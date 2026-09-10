import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalTransformerFrame, originalSpringStep } from './original-transformer-spring.ts'
import type { Material } from './levels.ts'
import clockData from './original-transformer-clock-data.json' with {type:'json'}

// Seconds, from Gameplay.nmo and AnimTrafo.nmo. See docs/original-transformer.md.
export const TRANSFORMATION = { entryFrames:clockData.entryDelayFrames, rearmFrames:clockData.rearmDelayFrames, open: .35, travel: 2, close: .2, capture: 1.35, dissolve: 2.35, swap: 2.5, duration: 2.55 } as const
type Point = { x: number; y: number; z: number }
const timerDurations=clockData.timers.map(timer=>timer.durationMs)
export class BallTransformation {
  age = 0
  active = false
  committed = false
  shattered = false
  kind: Material = 'wood'
  private body?: RAPIER.RigidBody
  private target: Point = { x: 0, y: 0, z: 0 }
  private previous: Point = { x: 0, y: 0, z: 0 }
  private timerStage=0
  private timerAge=0
  private springStarted=false
  private frame?: OriginalTransformerFrame
  private releaseFrames=0
  physicalized=false
  get ballVisible() { return !this.active || !this.shattered || this.committed }
  begin(body: RAPIER.RigidBody, current: Material, kind: Material, center: Point, machineMatrix?: readonly number[]) {
    if ((this.active&&!this.physicalized) || current === kind) return false
    this.body = body; this.target = { ...center }; this.previous = { ...body.translation() }
    this.frame = machineMatrix ? new OriginalTransformerFrame(machineMatrix) : undefined
    if(this.frame)this.previous=this.frame.local(body.translation())
    this.kind = kind; this.age = 0; this.committed = false; this.shattered = false; this.active = true
    this.timerStage=0;this.timerAge=0;this.releaseFrames=0;this.physicalized=false;this.springStarted=false
    body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    body.setBodyType(RAPIER.RigidBodyType.Fixed, true)
    this.collision(false)
    return true
  }
  step(dt: number, changeMaterial: (kind: Material) => void, shatter: () => void = () => {}, physicalize:()=>void=()=>{}) {
    if (!this.active || !this.body) return
    if(!Number.isFinite(dt)||dt<0)throw new Error('Invalid transformer frame duration')
    this.age += dt
    const deltaMs=Math.fround(dt*1000)
    const body = this.body
    if(this.committed&&!this.physicalized&&--this.releaseFrames===0) {
      this.release();physicalize();this.physicalized=true
    }
    if (!this.committed) {
      // Off performs one final spring update; subsequent delay frames retain
      // that position. The source graph has no snap-to-center Set Position.
      if (this.timerStage===0&&(this.springStarted||Math.fround(this.timerAge+deltaMs)>=timerDurations[0]!)) {
        const worldPosition = body.translation()
        const position = this.frame ? this.frame.local(worldPosition) : worldPosition
        const next = this.frame ? originalSpringStep(position,this.previous,{x:0,y:0,z:0},{x:0,y:-3,z:0},deltaMs) : { ...position }
        if(!this.frame)for (const axis of ['x', 'y', 'z'] as const) next[axis] = position[axis] + (this.target[axis] - position[axis]) * 2 * dt + (position[axis] - this.previous[axis]) * .7
        this.previous = { ...position }; body.setTranslation(this.frame ? this.frame.rendered(next) : next, true)
      }
      this.springStarted=true
      // Separate TimerMini behaviors. A zero-frame link starts the next timer
      // with this frame's DeltaTime, not the previous timer's overshoot.
      while(this.timerStage<timerDurations.length) {
        this.timerAge=Math.fround(this.timerAge+deltaMs)
        if(this.timerAge<timerDurations[this.timerStage]!)break
        this.timerStage++;this.timerAge=0
        if(this.timerStage===2){this.shattered=true;shatter()}
        if(this.timerStage===3){
          changeMaterial(this.kind);this.committed=true;this.releaseFrames=clockData.physicalizeDelayFrames
          this.collision(false);body.setBodyType(RAPIER.RigidBodyType.Fixed,true)
        }
      }
    }
    if (this.physicalized&&this.age >= TRANSFORMATION.duration) { this.active = false; this.body = undefined }
  }
  private collision(enabled: boolean) { if (this.body) for (let i = 0; i < this.body.numColliders(); i++) this.body.collider(i).setEnabled(enabled) }
  private release() {
    if (!this.body) return
    this.collision(true); this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  }
  cancel() { this.release(); this.body = undefined; this.active = false; this.committed = false; this.shattered = false; this.age = 0;this.timerStage=0;this.timerAge=0;this.releaseFrames=0;this.physicalized=false }
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
