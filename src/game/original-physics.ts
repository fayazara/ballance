import RAPIER from '@dimforge/rapier3d-compat'
import type { Material } from './levels.ts'
import { SCALE } from './original-data.ts'

// Numerical values recovered from Balls.nmo and Levelinit.nmo; see the evidence document.
export interface PhysicalMaterial { mass: number; friction: number; restitution: number; linearDamping: number; angularDamping: number }
export const PLAYER_PHYSICS: Record<Material, PhysicalMaterial & { driveImpulse: number }> = {
  wood: { mass: 1.9, friction: .8, restitution: .2, linearDamping: .9, angularDamping: .1, driveImpulse: .43 },
  stone: { mass: 10, friction: .5, restitution: .1, linearDamping: .3, angularDamping: .1, driveImpulse: .92 },
  paper: { mass: .2, friction: .5, restitution: .4, linearDamping: 1.5, angularDamping: .1, driveImpulse: .065 },
}
export const LOOSE_BALL_PHYSICS: Record<Material, PhysicalMaterial> = {
  wood: { mass: 2, friction: .6, restitution: .2, linearDamping: .6, angularDamping: .1 },
  stone: { mass: 10, friction: .7, restitution: .1, linearDamping: .2, angularDamping: .1 },
  paper: PLAYER_PHYSICS.paper,
}
export const CRATE_PHYSICS: PhysicalMaterial = { mass: 1, friction: .7, restitution: .3, linearDamping: .1, angularDamping: .1 }
// P_Dome is fixed. Its table's mass and damping values do not make it a dynamic body.
export const DOME_PHYSICS = { friction: .2, restitution: .8 }
export const FLOOR_PHYSICS = { friction: .7, restitution: .3 }
// Gameplay.nmo runs the IVP clock at 2x. IVP's default simulation rate is 66 Hz.
export const ORIGINAL_TIME_FACTOR = 2
export const ORIGINAL_PSI_HZ = 66
export const PHYSICS_STEP = 1 / (ORIGINAL_PSI_HZ * ORIGINAL_TIME_FACTOR)
export const GRAVITY = -20 * SCALE * ORIGINAL_TIME_FACTOR ** 2
export const BALL_RADIUS = 2 * SCALE
export function configureContact(collider: RAPIER.ColliderDesc, material: Pick<PhysicalMaterial, 'friction' | 'restitution'>) {
  // IVP multiplies both coefficients, whereas Rapier defaults to averaging them.
  return collider.setFriction(material.friction).setRestitution(material.restitution)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply).setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
}
export function configureBody(body: RAPIER.RigidBody, material: PhysicalMaterial, dt = PHYSICS_STEP) {
  // Match IVP's exponential decay using Rapier's reciprocal damping formula.
  body.setLinearDamping(Math.expm1(material.linearDamping * ORIGINAL_TIME_FACTOR * dt) / dt)
  body.setAngularDamping(Math.expm1(material.angularDamping * ORIGINAL_TIME_FACTOR * dt) / dt)
}
export function driveBall(body: RAPIER.RigidBody, kind: Material, x: number, z: number, dt: number, sensitivity = 1) {
  // SetPhysicsForce actually applies an impulse each IVP tick, at the ball center.
  // Scale momentum by S*T and account for 66*T ticks per real second.
  const impulse = PLAYER_PHYSICS[kind].driveImpulse * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ * dt * sensitivity
  body.applyImpulse({ x: x * impulse, y: 0, z: z * impulse }, true)
}
