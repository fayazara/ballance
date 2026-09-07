import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import RAPIER from '@dimforge/rapier3d-compat'
import { PLAYER_PHYSICS, LOOSE_BALL_PHYSICS, CRATE_PHYSICS, FLOOR_PHYSICS, GRAVITY, PHYSICS_STEP, configureContact, configureBody, driveBall } from '../src/game/original-physics.ts'
import type { Material } from '../src/game/levels.ts'

const initialized = RAPIER.init()
async function trial(kind: Material, withCrate: boolean) {
  await initialized
  const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); world.timestep = PHYSICS_STEP
  world.createCollider(configureContact(RAPIER.ColliderDesc.cuboid(40, .5, 20).setTranslation(0, -.5, 0), FLOOR_PHYSICS))
  const ball = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-1.126, .5, 0).setCcdEnabled(true))
  world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS[kind].mass), PLAYER_PHYSICS[kind]), ball)
  configureBody(ball, PLAYER_PHYSICS[kind])
  const crate = withCrate ? world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, .625, 0)) : null
  if (crate) { world.createCollider(configureContact(RAPIER.ColliderDesc.cuboid(.625, .625, .625).setMass(CRATE_PHYSICS.mass), CRATE_PHYSICS), crate); configureBody(crate, CRATE_PHYSICS) }
  return { world, ball, crate }
}
test('wood continuously pushes a crate; stone pushes harder; paper cannot bulldoze it', async () => {
  const distance: Partial<Record<Material, number>> = {}
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
    const { world, ball, crate } = await trial(kind, true)
    try {
      for (let i = 0; i < 396; i++) { driveBall(ball, kind, 1, 0, PHYSICS_STEP); world.step() }
      distance[kind] = crate!.translation().x
      assert.ok(Math.abs(crate!.translation().y - .625) < .03, 'the crate slides, rather than jumping over a collision')
    } finally { world.free() }
  }
  assert.ok(distance.wood! > 3, `wood moved the crate only ${distance.wood}`)
  assert.ok(distance.stone! > distance.wood! * 1.5)
  assert.ok(Math.abs(distance.paper!) < .05)
})
test('wood responds faster than stone; paper sheds velocity fastest when controls are released', async () => {
  const response: Partial<Record<Material, { acceleration: number; coastRatio: number }>> = {}
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
    const { world, ball } = await trial(kind, false)
    try {
      for (let i = 0; i < 66; i++) { driveBall(ball, kind, 1, 0, PHYSICS_STEP); world.step() }
      const speed = ball.linvel().x
      for (let i = 0; i < 132; i++) world.step()
      response[kind] = { acceleration: speed, coastRatio: ball.linvel().x / speed }
    } finally { world.free() }
  }
  assert.ok(response.wood!.acceleration > response.stone!.acceleration * 1.5)
  assert.ok(response.paper!.coastRatio < response.wood!.coastRatio)
  assert.ok(response.wood!.coastRatio < response.stone!.coastRatio)
})
test('original data tables, rather than tuning guesses, define player and loose-ball materials', () => {
  const evidence = JSON.parse(readFileSync(new URL('../docs/original-physics-evidence.json', import.meta.url), 'utf8'))
  for (const row of evidence.tables.Physicalize_GameBall.rows) {
    const kind = row.Ballname.replace('Ball_', '').toLowerCase() as Material, actual = PLAYER_PHYSICS[kind]
    assert.equal(actual.mass, row.Mass); assert.equal(actual.friction, row.Friction); assert.equal(actual.restitution, row.Elasticity)
    assert.equal(actual.driveImpulse, row.Force); assert.equal(actual.linearDamping, row['Linear Damp']); assert.equal(actual.angularDamping, row['Rot Damp'])
  }
  for (const row of evidence.tables.Physicalize_Balls.rows) {
    const kind = row['Group Name'].replace('P_Ball_', '').toLowerCase() as Material
    assert.equal(LOOSE_BALL_PHYSICS[kind].mass, row.Mass)
    assert.equal(LOOSE_BALL_PHYSICS[kind].friction, row.Friction)
  }
})
test('drive impulses conserve their intended strength across simulation rates and act in the air', async () => {
  await initialized
  const velocities = []
  for (const hz of [66, 132, 264]) {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 }); world.timestep = 1 / hz
    try {
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
      world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS.wood.mass), body)
      for (let i = 0; i < hz; i++) { driveBall(body, 'wood', 1, 0, 1 / hz); world.step() }
      velocities.push(body.linvel().x)
    } finally { world.free() }
  }
  assert.ok(Math.max(...velocities) - Math.min(...velocities) < .0001)
  assert.ok(Math.abs(velocities[0]! - 28.38 / 1.9) < .0001)
})
