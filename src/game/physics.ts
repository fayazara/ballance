import type { Level, Material, Surface } from './levels.ts'
export const RADIUS = 0.55
export const properties = {
  wood: { acceleration: 8, drag: 1.2, speed: 5.5, weight: 1 },
  stone: { acceleration: 5.5, drag: 0.8, speed: 4.5, weight: 3 },
  paper: { acceleration: 10, drag: 1.9, speed: 5.6, weight: 0.2 },
}
export type Ball = { x: number; y: number; z: number; vx: number; vy: number; vz: number; material: Material; grounded: boolean }
export function surfaceHeight(s: Surface, x: number, z: number) {
  if (s.endY === undefined) return s.y
  const t = s.axis === 'x' ? (x - s.x) / s.w + 0.5 : 0.5 - (z - s.z) / s.d
  return s.y + (s.endY - s.y) * Math.max(0, Math.min(1, t))
}
export function supportAt(surfaces: Surface[], x: number, z: number, broken: Set<number>) {
  let height = -Infinity, index = -1
  surfaces.forEach((s, i) => {
    if (!broken.has(i) && Math.abs(x - s.x) <= s.w / 2 && Math.abs(z - s.z) <= s.d / 2) {
      const h = surfaceHeight(s, x, z)
      if (h > height) { height = h; index = i }
    }
  })
  return { height, index }
}
export function stepBall(ball: Ball, level: Level, input: { x: number; z: number; brake: boolean; strength?: number }, broken: Set<number>, dt: number) {
  const p = properties[ball.material]
  const control = ball.grounded ? 1 : 0.22
  const length = Math.max(1, Math.hypot(input.x, input.z))
  ball.vx += input.x / length * p.acceleration * control * (input.strength ?? 1) * dt
  ball.vz += input.z / length * p.acceleration * control * (input.strength ?? 1) * dt
  const drag = Math.exp(-(ball.grounded ? (input.brake ? 9 : p.drag) : 0.08) * dt)
  ball.vx *= drag; ball.vz *= drag
  const speed = Math.hypot(ball.vx, ball.vz)
  if (speed > p.speed) { ball.vx *= p.speed / speed; ball.vz *= p.speed / speed }
  const oldY = ball.y
  ball.x += ball.vx * dt; ball.z += ball.vz * dt
  const support = supportAt(level.surfaces, ball.x, ball.z, broken)
  if (ball.grounded && support.index >= 0 && Math.abs(oldY - RADIUS - support.height) < 0.35) {
    ball.y = support.height + RADIUS
    const s = level.surfaces[support.index]
    if (s.endY !== undefined) {
      const slope = (s.endY - s.y) / (s.axis === 'x' ? s.w : s.d)
      if (s.axis === 'x') ball.vx -= slope * 5 * dt
      else ball.vz += slope * 5 * dt
    }
  } else {
    ball.grounded = false
    ball.vy -= 14 * dt; ball.y += ball.vy * dt
    if (ball.vy <= 0 && support.index >= 0 && oldY - RADIUS >= support.height - 0.08 && ball.y - RADIUS <= support.height) {
      ball.y = support.height + RADIUS; ball.vy = 0; ball.grounded = true
    }
  }
  return support.index
}
