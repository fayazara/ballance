import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalDepthTest, originalDepthLimit, ORIGINAL_DEPTH } from '../src/game/original-depth.ts'
import { OriginalLift } from '../src/game/original-lift.ts'
import { SCALE } from '../src/game/original-data.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY } from '../src/game/original-physics.ts'

const ready = RAPIER.init(), pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('level_12.json', pack))
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
const empty: OriginalDocument = { objects: [], meshes: [], groups: [], materials: [], textures: [] }

test('recovered cleanup targets loose balls and boxes with strict origin-depth comparison', () => {
  assert.deepEqual(ORIGINAL_DEPTH.groups, ['P_Ball_Paper', 'P_Ball_Wood', 'P_Ball_Stone', 'P_Box'])
  assert.equal(ORIGINAL_DEPTH.margin, 200)
  assert.equal(ORIGINAL_DEPTH.comparison, 'less-than')
  assert.equal(ORIGINAL_DEPTH.hideHierarchy, false); assert.equal(ORIGINAL_DEPTH.moveHierarchy, true)
  assert.equal(originalDepthLimit(empty), -50)
})

test('depth cutoff uses transformed boundary boxes across all twelve original levels', { skip: !available }, () => {
  for (let level = 1; level <= 12; level++) {
    const d = load(`level_${String(level).padStart(2, '0')}`)
    const members = new Set(d.groups.find(g => g.name === 'DepthTestCubes')!.members)
    let minimum = 0
    for (const object of d.objects.filter(o => members.has(o.id))) {
      const mesh = d.meshes.find(m => m.id === object.mesh)!, m = object.matrix
      // Independent bounds computation for the authored box meshes.
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const y = m[1]! * mesh.positions[i]! + m[5]! * mesh.positions[i + 1]! + m[9]! * mesh.positions[i + 2]! + m[13]!
        minimum = Math.min(minimum, y)
      }
    }
    assert.ok(members.size >= 3)
    assert.ok(Math.abs(originalDepthLimit(d) - (minimum - 200) * SCALE) < .00001, `Level ${level}`)
    assert.ok(originalDepthLimit(d) < -50)
  }
})

function item(world: RAPIER.World, sector: number, y = 0) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(5, y, 8))
  world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(1), body)
  const mesh = new THREE.Object3D(), origin = new THREE.Vector3(5, y, 8)
  mesh.position.copy(origin)
  return { body, mesh, origin, sector }
}

test('falling bodies leave simulation and collision, while unregistered bodies stay untouched', async () => {
  await ready
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const cleanup = new OriginalDepthTest(empty), fallen = item(world, 1), untouched = item(world, 1)
  untouched.body.setTranslation({ x: 10, y: 0, z: 8 }, true)
  const child = new THREE.Object3D(); child.position.set(1, 2, 3); fallen.mesh.add(child)
  cleanup.register(fallen); cleanup.register(fallen)
  try {
    // Origin exactly on the boundary survives, even though the sphere extends below it.
    fallen.body.setTranslation({ x: 5, y: cleanup.limit, z: 8 }, true)
    cleanup.update(); assert.equal(fallen.body.isEnabled(), true)
    fallen.body.setTranslation(fallen.origin, true)
    for (let i = 0; i < 660 && !cleanup.removedCount; i++) { world.step(); cleanup.update() }
    assert.equal(cleanup.count, 1); assert.equal(cleanup.removedCount, 1)
    assert.equal(fallen.body.isEnabled(), false); assert.equal(fallen.mesh.visible, false)
    assert.deepEqual({ ...fallen.body.translation() }, { x: 0, y: 0, z: 0 })
    assert.equal(untouched.body.isEnabled(), true); assert.equal(untouched.mesh.visible, true)
    assert.ok(untouched.body.translation().y < cleanup.limit)
    world.step()
    assert.equal(world.castRay(new RAPIER.Ray({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }), 4, true), null, 'retired collider cannot hit objects at the origin')
    assert.equal(child.visible, true, 'Hide affects the object itself, not child visibility flags')
    assert.deepEqual(child.position.toArray(), [1, 2, 3])
  } finally { world.free() }
})

test('sector reset restores cleaned objects and preserves other sectors across repeated falls', async () => {
  await ready
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }), cleanup = new OriginalDepthTest(empty)
  const first = item(world, 1), second = item(world, 2)
  second.mesh.visible = false
  cleanup.register(first); cleanup.register(second)
  try {
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const p of [first, second]) p.body.setTranslation({ x: 0, y: cleanup.limit - 1, z: 0 }, true)
      cleanup.update(); assert.equal(cleanup.removedCount, 2)
      cleanup.resetSector(1)
      assert.equal(first.body.isEnabled(), true); assert.equal(first.mesh.visible, true)
      assert.ok(first.origin.distanceTo(first.body.translation()) < .00001)
      assert.deepEqual({ ...first.body.linvel() }, { x: 0, y: 0, z: 0 })
      assert.equal(second.body.isEnabled(), false)
      cleanup.resetSector(2)
      assert.equal(second.body.isEnabled(), true); assert.equal(second.mesh.visible, false, 'reset preserves authored visibility')
      assert.equal(cleanup.removedCount, 0); assert.equal(cleanup.count, 2)
    }
  } finally { world.free() }
})

test('all nine lifts register only the eight loose weights on wake and restore them on reset', { skip: !available }, async () => {
  await ready
  const module = load('p_modul_03'), material = new THREE.MeshPhongMaterial()
  let instances = 0
  try {
    for (let level = 1; level <= 12; level++) {
      const document = load(`level_${String(level).padStart(2, '0')}`)
      for (const parent of document.objects.filter(o => o.name.startsWith('P_Modul_03_'))) {
        const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }), cleanup = new OriginalDepthTest(document)
        const lift = new OriginalLift(world, parent, module, new Map(module.materials.map(m => [m.id, material])), 2, cleanup)
        try {
          assert.equal(cleanup.count, 0)
          lift.update(lift.wakeOrigin, 1, 0); assert.equal(cleanup.count, 0)
          lift.update(lift.wakeOrigin, 2, 0); assert.equal(cleanup.count, 8)
          for (const wall of lift.walls) wall.body.setTranslation({ x: 0, y: cleanup.limit - 1, z: 0 }, true)
          cleanup.update(); assert.equal(cleanup.removedCount, 8)
          assert.equal(lift.platform.body.isEnabled(), true); assert.equal(world.impulseJoints.len(), 1)
          lift.reset(); assert.equal(cleanup.removedCount, 0); assert.equal(world.impulseJoints.len(), 0)
          for (const wall of lift.walls) {
            assert.equal(wall.mesh.visible, true); assert.equal(wall.body.isEnabled(), false)
            assert.ok(wall.origin.distanceTo(wall.body.translation()) < .0001)
          }
          lift.update(lift.wakeOrigin, 2, 0)
          assert.equal(cleanup.count, 8); assert.equal(lift.walls.every(p => p.body.isEnabled()), true)
          instances++
        } finally { lift.parts.forEach(p => p.mesh.geometry.dispose()); world.free() }
      }
    }
    assert.equal(instances, 9)
  } finally { material.dispose() }
})
