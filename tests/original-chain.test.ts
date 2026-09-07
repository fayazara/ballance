import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalChain, ORIGINAL_CHAIN, CHAIN_GROUPS } from '../src/game/original-chain.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import type { Material } from '../src/game/levels.ts'
import { PHYSICS_STEP, GRAVITY, PLAYER_PHYSICS, FLOOR_PHYSICS, configureBody, configureContact, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'

const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_29.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, parent?: OriginalObject) {
  const document = load('p_modul_29'), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: 'P_Modul_29_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const chain = new OriginalChain(world, instance, document, new Map(document.materials.map(m => [m.id, material])), 1)
  return { chain, dispose: () => { chain.parts.forEach(p => p.mesh.geometry.dispose()); material.dispose() } }
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
test('original bridge topology has nine planks, two fixed ends, and one stone-triggered break', () => {
  assert.equal(ORIGINAL_CHAIN.parts.length, 9)
  assert.equal(ORIGINAL_CHAIN.parts.reduce((sum, p) => sum + p.mass, 0), 5)
  assert.equal(ORIGINAL_CHAIN.parts.find(p => p.mass === 1)?.target, 'P_Modul_29_Platte09')
  assert.equal(ORIGINAL_CHAIN.joints.length, 10)
  assert.equal(ORIGINAL_CHAIN.joints.filter(j => j.anchorObject === 'FixCube Object').length, 2)
  const breaking = ORIGINAL_CHAIN.joints.find(j => j.index === ORIGINAL_CHAIN.releaseHinge)!
  assert.equal(breaking.target, 'P_Modul_29_Platte07')
  assert.equal(breaking.anchorObject, 'P_Modul_29_Platte06')
  assert.equal(ORIGINAL_CHAIN.releaseBall, 'Ball_Stone')
  assert.equal(ORIGINAL_CHAIN.release.axes, 7, 'release checks vertical distance as well')
  assert.equal(ORIGINAL_CHAIN.wake.axes, 5)
  assert.ok(ORIGINAL_CHAIN.joints.every(j => !j.limitsEnabled))
  const contact = (a: number, b: number) => !!((a >>> 16) & (b & 0xffff)) && !!((b >>> 16) & (a & 0xffff))
  assert.equal(contact(CHAIN_GROUPS, CHAIN_GROUPS), false)
  assert.equal(contact(CHAIN_GROUPS, 0x0004ffff), true)
  assert.equal(contact(CHAIN_GROUPS, LEVEL_FLOOR_GROUPS), true)
})
test('bridge remains frozen far away, wakes, flexes under weight, and keeps its surviving anchors', { skip: !available }, async () => {
  await initialized
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  const t = make(world), c = t.chain
  try {
    for (let i = 0; i < 132; i++) { c.update(new THREE.Vector3(1000, 0, 1000), 'wood'); world.step() }
    for (const p of c.parts) {
      assert.equal(p.body.isDynamic(), false)
      assert.ok(new THREE.Vector3().copy(p.body.translation()).distanceTo(p.origin) < .00001)
      assert.equal(p.body.numColliders(), 1)
      assert.ok(Math.abs(p.body.mass() - ORIGINAL_CHAIN.parts.find(d => d.target === p.name)!.mass) < .00001)
    }
    for (let i = 0; i < 132; i++) { c.update(c.wakeOrigin.clone().add(new THREE.Vector3(0, 4, 0)), 'wood'); world.step() }
    assert.equal(c.activated, true)
    const center = c.parts.find(p => p.name.endsWith('04'))!
    center.body.applyImpulse({ x: 0, y: -1, z: 0 }, true)
    for (let i = 0; i < 396; i++) world.step()
    assert.ok(c.parts.some(p => Math.hypot(p.body.rotation().x, p.body.rotation().y, p.body.rotation().z) > .005))
    assert.ok(c.anchorError < .02, `hinges drifted ${c.anchorError}`)
    assert.equal(c.broken, false)
  } finally { t.dispose(); world.free() }
})
test('stone breaks only on entering the 3D trigger; wood/paper and a material change inside do not', { skip: !available }, async () => {
  await initialized
  for (const kind of ['wood', 'paper', 'stone'] as Material[]) {
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const t = make(world), c = t.chain
    try {
      const near = c.releasePosition.clone().add(new THREE.Vector3(0, .6, 0)), far = near.clone().add(new THREE.Vector3(0, 4, 0))
      const poll = (position: THREE.Vector3, material: Material) => { let events = 0; for (let i = 0; i < 132; i++) if (c.update(position, material)) events++; return events }
      assert.equal(poll(far, kind), 0)
      assert.equal(c.broken, false, 'a stone ball above another story must not break it')
      assert.equal(poll(near, kind), kind === 'stone' ? 1 : 0)
      if (kind !== 'stone') {
        assert.equal(poll(near, 'stone'), 0, 'original only emits Enter Range, not In Range')
        poll(far, 'stone'); assert.equal(poll(near, 'stone'), 1)
      }
      assert.equal(c.connections.filter(j => j.joint).length, 9)
      assert.equal(c.connections.find(j => !j.joint)?.index, 187)
      for (let i = 0; i < 396; i++) world.step()
      assert.ok(c.parts.some(p => p.body.translation().y < p.origin.y - .5), 'released planks must fall, not remain an invisible bridge')
      assert.ok(c.anchorError < .02)
      for (let reset = 0; reset < 3; reset++) {
        c.reset()
        assert.equal(c.broken, false); assert.equal(c.activated, false)
        assert.equal(c.connections.filter(j => j.joint).length, 10)
        assert.equal(world.impulseJoints.len(), 10, 'reset does not leak or duplicate joints')
        assert.ok(c.anchorError < .00001)
        for (const p of c.parts) { assert.equal(p.body.isDynamic(), false); assert.ok(new THREE.Vector3().copy(p.body.translation()).distanceTo(p.origin) < .00001) }
        assert.equal(poll(near, 'stone'), 1, 'break rearms after reset')
      }
    } finally { t.dispose(); world.free() }
  }
})
test('all 17 bridge instances retain their connections in their actual level geometry', { skip: !available }, async () => {
  await initialized
  let count = 0
  for (let levelIndex = 1; levelIndex <= 12; levelIndex++) {
    const level = load(`level_${String(levelIndex).padStart(2, '0')}`)
    const parents = level.objects.filter(p => p.name.startsWith('P_Modul_29_'))
    if (!parents.length) continue
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    const trials: ReturnType<typeof make>[] = []
    try {
      floor(world, level)
      for (const p of parents) { const t = make(world, p); trials.push(t); t.chain.update(t.chain.wakeOrigin, 'wood'); count++ }
      for (let i = 0; i < 660; i++) world.step()
      for (const { chain: c } of trials) assert.ok(c.anchorError < .025, `${levelIndex}/${c.name} drift ${c.anchorError}`)
    } finally { trials.forEach(t => t.dispose()); world.free() }
  }
  assert.equal(count, 17)
})
test('wood and paper cross the real Level 2 bridge; stone releases it through normal rolling contact', { skip: !available }, async () => {
  await initialized
  for (const kind of ['wood', 'paper', 'stone'] as Material[]) {
    const level = load('level_02'), world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    floor(world, level)
    const t = make(world, level.objects.find(p => p.name.startsWith('P_Modul_29_'))), c = t.chain
    try {
      const first = c.parts.find(p => p.name.endsWith('01'))!, last = c.parts.find(p => p.name.endsWith('09'))!
      const axis = last.origin.clone().sub(first.origin).normalize(), start = first.origin.clone().addScaledVector(axis, -1.5)
      world.step()
      const hit = world.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 3, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, 0x0004ffff)
      assert.ok(hit, 'bridge approach has a floor'); start.y += 3 - hit.timeOfImpact + .51
      const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true))
      let shape = RAPIER.ColliderDesc.ball(.5)
      if (kind === 'paper') {
        const doc = load('balls'), object = doc.objects.find(o => o.name === 'Ball_Paper')!
        const geometry = originalGeometry(doc.meshes.find(m => m.id === object.mesh)!, object.matrix, true)
        shape = RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!; geometry.dispose()
      }
      world.createCollider(configureContact(shape.setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(0x0004ffff), PLAYER_PHYSICS[kind]), ball)
      configureBody(ball, PLAYER_PHYSICS[kind])
      let crossed = false, events = 0
      for (let i = 0; i < 6 / PHYSICS_STEP; i++) {
        const player = new THREE.Vector3().copy(ball.translation())
        if (c.update(player, kind)) events++
        driveBall(ball, kind, axis.x, axis.z, PHYSICS_STEP); world.step()
        if (new THREE.Vector3().copy(ball.translation()).sub(last.origin).dot(axis) > 1 && ball.translation().y > last.origin.y - .1) { crossed = true; break }
      }
      if (kind !== 'stone') { assert.equal(crossed, true, `${kind} failed crossing: ${JSON.stringify(ball.translation())}`); assert.equal(c.broken, false) }
      else { assert.equal(c.broken, true); assert.equal(events, 1) }
    } finally { t.dispose(); world.free() }
  }
})
