import * as THREE from 'three'
import type {Material} from './levels.ts'
import type {OriginalDocument} from './original-data.ts'
import type {IvpWorld} from './ivp-bridge.ts'
import {SCALE} from './original-data.ts'
import {PLAYER_PHYSICS,ORIGINAL_TIME_FACTOR} from './original-physics.ts'
import source from './original-player-data.json' with {type:'json'}
export interface OriginalPlayerPose {position:readonly number[];rotation:readonly number[]}
export type OriginalDriveKey='left'|'right'|'forward'|'backward'
type PlayerWorld=Pick<IvpWorld,'sphere'|'convex'|'force'|'removeForce'|'remove'|'state'|'wake'>

/** Original-coordinate player ownership. The renderer uses renderPose; physics
 * receives unscaled geometry and runs on its own original 66 Hz clock. */
export class OriginalIvpPlayer {
  private world:PlayerWorld
  private paper:number[]
  private bounds=new Map<Material,THREE.Box3>()
  private handle?:number
  private captured:OriginalPlayerPose
  private drives=new Map<OriginalDriveKey,{handle:number;direction:number[]}>()
  private disposed=false
  material:Material
  constructor(world:PlayerWorld,document:OriginalDocument,material:Material,pose:OriginalPlayerPose) {
    this.world=world;this.material=material;this.captured=this.copyPose(pose)
    const object=document.objects.find(o=>o.name==='Ball_Paper'),mesh=document.meshes.find(m=>m.id===object?.mesh)
    if(!object||!mesh) throw new Error('Missing original paper player geometry')
    const identity=new THREE.Matrix4().elements
    if(object.matrix.some((v,i)=>Math.abs(v-identity[i]!)>1e-7)) throw new Error('Unverified original paper player frame')
    const unique=new Map<string,number[]>()
    for(let i=0;i<mesh.positions.length;i+=3) {const p=mesh.positions.slice(i,i+3).map(Math.fround);unique.set(p.join(' '),p)}
    this.paper=[...unique.values()].flat()
    for(const kind of ['wood','stone','paper'] as const) {
      const ball=document.objects.find(o=>o.name.toLowerCase()===`ball_${kind}`)
      const geometry=document.meshes.find(m=>m.id===ball?.mesh)
      if(!ball||!geometry) throw new Error(`Missing original ${kind} player bounds`)
      if(ball.matrix.some((v,i)=>Math.abs(v-identity[i]!)>1e-7)) throw new Error(`Unverified original ${kind} player frame`)
      this.bounds.set(kind,new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(geometry.positions,3)))
    }
    this.release(material)
  }
  private live() {if(this.disposed) throw new Error('IVP player is disposed')}
  private copyPose(pose:OriginalPlayerPose):OriginalPlayerPose {
    const {position,rotation}=pose
    if(position.length!==3||rotation.length!==4||![...position,...rotation].every(Number.isFinite)||Math.abs(Math.hypot(...rotation)-1)>1e-5) throw new Error('Invalid original player pose')
    return {position:[...position],rotation:[...rotation]}
  }
  get body() {this.live();return this.handle}
  get localBounds() {this.live();return this.bounds.get(this.material)!.clone()}
  get pose():OriginalPlayerPose {
    this.live()
    if(this.handle!==undefined) {const state=this.world.state(this.handle);return {position:state.slice(0,3),rotation:state.slice(3,7)}}
    return this.copyPose(this.captured)
  }
  /** Input callbacks resolve the camera/world direction when a key controller
   * starts. Opposing keys remain independent, as in the original behavior graph. */
  drive(key:OriginalDriveKey,direction:readonly number[]|undefined) {
    this.live()
    if(direction&&(direction.length!==3||!direction.every(Number.isFinite))) throw new Error('Invalid original drive direction')
    const previous=this.drives.get(key)
    if(previous&&direction&&previous.direction.every((v,i)=>v===direction[i])) return
    // Gameplay.nmo connects both force outputs (Create and Shutdown) to
    // Physics WakeUp 1653. A release must wake a sleeping ball too: another
    // independently held key may still own a force controller.
    if(previous) {
      this.world.removeForce(previous.handle);this.drives.delete(key)
      if(this.handle!==undefined) this.world.wake(this.handle)
    }
    if(this.handle===undefined||!direction) return
    const force=this.world.force({body:this.handle,position:[0,0,0],positionSpace:'core',direction,value:PLAYER_PHYSICS[this.material].driveImpulse})
    this.drives.set(key,{handle:force,direction:[...direction]})
    this.world.wake(this.handle)
  }
  /** Unphysicalize for a transformer; contacts and old controller handles end. */
  capture() {
    this.live();this.captured=this.copyPose(this.pose)
    if(this.handle!==undefined) this.world.remove(this.handle)
    this.handle=undefined;this.drives.clear()
    return this.copyPose(this.captured)
  }
  moveCaptured(pose:OriginalPlayerPose) {
    this.live();if(this.handle!==undefined) throw new Error('Capture the player before moving its visual pose')
    this.captured=this.copyPose(pose)
  }
  release(material:Material) {
    this.live();if(this.handle!==undefined) throw new Error('Player is already physicalized')
    const settings=source.bodies.find(b=>b.shape===(material==='paper'?'convex':'sphere'))!
    const descriptor={...PLAYER_PHYSICS[material],...this.captured,massCenter:settings.massCenter,collisionGroup:'Ball',fixed:settings.fixed,frozen:settings.startFrozen,collisionEnabled:settings.enableCollision}
    const handle=material==='paper'?this.world.convex(this.paper,descriptor):this.world.sphere(settings.radius!,descriptor)
    this.handle=handle;this.material=material
  }
  respawn(material:Material,pose:OriginalPlayerPose) {
    const valid=this.copyPose(pose)
    this.capture();this.captured=valid;this.release(material)
  }
  get renderPose() {
    const pose=this.pose,[x,y,z,w]=pose.rotation
    return {position:new THREE.Vector3(...pose.position as [number,number,number]).multiplyScalar(SCALE).multiply(new THREE.Vector3(1,1,-1)),rotation:new THREE.Quaternion(-x!,-y!,z!,w!)}
  }
  get speed() {
    this.live();return this.handle===undefined?0:Math.hypot(...this.world.state(this.handle).slice(7,10))*SCALE*ORIGINAL_TIME_FACTOR
  }
  dispose() {
    if(this.disposed) return
    if(this.handle!==undefined) this.world.remove(this.handle)
    this.handle=undefined;this.drives.clear();this.disposed=true
  }
}
