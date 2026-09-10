import * as THREE from 'three'

/** Imported faces alternate materials frequently. Coalesce opaque groups once
 * after import; vertex data, winding and triangle/material membership stay exact.
 * Transparent groups retain their authored order. Colliders own separate indices. */
export function batchOpaqueGroups(geometry:THREE.BufferGeometry,materials:readonly (THREE.Material|undefined)[]) {
  const index=geometry.index,groups=geometry.groups
  if(!index||groups.length<2||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)return false
  const buckets=new Map<number,number[]>()
  const batches:{material:number;indices:number[]}[]=[]
  const flush=()=>{for(const [material,indices] of buckets)batches.push({material,indices});buckets.clear()}
  let count=0
  for(const group of groups) {
    const material=group.materialIndex??0
    if(group.start!==count||group.count%3!==0||group.start+group.count>index.count)return false
    const m=materials[material]
    // Blended/non-depth-writing faces are ordering barriers, including within
    // otherwise solid floor meshes. Never move opaque triangles across them.
    const opaque=m&&!m.transparent&&m.depthWrite&&m.blending===THREE.NormalBlending
    if(!opaque)flush()
    const bucket=opaque?(buckets.get(material)??[]):[]
    for(let i=group.start;i<group.start+group.count;i++)bucket.push(index.getX(i))
    if(opaque)buckets.set(material,bucket)
    else batches.push({material,indices:bucket})
    count+=group.count
  }
  flush()
  if(count!==index.count||batches.length===groups.length)return false
  const indices:number[]=[];geometry.clearGroups()
  for(const {material,indices:bucket} of batches) {
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
