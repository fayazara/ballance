import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalCollisionGroups } from './original-collisions.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import recovered from './original-arms-data.json' with { type: 'json' }
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'

import { OriginalSpring } from './original-spring.ts'

export const ORIGINAL_ARMS = recovered

/** Three-part rotating obstacle with the original hinge and offset return spring. */
export class OriginalArms {
  name: string
  sector: number
  world: RAPIER.World
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  fixed: RAPIER.RigidBody
  joint?: RAPIER.RevoluteImpulseJoint
  origin: THREE.Vector3
  pivot: THREE.Vector3
  axis: THREE.Vector3
  localAnchor: THREE.Vector3
  spring: OriginalSpring
  active = false
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.world = world
    const data = recovered.body, parentMatrix = new THREE.Matrix4().fromArray(parent.matrix)
    const object = document.objects.find(o => o.name === data.target)
    if (!object) throw new Error(`Missing rotating arm ${data.target}`)
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
      if (!hull) throw new Error(`Missing arm collision hull ${name}`)
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
    // Referential 1 belongs to the moving body, despite being a separate frame.
    // Referential 2 is sampled at creation and anchored to the fixed object.
    const point1 = new THREE.Vector3(...recovered.spring.position1 as [number, number, number]).applyMatrix4(frame).multiplyScalar(SCALE); point1.z *= -1
    const point2 = new THREE.Vector3(...recovered.spring.position2 as [number, number, number]).applyMatrix4(matrix).multiplyScalar(SCALE); point2.z *= -1
    this.spring = new OriginalSpring(this.body, point1.sub(this.origin), point2, { ...recovered.spring, length: recovered.spring.length * SCALE })
    this.reset()
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true; this.body.setEnabled(true)
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
    this.joint = this.world.createImpulseJoint(RAPIER.JointData.revolute(this.localAnchor, { x: 0, y: 0, z: 0 }, this.axis), this.body, this.fixed, true) as RAPIER.RevoluteImpulseJoint
    if (recovered.hinge.limitsEnabled) this.joint.setLimits(THREE.MathUtils.degToRad(recovered.hinge.lowerLimit), THREE.MathUtils.degToRad(recovered.hinge.upperLimit))
  }
  update(dt: number, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (this.active && dt > 0) this.spring.update(dt)
  }
  reset() {
    if (this.joint) this.world.removeImpulseJoint(this.joint, false)
    this.joint = undefined; this.body.setEnabled(false)
    this.body.setTranslation(this.origin, false); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false); this.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    this.active = false
  }
  get anchorError() { return this.localAnchor.clone().applyQuaternion(this.body.rotation()).add(this.body.translation()).distanceTo(this.pivot) }
}
