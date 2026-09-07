import { PLAYER_GROUPS } from '../src/game/original-collisions.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalSectorObject, ORIGINAL_OBJECTS } from '../src/game/original-objects.ts'
import type { OriginalObjectKind } from '../src/game/original-objects.ts'
import { OriginalDepthTest } from '../src/game/original-depth.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { GRAVITY, PHYSICS_STEP, PLAYER_PHYSICS, FLOOR_PHYSICS, configureBody, configureContact, driveBall } from '../src/game/original-physics.ts'
import type { Material } from '../src/game/levels.ts'

const ready = RAPIER.init(), pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('level_12.json', pack))
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function create(world: RAPIER.World, kind: OriginalObjectKind, parent?: OriginalObject, sector = 2, depth?: OriginalDepthTest) {
  const document = load(kind.toLowerCase()), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: kind + '_01', mesh: 0, matrix: new THREE.Matrix4().toArray(), visible: true }
  const object = new OriginalSectorObject(world, instance, document, new Map(document.materials.map(m => [m.id, material])), sector, kind, depth)
  return { object, dispose: () => { object.mesh.geometry.dispose(); material.dispose() } }
}

test('recovered loose-object flags distinguish spherical balls, convex paper/crates and fixed domes', () => {
  assert.equal(ORIGINAL_OBJECTS.P_Dome.fixed, true)
  assert.equal(ORIGINAL_OBJECTS.P_Dome.shape, 'convex')
  for (const [kind, data] of Object.entries(ORIGINAL_OBJECTS)) {
    assert.equal(data.reset, 2); assert.equal(data.collisionGroup, '')
    assert.equal(data.startFrozen, false); assert.equal(data.enableCollision, true)
    assert.equal(data.automaticMassCenter, false); assert.deepEqual(data.massCenter, [0, 0, 0])
    assert.equal(data.fixed, kind === 'P_Dome')
  }
  assert.equal(ORIGINAL_OBJECTS.P_Ball_Paper.shape, 'convex')
  assert.equal(ORIGINAL_OBJECTS.P_Ball_Wood.radius, 2); assert.equal(ORIGINAL_OBJECTS.P_Ball_Stone.radius, 2)
})

test('all 157 imported sector objects remain absent until activation and restore on sector re-entry', { skip: !available }, async () => {
  await ready
  const counts: Record<string, number> = {}
  for (let level = 1; level <= 12; level++) {
    const document = load(`level_${String(level).padStart(2, '0')}`)
    for (const parent of document.objects) {
      const kind = (Object.keys(ORIGINAL_OBJECTS) as OriginalObjectKind[]).find(k => parent.name.startsWith(k + '_'))
      if (!kind) continue
      const sector = Number(document.groups.find(g => /^Sector_/.test(g.name) && g.members.includes(parent.id))?.name.slice(-2) || 1)
      const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
      const t = create(world, kind, parent, sector), o = t.object, data = ORIGINAL_OBJECTS[kind]
      try {
        for (let repeat = 0; repeat < 2; repeat++) {
          for (let i = 0; i < 66; i++) { o.update(sector + 1); world.step() }
          assert.equal(o.body.isEnabled(), false); assert.equal(o.mesh.visible, false)
          assert.ok(o.origin.distanceTo(o.body.translation()) < .0001)
          o.update(sector)
          assert.equal(o.body.isEnabled(), true); assert.equal(o.mesh.visible, true)
          assert.equal(o.body.isFixed(), data.fixed); assert.equal(o.body.numColliders(), 1)
          assert.equal(o.body.collider(0).shapeType(), data.shape === 'sphere' ? RAPIER.ShapeType.Ball : RAPIER.ShapeType.ConvexPolyhedron)
          if (!data.fixed) {
            assert.ok(Math.abs(o.body.mass() - data.mass) < .00001)
            assert.ok(new THREE.Vector3().copy(o.body.localCom()).length() < .00001)
          }
          o.body.applyImpulse({ x: 2, y: 0, z: 1 }, true)
          for (let i = 0; i < 66; i++) world.step()
          if (data.fixed) assert.ok(o.origin.distanceTo(o.body.translation()) < .0001)
          else assert.ok(o.origin.distanceTo(o.body.translation()) > .1)
          o.update(sector + 1)
          assert.equal(o.active, false); assert.equal(o.body.isEnabled(), false); assert.equal(o.mesh.visible, false)
          assert.ok(o.origin.distanceTo(o.body.translation()) < .0001)
          assert.ok(new THREE.Vector3().copy(o.body.linvel()).length() < .00001)
        }
        counts[kind] = (counts[kind] || 0) + 1
      } finally { t.dispose(); world.free() }
    }
  }
  assert.deepEqual(counts, { P_Ball_Wood: 9, P_Ball_Stone: 52, P_Ball_Paper: 19, P_Dome: 11, P_Box: 66 })
})

test('a cleaned crate stays absent until reset and reactivates with its original pose', { skip: !available }, async () => {
  await ready
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const cleanup = new OriginalDepthTest(load('level_01')), t = create(world, 'P_Box', undefined, 2, cleanup), o = t.object
  try {
    for (let repeat = 0; repeat < 3; repeat++) {
      for (let i = 0; i < 1320; i++) { o.update(2); world.step(); cleanup.update() }
      assert.equal(cleanup.removedCount, 1); assert.equal(o.active, true)
      assert.equal(o.body.isEnabled(), false); assert.equal(o.mesh.visible, false)
      o.update(3); assert.equal(cleanup.removedCount, 0)
      assert.equal(o.body.isEnabled(), false); assert.equal(o.mesh.visible, false)
      o.update(2)
      assert.equal(o.body.isEnabled(), true); assert.equal(o.mesh.visible, true)
      assert.ok(o.origin.distanceTo(o.body.translation()) < .00001)
      assert.equal(cleanup.count, 1)
    }
  } finally { t.dispose(); world.free() }
})

function player(world: RAPIER.World, kind: Material, position: THREE.Vector3) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z).setCcdEnabled(true))
  let shape = RAPIER.ColliderDesc.ball(.5)
  if (kind === 'paper') {
    const d = load('balls'), o = d.objects.find(o => o.name === 'Ball_Paper')!
    const g = originalGeometry(d.meshes.find(m => m.id === o.mesh)!, o.matrix, true)
    shape = RAPIER.ColliderDesc.convexHull(g.attributes.position!.array as Float32Array)!; g.dispose()
  }
  world.createCollider(configureContact(shape.setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(PLAYER_GROUPS), PLAYER_PHYSICS[kind]), body)
  configureBody(body, PLAYER_PHYSICS[kind]); return body
}

test('wood pushes the original crate continuously, stone pushes harder and paper barely moves it', { skip: !available }, async () => {
  await ready
  const distance: Partial<Record<Material, number>> = {}
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const t = create(world, 'P_Box'), o = t.object, bounds = o.mesh.geometry.boundingBox!
    try {
      const floorY = bounds.min.y
      world.createCollider(configureContact(RAPIER.ColliderDesc.cuboid(30, .5, 30).setTranslation(0, floorY - .5, 0), FLOOR_PHYSICS))
      o.update(2)
      const ball = player(world, kind, new THREE.Vector3(bounds.min.x - .501, floorY + .5, 0))
      let contacted = false
      for (let i = 0; i < 396; i++) {
        driveBall(ball, kind, 1, 0, PHYSICS_STEP); world.step()
        world.contactPair(ball.collider(0), o.body.collider(0), () => { contacted = true })
      }
      assert.equal(contacted, true)
      distance[kind] = o.body.translation().x - o.origin.x
    } finally { t.dispose(); world.free() }
  }
  assert.ok(distance.wood! > 2, `wood displacement ${distance.wood}`)
  assert.ok(distance.stone! > distance.wood! * 1.5, JSON.stringify(distance))
  assert.ok(Math.abs(distance.paper!) < .05, `paper displacement ${distance.paper}`)
})

test('the original fixed convex dome resists direct contact from every ball material', { skip: !available }, async () => {
  await ready
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const t = create(world, 'P_Dome'), o = t.object, bounds = o.mesh.geometry.boundingBox!
    try {
      world.createCollider(configureContact(RAPIER.ColliderDesc.cuboid(30, .5, 30).setTranslation(0, bounds.min.y - .5, 0), FLOOR_PHYSICS))
      o.update(2)
      const ball = player(world, kind, new THREE.Vector3(bounds.max.x + .51, bounds.min.y + .51, 0))
      let contacted = false
      for (let i = 0; i < 396; i++) {
        driveBall(ball, kind, -1, 0, PHYSICS_STEP); world.step()
        world.contactPair(ball.collider(0), o.body.collider(0), () => { contacted = true })
      }
      assert.equal(contacted, true); assert.equal(o.body.isFixed(), true)
      assert.ok(o.origin.distanceTo(o.body.translation()) < .00001)
      assert.ok(new THREE.Quaternion().copy(o.body.rotation()).angleTo(new THREE.Quaternion()) < .00001)
    } finally { t.dispose(); world.free() }
  }
})
