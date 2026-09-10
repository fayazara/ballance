/** Gameplay Fadeout Manager: one flag/timer per material, independent of the
 * existence of fragment bodies. Balls.nmo owns the separately activated fade. */
export class OriginalDebrisClock {
  waiting=false
  requested=false
  elapsedMs=0
  fadeMs:number|undefined
  readonly waitDurationMs:number
  readonly fadeDurationMs:number
  constructor(waitDurationMs:number,fadeDurationMs:number){this.waitDurationMs=waitDurationMs;this.fadeDurationMs=fadeDurationMs}
  request(){this.requested=true}
  reset(){this.waiting=this.requested=false;this.elapsedMs=0;this.fadeMs=undefined}
  step(deltaMs:number) {
    if(!Number.isFinite(deltaMs)||deltaMs<0)throw new Error('Invalid debris frame duration')
    if(!deltaMs)return {fadeStarted:false,removed:false}
    const dt=Math.fround(deltaMs)
    let removed=false,fadeStarted=false
    if(this.fadeMs!==undefined){
      this.fadeMs=Math.fround(this.fadeMs+dt)
      if(this.fadeMs>this.fadeDurationMs){removed=true;this.fadeMs=undefined}
    }
    if(!this.waiting){
      if(!this.requested)return {fadeStarted,removed}
      this.requested=false;this.waiting=true;this.elapsedMs=0
    }
    this.elapsedMs=Math.fround(this.elapsedMs+dt)
    if(this.elapsedMs>=this.waitDurationMs||this.requested){
      // Timer Out or its Loop Out -> flag switch enters the same fade branch.
      // A repeated request remains set for next frame's idle poll to consume.
      this.waiting=false;fadeStarted=true;this.fadeMs=dt
      if(this.fadeMs>this.fadeDurationMs){removed=true;this.fadeMs=undefined}
    }
    return {fadeStarted,removed}
  }
}
