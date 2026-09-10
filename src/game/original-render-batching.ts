import * as THREE from 'three'

/** Imported faces alternate materials frequently. Coalesce opaque groups once
 * after import; vertex data, winding and triangle/material membership stay exact.
 * Transparent groups retain their authored order. Colliders own separate indices. */
export function batchOpaqueGroups(geometry:THREE.BufferGeometry,materials:readonly (THREE.Material|undefined)[]) {
  const index=geometry.index,groups=geometry.groups
  if(!index||groups.length<2||materials.some(m=>m?.transparent)||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)return false
  const buckets=new Map<number,number[]>()
  let count=0
  for(const group of groups) {
    const material=group.materialIndex??0
    if(!materials[material]||group.start!==count||group.count%3!==0)return false
    const bucket=buckets.get(material)??[]
    for(let i=group.start;i<group.start+group.count;i++)bucket.push(index.getX(i))
    buckets.set(material,bucket);count+=group.count
  }
  if(count!==index.count||buckets.size===groups.length)return false
  const indices:number[]=[];geometry.clearGroups()
  for(const [material,bucket] of buckets) {
    geometry.addGroup(indices.length,bucket.length,material)
    for(const i of bucket)indices.push(i)
  }
  geometry.setIndex(indices)
  return true
}
export function batchOriginalScene(root:THREE.Object3D) {
  root.traverse(object=> {
    if(object instanceof THREE.Mesh&&Array.isArray(object.material))batchOpaqueGroups(object.geometry,object.material)
  })
}
