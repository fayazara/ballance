import { applyOriginalConvexMass } from './original-inertia.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { configureBody, configureContact } from './original-physics.ts'
import { OriginalProximity } from './original-proximity.ts'
import sectors from './original-sector-data.json' with { type: 'json' }

import { originalCollisionGroups, LEVEL_FLOOR_GROUPS } from './original-collisions.ts'
export { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from './original-collisions.ts'

// Original pusher/filler are Floor; the physical channel is Ball.
export const PUSHER_GROUPS = originalCollisionGroups('Floor')
export const PUSHER_GUIDE_GROUPS = originalCollisionGroups('Ball')
export const PUSHER_PHYSICS = { mass: 3, friction: .6, restitution: .4, linearDamping: .1, angularDamping: 1 }
const GUIDE_PHYSICS = { friction: .7, restitution: .4 }

export class OriginalPusher {
  name: string
  sector: number
  mesh: THREE.Mesh
  body: RAPIER.RigidBody
  origin: THREE.Vector3
  axis: THREE.Vector3
  target: THREE.Vector3
  passage: THREE.Vector3
  active = false
  activated = false
  guides: RAPIER.Collider[] = []
  private wake = new OriginalProximity(sectors.wake.P_Modul_01)
  constructor(world: RAPIER.World, parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    this.name = parent.name; this.sector = sector; this.passage = originalPosition(parent)
    const object = document.objects.find(o => o.name === 'P_Modul_01_Pusher')!
    const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
    this.origin = originalPosition({ ...object, matrix: matrix.toArray() })
    this.axis = new THREE.Vector3(1, 0, 0).transformDirection(matrix); this.axis.z *= -1
    this.passage.addScaledVector(this.axis, .5)
    const source = document.meshes.find(m => m.id === object.mesh)!
    this.mesh = new THREE.Mesh(originalGeometry(source, matrix.toArray(), true), source.materials.map(id => materials.get(id)!))
    this.mesh.name = object.name; this.mesh.position.copy(this.origin); this.mesh.castShadow = this.mesh.receiveShadow = true
    this.target = new THREE.Vector3(-7.758, 1.09, 0).applyMatrix4(matrix).multiplyScalar(SCALE); this.target.z *= -1
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(this.origin.x, this.origin.y, this.origin.z).setCcdEnabled(true))
    configureBody(this.body, PUSHER_PHYSICS)
    // Physicalize (178) references these three hulls, not the rendered assembly's convex envelope.
    const colliders: RAPIER.Collider[] = []
    for (const name of ['P_Modul_01_Col01_Mesh', 'P_Modul_01_Col02_Mesh', 'P_Modul_01_Col03_Mesh']) {
      const hull = document.meshes.find(m => m.name === name)
      if (!hull) throw new Error(`Missing original pusher collision mesh: ${name}`)
      const geometry = originalGeometry(hull, matrix.toArray(), true)
      const desc = RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!
      colliders.push(world.createCollider(configureContact(desc.setCollisionGroups(PUSHER_GROUPS), PUSHER_PHYSICS), this.body))
      geometry.dispose()
    }
    applyOriginalConvexMass(this.body, PUSHER_PHYSICS.mass, ['P_Modul_01_Col01_Mesh', 'P_Modul_01_Col02_Mesh', 'P_Modul_01_Col03_Mesh'], matrix)
    // Physicalize (139) uses all three channel pieces. They form the physical sliding guide;
    // there is no slider joint or scripted movement in the original module.
    for (const helperName of ['P_Modul_01_Rinne', 'P_Modul_01_Filler']) {
      const helper = document.objects.find(o => o.name === helperName)!
      const helperMatrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(helper.matrix))
      const names = helperName.endsWith('Rinne') ? ['P_Modul_01_Rinne_01_Mesh', 'P_Modul_01_Rinne_02_Mesh', 'P_Modul_01_Rinne_03_Mesh'] : ['P_Modul_01_Filler_Mesh']
      for (const name of names) {
        const hull = document.meshes.find(m => m.name === name)
        if (!hull) throw new Error(`Missing original pusher guide mesh: ${name}`)
        const geometry = originalGeometry(hull, helperMatrix.toArray())
        const desc = RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)!
        this.guides.push(world.createCollider(configureContact(desc.setCollisionGroups(helperName.endsWith('Rinne') ? PUSHER_GUIDE_GROUPS : LEVEL_FLOOR_GROUPS), GUIDE_PHYSICS)))
        geometry.dispose()
      }
    }
    this.reset()
  }
  setActive(active: boolean) {
    if (this.active === active) return
    if (!active) { this.reset(); return }
    this.active = true
    for (const collider of this.guides) collider.setEnabled(true)
    this.body.setEnabled(true)
  }
  update(player: THREE.Vector3, activeSector: number) {
    this.setActive(this.sector === activeSector)
    if (!this.active || this.activated) return
    if (this.wake.enter(player, new THREE.Vector3().copy(this.body.translation()))) {
      this.activated = true; this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true); this.body.wakeUp()
    }
  }
  reset() {
    for (const collider of this.guides) collider.setEnabled(false)
    this.body.setEnabled(false); this.body.setBodyType(RAPIER.RigidBodyType.Fixed, false)
    this.body.setTranslation(this.origin, false); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, false)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, false); this.body.setAngvel({ x: 0, y: 0, z: 0 }, false)
    this.active = false; this.activated = false; this.wake = new OriginalProximity(sectors.wake.P_Modul_01)
  }
  get travel() { return new THREE.Vector3().copy(this.body.translation()).sub(this.origin).dot(this.axis) }
}
