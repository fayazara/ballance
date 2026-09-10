import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-sack-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact, ORIGINAL_PSI_HZ, ORIGINAL_TIME_FACTOR, PHYSICS_STEP } from './original-physics.ts'

export const ORIGINAL_SACK = recovered
type Part = { name: string; mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number; collision: boolean }
type Connection = { a: RAPIER.RigidBody; b: RAPIER.RigidBody; anchorA: THREE.Vector3; anchorB: THREE.Vector3; joint?: RAPIER.SphericalImpulseJoint }
type Drive = { body: RAPIER.RigidBody; direction: THREE.Vector3; point: THREE.Vector3; impulse: number }

/** Two spherical joints and alternating physical drive recovered from P_Modul_26. */
export class OriginalSack {
  name: string
  sector: number
  world: RAPIER.World
  parts: Part[] = []
  decoration = new THREE.Group()
  fixed: RAPIER.RigidBody
  connections: Connection[] = []
  drives: Drive[] = []
  active = false
  phase = recovered.initialForce
  elapsed = 0
  switches = 0
  // Delayer uses real milliseconds, independently of the IVP physics time factor.
  // Its one-frame output link is mapped to one fixed tick, as in the bridge adapter.
  readonly interval = recovered.intervalMs / 1000 + recovered.switchDelayFrames * PHYSICS_STEP
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.world = world
    const parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    const origin = originalPosition(parent)
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(origin.x, origin.y, origin.z))
    const matrices = new Map<string, THREE.Matrix4>()
    for (const data of recovered.parts) {
      const object = document.objects.find(o => o.name === data.target)
      if (!object) throw new Error(`Missing suspended part ${data.target}`)
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix)); matrices.set(object.name, matrix)
      const origin = originalPosition({ ...object, matrix: matrix.toArray() })
      const source = document.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
      mesh.name = object.name; mesh.position.copy(origin); mesh.castShadow = mesh.receiveShadow = true
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true).setAdditionalSolverIterations(4))
      configureBody(body, data)
      const hull = document.meshes.find(m => m.name === data.hulls[0])
      if (!hull) throw new Error(`Missing suspended collision hull ${data.hulls[0]}`)
      const geometry = originalGeometry(hull, matrix.toArray(), true)
      const collider = world.createCollider(configureContact(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setMass(data.mass).setCollisionGroups(originalCollisionGroups(data.collisionGroup)), data), body)
      geometry.dispose(); body.recomputeMassPropertiesFromColliders()
      applyOriginalConvexMass(body, data.mass, data.hulls, matrix, data.massCenter)
      // The rope keeps its original mass/inertia even though collisions are disabled.
      collider.setEnabled(data.enableCollision)
      this.parts.push({ name: object.name, mesh, body, origin, sector, collision: data.enableCollision })
    }
    for (const data of recovered.joints) {
      const a = this.parts.find(p => p.name === data.target)!.body
      const b = data.anchorObject === 'FixCube Object' ? this.fixed : this.parts.find(p => p.name === data.anchorObject)!.body
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(data.frame))
      const pivot = new THREE.Vector3(...data.position as [number, number, number]).applyMatrix4(matrix).multiplyScalar(SCALE); pivot.z *= -1
      this.connections.push({ a, b, anchorA: pivot.clone().sub(a.translation()), anchorB: pivot.clone().sub(b.translation()) })
    }
    const holder = document.objects.find(o => o.name === recovered.decoration)!
    const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(holder.matrix)); matrices.set(holder.name, matrix)
    const source = document.meshes.find(m => m.id === holder.mesh)!
    const mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray()), source.materials.map(id => materials.get(id)!))
    mesh.name = holder.name; mesh.castShadow = mesh.receiveShadow = true; this.decoration.add(mesh)
    // Force directions use the fixed holder frame, not the sack's changing rotation.
    for (const data of recovered.forces) {
      const body = this.parts.find(p => p.name === data.target)!.body
      const direction = new THREE.Vector3(...data.direction as [number, number, number]).transformDirection(matrices.get(data.directionFrame)!); direction.z *= -1
      const point = new THREE.Vector3(...data.position as [number, number, number]).applyMatrix4(matrices.get(data.positionFrame)!).multiplyScalar(SCALE); point.z *= -1; point.sub(body.translation())
      this.drives.push({ body, direction, point, impulse: data.impulse })
    }
    this.reset()
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true
    for (const p of this.parts) { p.body.setEnabled(true); p.body.collider(0).setEnabled(p.collision) }
    for (const c of this.connections) c.joint = this.world.createImpulseJoint(RAPIER.JointData.spherical(c.anchorA, c.anchorB), c.a, c.b, true) as RAPIER.SphericalImpulseJoint
    this.parts.find(p => p.name === recovered.wakeTarget)!.body.wakeUp()
  }
  update(dt: number, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active || dt <= 0) return
    // A controller is installed continuously for each half-cycle, rather than one kick per turn.
    const drive = this.drives[this.phase]!
    const magnitude = drive.impulse * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ * dt
    const point = drive.point.clone().applyQuaternion(drive.body.rotation()).add(drive.body.translation())
    drive.body.applyImpulseAtPoint(drive.direction.clone().multiplyScalar(magnitude), point, true)
    this.elapsed += dt
    while (this.elapsed >= this.interval - 1e-10) {
      this.elapsed = Math.max(0, this.elapsed - this.interval); this.phase = (this.phase + 1) % this.drives.length; this.switches++
    }
  }
  reset() {
    for (const c of this.connections) { if (c.joint) this.world.removeImpulseJoint(c.joint, false); c.joint = undefined }
    for (const p of this.parts) {
      p.body.setEnabled(false); p.body.setTranslation(p.origin, false); p.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
      p.body.setLinvel({ x: 0, y: 0, z: 0 }, false); p.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    }
    // Activate Sector uses Activate Script with Reset=true, resetting the sequencer to its first output.
    this.active = false; this.phase = recovered.initialForce; this.elapsed = 0; this.switches = 0
  }
  get sack() { return this.parts.find(p => p.name === recovered.wakeTarget)! }
  get anchorError() {
    return Math.max(0, ...this.connections.filter(c => c.joint).map(c => c.anchorA.clone().applyQuaternion(c.a.rotation()).add(c.a.translation()).distanceTo(c.anchorB.clone().applyQuaternion(c.b.rotation()).add(c.b.translation()))))
  }
}
