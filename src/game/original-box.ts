import * as THREE from 'three'
import {OBB} from 'three/addons/math/OBB.js'

/** VxOBB::Create / VxIntersect::OBBOBB scalar semantics, adapted from VxMath
 * (Apache-2.0; source revision in THIRD_PARTY.md). Retain normalized authored
 * axes, including slight shear; do not orthogonalize by quaternion decomposition.
 * Arithmetic currently uses JS doubles, not the original float intermediates. */
export function originalBox(bounds:THREE.Box3,frame:THREE.Matrix4) {
  const axes=[0,1,2].map(i=>new THREE.Vector3().setFromMatrixColumn(frame,i))
  const lengths=axes.map(v=>v.length())
  if(!frame.elements.every(Number.isFinite)||lengths.some(v=>v===0)) throw new Error('Invalid original box transform')
  axes.forEach((v,i)=>v.divideScalar(lengths[i]!))
  const rotation=new THREE.Matrix3().set(axes[0]!.x,axes[1]!.x,axes[2]!.x,axes[0]!.y,axes[1]!.y,axes[2]!.y,axes[0]!.z,axes[1]!.z,axes[2]!.z)
  return new OBB(bounds.getCenter(new THREE.Vector3()).applyMatrix4(frame),bounds.getSize(new THREE.Vector3()).multiplyScalar(.5).multiply(new THREE.Vector3(...lengths as [number,number,number])),rotation)
}
export function originalBoxesIntersect(a:OBB,b:OBB) {
  const axes=(box:OBB)=>[0,1,2].map(i=>new THREE.Vector3().fromArray(box.rotation.elements,i*3))
  const A=axes(a),B=axes(b),e=a.halfSize.toArray(),f=b.halfSize.toArray()
  const delta=b.center.clone().sub(a.center),t=A.map(v=>v.dot(delta))
  const r=A.map(v=>B.map(w=>v.dot(w))),abs=r.map(row=>row.map(Math.abs))
  for(let i=0;i<3;++i) if(Math.abs(t[i]!)>e[i]!+abs[i]![0]!*f[0]!+abs[i]![1]!*f[1]!+abs[i]![2]!*f[2]!) return false
  // VxMath projects delta directly onto B; Three's OBB instead derives this
  // from t*R, which only agrees when A's axes are mutually perpendicular.
  for(let j=0;j<3;++j) if(Math.abs(delta.dot(B[j]!))>f[j]!+abs[0]![j]!*e[0]!+abs[1]![j]!*e[1]!+abs[2]![j]!*e[2]!) return false
  for(let i=0;i<3;++i) for(let j=0;j<3;++j) {
    const i1=(i+1)%3,i2=(i+2)%3,j1=(j+1)%3,j2=(j+2)%3
    if(Math.abs(t[i2]!*r[i1]![j]!-t[i1]!*r[i2]![j]!)>
      abs[i2]![j]!*e[i1]!+abs[i1]![j]!*e[i2]!+abs[i]![j2]!*f[j1]!+abs[i]![j1]!*f[j2]!) return false
  }
  return true
}
