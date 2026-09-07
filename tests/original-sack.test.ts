import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalSack, ORIGINAL_SACK } from '../src/game/original-sack.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY, FLOOR_PHYSICS, PLAYER_PHYSICS, configureContact, configureBody, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'
import type { Material } from '../src/game/levels.ts'

const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_26.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, parent?: OriginalObject, sector = 1) {
  const document = load('p_modul_26'), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: 'P_Modul_26_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const sack = new OriginalSack(world, instance, document, new Map(document.materials.map(m => [m.id, material])), sector)
  return { sack, dispose: () => { sack.parts.forEach(p => p.mesh.geometry.dispose()); sack.decoration.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() }); material.dispose() } }
}
function floor(world: RAPIER.World, level: OriginalDocument) {
  const stoppers = new Set(level.groups.find(g => g.name === 'Phys_FloorStopper')?.members)
  const floors = new Set(level.groups.filter(g => ['Phys_Floors', 'Phys_FloorRails', 'Phys_FloorStopper'].includes(g.name)).flatMap(g => g.members))
  for (const o of level.objects.filter(o => floors.has(o.id))) {
    const source = level.meshes.find(m => m.id === o.mesh); if (!source) continue
    const geometry = originalGeometry(source, o.matrix)
    world.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)).setCollisionGroups(stoppers.has(o.id) ? LEVEL_STOPPER_GROUPS : LEVEL_FLOOR_GROUPS), FLOOR_PHYSICS))
    geometry.dispose()
  }
}
test('recovered sack uses two ball joints, a non-colliding massive rope, and a real-time alternating controller', () => {
  const rope = ORIGINAL_SACK.parts.find(p => p.target.endsWith('Rope'))!, sack = ORIGINAL_SACK.parts.find(p => p.target.endsWith('Sack'))!
  assert.equal(rope.mass, 1); assert.equal(rope.enableCollision, false)
  assert.equal(sack.mass, 10); assert.equal(sack.collisionGroup, 'Floor')
  assert.equal(ORIGINAL_SACK.joints.length, 2)
  assert.equal(ORIGINAL_SACK.joints[0]!.anchorObject, 'FixCube Object')
  assert.equal(ORIGINAL_SACK.joints[1]!.anchorObject, sack.target)
  assert.deepEqual(ORIGINAL_SACK.forces.map(f => f.direction), [[0, 0, 1], [0, 0, -1]])
  assert.deepEqual(ORIGINAL_SACK.forces.map(f => f.impulse), [.25, .25])
  assert.equal(ORIGINAL_SACK.intervalMs, 1500); assert.equal(ORIGINAL_SACK.switchDelayFrames, 1)
})
test('sack impulse keeps its recovered strength and holder direction when the sack rotates', { skip: !available }, async () => {
  await initialized
  for (const steps of [1, 10, 100]) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 }), t = make(world), s = t.sack
    try {
      const rope = s.parts.find(p => p.name.endsWith('Rope'))!
      s.setActive(true)
      assert.ok(Math.abs(rope.body.mass() - 1) < .00001, 'disabling rope collision must not discard its mass')
      assert.equal(rope.body.collider(0).isEnabled(), false)
      assert.equal(s.sack.body.collider(0).isEnabled(), true)
      s.sack.body.setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(.8, .6, .4)), true)
      for (let i = 0; i < steps; i++) s.update(.1 / steps, 1)
      // .25 original impulse * scale .25 * timeFactor^2 * 66 * .1s / mass 10.
      const expected = s.drives[0]!.direction.clone().multiplyScalar(.165)
      assert.ok(new THREE.Vector3().copy(s.sack.body.linvel()).distanceTo(expected) < .00001)
      assert.ok(new THREE.Vector3().copy(s.sack.body.angvel()).length() < .00001, 'drive point is the sack origin/mass center')
    } finally { t.dispose(); world.free() }
  }
})
test('sack drive reverses every 1500ms plus its link delay, stops outside its sector, and resets its phase', { skip: !available }, async () => {
  await initialized
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const t = make(world, undefined, 3), s = t.sack
  try {
    for (let i = 0; i < 264; i++) { s.update(PHYSICS_STEP, 1); world.step() }
    assert.equal(s.active, false); assert.equal(s.elapsed, 0); assert.equal(world.impulseJoints.len(), 0)
    assert.ok(new THREE.Vector3().copy(s.sack.body.translation()).distanceTo(s.sack.origin) < .00001)
    for (let i = 0; i < 198; i++) { s.update(PHYSICS_STEP, 3); world.step() }
    assert.equal(s.phase, 0); assert.equal(s.switches, 0)
    s.update(PHYSICS_STEP, 3); world.step()
    assert.equal(s.phase, 1); assert.equal(s.switches, 1)
    for (let i = 0; i < 199; i++) { s.update(PHYSICS_STEP, 3); world.step() }
    assert.equal(s.phase, 0); assert.equal(s.switches, 2)
    s.update(PHYSICS_STEP, 4)
    assert.equal(s.active, false); assert.equal(world.impulseJoints.len(), 0)
    for (let reset = 0; reset < 4; reset++) {
      s.setActive(true); assert.equal(world.impulseJoints.len(), 2)
      for (let i = 0; i < 264; i++) { s.update(PHYSICS_STEP, 3); world.step() }
      s.reset(); assert.equal(world.impulseJoints.len(), 0)
      assert.equal(s.phase, 0); assert.equal(s.elapsed, 0)
      for (const p of s.parts) { assert.ok(new THREE.Vector3().copy(p.body.translation()).distanceTo(p.origin) < .00001); assert.equal(p.body.isEnabled(), false) }
    }
  } finally { t.dispose(); world.free() }
})
test('both ball joints permit a sideways deflection while retaining their anchors', { skip: !available }, async () => {
  await initialized
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const t = make(world), s = t.sack
  try {
    s.setActive(true)
    const cross = new THREE.Vector3(0, 1, 0).cross(s.drives[0]!.direction).normalize()
    s.sack.body.applyImpulse(cross.clone().multiplyScalar(8), true)
    let sideways = 0
    for (let i = 0; i < 660; i++) {
      s.update(PHYSICS_STEP, 1); world.step()
      sideways = Math.max(sideways, Math.abs(new THREE.Vector3().copy(s.sack.body.translation()).sub(s.sack.origin).dot(cross)))
    }
    assert.ok(sideways > .15, `a planar hinge would prevent sideways movement: ${sideways}`)
    assert.ok(s.anchorError < .005, `joint drift ${s.anchorError}`)
  } finally { t.dispose(); world.free() }
})
test('all 18 original sack placements swing without detaching in their actual level geometry', { skip: !available }, async () => {
  await initialized
  let count = 0
  for (let levelIndex = 8; levelIndex <= 12; levelIndex++) {
    const level = load(`level_${String(levelIndex).padStart(2, '0')}`)
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const trials: ReturnType<typeof make>[] = []
    try {
      floor(world, level)
      for (const parent of level.objects.filter(o => o.name.startsWith('P_Modul_26_'))) { trials.push(make(world, parent)); count++ }
      const excursions = trials.map(() => 0)
      for (let i = 0; i < 20 / PHYSICS_STEP; i++) {
        trials.forEach(t => t.sack.update(PHYSICS_STEP, 1)); world.step()
        trials.forEach((t, j) => { excursions[j] = Math.max(excursions[j]!, new THREE.Vector3().copy(t.sack.sack.body.translation()).distanceTo(t.sack.sack.origin)) })
      }
      for (const [i, { sack: s }] of trials.entries()) {
        assert.ok(excursions[i]! > .15, `Level ${levelIndex}/${s.name} never swung: ${excursions[i]}`)
        assert.ok(excursions[i]! < 4, `Level ${levelIndex}/${s.name} escaped its rope: ${excursions[i]}`)
        assert.ok(s.anchorError < .02, `Level ${levelIndex}/${s.name} joint drift ${s.anchorError}`)
      }
    } finally { trials.forEach(t => t.dispose()); world.free() }
  }
  assert.equal(count, 18)
})
test('player contact moves the Level 8 sack; heavier balls transfer more momentum', { skip: !available }, async () => {
  await initialized
  const motion = new Map<Material, number>()
  for (const kind of ['paper', 'wood', 'stone'] as Material[]) {
    const level = load('level_08'), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    floor(world, level)
    const t = make(world, level.objects.find(p => p.name === 'P_Modul_26_01')), s = t.sack
    try {
      s.setActive(true)
      const axis = new THREE.Vector3(1, 0, 0), start = s.sack.origin.clone().addScaledVector(axis, -2)
      world.step()
      // The original approach uses paired rails: a center ray falls through their gap.
      const hit = world.castShape({ x: start.x, y: start.y + 3, z: start.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 10, true, undefined, 0x0004ffff)
      assert.ok(hit); start.y += 3 - hit.time_of_impact + .01
      const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true))
      let shape = RAPIER.ColliderDesc.ball(.5)
      if (kind === 'paper') {
        const doc = load('balls'), object = doc.objects.find(o => o.name === 'Ball_Paper')!
        const geometry = originalGeometry(doc.meshes.find(m => m.id === object.mesh)!, object.matrix, true)
        shape = RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!; geometry.dispose()
      }
      world.createCollider(configureContact(shape.setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(0x0004ffff), PLAYER_PHYSICS[kind]), ball)
      configureBody(ball, PLAYER_PHYSICS[kind])
      let excursion = 0
      // Isolate player contact here; the separate oscillator tests cover the script's drive.
      for (let i = 0; i < 3 / PHYSICS_STEP; i++) {
        driveBall(ball, kind, axis.x, axis.z, PHYSICS_STEP); world.step()
        excursion = Math.max(excursion, new THREE.Vector3().copy(s.sack.body.translation()).sub(s.sack.origin).dot(axis))
      }
      motion.set(kind, excursion)
      assert.ok(s.anchorError < .005)
    } finally { t.dispose(); world.free() }
  }
  assert.ok(motion.get('wood')! > .1, `wood must move the sack: ${JSON.stringify([...motion])}`)
  assert.ok(motion.get('stone')! > motion.get('wood')! && motion.get('wood')! > motion.get('paper')!, JSON.stringify([...motion]))
})
