import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-lift-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'
import { OriginalSpring } from './original-spring.ts'
import { OriginalProximity } from './original-proximity.ts'
import type { OriginalDepthTest } from './original-depth.ts'

export const ORIGINAL_LIFT = recovered
type Part = { name: string; mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number; collision: boolean }

/** Removable wall weights load a spring-supported platform constrained vertically. */
export class OriginalLift {
  name: string
  sector: number
  world: RAPIER.World
  parts: Part[] = []
  fixed: RAPIER.RigidBody
  joint?: RAPIER.PrismaticImpulseJoint
  axis: THREE.Vector3
  pivot: THREE.Vector3
  localAnchor: THREE.Vector3
  spring: OriginalSpring
  wakeOrigin: THREE.Vector3
  active = false
  activated = false
  private depthTest?: OriginalDepthTest
  private wake = new OriginalProximity(recovered.wake)
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number, depthTest?: OriginalDepthTest) {
    this.name = parent.name; this.sector = sector; this.world = world; this.depthTest = depthTest
    const parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    for (const data of recovered.parts) {
      const object = document.objects.find(o => o.name === data.target)
      if (!object) throw new Error(`Missing lift part ${data.target}`)
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
      const origin = originalPosition({ ...object, matrix: matrix.toArray() })
      const source = document.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
      mesh.name = object.name; mesh.position.copy(origin); mesh.castShadow = mesh.receiveShadow = true
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true).setAdditionalSolverIterations(4))
      configureBody(body, data)
      const colliders: RAPIER.Collider[] = []
      for (const name of data.hulls) {
        const hull = document.meshes.find(m => m.name === name)
        if (!hull) throw new Error(`Missing lift collision hull ${name}`)
        const geometry = originalGeometry(hull, matrix.toArray(), true)
        colliders.push(world.createCollider(configureContact(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setCollisionGroups(originalCollisionGroups(data.collisionGroup)), data), body)); geometry.dispose()
      }
      applyOriginalConvexMass(body, data.mass, data.hulls, matrix, data.massCenter)
      this.parts.push({ name: object.name, mesh, body, origin, sector, collision: data.enableCollision })
    }
    const frame1 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.slider.frame1))
    const frame2 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.slider.frame2))
    this.pivot = new THREE.Vector3().setFromMatrixPosition(frame1).multiplyScalar(SCALE); this.pivot.z *= -1
    const end = new THREE.Vector3().setFromMatrixPosition(frame2).multiplyScalar(SCALE); end.z *= -1
    this.axis = end.sub(this.pivot).normalize()
    this.localAnchor = this.pivot.clone().sub(this.platform.origin)
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pivot.x, this.pivot.y, this.pivot.z))
    const wakeMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.wakeFrame))
    this.wakeOrigin = new THREE.Vector3().setFromMatrixPosition(wakeMatrix).multiplyScalar(SCALE); this.wakeOrigin.z *= -1
    const springFrame1 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.spring.frame1))
    const springFrame2 = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.spring.frame2))
    const point1 = new THREE.Vector3(...recovered.spring.position1 as [number, number, number]).applyMatrix4(springFrame1).multiplyScalar(SCALE); point1.z *= -1
    const point2 = new THREE.Vector3(...recovered.spring.position2 as [number, number, number]).applyMatrix4(springFrame2).multiplyScalar(SCALE); point2.z *= -1
    this.spring = new OriginalSpring(this.platform.body, point1.sub(this.platform.origin), point2, { ...recovered.spring, length: recovered.spring.length * SCALE })
    this.reset()
  }
  get platform() { return this.parts.find(p => p.name === recovered.wakeTarget)! }
  get walls() { return this.parts.filter(p => p.name !== recovered.wakeTarget) }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true
    for (const p of this.parts) p.body.setEnabled(true)
    // The platform starts frozen and is released by the original proximity watcher.
    this.platform.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.prismatic(this.localAnchor, { x: 0, y: 0, z: 0 }, this.axis), this.platform.body, this.fixed, false) as RAPIER.PrismaticImpulseJoint
    if (recovered.slider.limitsEnabled) this.joint.setLimits(recovered.slider.lowerLimit * SCALE, recovered.slider.upperLimit * SCALE)
    // Registration must preserve the authored frozen cage until the approach trigger.
    for (const part of this.walls) part.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
  }
  update(player: THREE.Vector3, activeSector: number, dt: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active) return
    if (!this.activated && this.wake.enter(player, this.wakeOrigin)) {
      for (const part of this.walls) { part.body.setBodyType(RAPIER.RigidBodyType.Dynamic, false); part.body.sleep() }
      this.activated = true; this.platform.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.platform.body.wakeUp()
      for (const part of this.walls) this.depthTest?.register(part)
    }
    if (this.activated && dt > 0) this.spring.update(dt)
  }
  reset() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, false)
    this.joint = undefined
    for (const p of this.parts) {
      this.depthTest?.restore(p)
      p.body.setEnabled(false); p.body.setTranslation(p.origin, false); p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    }
    this.active = false; this.activated = false; this.wake = new OriginalProximity(recovered.wake)
  }
  get travel() { return new THREE.Vector3().copy(this.platform.body.translation()).sub(this.platform.origin).dot(this.axis) }
  get lateralError() {
    const delta = this.localAnchor.clone().applyQuaternion(this.platform.body.rotation()).add(this.platform.body.translation()).sub(this.pivot)
    return delta.addScaledVector(this.axis, -delta.dot(this.axis)).length()
  }
}
