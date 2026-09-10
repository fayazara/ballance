import data from './original-respawn-data.json' with {type:'json'}
import {ufoCurve} from './original-ufo-animation.ts'

export type RespawnEvent='clear-fragments'|'remove-ball'|'position-ball'|'physicalize-ball'|'ready'|'game-over'
/** Deactivate Ball / New Ball: script-frame links are distinct from millisecond
 * delayers. Waiting never consumes the next state's frame link in the same call. */
export class OriginalRespawn {
  stage:'idle'|'checking'|'falling'|'positioning'|'forming'|'waking'='idle'
  private frames=0
  private age=0
  flashAge:number|undefined
  get active(){return this.stage!=='idle'}
  begin() {
    if(this.active)return false
    this.stage='checking';this.frames=data.lifeCheckDelayFrames;this.age=0;this.flashAge=undefined
    return true
  }
  reset(){this.stage='idle';this.age=0;this.frames=0;this.flashAge=undefined}
  get flash() {
    if(this.flashAge===undefined||this.flashAge>data.flash.durationMs)return [0,0,0,0]
    const t=ufoCurve(data.flash.curve,this.flashAge/data.flash.durationMs)
    return data.flash.fromColor.map((v,i)=>v+(data.flash.toColor[i]!-v)*t)
  }
  step(deltaMs:number,spareLives:number):RespawnEvent[] {
    if(!Number.isFinite(deltaMs)||deltaMs<0)throw new Error('Invalid respawn frame duration')
    if(this.flashAge!==undefined)this.flashAge=Math.fround(this.flashAge+deltaMs)
    switch(this.stage) {
      case 'idle':return []
      case 'checking':
        if(--this.frames>0)return []
        if(spareLives<=0){this.reset();return ['game-over']}
        this.stage='falling';this.age=0;this.flashAge=deltaMs
        return ['clear-fragments']
      case 'falling':
        this.age=Math.fround(this.age+deltaMs)
        if(this.age<data.removeBallDelayMs)return []
        this.stage='positioning';this.frames=data.newBallDelayFrames
        return ['remove-ball']
      case 'positioning':
        if(--this.frames>0)return []
        this.stage='forming';this.age=0
        return ['position-ball']
      case 'forming':
        this.age=Math.fround(this.age+deltaMs)
        if(this.age<data.physicalizeDelayMs)return []
        this.stage='waking';this.frames=data.wakeDelayFrames
        return ['physicalize-ball']
      case 'waking':
        if(--this.frames>0)return []
        this.stage='idle'
        return ['ready']
    }
  }
}
