import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { ORIGINAL_OBJECT_INERTIA } from '../src/game/original-inertia.ts'
import { OriginalSectorObject, ORIGINAL_OBJECTS } from '../src/game/original-objects.ts'
import type { OriginalObjectKind } from '../src/game/original-objects.ts'
import { OriginalHinge, ORIGINAL_HINGES } from '../src/game/original-hinges.ts'
import type { HingeKind } from '../src/game/original-hinges.ts'
import { OriginalPusher, PUSHER_PHYSICS } from '../src/game/original-pusher.ts'
import { OriginalArms, ORIGINAL_ARMS } from '../src/game/original-arms.ts'
import { OriginalSwing, ORIGINAL_SWING } from '../src/game/original-swing.ts'
import { OriginalLift, ORIGINAL_LIFT } from '../src/game/original-lift.ts'
import { OriginalSlider, ORIGINAL_SLIDER } from '../src/game/original-slider.ts'
import { OriginalSack, ORIGINAL_SACK } from '../src/game/original-sack.ts'
import { OriginalChain, ORIGINAL_CHAIN } from '../src/game/original-chain.ts'

const pack = new URL('../.local/original/', import.meta.url), available = existsSync(new URL('level_12.json', pack))
const ready = RAPIER.init(), documents = new Map<string, OriginalDocument>()
const load = (name: string) => {
  if (!documents.has(name)) documents.set(name, JSON.parse(readFileSync(new URL(`${name.toLowerCase()}.json`, pack), 'utf8')))
  return documents.get(name)!
}
type Settings = { mass: number; massCenter: readonly number[] }
type Part = { body: RAPIER.RigidBody; target: string; settings: Settings }
function create(world: RAPIER.World, parent: OriginalObject, doc: OriginalDocument, kind: string, materials: Map<number, THREE.MeshPhongMaterial>): Part[] {
  if (kind in ORIGINAL_HINGES) {
    const settings = ORIGINAL_HINGES[kind as HingeKind]
    return [{ body: new OriginalHinge(world, parent, doc, materials, 1, kind as HingeKind).body, target: settings.target, settings }]
  }
  if (kind === 'P_Box' || kind === 'P_Ball_Paper') return [{ body: new OriginalSectorObject(world, parent, doc, materials, 1, kind as OriginalObjectKind).body, target: `${kind}_MF`, settings: ORIGINAL_OBJECTS[kind] }]
  if (kind === 'P_Modul_01') return [{ body: new OriginalPusher(world, parent, doc, materials, 1).body, target: 'P_Modul_01_Pusher', settings: { ...PUSHER_PHYSICS, massCenter: [0,0,0] } }]
  if (kind === 'P_Modul_17') return [{ body: new OriginalArms(world, parent, doc, materials, 1).body, target: ORIGINAL_ARMS.body.target, settings: ORIGINAL_ARMS.body }]
  if (kind === 'P_Modul_08') return [{ body: new OriginalSwing(world, parent, doc, materials, 1).body, target: ORIGINAL_SWING.body.target, settings: ORIGINAL_SWING.body }]
  const modules = {
    P_Modul_03: [OriginalLift, ORIGINAL_LIFT.parts], P_Modul_34: [OriginalSlider, ORIGINAL_SLIDER.parts],
    P_Modul_26: [OriginalSack, ORIGINAL_SACK.parts], P_Modul_29: [OriginalChain, ORIGINAL_CHAIN.parts],
  } as const
  const [Constructor, settings] = modules[kind as keyof typeof modules]
  const mechanism = new Constructor(world, parent, doc, materials, 1)
  return mechanism.parts.map(part => ({ body: part.body, target: part.name, settings: settings.find(data => data.target === part.name)! }))
}

test('native inertia controls distinguish axes and preserve the IVP square-root combination', () => {
  const controls = ORIGINAL_OBJECT_INERTIA.controls
  assert.ok(controls.unitCube.inertiaPerMass.every(v => Math.abs(v - Math.SQRT2 / 3) < 1e-6))
  const moments = [4/3, 3, 16/3]
  controls.rectangularControl.inertiaPerMass.forEach((v, axis) => {
    assert.ok(Math.abs(v - Math.hypot(moments[(axis+1)%3]!, moments[(axis+2)%3]!)) < 1e-6)
  })
})

test('all measured compound hulls match the original mesh bytes and actual placement scales', { skip: !available }, () => {
  const seen = new Set<string>()
  for (const [key, measurement] of Object.entries(ORIGINAL_OBJECT_INERTIA.measurements)) {
    for (const placement of measurement.placements) {
      assert.equal(seen.has(placement), false, `duplicate ${placement}`); seen.add(placement)
      const [level, parentName, target] = placement.split(':')
      const parent = load(`level_${level!.padStart(2, '0')}`).objects.find(o => o.name === parentName)!
      const kind = parentName!.replace(/_\d+$/, ''), doc = load(kind)
      const object = doc.objects.find(o => o.name === target)!
      const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
      const scale = new THREE.Vector3().setFromMatrixScale(matrix).toArray()
      scale.forEach((v, i) => assert.ok(Math.abs(v - measurement.scale[i]!) < 1e-10))
      const axes = [0,1,2].map(axis => new THREE.Vector3().setFromMatrixColumn(matrix, axis).normalize())
      assert.ok(matrix.determinant() > 0, `${placement}: mirrored source needs separate orientation handling`)
      assert.ok(Math.max(Math.abs(axes[0]!.dot(axes[1]!)), Math.abs(axes[1]!.dot(axes[2]!)), Math.abs(axes[0]!.dot(axes[2]!))) < .00001, `${placement}: unexpected shear`)
      key.split('@')[0]!.split('|').forEach((name, index) => {
        const positions = doc.meshes.find(m => m.name === name)!.positions
        const bytes = Buffer.alloc(positions.length * 4); positions.forEach((v,i) => bytes.writeFloatLE(v,i*4))
        assert.equal(createHash('sha256').update(bytes).digest('hex'), measurement.positionsSha256[index], `${placement}: ${name}`)
      })
    }
  }
  assert.equal(seen.size, 547, 'all placed convex props and implemented moving mechanism bodies')
})

test('547 actual mechanism and prop bodies use native inertia axes, minimum inertia and authored mass centers', { skip: !available }, async () => {
  await ready
  const expected = new Map(Object.values(ORIGINAL_OBJECT_INERTIA.measurements).flatMap(m => m.placements.map(p => [p, m] as const)))
  const kinds = ['P_Box', 'P_Ball_Paper', 'P_Modul_01', 'P_Modul_17', 'P_Modul_08', 'P_Modul_03', 'P_Modul_34', 'P_Modul_26', 'P_Modul_29', ...Object.keys(ORIGINAL_HINGES)]
  let count = 0, clamped = 0
  const bodyRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.31, -.82, .24))
  for (let level = 1; level <= 12; level++) {
    for (const parent of load(`level_${String(level).padStart(2, '0')}`).objects) {
      const kind = kinds.find(k => parent.name.startsWith(k + '_')); if (!kind) continue
      const doc = load(kind), material = new THREE.MeshPhongMaterial()
      const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
      try {
        for (const part of create(world, parent, doc, kind, new Map(doc.materials.map(m => [m.id, material])))) {
          const name = `${level}:${parent.name}:${part.target}`, measurement = expected.get(name)
          assert.ok(measurement, `unmeasured runtime body: ${name}`)
          const object = doc.objects.find(o => o.name === part.target)!
          const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
          const { body, settings } = part
          body.setEnabled(true); body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
          body.setRotation(bodyRotation, true); body.recomputeMassPropertiesFromColliders()
          assert.ok(Math.abs(body.mass() - settings.mass) < 1e-5, name)
          const moments = measurement.inertiaPerMass.map(v => v * settings.mass * .25 ** 2)
          const minimum = Math.hypot(...moments) * .03
          const center = new THREE.Vector3()
          for (let axis = 0; axis < 3; axis++) {
            // Independently construct original world axes from matrix columns.
            const direction = new THREE.Vector3().setFromMatrixColumn(matrix, axis).normalize(); direction.z *= -1
            center.addScaledVector(direction, settings.massCenter[axis]! * .25)
            direction.applyQuaternion(bodyRotation)
            body.setAngvel({ x: 0, y: 0, z: 0 }, true)
            const inertia = Math.max(moments[axis]!, minimum)
            if (inertia > moments[axis]!) clamped++
            body.applyTorqueImpulse(direction.clone().multiplyScalar(inertia), true)
            assert.ok(new THREE.Vector3().copy(body.angvel()).distanceTo(direction) < .0001, `${name}: axis ${axis} angular response`)
          }
          assert.ok(new THREE.Vector3().copy(body.localCom()).distanceTo(center) < .00001, `${name}: COM`)
          count++
        }
      } finally { world.free(); material.dispose() }
    }
  }
  assert.equal(count, 547); assert.ok(clamped > 0, 'thin original parts exercise the IVP minimum-axis guard')
})
