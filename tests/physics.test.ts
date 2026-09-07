import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RADIUS, stepBall, supportAt } from '../src/game/physics.ts'
import type { Ball } from '../src/game/physics.ts'
import { levels } from '../src/game/levels.ts'
import type { Level, Material } from '../src/game/levels.ts'
const flat: Level = { ...levels[0]!, surfaces: [{ x: 0, y: 0, z: 0, w: 100, d: 100, kind: 'stone' }] }
const ball = (material: Material = 'wood'): Ball => ({ x: 0, y: RADIUS, z: 0, vx: 0, vy: 0, vz: 0, grounded: true, material })
function simulate(b: Ball, seconds: number, input = { x: 0, z: -1, brake: false, strength: 1 }, level = flat, hz = 120) {
  for (let t = 0; t < Math.round(seconds * hz); t++) stepBall(b, level, input, new Set(), 1 / hz)
  return b
}
test('the ball rests on a platform without sinking', () => {
  const b = simulate(ball(), 10, { x: 0, z: 0, brake: false, strength: 1 })
  assert.equal(b.y, RADIUS); assert.equal(b.grounded, true)
})
test('the brake removes momentum more quickly than free rolling', () => {
  const rolling = ball(), braking = ball(); rolling.vx = braking.vx = 4
  simulate(rolling, 0.5, { x: 0, z: 0, brake: false, strength: 1 }); simulate(braking, 0.5, { x: 0, z: 0, brake: true, strength: 1 })
  assert.ok(braking.vx < rolling.vx / 10)
})
test('material changes affect acceleration and inertia', () => {
  const wood = simulate(ball('wood'), 0.5), stone = simulate(ball('stone'), 0.5), paper = simulate(ball('paper'), 0.5)
  assert.ok(Math.abs(paper.vz) > Math.abs(wood.vz)); assert.ok(Math.abs(wood.vz) > Math.abs(stone.vz))
})
test('steering-strength preference changes acceleration', () => {
  const gentle = simulate(ball(), 0.5, { x: 1, z: 0, brake: false, strength: 0.6 })
  const strong = simulate(ball(), 0.5, { x: 1, z: 0, brake: false, strength: 1.4 })
  assert.ok(strong.vx > gentle.vx * 1.8)
})
test('diagonal input does not grant a speed boost', () => {
  const a = simulate(ball(), 1), b = simulate(ball(), 1, { x: 1, z: -1, brake: false, strength: 1 })
  assert.ok(Math.abs(Math.hypot(a.vx, a.vz) - Math.hypot(b.vx, b.vz)) < 0.001)
})
test('leaving the edge starts a fall', () => {
  const b = ball(); b.x = 49.9; b.vx = 4
  simulate(b, 1, { x: 1, z: 0, brake: false, strength: 1 })
  assert.equal(b.grounded, false); assert.ok(b.y < -1)
})
test('broken surfaces no longer support a ball', () => {
  assert.equal(supportAt(flat.surfaces, 0, 0, new Set([0])).height, -Infinity)
})
test('ramps remain traversable without falling through at their seams', () => {
  const level = levels[0]!, b = ball(); b.x = 10; b.z = -6
  for (let i = 0; i < 330; i++) {
    stepBall(b, level, { x: 0, z: -1, brake: false }, new Set(), 1 / 120)
    assert.ok(b.y >= RADIUS - 0.05)
  }
  assert.ok(b.z < -15); assert.ok(Math.abs(b.y - (2 + RADIUS)) < 0.05); assert.equal(b.grounded, true)
})
test('both paper fan jumps can land on their destination platforms', () => {
  for (const index of [1, 2]) {
    const level = levels[index]!, fan = level.fans[0]!, b = ball('paper')
    Object.assign(b, { x: fan.x, z: fan.z, y: fan.y + RADIUS, vy: 8, vz: -5.3, grounded: false })
    simulate(b, 1.3, { x: 0, z: -1, brake: false, strength: 1 }, level)
    assert.equal(b.grounded, true, `course ${index + 1}`)
    assert.ok(b.z < fan.z - 5)
  }
})
test('60 Hz and 120 Hz physics agree closely', () => {
  const a = simulate(ball(), 2, undefined, flat, 60), b = simulate(ball(), 2, undefined, flat, 120)
  assert.ok(Math.abs(a.z - b.z) < 0.08)
})
