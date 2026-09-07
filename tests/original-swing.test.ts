import { PLAYER_GROUPS } from '../src/game/original-collisions.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalSwing, ORIGINAL_SWING } from '../src/game/original-swing.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY, FLOOR_PHYSICS, PLAYER_PHYSICS, configureContact, configureBody, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'
import type { Material } from '../src/game/levels.ts'

const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_08.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, parent?: OriginalObject, sector = 1) {
  const document = load('p_modul_08'), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: 'P_Modul_08_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const swing = new OriginalSwing(world, instance, document, new Map(document.materials.map(m => [m.id, material])), sector)
  return { swing, dispose: () => { swing.mesh.geometry.dispose(); swing.decoration.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() }); material.dispose() } }
}
function floor(world: RAPIER.World, level: OriginalDocument) {
  const stoppers = new Set(level.groups.find(g => g.name === 'Phys_FloorStopper')?.members)
  const floors = new Set(level.groups.filter(g => ['Phys_Floors', 'Phys_FloorRails', 'Phys_FloorStopper'].includes(g.name)).flatMap(g => g.members))
  for (const o of level.objects.filter(o => floors.has(o.id))) {
    const source = level.meshes.find(m => m.id === o.mesh); if (!source) continue
    const g = originalGeometry(source, o.matrix)
    world.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(g.attributes.position!.array as Float32Array, Uint32Array.from(g.index!.array)).setCollisionGroups(stoppers.has(o.id) ? LEVEL_STOPPER_GROUPS : LEVEL_FLOOR_GROUPS), FLOOR_PHYSICS)); g.dispose()
  }
}
test('the recovered swing has six hulls and a push/coast/reverse/coast sequence', () => {
  assert.equal(ORIGINAL_SWING.body.hulls.length, 6)
  assert.equal(ORIGINAL_SWING.body.mass, 10)
  assert.equal(ORIGINAL_SWING.body.startFrozen, true)
  assert.equal(ORIGINAL_SWING.hinge.limitsEnabled, false)
  assert.deepEqual(ORIGINAL_SWING.stages.map(s => s.force), [0, null, 1, null])
  assert.deepEqual(ORIGINAL_SWING.stages.map(s => s.durationMs), [500, 500, 500, 500])
  assert.deepEqual(ORIGINAL_SWING.forces.map(f => f.direction), [[0, 0, 1], [0, 0, -1]])
  assert.equal(ORIGINAL_SWING.startupDelayFrames, 1)
})
test('the drive applies recovered impulses only during powered stages, in the fixed holder frame', { skip: !available }, async () => {
  await initialized
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }), t = make(world), s = t.swing
  try {
    s.update(PHYSICS_STEP, 1)
    assert.equal(s.body.isFixed(), true); assert.equal(s.stage, -1)
    assert.ok(Math.abs(s.body.mass() - 10) < .00001, 'mass is total, not 10 per collision hull')
    assert.equal(s.body.numColliders(), 6)
    assert.equal(s.joint!.limitsEnabled(), false)
    const expected = s.drives[0]!.direction.clone().multiplyScalar(ORIGINAL_SWING.forces[0]!.impulse * 33 / 10)
    for (let i = 0; i < 66; i++) s.update(PHYSICS_STEP, 1)
    assert.equal(s.stage, 1)
    assert.ok(new THREE.Vector3().copy(s.body.linvel()).distanceTo(expected) < .00001)
    s.body.setRotation(new THREE.Quaternion().setFromAxisAngle(s.axis, .4), true)
    for (let i = 0; i < 66; i++) s.update(PHYSICS_STEP, 1)
    assert.equal(s.stage, 2)
    assert.ok(new THREE.Vector3().copy(s.body.linvel()).distanceTo(expected) < .00001, 'coasting must not add impulse')
    for (let i = 0; i < 66; i++) s.update(PHYSICS_STEP, 1)
    assert.equal(s.stage, 3)
    assert.ok(new THREE.Vector3().copy(s.body.linvel()).length() < .00001, 'reversed holder force cancels the previous impulse even after body rotation')
    for (let i = 0; i < 66; i++) s.update(PHYSICS_STEP, 1)
    assert.equal(s.stage, 0); assert.equal(s.cycles, 1)
    assert.ok(new THREE.Vector3().copy(s.body.linvel()).length() < .00001)
  } finally { t.dispose(); world.free() }
})
test('sector activation and repeated resets restore the hinge, initial pose and startup delay', { skip: !available }, async () => {
  await initialized
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const t = make(world, undefined, 3), s = t.swing
  try {
    for (let i = 0; i < 264; i++) { s.update(PHYSICS_STEP, 2); world.step() }
    assert.equal(s.active, false); assert.equal(world.impulseJoints.len(), 0)
    assert.ok(new THREE.Vector3().copy(s.body.translation()).distanceTo(s.origin) < .00001)
    for (let reset = 0; reset < 4; reset++) {
      for (let i = 0; i < 660; i++) { s.update(PHYSICS_STEP, 3); world.step() }
      assert.equal(world.impulseJoints.len(), 1)
      assert.ok(s.anchorError < .005)
      s.reset()
      assert.equal(s.stage, -1); assert.equal(s.cycles, 0); assert.equal(s.elapsed, 0)
      assert.equal(s.startupRemaining, PHYSICS_STEP); assert.equal(s.body.isEnabled(), false)
      assert.equal(world.impulseJoints.len(), 0)
      assert.ok(new THREE.Vector3().copy(s.body.translation()).distanceTo(s.origin) < .00001)
    }
    s.update(PHYSICS_STEP, 3); s.update(PHYSICS_STEP, 4)
    assert.equal(s.active, false); assert.equal(world.impulseJoints.len(), 0)
  } finally { t.dispose(); world.free() }
})
test('all six imported swinging platforms remain hinged while completing their drive cycles', { skip: !available }, async () => {
  await initialized
  let count = 0
  for (let levelIndex = 8; levelIndex <= 11; levelIndex++) {
    const level = load(`level_${String(levelIndex).padStart(2, '0')}`), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const trials: ReturnType<typeof make>[] = []
    try {
      floor(world, level)
      for (const parent of level.objects.filter(o => o.name.startsWith('P_Modul_08_'))) { trials.push(make(world, parent)); count++ }
      const excursions = trials.map(() => 0)
      for (let i = 0; i < 20 / PHYSICS_STEP; i++) {
        trials.forEach(t => t.swing.update(PHYSICS_STEP, 1)); world.step()
        trials.forEach((t, j) => { excursions[j] = Math.max(excursions[j]!, new THREE.Vector3().copy(t.swing.body.translation()).distanceTo(t.swing.origin)) })
      }
      for (const [i, { swing: s }] of trials.entries()) {
        assert.ok(excursions[i]! > .3, `${levelIndex}/${s.name} did not swing: ${excursions[i]}`)
        assert.ok(s.anchorError < .005, `${levelIndex}/${s.name} joint drift ${s.anchorError}`)
        assert.ok(s.cycles >= 9)
        assert.ok(s.axis.clone().applyQuaternion(s.body.rotation()).distanceTo(s.axis) < .0001)
      }
    } finally { trials.forEach(t => t.dispose()); world.free() }
  }
  assert.equal(count, 6)
})
test('wood, stone and paper can stand on the open compound deck without hitting a false enclosing hull', { skip: !available }, async () => {
  await initialized
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const t = make(world), s = t.swing
    try {
      s.setActive(true); world.step()
      const start = s.origin.clone().add(new THREE.Vector3(0, 1, 0))
      const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true))
      let shape = RAPIER.ColliderDesc.ball(.5)
      if (kind === 'paper') {
        const d = load('balls'), o = d.objects.find(o => o.name === 'Ball_Paper')!
        const g = originalGeometry(d.meshes.find(m => m.id === o.mesh)!, o.matrix, true)
        shape = RAPIER.ColliderDesc.convexHull(g.attributes.position!.array as Float32Array)!; g.dispose()
      }
      world.createCollider(configureContact(shape.setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(PLAYER_GROUPS), PLAYER_PHYSICS[kind]), ball); configureBody(ball, PLAYER_PHYSICS[kind])
      // Hold at the initial frozen stage to isolate the six-part collision shape from motor motion.
      for (let i = 0; i < 264; i++) world.step()
      const height = ball.translation().y - s.origin.y
      assert.ok(height > .5 && height < .85, `${kind} should rest on the low deck, not on a hull spanning its overhead suspension: ${height}`)
    } finally { t.dispose(); world.free() }
  }
})
test('wood can enter and cross the moving Level 9 platform using normal drive impulses', { skip: !available }, async () => {
  await initialized
  const level = load('level_09'), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  floor(world, level)
  const t = make(world, level.objects.find(o => o.name === 'P_Modul_08_01')), s = t.swing
  try {
    const axis = s.drives[0]!.direction.clone(); axis.y = 0; axis.normalize()
    const start = s.origin.clone().addScaledVector(axis, -2)
    // Approach on the return stroke; rolling immediately at startup chases it into the gap.
    for (let i = 0; i < 2 / PHYSICS_STEP; i++) { s.update(PHYSICS_STEP, 1); world.step() }
    world.step()
    const hit = world.castShape({ x: start.x, y: start.y + 2, z: start.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 8, true, undefined, PLAYER_GROUPS)
    assert.ok(hit, 'approach is on the original floor'); start.y += 2 - hit.time_of_impact + .01
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true))
    world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS.wood.mass).setCollisionGroups(PLAYER_GROUPS), PLAYER_PHYSICS.wood), ball); configureBody(ball, PLAYER_PHYSICS.wood)
    let crossed = false, touched = false
    for (let i = 0; i < 6 / PHYSICS_STEP; i++) {
      s.update(PHYSICS_STEP, 1); driveBall(ball, 'wood', axis.x, axis.z, PHYSICS_STEP); world.step()
      for (let j = 0; j < s.body.numColliders(); j++) world.contactPair(ball.collider(0), s.body.collider(j), manifold => { if (manifold.numContacts()) touched = true })
      if (new THREE.Vector3().copy(ball.translation()).sub(s.origin).dot(axis) > 2 && ball.translation().y > s.origin.y) { crossed = true; break }
    }
    assert.equal(touched, true, 'the route must actually contact the moving platform')
    assert.equal(crossed, true, JSON.stringify(ball.translation()))
    const target = s.origin.clone().addScaledVector(axis, 3)
    // Counter-steer with the same capped control force to stop on the exit platform.
    for (let i = 0; i < 396; i++) {
      const p = ball.translation(), v = ball.linvel()
      s.update(PHYSICS_STEP, 1)
      driveBall(ball, 'wood', THREE.MathUtils.clamp((target.x - p.x) * 4 - v.x * .8, -1, 1), THREE.MathUtils.clamp((target.z - p.z) * 4 - v.z * .8, -1, 1), PHYSICS_STEP); world.step()
    }
    const support = world.castShape(ball.translation(), { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.48), 0, .15, true, undefined, undefined, undefined, ball)
    assert.ok(support, 'the ball must land, not merely fly beyond the swing')
    assert.equal(support.collider.parent(), null, 'landing is on the level floor, not still on the swinging platform')
    assert.ok(new THREE.Vector3().copy(ball.translation()).sub(s.origin).dot(axis) > 2.8)
    assert.ok(s.anchorError < .005)
  } finally { t.dispose(); world.free() }
})
