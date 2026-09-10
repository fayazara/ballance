import * as THREE from 'three'

// Keys retain float precision from the asset matrices. The scale is applied to
// mesh coordinates before the native compact surface is built, as in Physics_RT.
export function originalInertiaScale(matrix: THREE.Matrix4) {
  return new THREE.Vector3().setFromMatrixScale(matrix).toArray()
}
export function originalInertiaKey(hulls: readonly string[], matrix: THREE.Matrix4) {
  return `${hulls.join('|')}@${originalInertiaScale(matrix).map(v => v.toPrecision(12)).join(',')}`
}
export function originalInertiaFrame(matrix: THREE.Matrix4) {
  const reflection = new THREE.Matrix4().makeScale(1, 1, -1)
  const rotation = new THREE.Matrix4().extractRotation(matrix)
  // Both our body geometry and the original object axes reflect Z.
  rotation.premultiply(reflection).multiply(reflection)
  return new THREE.Quaternion().setFromRotationMatrix(rotation).normalize()
}
