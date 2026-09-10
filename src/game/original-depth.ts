import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-depth-data.json' with { type: 'json' }
import { SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'

export const ORIGINAL_DEPTH = recovered
export type DepthObject = { mesh: THREE.Object3D; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number }

/** Gameplay's get maxDepth: minimum world bounding-box Y, starting at zero. */
export function originalDepthLimit(document: OriginalDocument, coordinateScale=SCALE) {
  const members = new Set(document.groups.find(g => g.name === recovered.boundsGroup)?.members)
  let minimum = recovered.initialDepth
  for (const object of document.objects.filter(o => members.has(o.id))) {
    const source = document.meshes.find(m => m.id === object.mesh)
    if (!source || !source.positions.length) throw new Error(`Missing depth boundary mesh: ${object.name}`)
    const box = new THREE.Box3(), point = new THREE.Vector3()
    for (let i = 0; i < source.positions.length; i += 3) box.expandByPoint(point.fromArray(source.positions, i))
    // GetBoundingBox(FALSE) is the world AABB of the entity's local box.
    box.applyMatrix4(new THREE.Matrix4().fromArray(object.matrix))
    minimum = Math.min(minimum, box.min.y)
  }
  return (minimum - recovered.margin) * coordinateScale
}

/** Global DepthTest membership is explicit; constrained modules are not swept by default. */
export class OriginalDepthTest {
  readonly limit: number
  private entries = new Map<RAPIER.RigidBody, { object: DepthObject; visible: boolean; removed: boolean }>()
  constructor(document: OriginalDocument) { this.limit = originalDepthLimit(document) }
  register(object: DepthObject) {
    if (!this.entries.has(object.body)) this.entries.set(object.body, { object, visible: object.mesh.visible, removed: false })
  }
  get count() { return this.entries.size }
  get removedCount() { return [...this.entries.values()].filter(e => e.removed).length }
  update() {
    for (const entry of this.entries.values()) {
      const { body, mesh } = entry.object
      if (entry.removed || !body.isEnabled() || body.translation().y >= this.limit) continue
      // Keep the adapter's body handle for reset, but remove it from simulation/contact.
      // Original flow: Physicalize Destroy -> Hide (self) -> Set Position (hierarchy).
      body.setEnabled(false)
      body.setLinvel({ x: 0, y: 0, z: 0 }, false); body.setAngvel({ x: 0, y: 0, z: 0 }, false)
      mesh.visible = false
      body.setTranslation({ x: 0, y: 0, z: 0 }, false); mesh.position.set(0, 0, 0)
      entry.removed = true
    }
  }
  restore(object: DepthObject) {
    const entry = this.entries.get(object.body)
    if (!entry?.removed) return
    const { body, mesh, origin } = object
    body.setTranslation(origin, false); body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
    body.setLinvel({ x: 0, y: 0, z: 0 }, false); body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    mesh.position.copy(origin); mesh.quaternion.identity(); mesh.visible = entry.visible
    body.setEnabled(true); entry.removed = false
  }
  resetSector(sector: number) {
    for (const { object } of this.entries.values()) if (object.sector === sector) this.restore(object)
  }
}
