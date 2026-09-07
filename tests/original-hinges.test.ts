import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalHinge, ORIGINAL_HINGES } from '../src/game/original-hinges.ts'
import type { HingeKind } from '../src/game/original-hinges.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY, PLAYER_PHYSICS, FLOOR_PHYSICS, configureBody, configureContact, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'

const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_25.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, kind: HingeKind, parent?: OriginalObject) {
  const document = load(kind.toLowerCase()), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: kind + '_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const hinge = new OriginalHinge(world, instance, document, new Map(document.materials.map(m => [m.id, material])), 1, kind)
  return { hinge, dispose: () => { hinge.mesh.geometry.dispose(); hinge.decoration.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() }); material.dispose() } }
}
test('recovered hinge data preserves disabled limits, compound hulls, and intentional mass offsets', () => {
  for (const data of Object.values(ORIGINAL_HINGES)) {
    assert.equal(data.limitsEnabled, false, 'stored ±45 values are inactive defaults, not actual stops')
    assert.equal(data.anchorObject, 'FixCube Object')
    assert.ok(data.hulls.length >= 2)
    assert.equal(data.automaticMassCenter, false)
  }
  assert.deepEqual(ORIGINAL_HINGES.P_Modul_30.massCenter, [0, 4, 0])
  assert.deepEqual(ORIGINAL_HINGES.P_Modul_37.massCenter, [-7.5, 0, 0])
  assert.equal(ORIGINAL_HINGES.P_Modul_25.collisionGroup, '')
  assert.equal(ORIGINAL_HINGES.P_Modul_41.startFrozen, false)
})
test('all five mechanisms retain their pivot under forces and reset without losing the joint', { skip: !available }, async () => {
  await initialized
  for (const kind of Object.keys(ORIGINAL_HINGES) as HingeKind[]) {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const t = make(world, kind), h = t.hinge
    try {
      assert.ok(Math.abs(h.body.mass() - ORIGINAL_HINGES[kind].mass) < .00001)
      assert.equal(h.body.numColliders(), ORIGINAL_HINGES[kind].hulls.length)
      assert.equal(h.joint.limitsEnabled(), false)
      if (ORIGINAL_HINGES[kind].startFrozen) {
        for (let i = 0; i < 132; i++) { h.update(new THREE.Vector3(1000, 0, 1000)); world.step() }
        assert.equal(h.body.isDynamic(), false)
        assert.ok(new THREE.Vector3().copy(h.body.translation()).distanceTo(h.origin) < .0001)
      }
      h.update(h.wakeOrigin)
      h.body.applyTorqueImpulse(h.axis.clone().multiplyScalar(2), true)
      for (let i = 0; i < 660; i++) world.step()
      assert.ok(h.anchorError < .002, `${kind} pivot drifted ${h.anchorError}`)
      const q = h.body.rotation()
      assert.ok(Math.hypot(q.x, q.y, q.z) > .01, `${kind} must rotate`)
      // An anchored hinge keeps its local axis aligned with the world pivot's axis.
      assert.ok(h.axis.clone().applyQuaternion(q).distanceTo(h.axis) < .0001)
      h.reset()
      assert.ok(h.anchorError < .0001)
      assert.ok(Math.abs(h.body.rotation().w - 1) < .00001)
      assert.equal(h.activated, !ORIGINAL_HINGES[kind].startFrozen)
    } finally { t.dispose(); world.free() }
  }
})

function levelFloor(world: RAPIER.World, level: OriginalDocument) {
  const stoppers = new Set(level.groups.find(g => g.name === 'Phys_FloorStopper')?.members)
  const floors = new Set(level.groups.filter(g => ['Phys_Floors', 'Phys_FloorRails', 'Phys_FloorStopper'].includes(g.name)).flatMap(g => g.members))
  for (const o of level.objects.filter(o => floors.has(o.id))) {
    const source = level.meshes.find(m => m.id === o.mesh); if (!source) continue
    const g = originalGeometry(source, o.matrix)
    world.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(g.attributes.position!.array as Float32Array, Uint32Array.from(g.index!.array)).setCollisionGroups(stoppers.has(o.id) ? LEVEL_STOPPER_GROUPS : LEVEL_FLOOR_GROUPS), FLOOR_PHYSICS))
    g.dispose()
  }
}
test('all 118 imported passive hinges preserve their anchors in their actual level geometry', { skip: !available }, async () => {
  await initialized
  let count = 0
  for (let levelIndex = 1; levelIndex <= 12; levelIndex++) {
    const level = load(`level_${String(levelIndex).padStart(2, '0')}`)
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const instances: ReturnType<typeof make>[] = []
    try {
      levelFloor(world, level)
      for (const parent of level.objects) {
        const kind = (Object.keys(ORIGINAL_HINGES) as HingeKind[]).find(k => parent.name.startsWith(k + '_'))
        if (!kind) continue
        const t = make(world, kind, parent); instances.push(t); count++
        t.hinge.update(t.hinge.wakeOrigin)
      }
      for (let i = 0; i < 396; i++) world.step()
      for (const { hinge: h } of instances) assert.ok(h.anchorError < .025, `${h.name} in level ${levelIndex}: ${h.anchorError}`)
    } finally { instances.forEach(t => t.dispose()); world.free() }
  }
  assert.equal(count, 118)
})
test('a rolling stone ball moves the Level 7 pivoting plank by contact', { skip: !available }, async () => {
  await initialized
  const level = load('level_07'), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  levelFloor(world, level)
  const parent = level.objects.find(o => o.name === 'P_Modul_41_01')!, t = make(world, 'P_Modul_41', parent), h = t.hinge
  try {
    const bounds = h.mesh.geometry.boundingBox!, top = bounds.max.y + h.origin.y
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(h.origin.x, top + .55, h.origin.z).setCcdEnabled(true))
    world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(10).setCollisionGroups(0x0004ffff), PLAYER_PHYSICS.stone), ball); configureBody(ball, PLAYER_PHYSICS.stone)
    const sideways = new THREE.Vector3(0, 1, 0).cross(h.axis).normalize()
    for (let i = 0; i < 132; i++) { driveBall(ball, 'stone', sideways.x, sideways.z, PHYSICS_STEP); world.step() }
    assert.ok(Math.hypot(h.body.rotation().x, h.body.rotation().y, h.body.rotation().z) > .05, 'plank should tilt under the moving ball')
    assert.ok(h.anchorError < .002)
  } finally { t.dispose(); world.free() }
})
test('wood can roll across the moving Level 2 seesaw onto its exit platform', { skip: !available }, async () => {
  await initialized
  const level = load('level_02'), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  levelFloor(world, level)
  const t = make(world, 'P_Modul_30', level.objects.find(o => o.name === 'P_Modul_30_01')), h = t.hinge
  try {
    const bounds = h.mesh.geometry.boundingBox!, point = bounds.getCenter(new THREE.Vector3()).add(h.origin)
    point.x -= .3; point.y = bounds.max.y + h.origin.y + .55
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(point.x, point.y, point.z).setCcdEnabled(true))
    world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(1.9).setCollisionGroups(0x0004ffff), PLAYER_PHYSICS.wood), ball); configureBody(ball, PLAYER_PHYSICS.wood)
    let rotation = 0
    for (let i = 0; i < 2.5 / PHYSICS_STEP; i++) {
      h.update(new THREE.Vector3().copy(ball.translation()))
      if (i >= .5 / PHYSICS_STEP) driveBall(ball, 'wood', -1, 0, PHYSICS_STEP)
      world.step(); rotation = Math.max(rotation, Math.abs(h.body.rotation().z))
    }
    assert.ok(rotation > .04, 'the board must move under the ball')
    assert.ok(ball.translation().x < h.origin.x - 3, `did not reach the exit: ${JSON.stringify(ball.translation())}`)
    assert.ok(ball.translation().y > h.wakeOrigin.y - 1, 'the ball must remain on the course')
  } finally { t.dispose(); world.free() }
})
test('stone knocks down the Level 2 short drawbridge by contact', { skip: !available }, async () => {
  await initialized
  const level = load('level_02'), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  levelFloor(world, level)
  const t = make(world, 'P_Modul_25', level.objects.find(o => o.name === 'P_Modul_25_01')), h = t.hinge
  try {
    world.step()
    const start = h.pivot.clone().add(new THREE.Vector3(0, 0, 2.5))
    const hit = world.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 4, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, 0x0004ffff)
    assert.ok(hit)
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y + 4 - hit.timeOfImpact + .51, start.z).setCcdEnabled(true))
    world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(10).setCollisionGroups(0x0004ffff), PLAYER_PHYSICS.stone), ball); configureBody(ball, PLAYER_PHYSICS.stone)
    let rotation = 0
    for (let i = 0; i < 3 / PHYSICS_STEP; i++) {
      h.update(new THREE.Vector3().copy(ball.translation())); driveBall(ball, 'stone', 0, -1, PHYSICS_STEP); world.step()
      rotation = Math.max(rotation, Math.abs(h.body.rotation().x))
    }
    assert.ok(rotation > .6, `bridge did not lower: ${rotation}`)
    assert.ok(h.anchorError < .002)
  } finally { t.dispose(); world.free() }
})
