import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-slider-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'
import { OriginalProximity } from './original-proximity.ts'

export const ORIGINAL_SLIDER = recovered
type Part = { name: string; mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number; collision: boolean }

/** A free crate supports a stone restricted to the original slider axis. */
export class OriginalSlider {
  name: string
  sector: number
  world: RAPIER.World
  parts: Part[] = []
  fixed: RAPIER.RigidBody
  joint?: RAPIER.PrismaticImpulseJoint
  axis: THREE.Vector3
  pivot: THREE.Vector3
  localAnchor: THREE.Vector3
  active = false
  activated = false
  private wake = new OriginalProximity(recovered.wake)
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.world = world
    const parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    for (const data of recovered.parts) {
      const object = document.objects.find(o => o.name === data.target)
      if (!object) throw new Error(`Missing slider part ${data.target}`)
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
      const origin = originalPosition({ ...object, matrix: matrix.toArray() })
      const source = document.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
      mesh.name = object.name; mesh.position.copy(origin); mesh.castShadow = mesh.receiveShadow = true
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true).setAdditionalSolverIterations(4))
      configureBody(body, data)
      const hull = document.meshes.find(m => m.name === data.hulls[0])
      if (!hull) throw new Error(`Missing slider collision hull ${data.hulls[0]}`)
      const geometry = originalGeometry(hull, matrix.toArray(), true)
      const collider = world.createCollider(configureContact(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setMass(data.mass).setCollisionGroups(originalCollisionGroups(data.collisionGroup)), data), body)
      geometry.dispose(); body.recomputeMassPropertiesFromColliders()
      applyOriginalConvexMass(body, data.mass, data.hulls, matrix, data.massCenter)
      collider.setEnabled(data.enableCollision)
      this.parts.push({ name: object.name, mesh, body, origin, sector, collision: data.enableCollision })
    }
    const frame1 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.slider.frame1))
    const frame2 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.slider.frame2))
    this.pivot = new THREE.Vector3().setFromMatrixPosition(frame1).multiplyScalar(SCALE); this.pivot.z *= -1
    const end = new THREE.Vector3().setFromMatrixPosition(frame2).multiplyScalar(SCALE); end.z *= -1
    this.axis = end.sub(this.pivot).normalize()
    this.localAnchor = this.pivot.clone().sub(this.stone.origin)
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pivot.x, this.pivot.y, this.pivot.z))
    this.reset()
  }
  get stone() { return this.parts.find(p => p.name === recovered.wakeTarget)! }
  get crate() { return this.parts.find(p => p.name !== recovered.wakeTarget)! }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true
    for (const p of this.parts) p.body.setEnabled(true)
    // Joint registration must not release the initially frozen stone prematurely.
    this.stone.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.prismatic(this.localAnchor, { x: 0, y: 0, z: 0 }, this.axis), this.stone.body, this.fixed, false) as RAPIER.PrismaticImpulseJoint
    if (recovered.slider.limitsEnabled) this.joint.setLimits(recovered.slider.lowerLimit * SCALE, recovered.slider.upperLimit * SCALE)
    // Preserve both authored frozen poses while the proximity watcher is armed.
    this.crate.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
  }
  update(player: THREE.Vector3, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active || this.activated) return
    if (this.wake.enter(player, new THREE.Vector3().copy(this.stone.body.translation()))) {
      // Restore contact-driven sleeping for the unconstrained crate before releasing the stone.
      this.crate.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false); this.crate.body.sleep()
      this.activated = true; this.stone.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.stone.body.wakeUp()
    }
  }
  reset() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, false)
    this.joint = undefined
    for (const p of this.parts) {
      p.body.setEnabled(false); p.body.setTranslation(p.origin, false); p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    }
    this.active = false; this.activated = false; this.wake = new OriginalProximity(recovered.wake)
  }
  get travel() { return new THREE.Vector3().copy(this.stone.body.translation()).sub(this.stone.origin).dot(this.axis) }
  get lateralError() {
    const delta = this.localAnchor.clone().applyQuaternion(this.stone.body.rotation()).add(this.stone.body.translation()).sub(this.pivot)
    return delta.addScaledVector(this.axis, -delta.dot(this.axis)).length()
  }
}
