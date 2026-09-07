import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalFan, FAN_FORCE } from '../src/game/original-fan.ts'
import { PLAYER_PHYSICS, GRAVITY, PHYSICS_STEP, configureBody, driveBall } from '../src/game/original-physics.ts'
import type { Material } from '../src/game/levels.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { originalGeometry } from '../src/game/original-data.ts'

const initialized = RAPIER.init()
const bounds = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5))
const identity = () => new THREE.Matrix4().toArray()
// Minimal geometry fixture matching the recovered trigger's local dimensions and translation.
const document: OriginalDocument = {
  objects: [
    { id: 1, name: 'P_Modul_18_Kollisionsquader', mesh: 1, matrix: new THREE.Matrix4().makeTranslation(0, 1.14, 0).toArray(), visible: false },
    { id: 2, name: 'P_Modul_18_Rotor', mesh: 2, matrix: identity(), visible: true },
  ],
  meshes: [1, 2].map(id => ({ id, positions: [-1, 0, -1, 1, 16, 1, 1, 0, -1], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], uvs: [0, 0, 1, 1, 1, 0], indices: [0, 1, 2], faceMaterials: [0], materials: [1] })),
  textures: [], materials: [], groups: [],
}
const material = new THREE.MeshPhongMaterial()
function fanAt(matrix = identity()) {
  const parent: OriginalObject = { id: 1, name: 'P_Modul_18_01', mesh: 0, matrix, visible: true }
  return new OriginalFan(parent, document, new Map([[1, material]]))
}
async function trial(kind: Material) {
  await initialized
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, .5, 20).setTranslation(0, -.5, 0))
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, .51, 0).setCcdEnabled(true))
  world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS[kind].mass), ball)
  configureBody(ball, PLAYER_PHYSICS[kind])
  const fan = fanAt()
  const run = (seconds: number, x = 0) => {
    for (let i = 0; i < seconds / PHYSICS_STEP; i++) { fan.apply(ball, bounds, PHYSICS_STEP); driveBall(ball, kind, x, 0, PHYSICS_STEP); world.step() }
  }
  return { world, ball, fan, run, dispose: () => { world.free(); fan.dispose() } }
}
test('fan lifts paper and sustains a bounded hover; the same force cannot lift wood or stone', async () => {
  assert.ok(Math.abs(FAN_FORCE - 6.6) < .00001)
  for (const kind of ['paper', 'wood', 'stone'] as Material[]) {
    const t = await trial(kind)
    try {
      t.run(3)
      if (kind === 'paper') assert.ok(t.ball.translation().y > 4.5, `paper only rose to ${t.ball.translation().y}`)
      else assert.ok(t.ball.translation().y < .55, `${kind} should remain grounded`)
      t.run(8)
      if (kind === 'paper') assert.ok(t.ball.translation().y > 4.5 && t.ball.translation().y < 5.5, 'paper must hover at the finite top of the wind column')
      assert.equal(t.world.colliders.len(), 2, 'airflow adds no solid collider')
    } finally { t.dispose() }
  }
})
test('steering out of airflow restores falling; returning below the top restores lift', async () => {
  const t = await trial('paper')
  try {
    t.run(3); t.run(.8, 1)
    assert.ok(t.ball.translation().x > 1)
    assert.equal(t.fan.active, false)
    assert.ok(t.ball.linvel().y < -1)
    t.ball.setTranslation({ x: 0, y: 2, z: 0 }, true); t.ball.setLinvel({ x: 0, y: -1, z: 0 }, true)
    t.run(.5)
    assert.ok(t.ball.linvel().y > 1)
  } finally { t.dispose() }
})
test('trigger uses ball extent, finite height, and transformed instance orientation', async () => {
  const t = await trial('paper')
  const rotated = fanAt(new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(40, 20, -12).toArray())
  try {
    t.ball.setTranslation({ x: .7, y: 2, z: 0 }, true)
    assert.equal(t.fan.apply(t.ball, bounds, PHYSICS_STEP), true, 'a partial overlap must lift')
    t.ball.setTranslation({ x: .8, y: 2, z: 0 }, true)
    assert.equal(t.fan.apply(t.ball, bounds, PHYSICS_STEP), false)
    t.ball.setTranslation({ x: 0, y: 5, z: 0 }, true)
    assert.equal(t.fan.apply(t.ball, bounds, PHYSICS_STEP), false, 'no infinite column')
    t.ball.setTranslation(rotated.column.center, true)
    assert.equal(rotated.apply(t.ball, bounds, PHYSICS_STEP), true)
    t.ball.setTranslation({ x: 10, y: 8, z: 3 }, true)
    assert.equal(rotated.apply(t.ball, bounds, PHYSICS_STEP), false)
  } finally { rotated.dispose(); t.dispose() }
})
test('fan impulse is independent of step rate and remains world-up on rotated fans', async () => {
  await initialized
  for (const hz of [66, 132, 264]) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); world.timestep = 1 / hz
    const fan = fanAt(new THREE.Matrix4().makeRotationY(.7).toArray())
    try {
      const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0))
      world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(10), ball)
      for (let i = 0; i < hz; i++) { fan.apply(ball, bounds, 1 / hz); world.step() }
      assert.ok(Math.abs(ball.linvel().y - .66) < .00001)
      assert.ok(Math.abs(ball.linvel().x) + Math.abs(ball.linvel().z) < .00001)
    } finally { fan.dispose(); world.free() }
  }
})

const localPack = new URL('../.local/original/', import.meta.url)
test('original Level 2: paper can fly from fan 01 onto the raised fan 12', { skip: !existsSync(new URL('level_02.json', localPack)) }, async () => {
  await initialized
  const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, localPack), 'utf8'))
  const level = load('level_02'), module = load('p_modul_18'), balls = load('balls')
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const floors = new Set(level.groups.filter(g => ['Phys_Floors', 'Phys_FloorRails', 'Phys_FloorStopper'].includes(g.name)).flatMap(g => g.members))
  const geometries: THREE.BufferGeometry[] = []
  const mats = new Map(module.materials.map(m => [m.id, material]))
  const fans = level.objects.filter(o => o.name.startsWith('P_Modul_18_')).map(o => new OriginalFan(o, module, mats))
  try {
    for (const object of level.objects.filter(o => floors.has(o.id))) {
      const source = level.meshes.find(m => m.id === object.mesh); if (!source) continue
      const geometry = originalGeometry(source, object.matrix); geometries.push(geometry)
      world.createCollider(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)))
    }
    const first = fans.find(f => f.name.endsWith('_01'))!, upper = fans.find(f => f.name.endsWith('_12'))!
    const source = balls.objects.find(o => o.name === 'Ball_Paper')!
    const geometry = originalGeometry(balls.meshes.find(m => m.id === source.mesh)!, source.matrix, true); geometries.push(geometry)
    const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(first.origin.x, first.origin.y + .55, first.origin.z).setCcdEnabled(true))
    world.createCollider(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setMass(.2), ball)
    configureBody(ball, PLAYER_PHYSICS.paper)
    for (let i = 0; i < 6 / PHYSICS_STEP; i++) {
      if (i >= 1 / PHYSICS_STEP) {
        const p = ball.translation(), v = ball.linvel()
        driveBall(ball, 'paper', THREE.MathUtils.clamp((upper.origin.x - p.x) * 8 - v.x * .8, -1, 1), THREE.MathUtils.clamp((upper.origin.z - p.z) * 8 - v.z * .8, -1, 1), PHYSICS_STEP)
      }
      for (const fan of fans) fan.apply(ball, geometry.boundingBox!, PHYSICS_STEP)
      world.step()
    }
    const p = ball.translation()
    assert.ok(Math.hypot(p.x - upper.origin.x, p.z - upper.origin.z) < .3, `transfer missed: ${JSON.stringify(p)}`)
    assert.ok(p.y > upper.origin.y + 3.5, `upper fan did not lift: ${JSON.stringify(p)}`)
  } finally { fans.forEach(f => f.dispose()); geometries.forEach(g => g.dispose()); world.free() }
})
