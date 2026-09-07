import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-hinge-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'
import { PUSHER_GROUPS } from './original-pusher.ts'

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
  joint: RAPIER.RevoluteImpulseJoint
  origin: THREE.Vector3
  pivot: THREE.Vector3
  axis: THREE.Vector3
  localAnchor: THREE.Vector3
  wakeOrigin: THREE.Vector3
  activated: boolean
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number, kind: HingeKind) {
    this.name = parent.name; this.kind = kind; this.sector = sector
    const data = recovered[kind], parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    const object = document.objects.find(o => o.name === data.target)
    if (!object) throw new Error(`Missing ${data.target}`)
    const matrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
    const relative = matrix.clone().setPosition(0, 0, 0)
    this.origin = originalPosition({ ...object, matrix: matrix.toArray() })
    this.wakeOrigin = originalPosition(parent)
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
      collider.setCollisionGroups(data.collisionGroup === 'Floor' ? PUSHER_GROUPS : 0x0040ffff)
      colliders.push(world.createCollider(configureContact(collider, data), this.body)); geometry.dispose()
    }
    const volume = colliders.reduce((sum, c) => sum + c.volume(), 0)
    for (const collider of colliders) collider.setMass(data.mass * collider.volume() / volume)
    this.body.recomputeMassPropertiesFromColliders()
    const inertia = this.body.principalInertia(), frame = this.body.principalInertiaLocalFrame()
    const center = new THREE.Vector3(...data.massCenter as [number, number, number]).applyMatrix4(relative).multiplyScalar(SCALE); center.z *= -1
    for (const collider of colliders) collider.setMass(0)
    this.body.setAdditionalMassProperties(data.mass, center, inertia, frame, true); this.body.recomputeMassPropertiesFromColliders()

    const hingeMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(data.hingeFrame))
    this.pivot = new THREE.Vector3().setFromMatrixPosition(hingeMatrix).multiplyScalar(SCALE); this.pivot.z *= -1
    // GetOrientation's direction is the referential's local Z axis, not its X or Y axis.
    this.axis = new THREE.Vector3(0, 0, 1).transformDirection(hingeMatrix); this.axis.z *= -1
    this.localAnchor = this.pivot.clone().sub(this.origin)
    this.fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(this.pivot.x, this.pivot.y, this.pivot.z))
    this.joint = world.createImpulseJoint(RAPIER.JointData.revolute(this.localAnchor, { x: 0, y: 0, z: 0 }, this.axis), this.body, this.fixed, false) as RAPIER.RevoluteImpulseJoint
    if (data.limitsEnabled) this.joint.setLimits(THREE.MathUtils.degToRad(data.lowerLimit), THREE.MathUtils.degToRad(data.upperLimit))
    for (const part of document.objects.filter(o => o !== object)) {
      const geometrySource = document.meshes.find(m => m.id === part.mesh)
      if (!geometrySource) continue
      const partMatrix = parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(part.matrix))
      const mesh = new THREE.Mesh(originalGeometry(geometrySource, partMatrix.toArray()), geometrySource.materials.map(id => materials.get(id)!))
      mesh.name = part.name; mesh.castShadow = mesh.receiveShadow = true; this.decoration.add(mesh)
    }
    this.activated = !data.startFrozen
    // Rapier may wake a sleeping dynamic body as soon as its joint is registered.
    // Hold the original frozen pose explicitly until the module's proximity activation.
    if (!this.activated) this.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
  }
  update(player: THREE.Vector3) {
    const distance = recovered[this.kind].wakeDistance
    if (!this.activated && distance !== null && Math.hypot(player.x - this.wakeOrigin.x, player.z - this.wakeOrigin.z) < distance * SCALE) {
      this.activated = true; this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.body.wakeUp()
    }
  }
  reset() {
    this.body.setTranslation(this.origin, true); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.activated = !recovered[this.kind].startFrozen
    this.body.setBodyType(this.activated ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed, this.activated)
  }
  get anchorError() {
    return this.localAnchor.clone().applyQuaternion(this.body.rotation()).add(this.body.translation()).distanceTo(this.pivot)
  }
}
