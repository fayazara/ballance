export type Position3 = readonly [number, number, number]

const f32=Math.fround
const millisecondsToSeconds=f32(.001)

/** The unrestricted TT Set Dynamic Position update used by the ending UFO.
 * Operates in original units, with current/target already in the same frame.
 * TT_Toolbox_RT.dll callback 0x10004a80, arithmetic 0x10004c14–0x10004da5.
 * Damping multiplies last frame's displacement; only force is scaled by time.
 * Keep the original single-precision stores without rounding each x87 operation.
 * JS doubles approximate the x87 intermediates; this is not a bit-exact emulator.
 */
export class OriginalDynamicPosition {
  private previous:[number,number,number]=[0,0,0]

  /** Original On input saves current position and returns without integrating. */
  start(current:Position3) {
    this.previous=[f32(current[0]),f32(current[1]),f32(current[2])]
  }

  step(current:Position3,target:Position3,force:Position3,damping:Position3,deltaMs:number,offset:Position3=[0,0,0]):[number,number,number] {
    const next:[number,number,number]=[0,0,0]
    const seconds=f32(deltaMs)*millisecondsToSeconds
    for(let axis=0;axis<3;axis++) {
      const position=f32(current[axis]!)
      const displacement=f32(position-this.previous[axis]!)
      const error=f32(f32(target[axis]!)-position)
      const scaledForce=f32(f32(force[axis]!)*seconds)
      this.previous[axis]=position
      next[axis]=f32((error-f32(offset[axis]!))*scaledForce+displacement*f32(damping[axis]!)+position)
    }
    return next
  }
}
