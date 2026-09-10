import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalDebris } from '../src/game/original-debris.ts'
import { BallTransformation } from '../src/game/original-transformation.ts'
import { PHYSICS_STEP } from '../src/game/original-physics.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import type { Material } from '../src/game/levels.ts'

const initialized = RAPIER.init()
test('shattering happens once before replacement, and cancellation prevents a delayed burst', async () => {
  await initialized
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  try {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
    world.createCollider(RAPIER.ColliderDesc.ball(.5), body)
    const animation = new BallTransformation(), events: string[] = []
    animation.begin(body, 'wood', 'stone', { x: 0, y: .75, z: 0 })
    while (animation.active) animation.step(PHYSICS_STEP, () => events.push('replace'), () => events.push('shatter'))
    assert.deepEqual(events, ['shatter', 'replace'])
    animation.begin(body, 'stone', 'wood', { x: 0, y: .75, z: 0 }); animation.cancel()
    animation.step(5, () => events.push('replace'), () => events.push('shatter'))
    assert.deepEqual(events, ['shatter', 'replace'])
  } finally { world.free() }
})
test('all original materials shatter into bounded, simulated fragments that expire and clean up', async t => {
  const path = new URL('../.local/original/balls.json', import.meta.url)
  if (!existsSync(path)) { t.skip('requires locally imported original balls'); return }
  await initialized
  const document = JSON.parse(readFileSync(path, 'utf8')) as OriginalDocument
  const materials = new Map(document.materials.map(m => [m.id, new THREE.MeshPhongMaterial()]))
  const debris = new OriginalDebris(document, materials)
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 }); world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, .5, 20).setTranslation(0, -.5, 0))
  try {
    const expected = { wood: 16, stone: 17, paper: 18 }
    for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
      debris.spawn(world, kind, new THREE.Vector3(0, .75, 0), () => .5)
      assert.equal(debris.fragments.filter(f => f.kind === kind).length, expected[kind])
      const starting = debris.fragments.filter(f => f.kind === kind).map(f => f.body.translation())
      for (let i = 0; i < 66; i++) { debris.beforeStep(PHYSICS_STEP); world.step(); debris.step(world, PHYSICS_STEP) }
      assert.ok(debris.fragments.filter(f => f.kind === kind).some((f, i) => f.mesh.position.distanceTo(new THREE.Vector3(starting[i]!.x, starting[i]!.y, starting[i]!.z)) > .1))
      assert.ok(debris.fragments.every(f => Number.isFinite(f.body.translation().y)))
    }
    assert.equal(debris.fragments.length, 51)
    debris.spawn(world, 'wood', new THREE.Vector3(0, .75, 0), () => .5)
    assert.equal(debris.fragments.length, 51, 'repeated transformations replace the old material pool')
    debris.step(world, 23)
    assert.equal(debris.fragments.length, 0); assert.equal(world.bodies.len(), 0)
    debris.spawn(world, 'paper', new THREE.Vector3(0, .75, 0))
    debris.clear(world)
    assert.equal(debris.group.children.length, 0); assert.equal(world.bodies.len(), 0)
  } finally { debris.clear(world); world.free(); debris.dispose(); materials.forEach(m => m.dispose()) }
})
