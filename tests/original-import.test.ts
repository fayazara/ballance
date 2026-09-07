import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { GRAVITY, PHYSICS_STEP } from '../src/game/original-physics.ts'
import { originalGeometry, originalPosition } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalMesh } from '../src/game/original-data.ts'

const triangle: OriginalMesh = { id: 1, positions: [0, 0, 0, 0, 0, 4, 4, 0, 0], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0], uvs: [0, 0, 0, 1, 1, 0], indices: [0, 1, 2], faceMaterials: [0], materials: [2] }
test('Virtools conversion preserves upward-facing triangles after changing handedness', () => {
  const geometry = originalGeometry(triangle, new THREE.Matrix4().makeTranslation(8, 12, -16).toArray())
  assert.deepEqual(Array.from(geometry.attributes.position!.array), [2, 3, 4, 2, 3, 3, 3, 3, 4])
  const indices = geometry.index!.array, positions = geometry.attributes.position!
  const vertices = Array.from(indices).map(i => new THREE.Vector3().fromBufferAttribute(positions, i))
  assert.ok(vertices[1]!.sub(vertices[0]!).cross(vertices[2]!.sub(vertices[0]!)).y > 0)
  assert.deepEqual(Array.from(geometry.attributes.uv!.array), [0, 1, 0, 0, 1, 1])
  geometry.dispose()
})
test('dynamic geometry retains rotation without applying its translation twice', () => {
  const matrix = new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(100, 20, -200).toArray()
  const local = originalGeometry(triangle, matrix, true), world = originalGeometry(triangle, matrix)
  const origin = originalPosition({ id: 1, name: 'test', mesh: 1, visible: true, matrix })
  for (let i = 0; i < 3; i++) {
    const a = new THREE.Vector3().fromBufferAttribute(local.attributes.position!, i).add(origin)
    const b = new THREE.Vector3().fromBufferAttribute(world.attributes.position!, i)
    assert.ok(a.distanceTo(b) < 1e-6)
  }
  local.dispose(); world.dispose()
})
const root = new URL('../.local/original/', import.meta.url)
test('all imported level reset points have a physical floor beneath them', { skip: !existsSync(new URL('manifest.json', root)) }, async () => {
  await RAPIER.init()
  for (let level = 1; level <= 12; level++) {
    const document = JSON.parse(readFileSync(new URL(`level_${String(level).padStart(2, '0')}.json`, root), 'utf8')) as OriginalDocument
    const floors = new Set(document.groups.filter(g => /^Phys_Floor/.test(g.name)).flatMap(g => g.members))
    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
    try {
      for (const object of document.objects.filter(o => floors.has(o.id))) {
        const mesh = document.meshes.find(m => m.id === object.mesh)!
        const geometry = originalGeometry(mesh, object.matrix)
        world.createCollider(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)))
        geometry.dispose()
      }
      const resets = new Set(document.groups.find(g => g.name === 'PR_Resetpoints')!.members)
      for (const reset of document.objects.filter(o => resets.has(o.id))) {
        const origin = originalPosition(reset)
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true))
        world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(1), body)
        for (let i = 0; i < 240; i++) world.step()
        const position = body.translation()
        assert.ok(Math.abs(position.y - origin.y) < 1, `Level ${level} ${reset.name}: ball fell from ${origin.y} to ${position.y}`)
        assert.ok(Math.abs(body.linvel().y) < .15, `Level ${level} ${reset.name}: ball did not settle`)
        world.removeRigidBody(body)
      }
    } finally { world.free() }
  }
})
test('sphere grounding detects paired rails even when a center ray misses the gap', async () => {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  try {
    for (const x of [-.3, .3]) world.createCollider(RAPIER.ColliderDesc.cuboid(.035, .035, 3).setTranslation(x, 0, 0))
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, .6, 0))
    world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(1), body)
    for (let i = 0; i < 240; i++) world.step()
    const p = body.translation()
    assert.ok(p.y > .4 && p.y < .5)
    assert.equal(world.castRay(new RAPIER.Ray(p, { x: 0, y: -1, z: 0 }), .65, true, undefined, undefined, undefined, body), null)
    assert.ok(world.castShape(p, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.48), 0, .15, true, undefined, undefined, undefined, body))
  } finally { world.free() }
})
