import * as THREE from 'three'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { FLOOR_PHYSICS } from './original-physics.ts'
import type { IvpBodyDescriptor } from './ivp-bridge.ts'
import { IvpWorld } from './ivp-bridge.ts'

export interface IvpOriginalFloor {
  name: string
  objectId: number
  triangles: Float64Array
  descriptor: IvpBodyDescriptor
  group: string
}
// CKIpionManager builds collision geometry in local, scaled object axes. The
// rigid body carries translation/rotation; course geometry is never reflected
// into the web renderer's axes here. Serialized hierarchy/local scale remains a
// separate import boundary; these course floor frames all have unit scale.
export function originalIvpFloors(document: OriginalDocument): IvpOriginalFloor[] {
  const members=(name: string)=>new Set(document.groups.find(g=>g.name===name)?.members ?? [])
  const floors=new Set([...members('Phys_Floors'),...members('Phys_FloorRails'),...members('Phys_FloorStopper')])
  const stoppers=members('Phys_FloorStopper')
  return document.objects.filter(o=>floors.has(o.id)).map(object=> {
    const source=document.meshes.find(m=>m.id===object.mesh)
    if(!source || !source.indices.length) throw new Error(`Missing original floor mesh: ${object.name}`)
    const matrix=new THREE.Matrix4().fromArray(object.matrix.map(Math.fround))
    const position=new THREE.Vector3(), rotation=new THREE.Quaternion(), scale=new THREE.Vector3()
    matrix.decompose(position,rotation,scale); rotation.normalize()
    if(scale.distanceTo(new THREE.Vector3(1,1,1)) > .0001) throw new Error(`Unverified original floor scale: ${object.name}`)
    const composed=new THREE.Matrix4().compose(position,rotation,scale)
    if(matrix.elements.some((v,i)=>Math.abs(v-composed.elements[i]!)>.0001)) throw new Error(`Unsupported original floor shear: ${object.name}`)
    const s=scale.toArray().map(Math.fround)
    const triangles=Float64Array.from(source.indices.flatMap(index=> {
      if(index<0 || index*3+2>=source.positions.length) throw new Error(`Invalid original floor index: ${object.name}`)
      return [0,1,2].map(axis=>Math.fround(Math.fround(source.positions[index*3+axis]!)*s[axis]!))
    }))
    return { name:object.name, objectId:object.id, triangles, group:stoppers.has(object.id)?'Ball':'Floor',
      descriptor:{ position:position.toArray(), rotation:rotation.toArray(), fixed:true, mass:1, collisionGroup:stoppers.has(object.id)?'Ball':'Floor',
        ...FLOOR_PHYSICS, linearDamping:0, angularDamping:0 } }
  })
}
export function addOriginalIvpFloors(world: IvpWorld, floors: IvpOriginalFloor[]) {
  return floors.map(floor=> {
    const body=world.triangles(floor.triangles,floor.descriptor)
    return { body, name:floor.name, objectId:floor.objectId }
  })
}
export function originalIvpResetpoints(document: OriginalDocument): OriginalObject[] {
  const ids=new Set(document.groups.find(g=>g.name==='PR_Resetpoints')?.members ?? [])
  return document.objects.filter(o=>ids.has(o.id)).sort((a,b)=>a.name.localeCompare(b.name))
}
