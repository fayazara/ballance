import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { ORIGINAL_TIME_FACTOR } from './original-physics.ts'

export interface SpringCoefficients { length: number; constant: number; axialDamping: number; globalDamping: number }

/** Hooke force plus axial and full relative-velocity damping, in web world units. */
export function springImpulse(displacement: THREE.Vector3, relativeVelocity: THREE.Vector3, coefficients: SpringCoefficients, dt: number) {
  const length = displacement.length()
  if (length < 1e-7) return new THREE.Vector3()
  const normal = displacement.clone().divideScalar(length), time = ORIGINAL_TIME_FACTOR
  // Length is already scaled into world units. Stiffness scales by T²; damping by T.
  const axial = -(length - coefficients.length) * coefficients.constant * time ** 2
    - relativeVelocity.dot(normal) * coefficients.axialDamping * time
  return normal.multiplyScalar(axial).addScaledVector(relativeVelocity, -coefficients.globalDamping * time).multiplyScalar(dt)
}

/** Attach an offset point on a moving body to a fixed world point. */
export class OriginalSpring {
  body: RAPIER.RigidBody
  localPoint: THREE.Vector3
  fixedPoint: THREE.Vector3
  coefficients: SpringCoefficients
  constructor(body: RAPIER.RigidBody, localPoint: THREE.Vector3, fixedPoint: THREE.Vector3, coefficients: SpringCoefficients) {
    this.body = body; this.localPoint = localPoint; this.fixedPoint = fixedPoint; this.coefficients = coefficients
  }
  get point() { return this.localPoint.clone().applyQuaternion(this.body.rotation()).add(this.body.translation()) }
  update(dt: number) {
    const point = this.point
    const impulse = springImpulse(point.clone().sub(this.fixedPoint), new THREE.Vector3().copy(this.body.velocityAtPoint(point)), this.coefficients, dt)
    this.body.applyImpulseAtPoint(impulse, point, true)
  }
}
