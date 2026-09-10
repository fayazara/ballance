import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { ORIGINAL_PLAYER, ORIGINAL_PLAYER_INERTIA, replacePlayerCollider } from '../src/game/original-player.ts'
import { PLAYER_PHYSICS, PHYSICS_STEP } from '../src/game/original-physics.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'

const ready = RAPIER.init(), pack = new URL('../.local/original/balls.json', import.meta.url)
const available = existsSync(pack)
const paperGeometry = () => {
  const doc = JSON.parse(readFileSync(pack, 'utf8')) as OriginalDocument
  const object = doc.objects.find(o => o.name === 'Ball_Paper')!
  return originalGeometry(doc.meshes.find(m => m.id === object.mesh)!, object.matrix, true)
}
test('measured IVP paper inertia controls angular response in all three axes, including a rotated body', { skip: !available }, async () => {
  await ready
  const geometry = paperGeometry(), vertices = geometry.getAttribute('position').array as Float32Array
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  try {
    const original = JSON.parse(readFileSync(pack, 'utf8')) as OriginalDocument
    const meshId = original.objects.find(o => o.name === 'Ball_Paper')!.mesh
    const positions = original.meshes.find(m => m.id === meshId)!.positions
    const bytes = Buffer.alloc(positions.length * 4)
    positions.forEach((value, i) => bytes.writeFloatLE(value, i * 4))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), ORIGINAL_PLAYER_INERTIA.paperPositionsSha256, 'native measurements must match the loaded original mesh')
    for (const rotation of [new THREE.Quaternion(), new THREE.Quaternion().setFromEuler(new THREE.Euler(.5, .8, -.3))]) {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setRotation(rotation))
      replacePlayerCollider(world, body, 'paper', vertices)
      // Native probe output is per mass in original geometry units. Its analytical
      // cube control differs from a standard solid cube's 2/3 inertia.
      assert.ok(Math.abs(ORIGINAL_PLAYER_INERTIA.measurements.unitCube.inertiaPerMass[0]! - Math.SQRT2 / 3) < 1e-6)
      const measured = ORIGINAL_PLAYER_INERTIA.measurements.paper.inertiaPerMass.map(v => v * .2 * .25 ** 2)
      for (let axis = 0; axis < 3; axis++) {
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
        const direction = new THREE.Vector3().setComponent(axis, 1).applyQuaternion(rotation)
        body.applyTorqueImpulse(direction.clone().multiplyScalar(.01), true)
        const expected = direction.multiplyScalar(.01 / measured[axis]!)
        assert.ok(new THREE.Vector3().copy(body.angvel()).distanceTo(expected) < 1e-5)
      }
      world.removeRigidBody(body)
    }
  } finally { geometry.dispose(); world.free() }
})
test('all ActiveBall creation paths use an authored origin mass center', () => {
  assert.deepEqual(ORIGINAL_PLAYER.bodies.map(b => b.index), [233, 262, 291])
  for (const b of ORIGINAL_PLAYER.bodies) {
    assert.equal(b.automaticMassCenter, false); assert.deepEqual(b.massCenter, [0, 0, 0])
    assert.equal(b.fixed, false); assert.equal(b.startFrozen, false); assert.equal(b.enableCollision, true)
    if (b.shape === 'sphere') { assert.equal(b.radius, 2); assert.deepEqual(b.center, [0, 0, 0]) }
  }
})
test('actual paper mass is centered at the authored origin rather than its uneven convex hull centroid', { skip: !available }, async () => {
  await ready
  const geometry = paperGeometry(), vertices = geometry.getAttribute('position').array as Float32Array
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); world.timestep = PHYSICS_STEP
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(8, 4, -2))
    world.createCollider(RAPIER.ColliderDesc.convexHull(vertices)!.setMass(.2), body)
    body.recomputeMassPropertiesFromColliders()
    const automatic = new THREE.Vector3().copy(body.localCom()).length()
    assert.ok(automatic > .0001, `fixture needs the asymmetric original hull: ${automatic}`)
    replacePlayerCollider(world, body, 'paper', vertices)
    assert.ok(new THREE.Vector3().copy(body.localCom()).length() < 1e-7)
    assert.equal(body.numColliders(), 1)
    body.applyImpulseAtPoint({ x: .2, y: .1, z: -.3 }, body.translation(), true)
    world.step()
    assert.ok(new THREE.Vector3().copy(body.angvel()).length() < 1e-6, 'an impulse at the authored center cannot add spurious torque')
  } finally { geometry.dispose(); world.free() }
})
test('repeated transformer material replacements preserve body pose and restore exact mass without accumulating inertia', { skip: !available }, async () => {
  await ready
  const geometry = paperGeometry(), vertices = geometry.getAttribute('position').array as Float32Array
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.3, -.5, .7))
  const position = { x: 8, y: 4, z: -2 }
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setRotation(rotation))
    const inertias = new Map<string, THREE.Vector3>()
    for (let cycle = 0; cycle < 6; cycle++) for (const kind of ['wood', 'paper', 'stone'] as const) {
      // The real transformer replaces the collider while holding a kinematic ball.
      body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false)
      replacePlayerCollider(world, body, kind, vertices)
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      assert.equal(world.colliders.len(), 1); assert.equal(world.bodies.len(), 1)
      assert.ok(Math.abs(body.mass() - PLAYER_PHYSICS[kind].mass) < 1e-6)
      assert.ok(new THREE.Vector3().copy(body.localCom()).length() < 1e-7)
      assert.ok(new THREE.Vector3().copy(body.translation()).distanceTo(position) < 1e-6)
      assert.ok(new THREE.Quaternion().copy(body.rotation()).angleTo(rotation) < .001)
      const inertia = new THREE.Vector3().copy(body.principalInertia())
      assert.ok(Math.min(inertia.x, inertia.y, inertia.z) > 0, 'transforming must not lock rotation')
      if (inertias.has(kind)) assert.ok(inertia.distanceTo(inertias.get(kind)!) < 1e-7)
      else inertias.set(kind, inertia)
      if (kind !== 'paper') assert.ok(inertia.distanceTo(new THREE.Vector3(1, 1, 1).multiplyScalar(.4 * PLAYER_PHYSICS[kind].mass * .5 ** 2)) < 1e-6)
    }
    assert.throws(() => replacePlayerCollider(world, body, 'paper'), /requires its convex mesh/)
    assert.equal(world.colliders.len(), 1, 'missing geometry must not destroy the current collider')
  } finally { geometry.dispose(); world.free() }
})
