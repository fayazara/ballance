import * as THREE from 'three'
import {IvpWorld} from './ivp-bridge.ts'
import type {IvpModule,IvpBodyDescriptor} from './ivp-bridge.ts'
import type {OriginalDocument,OriginalObject} from './original-data.ts'
import type {Material} from './levels.ts'
import {OriginalIvpPlayer} from './original-ivp-player.ts'
import type {OriginalDriveKey} from './original-ivp-player.ts'
import {originalIvpFloors,originalIvpResetpoints} from './original-ivp-level.ts'
import {OriginalProximity} from './original-proximity.ts'
import objects from './original-object-data.json' with {type:'json'}
import pusher from './original-pusher-data.json' with {type:'json'}
import slider from './original-slider-data.json' with {type:'json'}
import sectors from './original-sector-data.json' with {type:'json'}
import hinges from './original-hinge-data.json' with {type:'json'}
import chain from './original-chain-data.json' with {type:'json'}
import {OriginalIvpFan} from './original-ivp-fan.ts'
import {OriginalIvpLift} from './original-ivp-lift.ts'
import {OriginalIvpFinish} from './original-ivp-finish.ts'
import {OriginalIvpSound,originalFloorSoundIds,originalModuleSoundIds} from './original-ivp-sound.ts'
import type {OriginalSoundIds} from './original-ivp-sound.ts'
import liftData from './original-lift-data.json' with {type:'json'}
import arms from './original-arms-data.json' with {type:'json'}
import swing from './original-swing-data.json' with {type:'json'}
import sack from './original-sack-data.json' with {type:'json'}
import {PHYSICS_STEP} from './original-physics.ts'
import {OriginalPhysicsClock} from './original-physics-clock.ts'
import {ORIGINAL_DEPTH,originalDepthLimit} from './original-depth.ts'
import {OriginalDeathTest} from './original-death.ts'

export type IvpVisuals=Map<string,Map<string,THREE.Mesh>>
type PartData=Omit<IvpBodyDescriptor,'position'> & {target:string;hulls?:string[];radius?:number;startFrozen:boolean;enableCollision:boolean}
type Part={body:number;name:string;mesh?:THREE.Mesh;initialRotation:THREE.Quaternion;owned:boolean;removeOnFall?:()=>void}
type Assembly={parent:OriginalObject;document:OriginalDocument;sector:number;kind:string}
const flippedRotation=(q:readonly number[])=>new THREE.Quaternion(-q[0]!,-q[1]!,q[2]!,q[3]!)
export const ivpRenderPosition=(p:readonly number[])=>new THREE.Vector3(p[0]!*.25,p[1]!*.25,-p[2]!*.25)

/** The playable IVP backend's course/player/sector ownership. Unsupported
 * mechanisms fail loading explicitly until their native adapters are connected. */
export class OriginalIvpRuntime {
  readonly world:IvpWorld
  readonly player:OriginalIvpPlayer
  readonly course:OriginalDocument
  readonly depthLimit:number
  readonly deathTest:OriginalDeathTest
  private depthMembers:Set<number>
  readonly parts:Part[]=[]
  readonly sound=new OriginalIvpSound()
  readonly clock=new OriginalPhysicsClock()
  readonly soundIds=new Map<number,OriginalSoundIds>()
  private assemblies:Assembly[]=[]
  private visuals:IvpVisuals
  private wake:{body:number;watcher:OriginalProximity;origin?:THREE.Vector3}[]=[]
  readonly fans:OriginalIvpFan[]=[]
  finish?:OriginalIvpFinish
  private ending?:{parent:OriginalObject;document:OriginalDocument;sector:number}
  private mechanisms:((player:THREE.Vector3,deltaMs:number)=>string|undefined)[]=[]
  private lifts:OriginalIvpLift[]=[]
  private supports:number[]=[]
  readonly actuators:{name:string;stage:number;cycles:number;force?:number}[]=[]
  private held=new Set<OriginalDriveKey>()
  private sector=0
  private disposed=false
  constructor(module:IvpModule,course:OriginalDocument,balls:OriginalDocument,modules:Map<string,OriginalDocument>,visuals:IvpVisuals) {
    this.depthLimit=originalDepthLimit(course,1)
    this.deathTest=new OriginalDeathTest(course)
    this.world=new IvpWorld(module);this.course=course;this.visuals=visuals
    this.depthMembers=new Set(course.groups.filter(g=>ORIGINAL_DEPTH.groups.includes(g.name)).flatMap(g=>g.members))
    try {
      for(const floor of originalIvpFloors(course)) {
        const body=this.world.triangles(floor.triangles,floor.descriptor)
        this.soundIds.set(body,originalFloorSoundIds(course,floor.objectId))
      }
      const supported=[...Object.keys(objects),...Object.keys(hinges),'P_Modul_01','P_Modul_34','P_Modul_18','P_Modul_29','P_Modul_03','P_Modul_17','P_Modul_08','P_Modul_26']
      for(const parent of course.objects) {
        const kind=supported.find(k=>parent.name.startsWith(k+'_'))
        if(/^P_Modul_/.test(parent.name)&&!kind) throw new Error(`IVP adapter pending: ${parent.name.split('_').slice(0,3).join('_')}`)
        if(!kind) continue
        const document=modules.get(kind.toLowerCase())
        if(!document) throw new Error(`Missing native module ${kind}`)
        const sector=Number(course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))?.name.slice(-2)||1)
        this.assemblies.push({parent,document,sector,kind})
        if(kind==='P_Modul_18')this.fans.push(new OriginalIvpFan(this.world,parent,document,sector))
      }
      const reset=originalIvpResetpoints(course)[0]
      if(!reset) throw new Error('Missing IVP course reset point')
      this.player=new OriginalIvpPlayer(this.world,balls,'wood',{position:reset.matrix.slice(12,15),rotation:[0,0,0,1]})
      this.sound.bind(this.player.body,this.player.material,this.player.pose.position)
      const ending=course.objects.find(o=>o.name.startsWith('PE_Balloon_'))
      if(ending) {
        const document=modules.get('pe_balloon')
        if(!document)throw new Error('Missing native ending module PE_Balloon')
        this.ending={parent:ending,document,sector:originalIvpResetpoints(course).length}
      }
      this.activate(1)
    } catch(error) {this.world.dispose();throw error}
  }
  private part(assembly:Assembly,data:PartData) {
    const {parent,document}=assembly,object=document.objects.find(o=>o.name===data.target)
    if(!object) throw new Error(`Missing native part ${data.target}`)
    const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
    const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
    frame.decompose(position,rotation,scale);rotation.normalize()
    const recomposed=new THREE.Matrix4().compose(position,rotation,scale)
    if(frame.determinant()<=0||frame.elements.some((v,i)=>Math.abs(v-recomposed.elements[i]!)>.0001)) throw new Error(`Unsupported native part frame: ${parent.name}/${data.target}`)
    const descriptor={...data,position:position.toArray(),rotation:rotation.toArray(),frozen:data.startFrozen,collisionEnabled:data.enableCollision}
    let body:number
    if(data.radius!==undefined) body=this.world.sphere(data.radius,descriptor)
    else {
      const renderMesh=document.meshes.find(m=>m.id===object.mesh)
      const hulls=(data.hulls??[renderMesh?.name]).map(name=> {
        const mesh=document.meshes.find(m=>m.name===name)
        if(!mesh) throw new Error(`Missing native hull ${name}`)
        const unique=new Map<string,number[]>()
        for(let i=0;i<mesh.positions.length;i+=3) {const p=mesh.positions.slice(i,i+3).map((v,j)=>Math.fround(v*scale.getComponent(j)));unique.set(p.join(' '),p)}
        return [...unique.values()].flat()
      })
      body=this.world.compound(hulls,descriptor)
    }
    this.parts.push({body,name:parent.name+'/'+data.target,mesh:this.visuals.get(parent.name)?.get(data.target),initialRotation:flippedRotation(rotation.toArray()).invert(),owned:true,...(this.depthMembers.has(parent.id)?{removeOnFall:()=>this.world.remove(body)}:{})})
    this.soundIds.set(body,originalModuleSoundIds(assembly.kind,data.target))
    return body
  }
  private frame(assembly:Assembly,value:string|number[]) {
    const matrix=typeof value==='string'?assembly.document.objects.find(o=>o.name===value)?.matrix:value
    if(!matrix)throw new Error(`Missing original frame ${value}`)
    return new THREE.Matrix4().fromArray(assembly.parent.matrix).multiply(new THREE.Matrix4().fromArray(matrix))
  }
  private driven(assembly:Assembly,bodies:Map<string,number>,forces:typeof sack.forces,stages:{force:number|null;durationMs:number;delayFrames?:number}[],startup:number,initial=0) {
    const state={name:assembly.parent.name,stage:-1,cycles:0,force:undefined as number|undefined}
    this.actuators.push(state)
    let remaining=startup,elapsed=0,switching=false
    const select=(stage:number)=> {
      const starting=state.stage<0
      if(state.force!==undefined)this.world.removeForce(state.force)
      state.force=undefined;state.stage=stage
      const index=stages[stage]!.force
      if(index!==null) {
        const f=forces[index]!,body=bodies.get(f.target)!
        if(f.positionFrame!==f.target)throw new Error('Unverified actuator force position frame')
        const direction=new THREE.Vector3(...f.direction as [number,number,number]).transformDirection(this.frame(assembly,f.directionFrame))
        state.force=this.world.force({body,position:f.position,positionSpace:'core',direction:direction.toArray(),value:f.impulse})
        if(starting)this.world.wake(body)
      }
    }
    const advance=()=> {
        const next=(state.stage+1)%stages.length
        if(next===initial)state.cycles++
        select(next);elapsed=0
    }
    this.mechanisms.push((_player,deltaMs)=> {
      if(switching) {
        if(--remaining>0)return
        switching=false;advance()
      } else if(remaining>0){remaining--;return}
      if(state.stage<0)select(initial)
      // Delayer adds this script frame on activation too. Zero-delay links
      // activate the following timer in the same frame, without carrying its
      // predecessor's overshoot. Sack's link delay is a frame, not milliseconds.
      for(let visited=0;visited<stages.length;visited++) {
        elapsed=Math.fround(elapsed+Math.fround(deltaMs))
        if(elapsed<stages[state.stage]!.durationMs)return
        const delay=stages[state.stage]!.delayFrames??0
        if(delay){switching=true;remaining=delay;return}
        advance()
      }
    })
  }
  activate(sector:number,reset=false) {
    if(this.disposed) throw new Error('IVP runtime is disposed')
    if(this.sector===sector&&!reset) return
    if(this.finish&&(reset||this.ending?.sector!==sector)) {for(const body of this.finish.parts.values())this.soundIds.delete(body);this.finish.dispose();this.finish=undefined}
    for(const lift of this.lifts)lift.dispose()
    this.lifts=[]
    for(const part of this.parts){this.soundIds.delete(part.body);if(part.owned)this.world.remove(part.body)}
    for(const body of this.supports)this.world.remove(body)
    this.supports=[]
    this.parts.length=0;this.wake=[];this.mechanisms=[];this.actuators.length=0;this.sector=sector
    for(const fan of this.fans)fan.reset()
    for(const meshes of this.visuals.values()) for(const mesh of meshes.values()) mesh.visible=false
    for(const assembly of this.assemblies.filter(a=>a.sector===sector)) {
      const {kind,parent}=assembly
      if(kind in objects) this.part(assembly,{...objects[kind as keyof typeof objects],target:kind+'_MF'})
      else if(kind==='P_Modul_03') {
        const lift=new OriginalIvpLift(this.world,parent,assembly.document);this.lifts.push(lift)
        for(const [target,body] of lift.parts) {
          this.soundIds.set(body,originalModuleSoundIds(kind,target))
          const rotation=new THREE.Quaternion();this.frame(assembly,target).decompose(new THREE.Vector3(),rotation,new THREE.Vector3());rotation.normalize()
          this.parts.push({body,name:parent.name+'/'+target,mesh:this.visuals.get(parent.name)?.get(target),initialRotation:flippedRotation(rotation.toArray()).invert(),owned:false,...(target!==liftData.wakeTarget?{removeOnFall:()=>{lift.removeWeight(target)}}:{})})
        }
        this.wake.push({body:lift.platform,origin:new THREE.Vector3().setFromMatrixPosition(this.frame(assembly,liftData.wakeFrame)),watcher:new OriginalProximity(liftData.wake,1)})
      } else if(kind==='P_Modul_17'||kind==='P_Modul_08') {
        const data=kind==='P_Modul_17'?arms:swing,body=this.part(assembly,data.body)
        const frame=this.frame(assembly,data.hinge.frame)
        const anchor=new THREE.Vector3().setFromMatrixPosition(frame).toArray()
        const support=this.world.sphere(.1,{position:anchor,mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,fixed:true,collisionEnabled:false})
        this.supports.push(support)
        this.world.joint({kind:'hinge',reference:body,attached:support,anchor,axis:new THREE.Vector3().setFromMatrixColumn(frame,2).normalize().toArray(),...(data.hinge.limitsEnabled?{limits:[data.hinge.lowerLimit*Math.PI/180,data.hinge.upperLimit*Math.PI/180] as [number,number]}:{})})
        if(kind==='P_Modul_17') {
          const s=arms.spring
          this.world.spring({reference:body,attached:support,anchor1:new THREE.Vector3(...s.position1 as [number,number,number]).applyMatrix4(this.frame(assembly,arms.hinge.frame)).toArray(),anchor2:new THREE.Vector3(...s.position2 as [number,number,number]).applyMatrix4(this.frame(assembly,s.frame2)).toArray(),length:s.length,constant:s.constant,axialDamping:s.axialDamping,globalDamping:s.globalDamping})
        } else this.driven(assembly,new Map([[data.body.target,body]]),swing.forces,swing.stages,swing.startupDelayFrames)
      } else if(kind==='P_Modul_26') {
        const bodies=new Map(sack.parts.map(data=>[data.target,this.part(assembly,data)]))
        for(const j of sack.joints)this.world.joint({kind:'ballSocket',reference:bodies.get(j.target)!,attached:j.anchorObject==='FixCube Object'?0:bodies.get(j.anchorObject)!,anchor:new THREE.Vector3(...j.position as [number,number,number]).applyMatrix4(this.frame(assembly,j.frame)).toArray()})
        this.world.wake(bodies.get(sack.wakeTarget)!)
        this.driven(assembly,bodies,sack.forces,sack.forces.map((_,force)=>({force,durationMs:sack.intervalMs,delayFrames:sack.switchDelayFrames})),0,sack.initialForce)
      }
      else if(kind==='P_Modul_01') {
        for(const data of pusher.parts) {
          const body=this.part(assembly,data)
          if(data.startFrozen) this.wake.push({body,watcher:new OriginalProximity(sectors.wake.P_Modul_01,1)})
        }
      } else if(kind in hinges) {
        const key=kind as keyof typeof hinges,data=hinges[key],body=this.part(assembly,data)
        const parentFrame=new THREE.Matrix4().fromArray(parent.matrix)
        const frame=parentFrame.clone().multiply(new THREE.Matrix4().fromArray(data.hingeFrame))
        this.world.joint({kind:'hinge',reference:body,attached:0,anchor:new THREE.Vector3().setFromMatrixPosition(frame).toArray(),axis:new THREE.Vector3().setFromMatrixColumn(frame,2).normalize().toArray(),...(data.limitsEnabled?{limits:[data.lowerLimit*Math.PI/180,data.upperLimit*Math.PI/180] as [number,number]}:{})})
        if(data.startFrozen&&key!=='P_Modul_41') {
          const settings=sectors.wake[key],origin=new THREE.Vector3().setFromMatrixPosition(parentFrame.multiply(new THREE.Matrix4().fromArray(settings.frame)))
          this.wake.push({body,origin,watcher:new OriginalProximity(settings,1)})
        }
      } else if(kind==='P_Modul_29') {
        const bodies=new Map(chain.parts.map(data=>[data.target,this.part(assembly,data)]))
        const parentFrame=new THREE.Matrix4().fromArray(parent.matrix)
        const joints=new Map(chain.joints.map(data=> {
          const frame=parentFrame.clone().multiply(new THREE.Matrix4().fromArray(data.hingeFrame))
          const joint=this.world.joint({kind:'hinge',reference:bodies.get(data.target)!,attached:data.anchorObject==='FixCube Object'?0:bodies.get(data.anchorObject)!,anchor:new THREE.Vector3().setFromMatrixPosition(frame).toArray(),axis:new THREE.Vector3().setFromMatrixColumn(frame,2).normalize().toArray(),...(data.limitsEnabled?{limits:[data.lowerLimit*Math.PI/180,data.upperLimit*Math.PI/180] as [number,number]}:{})})
          return [data.index,joint]
        }))
        const origin=new THREE.Vector3().setFromMatrixPosition(parentFrame.multiply(new THREE.Matrix4().fromArray(chain.wakeFrame)))
        const wake=new OriginalProximity(chain.wake,1),release=new OriginalProximity(chain.release,1)
        let activated=false,broken=false
        this.mechanisms.push(player=> {
          if(!activated) {
            if(!wake.enter(player,origin))return
            activated=true;this.world.wake(bodies.get(chain.wakeTarget)!)
          }
          if(broken)return
          const target=new THREE.Vector3(...this.world.state(bodies.get(chain.release.object)!).slice(0,3) as [number,number,number])
          if(!release.enter(player,target)||`Ball_${this.player.material[0]!.toUpperCase()}${this.player.material.slice(1)}`!==chain.releaseBall)return
          this.world.removeJoint(joints.get(chain.releaseHinge)!);broken=true
          return chain.sound
        })
      } else if(kind==='P_Modul_34') {
        const bodies=new Map(slider.parts.map(data=>[data.target,this.part(assembly,data)]))
        const body=bodies.get(slider.wakeTarget)!
        const frame=(values:number[])=>new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(values))
        const anchor=new THREE.Vector3().setFromMatrixPosition(frame(slider.slider.frame1))
        const axis=new THREE.Vector3().setFromMatrixPosition(frame(slider.slider.frame2)).sub(anchor).normalize()
        this.world.joint({kind:'slider',reference:body,attached:0,anchor:anchor.toArray(),axis:axis.toArray(),...(slider.slider.limitsEnabled?{limits:[slider.slider.lowerLimit,slider.slider.upperLimit] as [number,number]}:{})})
        this.wake.push({body,watcher:new OriginalProximity(slider.wake,1)})
      }
    }
    if(this.ending?.sector===sector&&!this.finish)this.finish=new OriginalIvpFinish(this.world,this.ending.parent,this.ending.document,this.visuals.get(this.ending.parent.name))
    if(this.finish)for(const [target,body] of this.finish.parts)this.soundIds.set(body,originalModuleSoundIds('pe_balloon',target))
    this.syncVisuals()
  }
  input(keys:Set<OriginalDriveKey>,yaw:number|readonly number[]) {
    for(const key of ['left','right','forward','backward'] as const) {
      if(!keys.has(key)) {if(this.held.delete(key)) this.player.drive(key,undefined);continue}
      if(this.held.has(key)||this.player.body===undefined) continue
      const x=key==='left'?-1:key==='right'?1:0,z=key==='forward'?-1:key==='backward'?1:0
      const direction=typeof yaw==='number'?[x*Math.cos(yaw)+z*Math.sin(yaw),0,x*Math.sin(yaw)-z*Math.cos(yaw)]:
        new THREE.Vector3(x,0,-z).transformDirection(new THREE.Matrix4().fromArray(yaw)).toArray()
      this.player.drive(key,direction)
      this.held.add(key)
    }
  }
  /** One original script/presentation frame. IVP internally divides its smoothed
   * simulation duration into PSI ticks; callers must not repeat script polling
   * for each of those internal ticks. The default is a 132 Hz test frame. */
  step(deltaMs=PHYSICS_STEP*1000) {
    const simulationSeconds=this.clock.step(deltaMs)
    const pose=this.player.pose,p=new THREE.Vector3(...pose.position as [number,number,number])
    this.deathTest.sample(this.player.localBounds,new THREE.Matrix4().compose(p,new THREE.Quaternion(...pose.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1)))
    this.wake=this.wake.filter(w=> {
      const origin=w.origin??new THREE.Vector3(...this.world.state(w.body).slice(0,3) as [number,number,number])
      if(!w.watcher.enter(p,origin)) return true
      this.world.wake(w.body);return false
    })
    const sounds=this.mechanisms.map(update=>update(p,deltaMs)).filter((sound):sound is string=>sound!==undefined)
    this.finish?.step(p)
    for(const fan of this.fans)fan.sample(this.player,this.sector)
    if(simulationSeconds>0)this.world.step(simulationSeconds)
    for(let i=this.parts.length-1;i>=0;i--) {
      const part=this.parts[i]!
      if(!part.removeOnFall||this.world.state(part.body)[1]!>=this.depthLimit)continue
      part.removeOnFall()
      this.soundIds.delete(part.body)
      if(part.mesh){part.mesh.visible=false;part.mesh.position.set(0,0,0)}
      this.parts.splice(i,1)
    }
    this.sound.step(this.player.body,this.player.material,this.player.pose.position,this.world.drainEvents(),this.world.time,deltaMs/1000,this.soundIds)
    return sounds
  }
  capture() {for(const fan of this.fans)fan.detachPlayer();this.held.clear();this.sound.bind(undefined,this.player.material,this.player.pose.position);return this.player.capture()}
  material(kind:Material) {if(this.player.body!==undefined) this.capture();this.player.release(kind);this.sound.bind(this.player.body,kind,this.player.pose.position)}
  reset(sector:number,kind:Material,position:readonly number[],rotation:readonly number[]=[0,0,0,1],resetSector=true) {
    for(const fan of this.fans)fan.detachPlayer()
    this.deathTest.restart()
    this.held.clear();this.player.respawn(kind,{position,rotation});if(resetSector)this.activate(sector,true)
    this.sound.bind(this.player.body,kind,position)
  }
  get grounded() {const body=this.player.body;return body!==undefined&&this.world.contacts(body).some(c=>c.normal[1]>.3)}
  syncVisuals() {
    this.finish?.syncVisuals()
    for(const part of this.parts) if(part.mesh) {
      const state=this.world.state(part.body)
      part.mesh.visible=true;part.mesh.position.copy(ivpRenderPosition(state))
      part.mesh.quaternion.copy(flippedRotation(state.slice(3,7)).multiply(part.initialRotation))
    }
  }
  dispose() {if(this.disposed) return;for(const fan of this.fans)fan.dispose();this.finish?.dispose();this.world.dispose();this.parts.length=0;this.disposed=true}
}
