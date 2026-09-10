import type {IvpCollisionEvent} from './ivp-bridge.ts'
export interface OriginalContactChange {group:number;active:boolean}
// Adapted from PhysicsContactManager and PhysicsContinuousContact in the
// Apache-2.0 CKBuildingBlocks reference (see THIRD_PARTY.md). Time is IVP time.
export class OriginalIvpContact {
  private body:number
  private startDelay:number
  private endDelay:number
  private groups:{count:number;active:boolean;pending?:number;order:number}[]
  private nextOrder=1
  private contacts=new Map<number,number>()
  private stopped=false
  constructor(body:number,groupCount:number,startDelay:number,endDelay:number) {
    if(!Number.isInteger(groupCount)||groupCount<1||![startDelay,endDelay].every(v=>Number.isFinite(v)&&v>=0)) throw new Error('Invalid original contact settings')
    this.body=body;this.startDelay=startDelay;this.endDelay=endDelay
    this.groups=Array.from({length:groupCount},()=>({count:0,active:false,order:0}))
  }
  private schedule(index:number,time:number) {
    const group=this.groups[index]!
    if(group.pending===undefined) {group.pending=time;group.order=this.nextOrder++}
  }
  consume(events:readonly IvpCollisionEvent[],groupForBody:(body:number)=>number):OriginalContactChange[] {
    if(this.stopped) return []
    const changes:OriginalContactChange[]=[]
    for(const event of events) {
      if(event.kind==='impact'||!event.bodies.includes(this.body)) continue
      if(event.kind==='contactStart') {
        if(this.contacts.has(event.contact)) continue
        const other=event.bodies[event.bodies[0]===this.body?1:0],index=groupForBody(other)-1
        if(!Number.isInteger(index)||index<0||index>=this.groups.length) continue
        this.contacts.set(event.contact,index)
        const group=this.groups[index]!
        if(++group.count!==1) continue
        if(group.active) group.pending=undefined
        else if(group.pending!==undefined&&this.startDelay<event.time-group.pending) {
          group.pending=undefined;group.active=true;changes.push({group:index+1,active:true})
        } else this.schedule(index,event.time)
      } else {
        const index=this.contacts.get(event.contact);if(index===undefined) continue
        this.contacts.delete(event.contact)
        const group=this.groups[index]!
        group.count=Math.max(0,group.count-1)
        if(group.count===0&&group.active) this.schedule(index,event.time)
      }
    }
    return changes
  }
  process(time:number):OriginalContactChange[] {
    if(!Number.isFinite(time)) throw new Error('Invalid original contact time')
    const changes:OriginalContactChange[]=[]
    if(this.stopped) return changes
    // The source iterates its pending-record array newest first, independently
    // of contact group numbers. Preserve that output activation order.
    const pending=this.groups.map((group,index)=>({group,index})).filter(({group})=>group.pending!==undefined).sort((a,b)=>b.group.order-a.group.order)
    for(const {group,index} of pending) {
      const delta=time-group.pending!
      if(group.active) {
        if(group.count!==0) group.pending=undefined
        else if(delta>this.endDelay) {group.pending=undefined;group.active=false;changes.push({group:index+1,active:false})}
      } else if(group.count<=0) {
        // Original retention window is twice the start delay, not an immediate
        // cancellation when a short touch ends. Re-entry can activate directly.
        if(delta*.5>this.startDelay) group.pending=undefined
      } else if(delta>this.startDelay) {group.pending=undefined;group.active=true;changes.push({group:index+1,active:true})}
    }
    return changes
  }
  stop():OriginalContactChange[] {
    const changes:OriginalContactChange[]=[]
    this.stopped=true;this.contacts.clear()
    this.groups.forEach((group,index)=> {
      if(group.active) changes.push({group:index+1,active:false})
      group.active=false;group.count=0;group.pending=undefined
    })
    return changes
  }
}
