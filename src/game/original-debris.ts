import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'
import { configureBody, configureContact, ORIGINAL_TIME_FACTOR } from './original-physics.ts'
import type { Material } from './levels.ts'

// Balls.nmo: Wood/Stone/Paper Explosion. Debris uses the actual broken-ball meshes.
export const DEBRIS_PHYSICS = {
  wood: { mass: [.2, .2], friction: [2, 2], restitution: 1, linearDamping: .3, angularDamping: .2, impulse: [1.5, 3] },
  stone: { mass: [.8, .8], friction: [2, 2], restitution: 1, linearDamping: .3, angularDamping: .2, impulse: [4, 9] },
  paper: { mass: [.02, .09], friction: [1, 5], restitution: 1, linearDamping: 6, angularDamping: .5, impulse: [.5, 1.3] },
} as const
type Template = { geometry: THREE.BufferGeometry; materials: THREE.MeshPhongMaterial[]; origin: THREE.Vector3; direction: THREE.Vector3 }
type Fragment = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial[]>; body: RAPIER.RigidBody; age: number; kind: Material }
export class OriginalDebris {
  group = new THREE.Group()
  fragments: Fragment[] = []
  private templates = new Map<Material, Template[]>()
  constructor(document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>) {
    for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
      this.templates.set(kind, document.objects.filter(o => o.name.toLowerCase().startsWith(`ball_${kind}_piece`)).map(object => {
        const source = document.meshes.find(m => m.id === object.mesh)!
        const direction = new THREE.Vector3(object.matrix[4], object.matrix[5], -object.matrix[6]).normalize()
        return { geometry: originalGeometry(source, object.matrix, true), materials: source.materials.map(id => materials.get(id) || materials.values().next().value!), origin: originalPosition(object), direction }
      }))
    }
  }
  spawn(world: RAPIER.World, kind: Material, position: THREE.Vector3, rotation: THREE.Quaternion, random = Math.random) {
    // The original has one fragment set per material. Reuse that bound on repeated transformations.
    this.remove(world, f => f.kind === kind)
    const data = DEBRIS_PHYSICS[kind], sample = (range: readonly [number, number]) => range[0] + (range[1] - range[0]) * random()
    for (const template of this.templates.get(kind) || []) {
      const p = template.origin.clone().applyQuaternion(rotation).add(position)
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(rotation).setCcdEnabled(true))
      const properties = { ...data, mass: sample(data.mass), friction: sample(data.friction) }
      const collider = RAPIER.ColliderDesc.convexHull(template.geometry.attributes.position!.array as Float32Array)
      if (!collider) { world.removeRigidBody(body); continue }
      // Fragments hit the course and props, but cannot knock the replacement player off the pad.
      world.createCollider(configureContact(collider.setMass(properties.mass).setCollisionGroups(0x00020001), properties), body)
      configureBody(body, properties)
      const direction = template.direction.clone().applyQuaternion(rotation)
      const point = p.clone().addScaledVector(direction, SCALE)
      body.applyImpulseAtPoint(direction.multiplyScalar(sample(data.impulse) * SCALE * ORIGINAL_TIME_FACTOR), point, true)
      const mesh = new THREE.Mesh(template.geometry, template.materials.map(m => m.clone()))
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.position.copy(p); mesh.quaternion.copy(rotation)
      this.group.add(mesh); this.fragments.push({ mesh, body, age: 0, kind })
    }
  }
  step(world: RAPIER.World, dt: number) {
    for (const fragment of this.fragments) {
      fragment.age += dt
      fragment.mesh.position.copy(fragment.body.translation()); fragment.mesh.quaternion.copy(fragment.body.rotation())
      if (fragment.age > 20) for (const material of fragment.mesh.material) { material.transparent = true; material.opacity = Math.max(0, 1 - (fragment.age - 20) / 2); material.depthWrite = false }
    }
    this.remove(world, f => f.age >= 22)
  }
  private remove(world: RAPIER.World, predicate: (fragment: Fragment) => boolean) {
    this.fragments = this.fragments.filter(f => {
      if (!predicate(f)) return true
      world.removeRigidBody(f.body); this.group.remove(f.mesh); f.mesh.material.forEach(m => m.dispose()); return false
    })
  }
  clear(world: RAPIER.World) { this.remove(world, () => true) }
  dispose() { this.templates.forEach(templates => templates.forEach(t => t.geometry.dispose())); this.templates.clear() }
}
