import RAPIER from '@dimforge/rapier3d-compat'
import type { Material } from './levels.ts'
import { SCALE } from './original-data.ts'
import { PLAYER_PHYSICS, configureBody, configureContact } from './original-physics.ts'
import { PLAYER_GROUPS } from './original-collisions.ts'
import source from './original-player-data.json' with { type: 'json' }
import inertiaSource from './original-player-inertia.json' with { type: 'json' }

export const ORIGINAL_PLAYER = source
export const ORIGINAL_PLAYER_INERTIA = inertiaSource

export function playerInertia(kind: Material) {
  const radius = source.bodies.find(b => b.shape === 'sphere')!.radius!
  const perMass = kind === 'paper' ? inertiaSource.measurements.paper.inertiaPerMass : [1, 1, 1].map(() => .4 * radius ** 2)
  const values = perMass.map(v => v * PLAYER_PHYSICS[kind].mass * SCALE ** 2)
  const minimum = Math.hypot(...values) * inertiaSource.minimumAxisFactor
  return { x: Math.max(values[0]!, minimum), y: Math.max(values[1]!, minimum), z: Math.max(values[2]!, minimum) }
}

/** Replace the player's shape without replacing its body or accumulating mass. */
export function replacePlayerCollider(world: RAPIER.World, body: RAPIER.RigidBody, kind: Material, vertices?: Float32Array) {
  const settings = source.bodies.find(b => b.shape === (kind === 'paper' ? 'convex' : 'sphere'))!
  const material = PLAYER_PHYSICS[kind]
  if (kind === 'paper' && !vertices) throw new Error('Original paper player requires its convex mesh')
  const desc = kind === 'paper' ? RAPIER.ColliderDesc.convexHull(vertices!) : RAPIER.ColliderDesc.ball(settings.radius! * SCALE)
  if (!desc) throw new Error(`Unable to build original ${kind} player collision shape`)
  while (body.numColliders()) world.removeCollider(body.collider(0), false)
  const collider = world.createCollider(configureContact(desc.setMass(material.mass).setCollisionGroups(PLAYER_GROUPS), material), body)
  collider.setEnabled(settings.enableCollision)
  body.recomputeMassPropertiesFromColliders()
  // Gameplay disables automatic mass-center calculation. IVP uses the compact
  // surface's diagonal inertia in the object's axes even when COM is overridden.
  // setMassProperties stores this on the collider, so material replacement cannot
  // leave additional body mass behind on a later transformation.
  const [x, y, z] = settings.massCenter
  collider.setMassProperties(material.mass, { x: x! * SCALE, y: y! * SCALE, z: -z! * SCALE }, playerInertia(kind), { x: 0, y: 0, z: 0, w: 1 })
  body.recomputeMassPropertiesFromColliders()
  configureBody(body, material)
  return collider
}
