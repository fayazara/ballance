import * as THREE from 'three'
import {OBB} from 'three/addons/math/OBB.js'
import type {IvpWorld} from './ivp-bridge.ts'
import type {OriginalDocument,OriginalObject} from './original-data.ts'
import type {OriginalIvpPlayer} from './original-ivp-player.ts'
import {OriginalProximity} from './original-proximity.ts'
import {originalBox,originalBoxesIntersect} from './original-box.ts'
import data from './original-fan-data.json' with {type:'json'}

type FanWorld=Pick<IvpWorld,'force'|'removeForce'>
type Player=Pick<OriginalIvpPlayer,'body'|'pose'|'localBounds'>
/** Original-coordinate airflow. sample() runs on script frames, independently
 * of PSI ticks: a live IVP controller applies the source impulse on each PSI. */
export class OriginalIvpFan {
  readonly origin:THREE.Vector3
  readonly column:OBB
  readonly sector:number
  running=false
  private world:FanWorld
  private outer=new OriginalProximity(data.outer,1)
  private range=new OriginalProximity(data.force,1)
  private inSector=false
  private controller?:number
  private target?:number
  private disposed=false
  constructor(world:FanWorld,parent:OriginalObject,document:OriginalDocument,sector:number) {
    this.world=world;this.sector=sector
    const parentFrame=new THREE.Matrix4().fromArray(parent.matrix)
    this.origin=new THREE.Vector3().setFromMatrixPosition(parentFrame.clone().multiply(new THREE.Matrix4().fromArray(data.outer.frame)))
    const object=document.objects.find(o=>o.name.endsWith('_Kollisionsquader'))
    const mesh=document.meshes.find(m=>m.id===object?.mesh)
    if(!object||!mesh) throw new Error('Missing original fan airflow bounds')
    const frame=parentFrame.multiply(new THREE.Matrix4().fromArray(object.matrix))
    const bounds=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(mesh.positions,3))
    this.column=originalBox(bounds,frame)
  }
  get active() {return this.controller!==undefined}
  /** Call before unphysicalizing a player: body deletion also deletes its
   * native controllers, so their owners must release their handles first. */
  detachPlayer() {
    if(this.controller!==undefined) this.world.removeForce(this.controller)
    this.controller=undefined;this.target=undefined
  }
  sample(player:Player,activeSector:number) {
    if(this.disposed) throw new Error('IVP fan is disposed')
    if(activeSector!==this.sector) {if(this.inSector) this.reset();return}
    this.inSector=true
    const pose=player.pose,position=new THREE.Vector3(...pose.position as [number,number,number])
    const outer=this.outer.sample(position,this.origin)
    if(outer===4) {this.running=true;this.range.restart()}
    else if(outer===8) this.running=false
    // Outer exit stops polling, not the persistent actuator. Sector-off and
    // a false Box Box Intersection are the recovered shutdown paths.
    if(!this.running) return
    const event=this.range.sample(position,this.origin)
    if(event!==1) return
    const bounds=player.localBounds
    const frame=new THREE.Matrix4().compose(position,new THREE.Quaternion(...pose.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1))
    const box=originalBox(bounds,frame)
    const body=player.body,intersects=originalBoxesIntersect(box,this.column)
    if(!intersects||body===undefined) {this.detachPlayer();return}
    if(this.controller!==undefined) {
      if(this.target!==body) throw new Error('Detach fan before replacing the player body')
      return
    }
    this.target=body
    this.controller=this.world.force({body,position:[0,0,0],positionSpace:'core',direction:data.direction,value:data.forceValue})
  }
  reset() {
    this.detachPlayer();this.running=this.inSector=false
    this.outer=new OriginalProximity(data.outer,1);this.range=new OriginalProximity(data.force,1)
  }
  dispose() {if(this.disposed) return;this.reset();this.disposed=true}
}
