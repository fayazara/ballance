import * as THREE from 'three'
import data from './original-point-trails-data.json' with {type:'json'}
import {SCALE} from './original-data.ts'
import {pointSatellitePosition} from './original-point-trails.ts'

const settings=data.motion
export type PointExtraStage='idle'|'away'|'pursuit'|'done'
/** TT Extra's idle/activated/hit states, run once per original script frame. */
export class OriginalPointExtra {
  stage:PointExtraStage='idle'
  readonly origin:THREE.Vector3
  readonly positions:THREE.Vector3[]
  readonly visible=Array<boolean>(6).fill(true)
  private previous:THREE.Vector3[]
  private away=new THREE.Vector3()
  private remainingMs=settings.Flyawaytime
  private timeValue=0
  private nextCheck=settings['Exactness Framedelay']
  private first=true
  private orbitTime=0
  constructor(origin:THREE.Vector3) {
    this.origin=origin.clone()
    this.positions=Array.from({length:6},(_,i)=>pointSatellitePosition(i,0).add(origin))
    this.previous=this.positions.map(p=>p.clone())
  }
  get remaining(){return this.stage==='idle'||this.stage==='done'?0:this.visible.filter(Boolean).length}
  cancel(){this.stage='done';this.visible.fill(false)}
  step(deltaMs:number,player:THREE.Vector3) {
    if(!Number.isFinite(deltaMs)||deltaMs<0)throw new Error('Invalid point-extra script delta')
    const event={activated:false,hits:[] as number[],points:0,ready:false}
    if(this.stage==='done'||deltaMs===0)return event
    // Exactness updates the displacement coefficient every second frame; the
    // fly-away countdown still consumes the current frame's milliseconds.
    if(this.first){this.timeValue=deltaMs*.001;this.first=false}
    if(--this.nextCheck===0){this.timeValue=deltaMs*.001;this.nextCheck=settings['Exactness Framedelay']}
    if(this.stage==='idle') {
      if(player.distanceToSquared(this.origin)<=settings.Activationdistance**2*SCALE**2) {
        this.stage='away';this.away.copy(player);this.away.y-=5.1*SCALE
        this.previous.forEach((p,i)=>p.copy(this.positions[i]!))
        event.activated=true;event.points=data.activationPoints
      } else {
        this.orbitTime+=this.timeValue
        this.positions.forEach((p,i)=>pointSatellitePosition(i,this.orbitTime,p).add(this.origin))
      }
      return event
    }
    if(this.stage==='away') {
      this.remainingMs-=deltaMs
      if(this.remainingMs<=0){this.stage='pursuit';return event}
      this.positions.forEach((p,i)=>{
        const old=this.previous[i]!.clone();this.previous[i]!.copy(p)
        p.addScaledVector(p.clone().sub(old),settings.Awaydamping)
          .addScaledVector(this.previous[i]!.clone().sub(this.away),settings.Awayforce*this.timeValue)
      })
      return event
    }
    if(!this.visible.some(Boolean)){this.stage='done';event.ready=true;return event}
    this.positions.forEach((p,i)=>{
      if(!this.visible[i])return
      // The saved 4 is compared directly with squared distance (radius 2).
      if(p.distanceToSquared(player)<=settings['Extra_Points CollDistance']*SCALE**2) {
        this.visible[i]=false;event.hits.push(i);event.points+=data.satellitePoints;return
      }
      const old=this.previous[i]!.clone();this.previous[i]!.copy(p)
      const force=settings.Force+i*settings.Forcewidth/6
      p.addScaledVector(p.clone().sub(old),settings.Damping)
        .addScaledVector(player.clone().sub(this.previous[i]!),force*this.timeValue)
    })
    return event
  }
}
