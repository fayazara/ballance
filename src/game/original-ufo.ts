import * as THREE from 'three'
import {originalGeometry,SCALE,type OriginalDocument,type OriginalObject} from './original-data.ts'
import type {OriginalIvpPlayer} from './original-ivp-player.ts'
import {OriginalDynamicPosition,type Position3} from './original-dynamic-position.ts'
import {UfoRotationTrack,ufoCurve} from './original-ufo-animation.ts'
import data from './original-ufo-data.json' with {type:'json'}

const reflection=new THREE.Matrix4().makeScale(SCALE,SCALE,-SCALE)
const inverseReflection=reflection.clone().invert()
type UfoPlayer=Pick<OriginalIvpPlayer,'pose'|'capture'|'moveCaptured'>

/** Final-course scripted assembly, separate from the balloon's IVP bodies.
 * Called once per presentation frame: TT's damping and graph delays are frame
 * dependent. Positions and animation nodes remain in original coordinates. */
export class OriginalUfo {
  readonly group=new THREE.Group()
  readonly nodes=new Map<string,THREE.Object3D>()
  readonly meshes=new Map<string,THREE.Mesh>()
  stage:'idle'|'waiting'|'flight'|'flash'|'done'='idle'
  row=-1
  grabbed=false
  private root=new THREE.Group()
  private frame:THREE.Matrix4
  private inverseFrame:THREE.Matrix4
  private delay=0
  private rowAge=0
  private rowAdvance=false
  private motionDelay=0
  private motion=new OriginalDynamicPosition()
  private target:Position3=[0,0,0]
  private previousBall=new THREE.Vector3()
  private grabAge?:number
  private centerNext=false
  private carry=new THREE.Matrix4()
  private flashAge=0
  private flash?:THREE.Mesh
  private flashRotation=new THREE.Quaternion()
  private tracks=data.grab.tracks.map(track=>({data:track,rotation:new UfoRotationTrack(track.keys)}))
  constructor(parent:OriginalObject,document:OriginalDocument,materials:Map<number,THREE.MeshPhongMaterial>) {
    this.frame=new THREE.Matrix4().fromArray(parent.matrix);this.inverseFrame=this.frame.clone().invert()
    this.root.matrix.copy(this.frame);this.root.matrixAutoUpdate=false
    const meshMaterials=(source:OriginalDocument['meshes'][number])=>source.materials.map((id,slot)=> {
      const material=materials.get(id)
      if(material)return material
      // Converted meshes retain an unused null material slot at index zero.
      if(source.faceMaterials.includes(slot))throw new Error(`Missing UFO material ${id}`)
      return materials.get(source.materials[source.faceMaterials[0]!]!)!
    })
    const matrices=new Map(data.hierarchy.map(part=>[part.name,new THREE.Matrix4().fromArray(part.matrix)]))
    for(const part of data.hierarchy) {
      const node=new THREE.Object3D();node.name=part.name
      const local=matrices.get(part.name)!.clone()
      if(part.parent)local.premultiply(matrices.get(part.parent)!.clone().invert())
      local.decompose(node.position,node.quaternion,node.scale)
      this.nodes.set(part.name,node)
      const object=document.objects.find(object=>object.name===part.name),source=document.meshes.find(mesh=>mesh.id===object?.mesh)
      if(!source)throw new Error(`Missing UFO mesh ${part.name}`)
      const mesh=new THREE.Mesh(originalGeometry(source,new THREE.Matrix4().toArray()),meshMaterials(source))
      mesh.matrixAutoUpdate=false;mesh.name=part.name;mesh.castShadow=mesh.receiveShadow=true
      this.meshes.set(part.name,mesh);this.group.add(mesh)
    }
    for(const part of data.hierarchy)(part.parent?this.nodes.get(part.parent)!:this.root).add(this.nodes.get(part.name)!)
    const object=document.objects.find(object=>object.name==='PE_UFO_Flash'),source=document.meshes.find(mesh=>mesh.id===object?.mesh)
    if(source) {
      const flashMaterials=meshMaterials(source)
      for(const material of flashMaterials) {
        material.blending=THREE.CustomBlending;material.blendSrc=THREE.OneFactor;material.blendDst=THREE.OneFactor
        material.blendEquation=THREE.AddEquation
      }
      new THREE.Matrix4().fromArray(data.flash.matrix).decompose(new THREE.Vector3(),this.flashRotation,new THREE.Vector3())
      this.flash=new THREE.Mesh(originalGeometry(source,new THREE.Matrix4().toArray()),flashMaterials)
      this.flash.matrixAutoUpdate=false;this.flash.name='PE_UFO_Flash';this.group.add(this.flash)
    }
    this.reset()
  }
  private get body() {return this.nodes.get('PE_UFO_Body')!}
  private worldPosition() {this.root.updateMatrixWorld(true);return new THREE.Vector3().setFromMatrixPosition(this.body.matrixWorld)}
  get hidePlayer() {return this.grabbed&&(this.stage==='flash'||this.stage==='done')}
  reset() {
    this.stage='idle';this.row=-1;this.grabbed=false;this.grabAge=undefined;this.centerNext=false
    this.rowAge=0;this.rowAdvance=false;this.flashAge=0
    for(const part of data.hierarchy) {
      const matrix=new THREE.Matrix4().fromArray(part.matrix)
      if(part.parent)matrix.premultiply(new THREE.Matrix4().fromArray(data.hierarchy.find(p=>p.name===part.parent)!.matrix).invert())
      matrix.decompose(this.nodes.get(part.name)!.position,this.nodes.get(part.name)!.quaternion,this.nodes.get(part.name)!.scale)
    }
    this.sync()
  }
  start() {if(this.stage==='idle'){this.stage='waiting';this.delay=2}}
  private selectRow() {
    this.row++;this.rowAge=0;this.rowAdvance=false
    if(this.row===data.rows.length) {this.stage='flash';this.flashAge=0;return}
    if(data.rows[this.row]!.startGrab)this.grabAge=0
  }
  /** Emits authored one-shot sounds; continuous UFO pitch/proximity is separate. */
  step(deltaMs:number,player:UfoPlayer):string[] {
    const sounds:string[]=[]
    if(this.stage==='idle'||this.stage==='done')return sounds
    if(this.stage==='waiting') {
      if(--this.delay>0)return sounds
      this.stage='flight';this.body.position.fromArray(data.initialPosition)
      this.selectRow();this.motionDelay=1;this.sync();return sounds
    }
    if(this.stage==='flash') {
      this.flashAge+=deltaMs
      if(this.flashAge>data.flash.durationMs)this.stage='done'
      this.sync();return sounds
    }
    if(this.centerNext) {this.carry.setPosition(0,0,0);this.centerNext=false}
    const advance=this.rowAdvance
    let startedGrab=false
    if(advance) {
      this.selectRow()
      if(this.stage!=='flight'){this.flashAge=deltaMs;this.sync();return sounds}
      if(data.rows[this.row]!.startGrab){startedGrab=true;sounds.push('Misc_UFO_anim')}
    } else {
      this.rowAge+=deltaMs
      if(this.rowAge>=data.rows[this.row]!.waitMs)this.rowAdvance=true
    }
    const row=data.rows[this.row]!
    const current=this.worldPosition().toArray() as [number,number,number]
    if(this.motionDelay) {this.motionDelay=0;this.motion.start(current)}
    else {
      const next=this.motion.step(current,this.target,[row.force,row.force,row.force],[row.damping,row.damping,row.damping],deltaMs)
      this.body.position.fromArray(next).applyMatrix4(this.inverseFrame)
    }
    // Target update precedes the ball-reference copy, retaining that one-frame lag.
    const target=new THREE.Vector3().fromArray(row.position)
    if(row.reference==='ball')target.add(this.previousBall)
    else target.applyMatrix4(this.frame)
    this.target=target.toArray()
    this.previousBall.fromArray(player.pose.position)
    const angle=data.spin.radiansPerSecond*deltaMs/1000
    this.body.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(data.spin.bodyAxis).normalize(),angle))
    this.nodes.get('PE_UFO_Top')!.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(data.spin.topAxis),angle*data.spin.topMultiplier))
    if(this.grabAge!==undefined&&!this.grabbed) {
      if(!startedGrab)this.grabAge=Math.fround(this.grabAge+deltaMs)
      const progress=ufoCurve(data.grab.curve,Math.min(1,this.grabAge/data.grab.durationMs))
      for(const track of this.tracks) {
        const node=this.nodes.get(track.data.name)!
        // VxQuaternion::ToMatrix uses the conjugate of Three's convention.
        node.quaternion.copy(track.rotation.sample(progress*track.data.length)).conjugate();node.scale.fromArray(track.data.scale)
      }
      if(this.grabAge>data.grab.durationMs) {
        this.root.updateMatrixWorld(true)
        const pose=player.capture()
        this.carry.compose(new THREE.Vector3().fromArray(pose.position),new THREE.Quaternion().fromArray(pose.rotation),new THREE.Vector3(1,1,1))
        this.carry.premultiply(this.body.matrixWorld.clone().invert());this.grabbed=true;this.centerNext=true
      }
    }
    if(this.grabbed) {
      this.root.updateMatrixWorld(true)
      const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
      this.body.matrixWorld.clone().multiply(this.carry).decompose(position,rotation,scale)
      player.moveCaptured({position:position.toArray(),rotation:rotation.normalize().toArray()})
    }
    this.sync();return sounds
  }
  sync() {
    this.root.updateMatrixWorld(true)
    for(const [name,mesh] of this.meshes) {
      mesh.visible=this.stage==='flight'
      mesh.matrix.copy(reflection).multiply(this.nodes.get(name)!.matrixWorld).multiply(inverseReflection)
    }
    if(this.flash) {
      this.flash.visible=this.stage==='flash'
      const progress=ufoCurve(data.flash.curve,Math.min(1,this.flashAge/data.flash.durationMs))
      const scale=new THREE.Vector3().fromArray(data.flash.scaleFrom).lerp(new THREE.Vector3().fromArray(data.flash.scaleTo),progress)
      const local=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(data.flash.position),this.flashRotation,scale)
      this.flash.matrix.copy(reflection).multiply(this.frame).multiply(local).multiply(inverseReflection)
    }
  }
}
