import RAPIER from '@dimforge/rapier3d-compat'
import type { Material } from './levels.ts'
import { SCALE } from './original-data.ts'
import { PLAYER_PHYSICS, configureBody, configureContact } from './original-physics.ts'
import { PLAYER_GROUPS } from './original-collisions.ts'
import source from './original-player-data.json' with { type: 'json' }

export const ORIGINAL_PLAYER = source

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
  // Gameplay disables automatic mass-center calculation. Keep the existing
  // Rapier shape inertia approximation, but anchor mass at the authored origin.
  // setMassProperties stores this on the collider, so material replacement cannot
  // leave additional body mass behind on a later transformation.
  const [x, y, z] = settings.massCenter
  collider.setMassProperties(material.mass, { x: x! * SCALE, y: y! * SCALE, z: -z! * SCALE }, body.principalInertia(), body.principalInertiaLocalFrame())
  body.recomputeMassPropertiesFromColliders()
  configureBody(body, material)
  return collider
}
