import * as THREE from 'three'
import type {OriginalObject} from './original-data.ts'
import {OriginalProximity} from './original-proximity.ts'
import data from './original-checkpoint-data.json' with {type:'json'}

/** Current checkpoint script, in original coordinates. Only the active next
 * checkpoint runs its trigger. Script Reset restores both polling countdowns. */
export class OriginalCheckpoint {
  readonly origin:THREE.Vector3
  readonly center:THREE.Vector3
  readonly gate=new OriginalProximity(data.gate,1)
  readonly trigger=new OriginalProximity(data.trigger,1)
  readonly smallGate=new OriginalProximity(data.smallGate,1)
  armed=false
  reached=false
  smallFlames=false
  constructor(object:OriginalObject) {
    const frame=new THREE.Matrix4().fromArray(object.matrix)
    this.origin=new THREE.Vector3().setFromMatrixPosition(frame)
    this.center=new THREE.Vector3().setFromMatrixPosition(frame.multiply(new THREE.Matrix4().fromArray(data.frame)))
  }
  sample(player:THREE.Vector3) {
    if(this.reached) {
      this.sampleSmallFlames(player)
      return false
    }
    const gate=this.gate.sample(player,this.origin)
    if(gate===4){this.armed=true;this.trigger.restart()}
    else if(gate===8)this.armed=false
    if(!this.armed||!this.trigger.enter(player,this.center))return false
    // The checkpoint message and sound start the side-flame scripts and their
    // separate distance watcher. The center watcher is stopped at this point.
    this.reached=true;this.armed=false;this.smallFlames=true
    this.sampleSmallFlames(player)
    return true
  }
  private sampleSmallFlames(player:THREE.Vector3) {
    const gate=this.smallGate.sample(player,this.origin)
    if(gate===4)this.smallFlames=true
    else if(gate===8)this.smallFlames=false
  }
}
