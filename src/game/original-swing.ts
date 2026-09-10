import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-swing-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact, ORIGINAL_PSI_HZ, ORIGINAL_TIME_FACTOR, PHYSICS_STEP } from './original-physics.ts'

export const ORIGINAL_SWING = recovered
type Drive = { direction: THREE.Vector3; point: THREE.Vector3; impulse: number }

/** Original hinged platform: push, coast, reverse push, coast. */
export class OriginalSwing {
  name: string
  sector: number
  world: RAPIER.World
  mesh: THREE.Mesh
  decoration = new THREE.Group()
  body: RAPIER.RigidBody
  fixed: RAPIER.RigidBody
  joint?: RAPIER.RevoluteImpulseJoint
  origin: THREE.Vector3
  pivot: THREE.Vector3
  axis: THREE.Vector3
  localAnchor: THREE.Vector3
  drives: Drive[] = []
  active = false
  stage = -1
  elapsed = 0
  cycles = 0
  startupRemaining = recovered.startupDelayFrames * PHYSICS_STEP
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.world = world
    const data = recovered.body, parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    const object = document.objects.find(o => o.name === data.target)
    if (!object) throw new Error(`Missing swinging platform ${data.target}`)
    const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
    this.origin = originalPosition({ ...object, matrix: matrix.toArray() })
    const source = document.meshes.find(m => m.id === object.mesh)!
    this.mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
    this.mesh.name = object.name; this.mesh.position.copy(this.origin); this.mesh.castShadow = this.mesh.receiveShadow = true
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(this.origin.x, this.origin.y, this.origin.z).setCcdEnabled(true).setAdditionalSolverIterations(4))
    configureBody(this.body, data)
    const colliders: RAPIER.Collider[] = []
    for (const name of data.hulls) {
      const hull = document.meshes.find(m => m.name === name)
      if (!hull) throw new Error(`Missing swing collision hull ${name}`)
      const geometry = originalGeometry(hull, matrix.toArray(), true)
      colliders.push(world.createCollider(configureContact(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setCollisionGroups(originalCollisionGroups(data.collisionGroup)), data), this.body))
      geometry.dispose()
    }
    applyOriginalConvexMass(this.body, data.mass, data.hulls, matrix, data.massCenter)

    const frame = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.hinge.frame))
    this.pivot = new THREE.Vector3().setFromMatrixPosition(frame).multiplyScalar(SCALE); this.pivot.z *= -1
    this.axis = new THREE.Vector3(0, 0, 1).transformDirection(frame); this.axis.z *= -1
    this.localAnchor = this.pivot.clone().sub(this.origin)
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pivot.x, this.pivot.y, this.pivot.z))
    const holder = document.objects.find(o => o.name === recovered.decoration)!
    const holderMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(holder.matrix))
    const holderSource = document.meshes.find(m => m.id === holder.mesh)!
    const decoration = new THREE.Mesh(originalGeometry(holderSource, holderMatrix.toArray()), holderSource.materials.map(id => materials.get(id)!))
    decoration.name = holder.name; decoration.castShadow = decoration.receiveShadow = true; this.decoration.add(decoration)
    for (const force of recovered.forces) {
      const direction = new THREE.Vector3(...force.direction as [number, number, number]).transformDirection(holderMatrix); direction.z *= -1
      const point = new THREE.Vector3(...force.position as [number, number, number]).applyMatrix4(matrix.clone().setPosition(0, 0, 0)).multiplyScalar(SCALE); point.z *= -1
      this.drives.push({ direction, point, impulse: force.impulse })
    }
    this.reset()
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true; this.body.setEnabled(true)
    // Physicalize starts frozen. The first force's WakeUp occurs after the startup link.
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(this.localAnchor, { x: 0, y: 0, z: 0 }, this.axis), this.body, this.fixed, false) as RAPIER.RevoluteImpulseJoint
  }
  update(dt: number, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active || dt <= 0) return
    if (this.stage < 0) {
      if (this.startupRemaining > 1e-10) { this.startupRemaining = Math.max(0, this.startupRemaining - dt); return }
      this.stage = 0; this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.body.wakeUp()
    }
    const force = recovered.stages[this.stage]!.force
    if (force !== null) {
      const drive = this.drives[force]!
      const impulse = drive.direction.clone().multiplyScalar(drive.impulse * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ * dt)
      this.body.applyImpulseAtPoint(impulse, drive.point.clone().applyQuaternion(this.body.rotation()).add(this.body.translation()), true)
    }
    this.elapsed += dt
    while (this.elapsed >= recovered.stages[this.stage]!.durationMs / 1000 - 1e-10) {
      this.elapsed = Math.max(0, this.elapsed - recovered.stages[this.stage]!.durationMs / 1000)
      this.stage = (this.stage + 1) % recovered.stages.length
      if (this.stage === 0) this.cycles++
    }
  }
  reset() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, false)
    this.joint = undefined; this.body.setEnabled(false)
    this.body.setTranslation(this.origin, false); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false); this.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    this.active = false; this.stage = -1; this.elapsed = 0; this.cycles = 0; this.startupRemaining = recovered.startupDelayFrames * PHYSICS_STEP
  }
  get anchorError() { return this.localAnchor.clone().applyQuaternion(this.body.rotation()).add(this.body.translation()).distanceTo(this.pivot) }
}
