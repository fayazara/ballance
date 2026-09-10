import * as THREE from 'three'
import type {OriginalDocument} from './original-data.ts'
import {originalBox,originalBoxesIntersect} from './original-box.ts'
import data from './original-death-data.json' with {type:'json'}

/** BallManager checks one authored local box per script frame. Iterator exhaustion
 * occupies a frame too, before a one-frame link restarts at the first member. */
export class OriginalDeathTest {
  readonly volumes
  hit:string|undefined
  private index=0
  constructor(course:OriginalDocument) {
    const group=course.groups.find(g=>g.name===data.group)
    if(!group)throw new Error('Missing original death-volume group')
    this.volumes=group.members.map(id=> {
      const object=course.objects.find(o=>o.id===id),mesh=course.meshes.find(m=>m.id===object?.mesh)
      if(!object||!mesh?.positions.length)throw new Error(`Missing original death-volume mesh: ${id}`)
      const bounds=new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(mesh.positions,3))
      return {id,name:object.name,box:originalBox(bounds,new THREE.Matrix4().fromArray(object.matrix))}
    })
  }
  restart(){this.index=0;this.hit=undefined}
  sample(bounds:THREE.Box3,frame:THREE.Matrix4) {
    if(this.hit)return this.hit
    // Group Iterator's Out output is reached on the call after the last member.
    if(this.index===this.volumes.length){this.index=0;return undefined}
    const volume=this.volumes[this.index++]!
    if(originalBoxesIntersect(volume.box,originalBox(bounds,frame)))this.hit=volume.name
    return this.hit
  }
}
