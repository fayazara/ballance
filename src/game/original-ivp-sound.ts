import type {IvpCollisionEvent} from './ivp-bridge.ts'
import type {Material} from './levels.ts'
import type {OriginalDocument} from './original-data.ts'
import {OriginalIvpContact} from './original-ivp-contact.ts'
import data from './original-audio-data.json' with {type:'json'}

export interface OriginalSoundIds {roll?:number;hit?:number}
export interface OriginalSoundFrame {
  rolls:{name:string;gain:number;pitch:number}[]
  impacts:{name:string;gain:number;group:number}[]
}
const moduleIds:Record<string,Record<string,OriginalSoundIds>>=data.moduleIds
export function originalModuleSoundIds(module:string,target:string):OriginalSoundIds {return moduleIds[module.toLowerCase()]?.[target]??{}}
export function originalFloorSoundIds(document:OriginalDocument,id:number):OriginalSoundIds {
  const result:OriginalSoundIds={}
  for(const kind of ['roll','hit'] as const)for(const [index,name] of data.floorGroups[kind].entries()) {
    if(document.groups.find(g=>g.name===name)?.members.includes(id))result[kind]=index+1
  }
  return result
}

/** Sound.nmo's delayed continuous contacts and PhysicsCollDetection thresholds.
 * Contact/cooldown times are IVP seconds. SpeedOMeter uses position displacement
 * divided by the real script-frame duration, including vertical movement. */
export class OriginalIvpSound {
  frame:OriginalSoundFrame={rolls:[],impacts:[]}
  private body?:number
  private material:Material='wood'
  private contact?:OriginalIvpContact
  private active=new Set<string>()
  private impactTimes=new Map<number,number>()
  private position?:number[]
  bind(body:number|undefined,material:Material,position:readonly number[]) {
    this.contact?.stop();this.active.clear();this.impactTimes.clear()
    this.body=body;this.material=material;this.position=position.map(Math.fround)
    this.contact=body===undefined?undefined:new OriginalIvpContact(body,data.rolling.groupCount,data.rolling.startDelay,data.rolling.endDelay)
    this.frame={rolls:[],impacts:[]}
  }
  step(body:number|undefined,material:Material,position:readonly number[],events:readonly IvpCollisionEvent[],time:number,dt:number,ids:ReadonlyMap<number,OriginalSoundIds>) {
    if(body!==this.body||material!==this.material)this.bind(body,material,position)
    this.frame={rolls:[],impacts:[]}
    if(body===undefined||!this.contact)return
    const sounds=data.materials[material]
    const changes=[...this.contact.consume(events,other=>ids.get(other)?.roll??0),...this.contact.process(time)]
    for(const change of changes) {
      const column=['onStone','onWood','onMetal'][change.group-1] as 'onStone'|'onWood'|'onMetal'
      const name=sounds[column]
      // Paper deliberately shares one Wave Player across all three source
      // outputs. Preserve their ordered start/stop commands, rather than ORing.
      if(change.active)this.active.add(name)
      else this.active.delete(name)
    }
    const next=position.map(Math.fround)
    const displacement=next.map((v,i)=>Math.fround(v-this.position![i]!))
    const speed=Math.fround(Math.hypot(...displacement)*1000/Math.fround(dt*1000))
    this.position=next
    const gain=Math.min(1,Math.max(0,Math.fround(speed*data.rolling.gainMultiplier)))
    const pitch=data.rolling.pitchBase+speed*data.rolling.pitchMultiplier
    this.frame.rolls=[...this.active].map(name=>({name,gain,pitch}))
    for(const event of events) {
      if(event.kind!=='impact'||!event.relativeVelocity||!event.bodies.includes(body))continue
      const other=event.bodies[event.bodies[0]===body?1:0],group=ids.get(other)?.hit??0
      const settings=data.impacts.find(i=>i.group===group)
      if(!settings||event.time-(this.impactTimes.get(group)??0)<settings.cooldown)continue
      const magnitude=Math.hypot(...event.relativeVelocity)
      if(magnitude<=settings.minimum)continue
      this.impactTimes.set(group,event.time)
      this.frame.impacts.push({name:sounds[settings.column as 'HitStone'|'HitWood'|'HitMetal'|'HitDome'],gain:Math.fround(Math.min(1,magnitude/settings.maximum)),group})
    }
  }
}
