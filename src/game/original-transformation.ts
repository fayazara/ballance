import RAPIER from '@dimforge/rapier3d-compat'
import type { Material } from './levels.ts'

// Seconds, from Gameplay.nmo and AnimTrafo.nmo. See docs/original-transformer.md.
export const TRANSFORMATION = { open: .35, travel: 2, close: .2, capture: 1.35, dissolve: 2.35, swap: 2.5, duration: 2.55 } as const
type Point = { x: number; y: number; z: number }
export class BallTransformation {
  age = 0
  active = false
  committed = false
  shattered = false
  kind: Material = 'wood'
  private body?: RAPIER.RigidBody
  private target: Point = { x: 0, y: 0, z: 0 }
  private previous: Point = { x: 0, y: 0, z: 0 }
  get ballVisible() { return !this.active || this.age < TRANSFORMATION.dissolve || this.committed }
  begin(body: RAPIER.RigidBody, current: Material, kind: Material, center: Point) {
    if (this.active || current === kind) return false
    this.body = body; this.target = { ...center }; this.previous = { ...body.translation() }
    this.kind = kind; this.age = 0; this.committed = false; this.shattered = false; this.active = true
    body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
    this.collision(false)
    return true
  }
  step(dt: number, changeMaterial: (kind: Material) => void, shatter: () => void = () => {}) {
    if (!this.active || !this.body) return
    this.age += dt
    const body = this.body
    if (!this.committed) {
      const position = body.translation()
      // Original TT Set Dynamic Position: force 2 on each axis, damping .7.
      const next = { ...this.target }
      if (this.age < TRANSFORMATION.capture) {
        for (const axis of ['x', 'y', 'z'] as const) next[axis] = position[axis] + (this.target[axis] - position[axis]) * 2 * dt + (position[axis] - this.previous[axis]) * .7
      }
      this.previous = { ...position }; body.setTranslation(next, true)
      if (!this.shattered && this.age >= TRANSFORMATION.dissolve) { this.shattered = true; shatter() }
      if (this.age >= TRANSFORMATION.swap) {
        changeMaterial(this.kind); this.committed = true
        this.release()
      }
    }
    if (this.age >= TRANSFORMATION.duration) { this.active = false; this.body = undefined }
  }
  private collision(enabled: boolean) { if (this.body) for (let i = 0; i < this.body.numColliders(); i++) this.body.collider(i).setEnabled(enabled) }
  private release() {
    if (!this.body) return
    this.collision(true); this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
  cancel() { this.release(); this.body = undefined; this.active = false; this.committed = false; this.shattered = false; this.age = 0 }
}

// Reconstruct the saved 2D curves from their knot positions and tangent slopes.
type Knot = [x: number, y: number, incoming: number, outgoing: number]
const openCurve: Knot[] = [[0, 0, .050015, .050015], [.4, 1, 5.384939, 5.384939], [1, 1, 1.700507, 1.700507]]
const travelCurve: Knot[] = [[0, 0, 0, 0], [.4, 1, .915659, .915659], [.6, 1, -.93528, -.93528], [1, 0, -.188945, -.188945]]
const closeCurve: Knot[] = [[0, 1, .050015, .050015], [1, 0, -2.479907, -2.479907]]
function curve(knots: Knot[], time: number) {
  const x = Math.max(0, Math.min(1, time))
  const end = knots.findIndex((k, i) => i > 0 && x <= k[0])
  const a = knots[end - 1]!, b = knots[end]!, width = b[0] - a[0], t = (x - a[0]) / width
  return (2 * t ** 3 - 3 * t ** 2 + 1) * a[1] + (t ** 3 - 2 * t ** 2 + t) * width * a[3] + (-2 * t ** 3 + 3 * t ** 2) * b[1] + (t ** 3 - t ** 2) * width * b[2]
}
export function transformerPose(age: number) {
  const closeAt = TRANSFORMATION.open + TRANSFORMATION.travel
  return {
    opening: age < TRANSFORMATION.open ? curve(openCurve, age / TRANSFORMATION.open) : age < closeAt ? 1 : curve(closeCurve, (age - closeAt) / TRANSFORMATION.close),
    height: age < TRANSFORMATION.open || age >= closeAt ? 0 : 5.2 * .25 * curve(travelCurve, (age - TRANSFORMATION.open) / TRANSFORMATION.travel),
    flashing: age >= TRANSFORMATION.open && age < closeAt,
    flashOffset: Math.floor(Math.max(0, age - TRANSFORMATION.open) / .05) % 2 * .5,
  }
}
