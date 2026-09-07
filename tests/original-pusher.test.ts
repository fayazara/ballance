import { PLAYER_GROUPS } from '../src/game/original-collisions.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalPusher, LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS, PUSHER_GROUPS, PUSHER_GUIDE_GROUPS } from '../src/game/original-pusher.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import { PLAYER_PHYSICS, FLOOR_PHYSICS, PHYSICS_STEP, GRAVITY, configureContact, configureBody, driveBall } from '../src/game/original-physics.ts'
import type { Material } from '../src/game/levels.ts'

test('pusher collision filtering allows the ball and guide while excluding the surrounding floor', () => {
  const contact = (a: number, b: number) => !!((a >>> 16) & (b & 0xffff)) && !!((b >>> 16) & (a & 0xffff))
  assert.equal(contact(PUSHER_GROUPS, PLAYER_GROUPS), true)
  assert.equal(contact(PUSHER_GROUPS, PUSHER_GUIDE_GROUPS), true)
  assert.equal(contact(PUSHER_GROUPS, LEVEL_FLOOR_GROUPS), false)
  assert.equal(contact(PUSHER_GROUPS, LEVEL_STOPPER_GROUPS), true)
  assert.equal(contact(PLAYER_GROUPS, PUSHER_GUIDE_GROUPS), false)
  assert.equal(contact(PLAYER_GROUPS, LEVEL_FLOOR_GROUPS), true)
})
const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_01.json', pack))
const initialized = RAPIER.init()
async function trial(kind: Material) {
  await initialized
  const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
  const level = load('level_01'), module = load('p_modul_01')
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const stoppers = new Set(level.groups.find(g => g.name === 'Phys_FloorStopper')?.members)
  const floors = new Set(level.groups.filter(g => ['Phys_Floors', 'Phys_FloorRails', 'Phys_FloorStopper'].includes(g.name)).flatMap(g => g.members))
  for (const object of level.objects.filter(o => floors.has(o.id))) {
    const source = level.meshes.find(m => m.id === object.mesh); if (!source) continue
    const geometry = originalGeometry(source, object.matrix)
    world.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)).setCollisionGroups(stoppers.has(object.id) ? LEVEL_STOPPER_GROUPS : LEVEL_FLOOR_GROUPS), FLOOR_PHYSICS)); geometry.dispose()
  }
  const material = new THREE.MeshPhongMaterial(), materials = new Map(module.materials.map(m => [m.id, material]))
  const pushers = level.objects.filter(o => o.name.startsWith('P_Modul_01_')).map(o => new OriginalPusher(world, o, module, materials, 1))
  for (const pusher of pushers) pusher.setActive(true)
  const pusher = pushers[0]!
  const start = pusher.target.clone().addScaledVector(pusher.axis, -2.5)
  world.step()
  const hit = world.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 1.5, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, PLAYER_GROUPS)
  assert.ok(hit, 'approach must have a floor')
  start.y += 1.5 - hit.timeOfImpact + .51
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true))
  world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(PLAYER_GROUPS), PLAYER_PHYSICS[kind]), ball)
  configureBody(ball, PLAYER_PHYSICS[kind])
  const run = (seconds: number, push = 0) => {
    for (let i = 0; i < seconds / PHYSICS_STEP; i++) { for (const p of pushers) p.update(new THREE.Vector3().copy(ball.translation()), 1); if (push) driveBall(ball, kind, pusher.axis.x * push, pusher.axis.z * push, PHYSICS_STEP); world.step() }
  }
  return { world, pusher, pushers, ball, start, run, dispose: () => { world.free(); pushers.forEach(p => p.mesh.geometry.dispose()); material.dispose() } }
}
test('original Level 1: wood pushes the three-post assembly along its channel', { skip: !available }, async () => {
  const t = await trial('wood')
  try {
    assert.equal(t.pusher.body.numColliders(), 3)
    assert.ok(Math.abs(t.pusher.body.mass() - 3) < .0001)
    t.run(3, 1)
    assert.ok(t.pusher.travel > .65, `wood only moved the pusher ${t.pusher.travel}`)
    assert.ok(new THREE.Vector3().copy(t.ball.translation()).sub(t.start).dot(t.pusher.axis) > .8)
    assert.ok(Math.abs(t.pusher.body.translation().y - t.pusher.origin.y) < .15, 'guide supports the assembly')
    t.run(1.2, -1); t.run(3, 1)
    assert.ok(t.pusher.travel > 1.15, `the second rolling push must open the route: ${t.pusher.travel}`)
    assert.ok(t.pusher.travel < 1.35, 'the channel stops travel at its original end')
    assert.ok(Math.abs(t.pushers[1]!.travel) < .05, 'pushing one assembly does not move its neighbor')
  } finally { t.dispose() }
})
test('original Level 1: paper cannot bulldoze the gate; stone can push it', { skip: !available }, async () => {
  for (const kind of ['paper', 'stone'] as Material[]) {
    const t = await trial(kind)
    try {
      t.run(3, 1)
      if (kind === 'paper') assert.ok(Math.abs(t.pusher.travel) < .08)
      else assert.ok(t.pusher.travel > .65)
    } finally { t.dispose() }
  }
})

test('the actual Level 1 passage is blocked when closed and traversable after pushing both gates', { skip: !available }, async () => {
  for (const open of [false, true]) {
    const t = await trial('wood')
    try {
      const place = (point: THREE.Vector3, height: number) => {
        const hit = t.world.castRay(new RAPIER.Ray({ x: point.x, y: point.y + height, z: point.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, PLAYER_GROUPS, undefined, t.ball)
        assert.ok(hit)
        t.ball.setTranslation({ x: point.x, y: point.y + height - hit.timeOfImpact + .51, z: point.z }, true)
        t.ball.setLinvel({ x: 0, y: 0, z: 0 }, true); t.ball.setAngvel({ x: 0, y: 0, z: 0 }, true); t.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      }
      if (open) for (const pusher of t.pushers) {
        for (let push = 0; push < 2; push++) {
          place(pusher.target.clone().addScaledVector(pusher.axis, pusher.travel - 2.5), 1.5)
          t.run(3, 1)
        }
        assert.ok(pusher.travel > 1.15, `${pusher.name} travel ${pusher.travel}; ball ${JSON.stringify(t.ball.translation())}`)
      }
      const first = t.pushers[0]!, last = t.pushers[1]!
      const across = new THREE.Vector3(-first.axis.z, 0, first.axis.x)
      const start = first.passage.clone().addScaledVector(across, -2)
      place(start, 3)
      let crossed = false
      for (let i = 0; i < 3 / PHYSICS_STEP; i++) {
        driveBall(t.ball, 'wood', across.x, across.z, PHYSICS_STEP); t.world.step()
        if (new THREE.Vector3().copy(t.ball.translation()).sub(last.passage).dot(across) > 1 && t.ball.translation().y > first.passage.y - 1) { crossed = true; break }
      }
      assert.equal(crossed, open, `passage traversal must agree with gate state: ${JSON.stringify(t.ball.translation())}`)
      if (open) assert.ok(t.ball.translation().y > first.passage.y - 1, 'ball stays on the path while crossing')
    } finally { t.dispose() }
  }
})
