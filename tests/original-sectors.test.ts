import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import sectors from '../src/game/original-sector-data.json' with { type: 'json' }
import { OriginalPusher } from '../src/game/original-pusher.ts'
import { OriginalHinge, ORIGINAL_HINGES } from '../src/game/original-hinges.ts'
import type { HingeKind } from '../src/game/original-hinges.ts'
import { OriginalChain } from '../src/game/original-chain.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import { GRAVITY, PHYSICS_STEP } from '../src/game/original-physics.ts'

const ready = RAPIER.init(), pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('level_12.json', pack))
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))

test('all original scripted physics modules use sector activation/reset and recovered wake polling', () => {
  const modules = sectors.groups.filter(g => g['Group Names'].startsWith('P_Modul_'))
  assert.equal(modules.length, 13)
  assert.ok(modules.every(g => g.Activation === 1 && g.Reset === 1))
  for (const wake of Object.values(sectors.wake)) {
    assert.equal(wake.distance, 50); assert.equal(wake.axes, 5); assert.equal(wake.outputFlags, 4)
    assert.equal(wake.exactnessMin, 55); assert.equal(wake.exactnessMax, 100)
    assert.equal(wake.minFrameDelay, 10); assert.equal(wake.maxFrameDelay, 60)
  }
})

test('all 159 older mechanisms disable their sector physics and rebuild cleanly on re-entry', { skip: !available }, async () => {
  await ready
  const counts = { gates: 0, hinges: 0, chains: 0 }, material = new THREE.MeshPhongMaterial()
  try {
    for (let level = 1; level <= 12; level++) {
      const document = load(`level_${String(level).padStart(2, '0')}`)
      for (const parent of document.objects) {
        const hingeKind = (Object.keys(ORIGINAL_HINGES) as HingeKind[]).find(k => parent.name.startsWith(k + '_'))
        const group = hingeKind || (parent.name.startsWith('P_Modul_01_') ? 'P_Modul_01' : parent.name.startsWith('P_Modul_29_') ? 'P_Modul_29' : undefined)
        if (!group) continue
        const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
        const module = load(group.toLowerCase()), materials = new Map(module.materials.map(m => [m.id, material]))
        const sector = Number(document.groups.find(g => /^Sector_/.test(g.name) && g.members.includes(parent.id))?.name.slice(-2) || 1)
        const mechanism = hingeKind ? new OriginalHinge(world, parent, module, materials, sector, hingeKind)
          : group === 'P_Modul_01' ? new OriginalPusher(world, parent, module, materials, sector)
            : new OriginalChain(world, parent, module, materials, sector)
        const parts = mechanism instanceof OriginalChain ? mechanism.parts : [mechanism]
        const near = mechanism instanceof OriginalPusher ? mechanism.origin : mechanism.wakeOrigin
        const update = (activeSector: number, point = near) => mechanism instanceof OriginalChain
          ? mechanism.update(point, 'wood', activeSector) : mechanism.update(point, activeSector)
        const joints = mechanism instanceof OriginalChain ? 10 : mechanism instanceof OriginalHinge ? 1 : 0
        try {
          for (let repeat = 0; repeat < 3; repeat++) {
            // Being directly above/beside another sector must not activate its XZ proximity.
            for (let i = 0; i < 66; i++) { update(sector + 1); world.step() }
            assert.equal(mechanism.active, false); assert.equal(mechanism.activated, false)
            assert.equal(world.impulseJoints.len(), 0)
            assert.ok(parts.every(p => !p.body.isEnabled()), `${level}/${parent.name} inactive bodies`)
            const far = near.clone().add(new THREE.Vector3(30, 0, 30))
            update(sector, far)
            assert.equal(mechanism.active, true); assert.equal(world.impulseJoints.len(), joints)
            assert.ok(parts.every(p => p.body.isEnabled()))
            assert.equal(mechanism.activated, hingeKind === 'P_Modul_41')
            for (let i = 0; i < 66; i++) update(sector)
            assert.equal(mechanism.activated, true)
            if (mechanism instanceof OriginalPusher) assert.ok(mechanism.guides.every(c => c.isEnabled()))
            parts[0]!.body.applyImpulse({ x: 1, y: -1, z: 1 }, true)
            world.step()
            update(sector + 1)
            for (const part of parts) {
              assert.equal(part.body.isEnabled(), false)
              assert.ok(part.origin.distanceTo(part.body.translation()) < .0001)
              assert.ok(new THREE.Quaternion().copy(part.body.rotation()).angleTo(new THREE.Quaternion()) < .0001)
            }
            assert.equal(world.impulseJoints.len(), 0)
            if (mechanism instanceof OriginalPusher) assert.ok(mechanism.guides.every(c => !c.isEnabled()))
          }
          if (mechanism instanceof OriginalPusher) counts.gates++
          else if (mechanism instanceof OriginalHinge) counts.hinges++
          else counts.chains++
        } finally {
          parts.forEach(p => p.mesh.geometry.dispose())
          if (mechanism instanceof OriginalHinge) mechanism.decoration.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
          world.free()
        }
      }
    }
    assert.deepEqual(counts, { gates: 24, hinges: 118, chains: 17 })
  } finally { material.dispose() }
})

test('a broken bridge stays inactive in the next sector and rearms only upon re-entry', { skip: !available }, async () => {
  await ready
  const level = load('level_02'), module = load('p_modul_29'), material = new THREE.MeshPhongMaterial()
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
  const bridge = new OriginalChain(world, level.objects.find(o => o.name.startsWith('P_Modul_29_'))!, module, new Map(module.materials.map(m => [m.id, material])), 2)
  try {
    for (let repeat = 0; repeat < 3; repeat++) {
      for (let i = 0; i < 66; i++) bridge.update(bridge.releasePosition, 'stone', 1)
      assert.equal(bridge.broken, false); assert.equal(world.impulseJoints.len(), 0)
      assert.equal(bridge.update(bridge.releasePosition, 'stone', 2), true)
      assert.equal(bridge.broken, true); assert.equal(world.impulseJoints.len(), 9)
      bridge.update(bridge.releasePosition, 'stone', 3)
      assert.equal(bridge.broken, false); assert.equal(world.impulseJoints.len(), 0)
      assert.ok(bridge.parts.every(p => !p.body.isEnabled()))
    }
  } finally { bridge.parts.forEach(p => p.mesh.geometry.dispose()); material.dispose(); world.free() }
})
