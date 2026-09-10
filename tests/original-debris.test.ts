import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalDebris, ORIGINAL_DEBRIS } from '../src/game/original-debris.ts'
import { ORIGINAL_FRAGMENT_INERTIA } from '../src/game/original-inertia.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'

const pack = new URL('../.local/original/balls.json', import.meta.url), available = existsSync(pack), ready = RAPIER.init()
function setup() {
  const document = JSON.parse(readFileSync(pack, 'utf8')) as OriginalDocument
  const material = new THREE.MeshPhongMaterial(), world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const debris = new OriginalDebris(document, new Map(document.materials.map(m => [m.id, material])))
  return { document, world, debris, dispose() { debris.clear(world); debris.dispose(); material.dispose(); world.free() } }
}

test('fragment creation settings preserve explicit centers, material-specific impulse offsets and all 18 wind targets', () => {
  const data = ORIGINAL_DEBRIS.materials
  assert.deepEqual(data.wood.impulsePosition, [0,1,0])
  assert.ok(Math.abs(data.stone.impulsePosition[0]! + .05) < 1e-8)
  assert.ok(Math.abs(data.paper.impulsePosition[2]! - .02) < 1e-8)
  for (const settings of Object.values(data)) {
    assert.equal(settings.automaticMassCenter, false); assert.deepEqual(settings.massCenter, [0,0,0])
    assert.equal(settings.fixed, false); assert.equal(settings.collisionGroup, 'Ball')
  }
  assert.equal(new Set(ORIGINAL_DEBRIS.wind.map(w => w.target)).size, 18)
  for (const wind of ORIGINAL_DEBRIS.wind) {
    assert.deepEqual(wind.position, [0,0,0]); assert.deepEqual(wind.direction, [-1,0,1])
    assert.ok(Math.abs(wind.impulse - .03) < 1e-8)
  }
})

test('all 51 real fragments launch with native inertia, zero authored COM and the original off-center torque', { skip: !available }, async () => {
  await ready
  const t = setup(), { debris, world, document } = t
  try {
    for (const kind of ['wood','stone','paper'] as const) debris.spawn(world, kind, new THREE.Vector3(0,4,0), () => .5)
    assert.equal(debris.fragments.length, 51)
    assert.equal(Object.keys(ORIGINAL_FRAGMENT_INERTIA.measurements).length, 51)
    for (const fragment of debris.fragments) {
      const { body, kind } = fragment, data = ORIGINAL_DEBRIS.materials[kind]
      const object = document.objects.find(o => o.name === fragment.mesh.name)!
      const mesh = document.meshes.find(m => m.id === object.mesh)!
      const matrix = new THREE.Matrix4().fromArray(object.matrix)
      const measurement = Object.entries(ORIGINAL_FRAGMENT_INERTIA.measurements).find(([key]) => key.startsWith(`${mesh.name}@`))![1]
      const bytes = Buffer.alloc(mesh.positions.length * 4); mesh.positions.forEach((v,i) => bytes.writeFloatLE(v,i*4))
      assert.equal(createHash('sha256').update(bytes).digest('hex'), measurement.positionsSha256[0])
      const mass = (data.mass[0]! + data.mass[1]!) / 2, impulse = (data.impulse[0]! + data.impulse[1]!) / 2 * .25 * 2
      assert.ok(Math.abs(body.mass() - mass) < 1e-6)
      assert.ok(new THREE.Vector3().copy(body.localCom()).length() < 1e-7)
      const direction = new THREE.Vector3().setFromMatrixColumn(matrix, 1).normalize(); direction.z *= -1
      assert.ok(new THREE.Vector3().copy(body.linvel()).distanceTo(direction.clone().multiplyScalar(impulse / mass)) < .0001)
      const reflection = new THREE.Matrix4().makeScale(1,1,-1)
      const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(matrix).premultiply(reflection).multiply(reflection)).normalize()
      const [x,y,z] = data.impulsePosition
      const arm = new THREE.Vector3(x,y,-z!).multiplyScalar(.25).applyQuaternion(frame)
      const torque = arm.cross(direction.multiplyScalar(impulse)).applyQuaternion(frame.clone().invert())
      const inertia = measurement.inertiaPerMass.map(v => v * mass * .25 ** 2), minimum = Math.hypot(...inertia) * .03
      const expected = torque.divide(new THREE.Vector3(...inertia.map(v => Math.max(v,minimum)) as [number,number,number])).applyQuaternion(frame)
      assert.ok(new THREE.Vector3().copy(body.angvel()).distanceTo(expected) < .0002, `${object.name}: launch torque`)
      if (kind !== 'wood') assert.ok(expected.length() > .01, `${object.name}: offset must produce spin`)
      // Check the authored-origin setting physically, independently of inertia.
      body.setAngvel({ x:0,y:0,z:0 }, true)
      body.applyImpulseAtPoint({ x:.1,y:0,z:.2 }, body.translation(), true)
      assert.ok(new THREE.Vector3().copy(body.angvel()).length() < 1e-6)
    }
  } finally { t.dispose() }
})

test('paper wind acts in world coordinates at the center and stops with the fragment pool', { skip: !available }, async () => {
  await ready
  const t = setup(), { debris, world } = t
  try {
    for (const kind of ['wood','stone','paper'] as const) debris.spawn(world, kind, new THREE.Vector3(), () => .5)
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.4,.8,-.2))
    for (const fragment of debris.fragments) {
      fragment.body.setRotation(rotation,true)
      fragment.body.setLinvel({ x:0,y:0,z:0 },true); fragment.body.setAngvel({ x:0,y:0,z:0 },true)
    }
    debris.beforeStep(1/132)
    for (const fragment of debris.fragments) {
      const velocity = new THREE.Vector3().copy(fragment.body.linvel())
      if (fragment.kind === 'paper') {
        // .03 original impulse, one 66-Hz IVP tick at time factor 2: web J=.015.
        const expected = new THREE.Vector3(-1,0,-1).normalize().multiplyScalar(.015 / fragment.body.mass())
        assert.ok(velocity.distanceTo(expected) < 1e-6)
      } else assert.equal(velocity.length(),0)
      assert.ok(new THREE.Vector3().copy(fragment.body.angvel()).length() < 1e-7)
    }
    for (const fragment of debris.fragments) fragment.body.setEnabled(false)
    const velocities = debris.fragments.map(f => new THREE.Vector3().copy(f.body.linvel()))
    debris.beforeStep(1/132)
    debris.fragments.forEach((f,i) => assert.ok(velocities[i]!.distanceTo(f.body.linvel()) < 1e-7))
    debris.clear(world); debris.beforeStep(1/132)
    assert.equal(world.bodies.len(),0)
    debris.spawn(world,'paper',new THREE.Vector3(),() => .5)
    assert.equal(debris.fragments.length,18)
    assert.ok(debris.fragments.every(f => new THREE.Vector3().copy(f.body.localCom()).length() < 1e-7))
  } finally { t.dispose() }
})

test('burst velocity and spin are invariant when the same fragment pool is moved far across a course', { skip: !available }, async () => {
  await ready
  const t = setup(), { debris, world } = t
  try {
    for (const kind of ['wood','stone','paper'] as const) {
      debris.spawn(world, kind, new THREE.Vector3(), () => .5)
      const baseline = new Map(debris.fragments.filter(f => f.kind === kind).map(f => [f.mesh.name, { velocity: new THREE.Vector3().copy(f.body.linvel()), spin: new THREE.Vector3().copy(f.body.angvel()) }]))
      debris.spawn(world, kind, new THREE.Vector3(900,700,-800), () => .5)
      for (const fragment of debris.fragments.filter(f => f.kind === kind)) {
        const original = baseline.get(fragment.mesh.name)!
        assert.ok(original.velocity.distanceTo(fragment.body.linvel()) < 1e-6)
        assert.ok(original.spin.distanceTo(fragment.body.angvel()) < 1e-6)
        assert.ok(new THREE.Quaternion().copy(fragment.body.rotation()).angleTo(new THREE.Quaternion()) < 1e-6)
      }
    }
  } finally { t.dispose() }
})
