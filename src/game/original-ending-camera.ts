import * as THREE from 'three'
import {OriginalDynamicPosition,type Position3} from './original-dynamic-position.ts'
import data from './original-ending-camera-data.json' with {type:'json'}

const original=(point:THREE.Vector3):Position3=>[point.x*4,point.y*4,-point.z*4]
const render=(point:Position3,target:THREE.Vector3)=>target.set(point[0]*.25,point[1]*.25,-point[2]*.25)

/** Gameplay's detached Cam_Pos and independently tracked Cam_Target.
 * When handed the live rig, detachment preserves its actual Cam_Pos anchor and
 * controller histories instead of restarting the camera's follow motion. */
export class OriginalEndingCamera {
  active=false
  readonly position=new THREE.Vector3()
  readonly target=new THREE.Vector3()
  private delay?:number
  private anchor:Position3=[0,0,0]
  private lowered=false
  private positionMotion=new OriginalDynamicPosition()
  private targetMotion=new OriginalDynamicPosition()

  start() {if(!this.active&&this.delay===undefined)this.delay=data.detachDelayFrames}
  reset() {this.active=false;this.delay=undefined;this.lowered=false}

  /** Once per presentation frame, before the next physical integration. */
  step(deltaMs:number,ball:THREE.Vector3,incomingPosition:THREE.Vector3,incomingTarget:THREE.Vector3,ufoFlying:boolean,
    rig?:{desiredPosition:THREE.Vector3;positionMotion:OriginalDynamicPosition;targetMotion:OriginalDynamicPosition}) {
    if(!this.active) {
      if(this.delay===undefined||--this.delay>0)return
      this.delay=undefined;this.active=true
      this.position.copy(incomingPosition);this.target.copy(incomingTarget)
      this.anchor=original(rig?.desiredPosition??this.position)
      if(rig){this.positionMotion=rig.positionMotion;this.targetMotion=rig.targetMotion}
      else {this.positionMotion=new OriginalDynamicPosition();this.targetMotion=new OriginalDynamicPosition();this.positionMotion.start(this.anchor);this.targetMotion.start(original(this.target))}
    }
    if(ufoFlying&&!this.lowered) {
      // Cam_Pos has an upright, yaw-only frame, so its authored self-relative
      // [0,-15,0] translation is also a world-Y translation.
      this.anchor=[this.anchor[0],this.anchor[1]+data.ufoPositionOffset[1]!,this.anchor[2]]
      this.lowered=true
    }
    render(this.positionMotion.step(original(this.position),this.anchor,
      data.position.force as unknown as Position3,data.position.damping as unknown as Position3,deltaMs),this.position)
    render(this.targetMotion.step(original(this.target),original(ball),
      data.target.force as unknown as Position3,data.target.damping as unknown as Position3,deltaMs),this.target)
  }
}
