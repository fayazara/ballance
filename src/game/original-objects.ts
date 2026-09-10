import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-object-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'
import type { OriginalDepthTest } from './original-depth.ts'

export const ORIGINAL_OBJECTS = recovered
export type OriginalObjectKind = keyof typeof recovered

/** PH activation types 2/3: one convex or sphere body, shown only in its sector. */
export class OriginalSectorObject {
  name: string
  kind: OriginalObjectKind
  sector: number
  origin: THREE.Vector3
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  active = false
  private depthTest?: OriginalDepthTest
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number, kind: OriginalObjectKind, depthTest?: OriginalDepthTest) {
    this.name = parent.name; this.kind = kind; this.sector = sector; this.depthTest = depthTest
    const data = recovered[kind], object = document.objects.find(o => o.name === `${kind}_MF`)
    if (!object) throw new Error(`Missing original object ${kind}_MF`)
    const source = document.meshes.find(m => m.id === object.mesh)
    if (!source) throw new Error(`Missing original collision/render mesh for ${kind}`)
    const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
    this.origin = originalPosition({ ...object, matrix: matrix.toArray() })
    const geometry = originalGeometry(source, matrix.toArray(), true)
    this.mesh = new THREE.Mesh(geometry, source.materials.map(id => materials.get(id)!))
    this.mesh.name = object.name; this.mesh.position.copy(this.origin); this.mesh.castShadow = !data.fixed; this.mesh.receiveShadow = true
    const bodyDesc = data.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true)
    this.body = world.createRigidBody(bodyDesc.setTranslation(this.origin.x, this.origin.y, this.origin.z))
    configureBody(this.body, data)
    const desc = 'radius' in data ? RAPIER.ColliderDesc.ball(data.radius * SCALE)
      : RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)
    if (!desc) throw new Error(`Unable to build original convex body: ${parent.name}`)
    const collider = world.createCollider(configureContact(desc.setMass(data.mass).setCollisionGroups(originalCollisionGroups(data.collisionGroup)), data), this.body)
    collider.setEnabled(data.enableCollision)
    this.body.recomputeMassPropertiesFromColliders()
    if (!data.fixed && !('radius' in data)) {
      applyOriginalConvexMass(this.body, data.mass, [source.name!], matrix, data.massCenter)
    } else if ('radius' in data) {
      const inertia = new THREE.Vector3(1, 1, 1).multiplyScalar(.4 * data.mass * (data.radius * SCALE) ** 2)
      collider.setMass(0)
      this.body.setAdditionalMassProperties(data.mass, { x: 0, y: 0, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 }, false)
      this.body.recomputeMassPropertiesFromColliders()
    }
    this.depthTest?.register(this)
    this.reset()
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true; this.mesh.visible = true; this.body.setEnabled(true)
    if (!recovered[this.kind].fixed) this.body.wakeUp()
  }
  update(activeSector: number) { this.setActive(this.sector === activeSector) }
  reset() {
    this.depthTest?.restore(this)
    this.body.setEnabled(false)
    this.body.setTranslation(this.origin, false); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false); this.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    this.mesh.position.copy(this.origin); this.mesh.quaternion.identity(); this.mesh.visible = false
    this.active = false
  }
}
