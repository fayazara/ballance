import * as THREE from 'three'
import {IvpWorld} from './ivp-bridge.ts'
import type {OriginalDocument,OriginalObject} from './original-data.ts'
import {OriginalProximity} from './original-proximity.ts'
import data from './original-finish-data.json' with {type:'json'}

const reflected=(q:readonly number[])=>new THREE.Quaternion(-q[0]!,-q[1]!,q[2]!,q[3]!)

/** Physical PE_Balloon assembly. Creation and activation order come from its
 * source graph; presentation of the level-end/UFO sequence lives in the engine. */
export class OriginalIvpFinish {
  readonly parts=new Map<string,number>()
  readonly joints=new Map<number,number>()
  readonly forces:number[]=[]
  stage:'dormant'|'ready'|'departing'='dormant'
  private initialRotation=new Map<string,THREE.Quaternion>()
  private approach=new OriginalProximity(data.approach,1)
  private boarding=new OriginalProximity(data.boarding,1)
  private world:IvpWorld
  private parent:OriginalObject
  private document:OriginalDocument
  private meshes:Map<string,THREE.Mesh>
  constructor(world:IvpWorld,parent:OriginalObject,document:OriginalDocument,meshes=new Map<string,THREE.Mesh>()) {
    this.world=world;this.parent=parent;this.document=document;this.meshes=meshes
    this.reset()
  }
  private frame(value:readonly number[]) {return new THREE.Matrix4().fromArray(this.parent.matrix).multiply(new THREE.Matrix4().fromArray(value))}
  private body(name:string) {
    const body=this.parts.get(name)
    if(body===undefined)throw new Error(`Missing ending body ${name}`)
    return body
  }
  get position() {return new THREE.Vector3(...this.world.state(this.body(data.wakeTarget)).slice(0,3) as [number,number,number])}
  reset() {
    this.dispose()
    this.stage='dormant';this.approach=new OriginalProximity(data.approach,1);this.boarding=new OriginalProximity(data.boarding,1)
    // The saved outer proximity has a ten-frame initial countdown.
    this.approach.remaining=data.approach.minFrameDelay
    try {
      for(const part of data.parts) {
        const object=this.document.objects.find(o=>o.name===part.target)
        if(!object)throw new Error(`Missing ending part ${part.target}`)
        const frame=this.frame(object.matrix),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
        frame.decompose(position,rotation,scale);rotation.normalize()
        const recomposed=new THREE.Matrix4().compose(position,rotation,scale)
        if(frame.determinant()<=0||frame.elements.some((v,i)=>Math.abs(v-recomposed.elements[i]!)>.0001))throw new Error(`Unsupported ending frame ${part.target}`)
        const ownMesh=this.document.meshes.find(m=>m.id===object.mesh)
        const hulls=(part.hulls??[ownMesh?.name]).map(name=> {
          const mesh=this.document.meshes.find(m=>m.name===name)
          if(!mesh)throw new Error(`Missing ending hull ${name}`)
          const vertices=new Map<string,number[]>()
          for(let i=0;i<mesh.positions.length;i+=3) {
            const p=mesh.positions.slice(i,i+3).map((v,j)=>Math.fround(v*scale.getComponent(j)))
            vertices.set(p.join(' '),p)
          }
          return [...vertices.values()].flat()
        })
        const body=this.world.compound(hulls,{...part,position:position.toArray(),rotation:rotation.toArray(),frozen:part.startFrozen,collisionEnabled:part.enableCollision})
        this.parts.set(part.target,body);this.initialRotation.set(part.target,reflected(rotation.toArray()).invert())
      }
      for(const joint of data.sliders) {
        const a=new THREE.Vector3().setFromMatrixPosition(this.frame(joint.frame1)),b=new THREE.Vector3().setFromMatrixPosition(this.frame(joint.frame2))
        this.joints.set(joint.index,this.world.joint({kind:'slider',reference:this.body(joint.target),attached:joint.anchorObject==='FixCube Object'?0:this.body(joint.anchorObject),anchor:a.toArray(),axis:b.sub(a).normalize().toArray(),...(joint.limitsEnabled?{limits:[joint.lowerLimit,joint.upperLimit] as const}:{})}))
      }
      const spring=data.spring
      this.world.spring({reference:this.body(spring.target),attached:this.body(spring.anchorObject),anchor1:new THREE.Vector3(...spring.position1 as [number,number,number]).applyMatrix4(this.frame(spring.frame1)).toArray(),anchor2:new THREE.Vector3(...spring.position2 as [number,number,number]).applyMatrix4(this.frame(spring.frame2)).toArray(),length:spring.length,constant:spring.constant,axialDamping:spring.axialDamping,globalDamping:spring.globalDamping})
      for(const joint of data.hinges) {
        const frame=this.frame(joint.frame)
        this.joints.set(joint.index,this.world.joint({kind:'hinge',reference:this.body(joint.target),attached:joint.anchorObject==='FixCube Object'?0:this.body(joint.anchorObject),anchor:new THREE.Vector3().setFromMatrixPosition(frame).toArray(),axis:new THREE.Vector3().setFromMatrixColumn(frame,2).normalize().toArray(),...(joint.limitsEnabled?{limits:[joint.lowerLimit*Math.PI/180,joint.upperLimit*Math.PI/180] as const}:{})}))
      }
      this.syncVisuals()
    } catch(error) {this.dispose();throw error}
  }
  private force(f:typeof data.departureForce) {
    const core=f.positionFrameName===f.target
    const position=new THREE.Vector3(...f.position as [number,number,number])
    if(!core)position.applyMatrix4(this.frame(f.positionFrame))
    const direction=new THREE.Vector3(...f.direction as [number,number,number]).transformDirection(this.frame(f.directionFrame))
    this.forces.push(this.world.force({body:this.body(f.target),position:position.toArray(),positionSpace:core?'core':'world',direction:direction.toArray(),value:f.impulse}))
  }
  /** Returns true once on boarding, at the original one-unit XYZ threshold. */
  step(player:THREE.Vector3) {
    if(this.stage==='dormant') {
      if(!this.approach.enter(player,this.position))return false
      this.world.wake(this.body(data.wakeTarget))
      for(const force of data.forces)this.force(force)
      this.stage='ready'
    }
    if(this.stage==='ready'&&this.boarding.enter(player,this.position)) {
      this.force(data.departureForce)
      this.world.removeJoint(this.joints.get(data.releaseHinge)!)
      this.joints.delete(data.releaseHinge);this.stage='departing'
      return true
    }
    return false
  }
  syncVisuals() {
    for(const [name,body] of this.parts) {
      const mesh=this.meshes.get(name)
      if(!mesh)continue
      const state=this.world.state(body)
      mesh.visible=name!=='PE_Box_slide'
      mesh.position.set(state[0]!*.25,state[1]!*.25,-state[2]!*.25)
      mesh.quaternion.copy(reflected(state.slice(3,7)).multiply(this.initialRotation.get(name)!))
    }
  }
  dispose() {
    for(const body of this.parts.values())this.world.remove(body)
    this.parts.clear();this.joints.clear();this.forces.length=0;this.initialRotation.clear()
  }
}
