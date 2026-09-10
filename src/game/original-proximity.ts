import * as THREE from 'three'
import { SCALE } from './original-data.ts'

export interface ProximitySettings { distance: number; axes: number; exactnessMin: number; exactnessMax: number; minFrameDelay: number; maxFrameDelay: number }

/** Enter-range semantics and adaptive polling from TT Scaleable Proximity.
 * Adapted from CKBuildingBlocks (Apache-2.0); see THIRD_PARTY.md for source and modifications.
 * Script frames are currently mapped to fixed physics ticks; see original-chain.md.
 */
export class OriginalProximity {
  data: ProximitySettings
  remaining = 1
  inside: boolean | undefined
  private coordinateScale:number
  constructor(data: ProximitySettings, coordinateScale=SCALE) { this.data = data;this.coordinateScale=coordinateScale }
  enter(a: THREE.Vector3, b: THREE.Vector3) {
    return this.sample(a, b) === 4
  }
  // Input "In" rearms transition state but preserves the last-check countdown.
  restart() { this.inside = undefined }
  // Original output flags: InRange=1, OutRange=2, EnterRange=4, ExitRange=8.
  sample(a: THREE.Vector3, b: THREE.Vector3) {
    if (--this.remaining > 0) return 0
    const d = this.data
    const squared = ((d.axes & 1) ? (a.x - b.x) ** 2 : 0) + ((d.axes & 2) ? (a.y - b.y) ** 2 : 0) + ((d.axes & 4) ? (a.z - b.z) ** 2 : 0)
    const distance = squared / this.coordinateScale ** 2
    const min = d.exactnessMin ** 2, max = d.exactnessMax ** 2
    this.remaining = Math.max(1, d.minFrameDelay + Math.trunc(THREE.MathUtils.clamp((distance - min) / (max - min), 0, 1) * (d.maxFrameDelay - d.minFrameDelay)))
    const inside = distance < d.distance ** 2
    const output = inside ? (this.inside === true ? 1 : 4) : (this.inside === false ? 2 : 8)
    this.inside = inside
    return output
  }
}
