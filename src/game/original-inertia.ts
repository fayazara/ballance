import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { SCALE } from './original-data.ts'
import { originalInertiaFrame, originalInertiaKey } from './original-inertia-frame.ts'
import source from './original-object-inertia.json' with { type: 'json' }
import fragments from './original-fragment-inertia.json' with { type: 'json' }

export const ORIGINAL_OBJECT_INERTIA = source
export const ORIGINAL_FRAGMENT_INERTIA = fragments
type Measurement = { center: number[]; inertiaPerMass: number[]; scale: number[] }
const measurements: Record<string, Measurement> = { ...source.measurements, ...fragments.measurements }

/** The original surface stores diagonal inertia in object axes, before placement rotation. */
export function originalConvexMass(mass: number, hulls: readonly string[], matrix: THREE.Matrix4, massCenter: readonly number[] = [0, 0, 0]) {
  const key = originalInertiaKey(hulls, matrix), measurement = measurements[key]
  if (!measurement) throw new Error(`Missing native original inertia measurement: ${key}`)
  const frame = originalInertiaFrame(matrix)
  const values = measurement.inertiaPerMass.map(v => v * mass * SCALE ** 2)
  const minimum = Math.hypot(...values) * source.minimumAxisFactor
  const inertia = new THREE.Vector3(...values.map(v => Math.max(v, minimum)) as [number, number, number])
  // FillTemplateInfo applies the authored shift directly in object coordinates;
  // GetScale affects collision vertices, not this override or the inertia axes.
  const center = new THREE.Vector3(massCenter[0], massCenter[1], -massCenter[2]!).multiplyScalar(SCALE).applyQuaternion(frame)
  return { center, inertia, frame }
}

export function applyOriginalConvexMass(body: RAPIER.RigidBody, mass: number, hulls: readonly string[], matrix: THREE.Matrix4, massCenter: readonly number[] = [0, 0, 0]) {
  const { center, inertia, frame } = originalConvexMass(mass, hulls, matrix, massCenter)
  for (let i = 0; i < body.numColliders(); i++) body.collider(i).setMass(0)
  body.setAdditionalMassProperties(mass, center, inertia, frame, false)
  body.recomputeMassPropertiesFromColliders()
}
