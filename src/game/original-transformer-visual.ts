import * as THREE from 'three'
import { originalGeometry, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { transformerPose } from './original-transformation.ts'

export class OriginalTransformerVisual {
  group = new THREE.Group()
  private lift = new THREE.Group()
  private rings: { mesh: THREE.Mesh; direction: THREE.Vector3 }[] = []
  private flash?: THREE.Mesh
  private flashMaterial?: THREE.MeshPhongMaterial
  private color?: THREE.MeshPhongMaterial
  private hidden: THREE.Mesh[] = []
  constructor(document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>) {
    this.group.add(this.lift); this.group.visible = false
    for (const object of document.objects) {
      const source = document.meshes.find(m => m.id === object.mesh)!
      // Virtools reserves null material slots even when no faces use them.
      const mesh = new THREE.Mesh(originalGeometry(source, object.matrix), source.materials.map(id => materials.get(id) || materials.values().next().value!))
      mesh.castShadow = !object.name.includes('Flashfield'); this.lift.add(mesh)
      if (object.name.includes('Ringpart')) {
        const direction = new THREE.Vector3(-.5, 0, -.5).applyMatrix4(new THREE.Matrix4().fromArray(object.matrix)).multiplyScalar(SCALE); direction.z *= -1
        this.rings.push({ mesh, direction })
      }
      if (object.name.includes('Flashfield')) this.flash = mesh
    }
    const color = document.materials.find(m => m.name === 'AnimTrafo_RingParts_Color')
    if (color) this.color = materials.get(color.id)
    const flash = document.materials.find(m => m.name === 'AnimTrafo_Flashfield')
    if (flash) { const material = materials.get(flash.id)!; this.flashMaterial = material; material.blending = THREE.AdditiveBlending; material.depthWrite = false; material.side = THREE.DoubleSide }
  }
  begin(pad: OriginalObject, meshes: THREE.Mesh[]) {
    this.reset(); this.hidden = meshes; meshes.forEach(m => { m.visible = false })
    const flip = new THREE.Matrix4().makeScale(1, 1, -1)
    const matrix = flip.clone().multiply(new THREE.Matrix4().fromArray(pad.matrix)).multiply(flip)
    matrix.elements[12]! *= SCALE; matrix.elements[13]! *= SCALE; matrix.elements[14]! *= SCALE
    matrix.decompose(this.group.position, this.group.quaternion, this.group.scale)
    const tint = meshes.flatMap(m => Array.isArray(m.material) ? m.material : [m.material]).find(m => /^P_Trafo_.*_Color$/.test(m.name))
    if (this.color && tint instanceof THREE.MeshPhongMaterial) { this.color.color.copy(tint.color); this.color.emissive.copy(tint.emissive) }
    this.group.visible = true; this.update(0)
  }
  update(age: number) {
    const pose = transformerPose(age)
    this.lift.position.y = pose.height
    for (const ring of this.rings) ring.mesh.position.copy(ring.direction).multiplyScalar(pose.opening)
    if (this.flash) {
      this.flash.visible = pose.flashing
      this.flashMaterial?.map?.offset.set(pose.flashOffset, 0)
    }
  }
  reset() { this.group.visible = false; this.hidden.forEach(m => { m.visible = true }); this.hidden = [] }
  dispose() { this.reset(); this.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() }) }
}
