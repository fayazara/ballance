import * as THREE from 'three'
import type { OriginalDocument,OriginalObject } from './original-data.ts'
import type { IvpWorld } from './ivp-bridge.ts'
import recovered from './original-lift-data.json' with {type:'json'}

// A sector activation creates a frozen assembly; reset destroys its original
// Physicalize bodies. Rendering consumes their original-coordinate object poses.
type AssemblyWorld=Pick<IvpWorld,'sphere'|'compound'|'joint'|'spring'|'wake'|'remove'|'state'>
export class OriginalIvpLift {
  readonly parts=new Map<string,number>()
  readonly platform:number
  readonly origin:THREE.Vector3
  readonly axis:THREE.Vector3
  private world:AssemblyWorld
  private support:number
  private disposed=false
  constructor(world:AssemblyWorld,parent:OriginalObject,document:OriginalDocument) {
    this.world=world
    const matrix=new THREE.Matrix4().fromArray(parent.matrix)
    const frame=(values:number[])=>matrix.clone().multiply(new THREE.Matrix4().fromArray(values))
    const point=(p:number[],m:THREE.Matrix4)=>new THREE.Vector3(...p as [number,number,number]).applyMatrix4(m)
    const anchor=point([0,0,0],frame(recovered.slider.frame1))
    this.axis=point([0,0,0],frame(recovered.slider.frame2)).sub(anchor).normalize()
    this.origin=new THREE.Vector3()
    this.support=world.sphere(.1,{position:anchor.toArray(),mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,fixed:true,collisionEnabled:false})
    try {
      for(const data of recovered.parts) {
        const object=document.objects.find(o=>o.name===data.target)
        if(!object) throw new Error(`Missing IVP lift part ${data.target}`)
        const transform=frame(object.matrix),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
        transform.decompose(position,rotation,scale);rotation.normalize()
        const composed=new THREE.Matrix4().compose(position,rotation,scale)
        if(transform.determinant()<=0 || transform.elements.some((v,i)=>Math.abs(v-composed.elements[i]!)>.0001)) throw new Error(`Unsupported IVP lift transform ${data.target}`)
        const hulls=data.hulls.map(name=> {
          const mesh=document.meshes.find(m=>m.name===name)
          if(!mesh) throw new Error(`Missing IVP lift hull ${name}`)
          const points=new Map<string,number[]>()
          for(let i=0;i<mesh.positions.length;i+=3) {const p=mesh.positions.slice(i,i+3);points.set(p.join(' '),p)}
          return [...points.values()].flatMap(p=>p.map((v,i)=>Math.fround(v*scale.getComponent(i))))
        })
        const body=world.compound(hulls,{...data,position:position.toArray(),rotation:rotation.toArray(),frozen:data.startFrozen,collisionEnabled:data.enableCollision})
        this.parts.set(data.target,body)
        if(data.target===recovered.wakeTarget) this.origin.copy(position)
      }
      this.platform=this.parts.get(recovered.wakeTarget)!
      world.joint({kind:'slider',reference:this.platform,attached:this.support,anchor:anchor.toArray(),axis:this.axis.toArray(),...(recovered.slider.limitsEnabled?{limits:[recovered.slider.lowerLimit,recovered.slider.upperLimit] as [number,number]}:{})})
      const s=recovered.spring
      world.spring({reference:this.platform,attached:this.support,anchor1:point(s.position1,frame(s.frame1)).toArray(),anchor2:point(s.position2,frame(s.frame2)).toArray(),length:s.length,constant:s.constant,axialDamping:s.axialDamping,globalDamping:s.globalDamping})
    } catch(error) {this.dispose();throw error}
  }
  wake() {if(this.disposed) throw new Error('IVP lift is disposed');this.world.wake(this.platform)}
  removeWeight(name:string) {
    if(this.disposed) throw new Error('IVP lift is disposed')
    if(name===recovered.wakeTarget) throw new Error('The lift platform is not a removable weight')
    const body=this.parts.get(name);if(body===undefined) return false
    this.world.remove(body);this.parts.delete(name);return true
  }
  get travel() {
    if(this.disposed) throw new Error('IVP lift is disposed')
    return new THREE.Vector3(...this.world.state(this.platform).slice(0,3) as [number,number,number]).sub(this.origin).dot(this.axis)
  }
  dispose() {
    if(this.disposed) return
    for(const body of this.parts.values()) this.world.remove(body)
    this.parts.clear();this.world.remove(this.support);this.disposed=true
  }
}
