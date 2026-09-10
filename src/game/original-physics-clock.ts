/** physics_RT.dll PostProcess 0x10007ce0. The script frame is distinct from
 * IVP's internal 66 Hz PSI. Smooth milliseconds first, then apply the time
 * factor; preserve FST's unrounded intermediate for the final multiplication. */
export class OriginalPhysicsClock {
  filteredMs=0
  step(deltaMs:number,timeFactor=2) {
    if(!Number.isFinite(deltaMs)||deltaMs<0||!Number.isFinite(timeFactor)||timeFactor<0)throw new Error('Invalid physics frame time')
    const filtered=(this.filteredMs*3+Math.fround(deltaMs))*.25
    this.filteredMs=Math.fround(filtered)
    return Math.fround(filtered*Math.fround(Math.fround(timeFactor)*Math.fround(.001)))
  }
}
