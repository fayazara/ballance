import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-hinge-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'
import { OriginalProximity } from './original-proximity.ts'
import sectors from './original-sector-data.json' with { type: 'json' }

export type HingeKind = keyof typeof recovered
export const ORIGINAL_HINGES = recovered

/** Passive original mechanisms: physics and hinge frames, without invented motors or limits. */
export class OriginalHinge {
  name: string
  kind: HingeKind
  sector: number
  mesh: THREE.Mesh
  decoration = new THREE.Group()
  body: RAPIER.RigidBody
  fixed: RAPIER.RigidBody
  joint?: RAPIER.RevoluteImpulseJoint
  world: RAPIER.World
  active = false
  private wake?: OriginalProximity
  origin: THREE.Vector3
  pivot: THREE.Vector3
  axis: THREE.Vector3
  localAnchor: THREE.Vector3
  wakeOrigin: THREE.Vector3
  activated = false
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number, kind: HingeKind) {
    this.name = parent.name; this.kind = kind; this.sector = sector; this.world = world
    const data = recovered[kind], parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    const object = document.objects.find(o => o.name === data.target)
    if (!object) throw new Error(`Missing ${data.target}`)
    const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
    this.origin = originalPosition({ ...object, matrix: matrix.toArray() })
    this.wakeOrigin = originalPosition(parent)
    if (kind !== 'P_Modul_41') {
      const wakeMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(sectors.wake[kind].frame))
      this.wakeOrigin.setFromMatrixPosition(wakeMatrix).multiplyScalar(SCALE); this.wakeOrigin.z *= -1
    }
    const source = document.meshes.find(m => m.id === object.mesh)!
    this.mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
    this.mesh.name = object.name; this.mesh.position.copy(this.origin); this.mesh.castShadow = this.mesh.receiveShadow = true
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(this.origin.x, this.origin.y, this.origin.z).setCcdEnabled(true).setAdditionalSolverIterations(4))
    configureBody(this.body, data)
    const colliders: RAPIER.Collider[] = []
    for (const name of data.hulls) {
      const hull = document.meshes.find(m => m.name === name)
      if (!hull) throw new Error(`Missing hinge collision mesh ${name}`)
      const geometry = originalGeometry(hull, matrix.toArray(), true)
      const collider = RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!
      // Empty collision group on bridges permits ground contact; Floor excludes other Floor objects.
      collider.setCollisionGroups(originalCollisionGroups(data.collisionGroup))
      colliders.push(world.createCollider(configureContact(collider, data), this.body)); geometry.dispose()
    }
    applyOriginalConvexMass(this.body, data.mass, data.hulls, matrix, data.massCenter)

    const hingeMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(data.hingeFrame))
    this.pivot = new THREE.Vector3().setFromMatrixPosition(hingeMatrix).multiplyScalar(SCALE); this.pivot.z *= -1
    // GetOrientation's direction is the referential's local Z axis, not its X or Y axis.
    this.axis = new THREE.Vector3(0, 0, 1).transformDirection(hingeMatrix); this.axis.z *= -1
    this.localAnchor = this.pivot.clone().sub(this.origin)
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pivot.x, this.pivot.y, this.pivot.z))
    for (const part of document.objects.filter(o => o !== object)) {
      const geometrySource = document.meshes.find(m => m.id === part.mesh)
      if (!geometrySource) continue
      const partMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(part.matrix))
      const mesh = new THREE.Mesh(originalGeometry(geometrySource, partMatrix.toArray()), geometrySource.materials.map(id => materials.get(id)!))
      mesh.name = part.name; mesh.castShadow = mesh.receiveShadow = true; this.decoration.add(mesh)
    }
    this.reset()
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true
    const data = recovered[this.kind]
    this.activated = !data.startFrozen
    this.body.setEnabled(true)
    // Rapier may wake a sleeping dynamic body as soon as its joint is registered.
    // Hold the original frozen pose explicitly until the module's proximity activation.
    this.body.setBodyType(this.activated ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed, this.activated)
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(this.localAnchor, { x: 0, y: 0, z: 0 }, this.axis), this.body, this.fixed, false) as RAPIER.RevoluteImpulseJoint
    if (data.limitsEnabled) this.joint.setLimits(THREE.MathUtils.degToRad(data.lowerLimit), THREE.MathUtils.degToRad(data.upperLimit))
  }
  update(player: THREE.Vector3, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active) return
    if (!this.activated && this.wake?.enter(player, this.wakeOrigin)) {
      this.activated = true; this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.body.wakeUp()
    }
  }
  reset() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, false)
    this.joint = undefined; this.active = false
    this.body.setEnabled(false)
    this.body.setTranslation(this.origin, true); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.activated = false
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    this.wake = this.kind === 'P_Modul_41' ? undefined : new OriginalProximity(sectors.wake[this.kind])
  }
  get anchorError() {
    return this.localAnchor.clone().applyQuaternion(this.body.rotation()).add(this.body.translation()).distanceTo(this.pivot)
  }
}
