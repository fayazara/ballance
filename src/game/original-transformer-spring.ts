import { Matrix4 } from 'three'
export type OriginalSpringPoint={x:number;y:number;z:number}
/** TT Set Dynamic Position's arithmetic, in the caller's original local frame.
 * Matrix conversion and On/Off scheduling are the caller's responsibility. */
export function originalSpringStep(current:OriginalSpringPoint,previous:OriginalSpringPoint,object:OriginalSpringPoint,offset:OriginalSpringPoint,deltaMs:number) {
  const f=Math.fround,coefficient=f(f(2)*f(f(deltaMs)*f(.001))),damping=f(.7)
  const next={...current}
  for(const axis of ['x','y','z'] as const){
    const position=f(f(object[axis])-f(current[axis])),delta=f(f(current[axis])-f(previous[axis]))
    next[axis]=f(f(current[axis])+f(f(f(position-f(offset[axis]))*coefficient)+f(delta*damping)))
  }
  return next
}

/** Convert rendered positions to the saved machine frame. Matrix inversion uses
 * Three.js; exact VxMath inversion rounding remains an independent parity gap. */
export class OriginalTransformerFrame {
  private world: number[]
  private inverse: number[]
  constructor(matrix: readonly number[]) {
    this.world = Array.from(matrix, Math.fround)
    this.inverse = new Matrix4().fromArray(this.world).invert().elements.map(Math.fround)
  }
  private apply(p: OriginalSpringPoint, m: number[]): OriginalSpringPoint {
    const f = Math.fround, values = [f(p.x), f(p.y), f(p.z)]
    const component = (i: number) => f(f(f(f(m[i]! * values[0]!) + f(m[i+4]! * values[1]!)) + f(m[i+8]! * values[2]!)) + m[i+12]!)
    return {x:component(0),y:component(1),z:component(2)}
  }
  local(rendered: OriginalSpringPoint) {
    return this.apply({x:rendered.x*4,y:rendered.y*4,z:-rendered.z*4},this.inverse)
  }
  rendered(local: OriginalSpringPoint) {
    const p=this.apply(local,this.world)
    return {x:p.x/4,y:p.y/4,z:-p.z/4}
  }
}
