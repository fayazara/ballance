import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-chain-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import type { Material } from './levels.ts'
import { configureBody, configureContact } from './original-physics.ts'

export const ORIGINAL_CHAIN = recovered
// All Modul29 bodies share IVP's non-collision group, including separate instances.
export const CHAIN_GROUPS = 0x0080ff7f
type Plank = { name: string; sector: number; mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3 }
type Connection = { index: number; a: RAPIER.RigidBody; b: RAPIER.RigidBody; anchorA: THREE.Vector3; anchorB: THREE.Vector3; axis: THREE.Vector3; joint?: RAPIER.RevoluteImpulseJoint }

/** Enter-range semantics and adaptive polling from TT Scaleable Proximity.
 * Adapted from CKBuildingBlocks (Apache-2.0); see THIRD_PARTY.md for source and modifications.
 * Script frames are currently mapped to fixed physics ticks; see original-chain.md.
 */
class Proximity {
  data: typeof recovered.wake
  remaining = 1
  inside = false
  constructor(data: typeof recovered.wake) { this.data = data }
  enter(a: THREE.Vector3, b: THREE.Vector3) {
    if (--this.remaining > 0) return false
    const d = this.data
    const squared = ((d.axes & 1) ? (a.x - b.x) ** 2 : 0) + ((d.axes & 2) ? (a.y - b.y) ** 2 : 0) + ((d.axes & 4) ? (a.z - b.z) ** 2 : 0)
    const distance = squared / SCALE ** 2
    const min = d.exactnessMin ** 2, max = d.exactnessMax ** 2
    this.remaining = Math.max(1, d.minFrameDelay + Math.trunc(THREE.MathUtils.clamp((distance - min) / (max - min), 0, 1) * (d.maxFrameDelay - d.minFrameDelay)))
    const inside = distance < d.distance ** 2
    const entered = inside && !this.inside; this.inside = inside
    return entered
  }
}

/** Original nine-plank bridge. The rope break removes a joint; planks remain physical. */
export class OriginalChain {
  name: string
  sector: number
  world: RAPIER.World
  parts: Plank[] = []
  connections: Connection[] = []
  fixed: RAPIER.RigidBody
  wakeOrigin: THREE.Vector3
  activated = false
  broken = false
  private wake = new Proximity(recovered.wake)
  private release = new Proximity(recovered.release)
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.world = world
    const parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    const wakeMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(recovered.wakeFrame))
    this.wakeOrigin = new THREE.Vector3().setFromMatrixPosition(wakeMatrix).multiplyScalar(SCALE); this.wakeOrigin.z *= -1
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.wakeOrigin.x, this.wakeOrigin.y, this.wakeOrigin.z))
    for (const data of recovered.parts) {
      const object = document.objects.find(o => o.name === data.target)
      if (!object) throw new Error(`Missing chain plank ${data.target}`)
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
      const origin = originalPosition({ ...object, matrix: matrix.toArray() })
      const source = document.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
      mesh.name = object.name; mesh.position.copy(origin); mesh.castShadow = mesh.receiveShadow = true
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true).setAdditionalSolverIterations(4))
      configureBody(body, data)
      const hull = document.meshes.find(m => m.name === data.hulls[0])
      if (!hull) throw new Error(`Missing chain collision hull ${data.hulls[0]}`)
      const geometry = originalGeometry(hull, matrix.toArray(), true)
      const collider = world.createCollider(configureContact(RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!.setCollisionGroups(CHAIN_GROUPS).setMass(data.mass), data), body)
      geometry.dispose(); body.recomputeMassPropertiesFromColliders()
      const inertia = body.principalInertia(), frame = body.principalInertiaLocalFrame()
      const center = new THREE.Vector3(...data.massCenter as [number, number, number]).applyMatrix4(matrix.clone().setPosition(0, 0, 0)).multiplyScalar(SCALE); center.z *= -1
      collider.setMass(0); body.setAdditionalMassProperties(data.mass, center, inertia, frame, true); body.recomputeMassPropertiesFromColliders()
      this.parts.push({ name: object.name, mesh, body, origin, sector })
    }
    for (const data of recovered.joints) {
      const a = this.parts.find(p => p.name === data.target)!.body
      const b = data.anchorObject === 'FixCube Object' ? this.fixed : this.parts.find(p => p.name === data.anchorObject)!.body
      const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(data.hingeFrame))
      const pivot = new THREE.Vector3().setFromMatrixPosition(matrix).multiplyScalar(SCALE); pivot.z *= -1
      const axis = new THREE.Vector3(0, 0, 1).transformDirection(matrix); axis.z *= -1
      // Initial world orientation is baked into the meshes, so body rotations start at identity.
      this.connections.push({ index: data.index, a, b, anchorA: pivot.clone().sub(a.translation()), anchorB: pivot.clone().sub(b.translation()), axis })
    }
    this.reset()
  }
  private createJoint(connection: Connection) {
    connection.joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(connection.anchorA, connection.anchorB, connection.axis), connection.a, connection.b, false) as RAPIER.RevoluteImpulseJoint
    // All ten source constraints have limits disabled; their ±45 degree defaults are inactive.
  }
  update(player: THREE.Vector3, material: Material) {
    if (!this.activated) {
      if (!this.wake.enter(player, this.wakeOrigin)) return false
      this.activated = true
      // IVP wakes the connected simulation unit from Platte04. Release the whole Rapier island.
      for (const part of this.parts) part.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
      this.parts.find(p => p.name === recovered.wakeTarget)!.body.wakeUp()
    }
    if (this.broken) return false
    const point = new THREE.Vector3().copy(this.parts.find(p => p.name === recovered.release.object)!.body.translation())
    if (!this.release.enter(player, point) || `Ball_${material[0]!.toUpperCase()}${material.slice(1)}` !== recovered.releaseBall) return false
    const connection = this.connections.find(c => c.index === recovered.releaseHinge)!
    this.world.removeImpulseJoint(connection.joint!, true); connection.joint = undefined
    this.broken = true
    return true
  }
  reset() {
    for (const c of this.connections) { if (c.joint) this.world.removeImpulseJoint(c.joint, false); c.joint = undefined }
    for (const part of this.parts) {
      part.body.setTranslation(part.origin, false); part.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
      part.body.setLinvel({ x: 0, y: 0, z: 0 }, false); part.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
      // Sleep alone does not preserve the frozen initial pose when registering Rapier joints.
      part.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    }
    for (const c of this.connections) this.createJoint(c)
    this.activated = false; this.broken = false
    this.wake = new Proximity(recovered.wake); this.release = new Proximity(recovered.release)
  }
  get anchorError() {
    return Math.max(...this.connections.filter(c => c.joint).map(c => c.anchorA.clone().applyQuaternion(c.a.rotation()).add(c.a.translation()).distanceTo(c.anchorB.clone().applyQuaternion(c.b.rotation()).add(c.b.translation()))))
  }
  get releasePosition() { return new THREE.Vector3().copy(this.parts.find(p => p.name === recovered.release.object)!.body.translation()) }
}
