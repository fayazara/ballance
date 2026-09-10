import * as THREE from 'three'
import data from './original-camera-data.json' with {type:'json'}
import {OriginalDynamicPosition,type Position3} from './original-dynamic-position.ts'
import {ufoCurve} from './original-ufo-animation.ts'

const vector=(values:readonly number[])=>new THREE.Vector3(values[0],values[1],values[2])
const tuple=(value:THREE.Vector3):Position3=>[value.x,value.y,value.z]
const original=(value:THREE.Vector3)=>value.clone().multiply(new THREE.Vector3(4,4,-4))
const rendered=(from:THREE.Vector3,to:THREE.Vector3)=>to.copy(from).multiply(new THREE.Vector3(.25,.25,-.25))
const matrix=(name:keyof typeof data.frames)=>new THREE.Matrix4().fromArray(data.frames[name].matrix)

/** Camera.nmo's world-space rig and Gameplay's two dynamic-position controls.
 * Navigation turns Cam_Orient first; Cam_OrientRef only commits on the delayed
 * completion link, so input does not follow the visibly lagging camera. */
export class OriginalCamera {
  readonly position=new THREE.Vector3()
  readonly target=new THREE.Vector3()
  readonly steeringFrame=new THREE.Matrix4()
  readonly orientation=new THREE.Matrix4()
  readonly positionMotion=new OriginalDynamicPosition()
  readonly targetMotion=new OriginalDynamicPosition()
  private eye=new THREE.Vector3()
  private aim=new THREE.Vector3()
  private offset=new THREE.Vector3().setFromMatrixPosition(matrix('Cam_Pos').premultiply(matrix('Cam_Orient').invert()))
  private rotation?:{elapsedMs:number;angle:number;commitFrames?:number}
  private activation=true

  get turning(){return this.rotation!==undefined}
  get inputYaw(){const right=new THREE.Vector3().setFromMatrixColumn(this.steeringFrame,0);return Math.atan2(right.z,right.x)}
  get anchor() {
    return this.offset.clone().applyMatrix4(this.orientation.clone().setPosition(this.aim))
  }
  get desiredPosition(){return rendered(this.anchor,new THREE.Vector3())}
  get verticalFov(){return 2*Math.atan(Math.tan(data.projection.horizontalFov/2)*data.projection.aspectHeight/data.projection.aspectWidth)*180/Math.PI}
  get clipping(){return {near:data.projection.near*.25,far:data.projection.far*.25}}

  reset(resetFrame:readonly number[]) {
    if(resetFrame.length!==16||!resetFrame.every(Number.isFinite))throw new Error('Invalid camera reset frame')
    const change=new THREE.Matrix4().fromArray(resetFrame).multiply(matrix('Cam_MF').invert())
    this.steeringFrame.copy(change).multiply(matrix('Cam_OrientRef'))
    this.orientation.copy(change).multiply(matrix('Cam_Orient'))
    this.aim.setFromMatrixPosition(change.clone().multiply(matrix('Cam_Target')))
    this.eye.setFromMatrixPosition(change.clone().multiply(matrix('InGameCam')))
    this.positionMotion.start(tuple(this.eye));this.targetMotion.start(tuple(this.aim))
    this.rotation=undefined;this.activation=true;this.sync()
  }
  /** Development route fixtures can explicitly stage a camera heading. */
  inspectAt(ball:THREE.Vector3,yaw:number) {
    this.steeringFrame.makeRotationY(-yaw);this.orientation.copy(this.steeringFrame)
    this.aim.copy(original(ball));this.eye.copy(this.anchor)
    this.positionMotion.start(tuple(this.eye));this.targetMotion.start(tuple(this.aim))
    this.rotation=undefined;this.activation=true;this.sync()
  }
  turn(direction:'left'|'right') {
    if(this.rotation)return false
    this.rotation={elapsedMs:0,angle:data.turn.angles[direction==='left'?0:1]!}
    return true
  }
  step(deltaMs:number,ball:THREE.Vector3,high=false) {
    if(!Number.isFinite(deltaMs)||deltaMs<0)throw new Error('Invalid camera frame time')
    if(this.rotation) {
      const rotation=this.rotation
      if(rotation.commitFrames!==undefined) {
        if(--rotation.commitFrames===0){this.steeringFrame.copy(this.orientation);this.rotation=undefined}
      } else {
        rotation.elapsedMs=Math.fround(rotation.elapsedMs+Math.fround(deltaMs))
        const progress=Math.fround(Math.min(1,rotation.elapsedMs/data.turn.durationMs))
        const angle=Math.fround(rotation.angle*ufoCurve(data.turn.curve,progress))
        this.orientation.copy(this.steeringFrame).multiply(new THREE.Matrix4().makeRotationY(angle))
        // Bezier Progression 0x10005 completes on > duration, not >=.
        if(rotation.elapsedMs>data.turn.durationMs)rotation.commitFrames=data.turn.commitDelayFrames
      }
    }
    if(this.activation){this.activation=false;return}
    const force:Position3=[data.position.force[0]!,high?data.highView.forceY:data.position.force[1]!,data.position.force[2]!]
    // The camera position controller precedes the target controller in
    // Gameplay_Ingame. Cam_Pos inherits the target's translation afterwards.
    this.eye.copy(vector(this.positionMotion.step(tuple(this.eye),tuple(this.anchor),force,
      data.position.damping as unknown as Position3,deltaMs,[0,high?data.highView.offsetY:0,0])))
    this.aim.copy(vector(this.targetMotion.step(tuple(this.aim),tuple(original(ball)),
      data.target.force as unknown as Position3,data.target.damping as unknown as Position3,deltaMs)))
    this.sync()
  }
  private sync(){rendered(this.eye,this.position);rendered(this.aim,this.target)}
}
