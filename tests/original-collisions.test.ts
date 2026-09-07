import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { ORIGINAL_COLLISIONS, originalCollisionGroups, PLAYER_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-collisions.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import { PHYSICS_STEP } from '../src/game/original-physics.ts'
import { OriginalDebris } from '../src/game/original-debris.ts'

const ready = RAPIER.init(), pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('level_12.json', pack))
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))

test('recovered floors, players, all module types and debris retain original exclusion identifiers', () => {
  assert.deepEqual(ORIGINAL_COLLISIONS.identifiers, ['', 'Ball', 'Floor', 'Modul29'])
  assert.deepEqual(ORIGINAL_COLLISIONS.floors, { Phys_FloorRails: 'Floor', Phys_Floors: 'Floor', Phys_FloorStopper: 'Ball' })
  assert.ok(Object.values(ORIGINAL_COLLISIONS.players).every(g => g === 'Ball'))
  assert.equal(Object.keys(ORIGINAL_COLLISIONS.modules).length, 13)
  assert.deepEqual(ORIGINAL_COLLISIONS.modules.P_Modul_01, ['Ball', 'Floor'])
  assert.deepEqual(ORIGINAL_COLLISIONS.modules.P_Modul_29, ['Modul29'])
  assert.ok(Object.values(ORIGINAL_COLLISIONS.fragments).every(f => f.enabled && f.group === 'Ball'))
  assert.throws(() => originalCollisionGroups('unrecovered'), /Unknown/)
})

test('actual contact resolution matches IVP for every ordered pair of recovered identifiers', async () => {
  await ready
  for (const a of ORIGINAL_COLLISIONS.identifiers) for (const b of ORIGINAL_COLLISIONS.identifiers) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); world.timestep = PHYSICS_STEP
    try {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-3, 0, 0).setLinvel(3, 0, 0).setCcdEnabled(true))
      const moving = world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(1).setRestitution(0).setCollisionGroups(originalCollisionGroups(a)), body)
      const fixed = world.createCollider(RAPIER.ColliderDesc.ball(.5).setRestitution(0).setCollisionGroups(originalCollisionGroups(b)))
      let touched = false
      for (let i = 0; i < 2 / PHYSICS_STEP; i++) {
        world.step(); world.contactPair(moving, fixed, manifold => { if (manifold.numContacts()) touched = true })
      }
      // Source rule: an empty identifier collides with everything; only equal
      // nonempty identifiers exclude contact. Check motion as well as manifolds.
      const expected = !a || !b || a !== b
      assert.equal(touched, expected, `${JSON.stringify(a)} versus ${JSON.stringify(b)}`)
      if (expected) assert.ok(body.translation().x < -.8)
      else assert.ok(body.translation().x > 2.5)
    } finally { world.free() }
  }
})

test('every original floor-stopper mesh admits the player but remains detectable to loose props', { skip: !available }, async () => {
  await ready
  let count = 0
  for (let level = 1; level <= 12; level++) {
    const document = load(`level_${String(level).padStart(2, '0')}`)
    const members = new Set(document.groups.find(g => g.name === 'Phys_FloorStopper')?.members)
    for (const object of document.objects.filter(o => members.has(o.id))) {
      const source = document.meshes.find(m => m.id === object.mesh)!
      const geometry = originalGeometry(source, object.matrix), positions = geometry.getAttribute('position'), indices = geometry.index!
      const triangle = new THREE.Triangle(), normal = new THREE.Vector3(), center = new THREE.Vector3()
      for (let i = 0; i < indices.count; i += 3) {
        triangle.set(new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i)), new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 1)), new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 2)))
        if (triangle.getArea() > .00001) break
      }
      assert.ok(triangle.getArea() > .00001)
      triangle.getNormal(normal); triangle.getMidpoint(center)
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
      try {
        world.createCollider(RAPIER.ColliderDesc.trimesh(positions.array as Float32Array, Uint32Array.from(indices.array)).setCollisionGroups(LEVEL_STOPPER_GROUPS))
        world.step()
        const ray = new RAPIER.Ray(center.clone().addScaledVector(normal, 1), normal.clone().negate())
        assert.equal(world.castRay(ray, 2, true, undefined, PLAYER_GROUPS), null, `${level}/${object.name}: invisible to player`)
        assert.ok(world.castRay(ray, 2, true, undefined, originalCollisionGroups('')), `${level}/${object.name}: still stops props`)
        count++
      } finally { world.free(); geometry.dispose() }
    }
  }
  assert.equal(count, 11, 'the imported twelve-level pack contains eleven stopper meshes')
})

test('all 51 actual transformation fragments participate in ordinary contact', { skip: !available }, async () => {
  await ready
  const document = load('balls'), material = new THREE.MeshPhongMaterial()
  const debris = new OriginalDebris(document, new Map(document.materials.map(m => [m.id, material])))
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); world.timestep = PHYSICS_STEP
  try {
    for (const kind of ['wood', 'stone', 'paper'] as const) debris.spawn(world, kind, new THREE.Vector3(0, 5, 0), new THREE.Quaternion(), () => .5)
    assert.equal(debris.fragments.length, 51)
    // Isolate each real hull and place an ordinary loose prop collider through its
    // bounds. Old floor-only debris masks must fail this physical contact check.
    for (const fragment of debris.fragments) fragment.body.setEnabled(false)
    const player = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
    const ball = world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(1).setCollisionGroups(originalCollisionGroups('')), player)
    for (const fragment of debris.fragments) {
      const collider = fragment.body.collider(0)
      assert.equal(collider.collisionGroups(), originalCollisionGroups('Ball'))
      fragment.body.setEnabled(true)
      fragment.mesh.geometry.computeBoundingBox()
      const point = fragment.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyQuaternion(new THREE.Quaternion().copy(fragment.body.rotation())).add(fragment.body.translation())
      player.setTranslation(point, true); player.setLinvel({ x: 0, y: 0, z: 0 }, true)
      fragment.body.setLinvel({ x: 0, y: 0, z: 0 }, true); fragment.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      let contacts = 0
      for (let i = 0; i < 3; i++) { world.step(); world.contactPair(collider, ball, manifold => { contacts += manifold.numContacts() }) }
      assert.ok(contacts > 0, `${fragment.kind} piece must contact loose props`)
      fragment.body.setEnabled(false)
    }
  } finally { debris.clear(world); world.free(); debris.dispose(); material.dispose() }
})
