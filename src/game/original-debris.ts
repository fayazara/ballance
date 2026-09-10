import { ORIGINAL_COLLISIONS, originalCollisionGroups } from './original-collisions.ts'
import { applyOriginalConvexMass } from './original-inertia.ts'
import { originalInertiaFrame } from './original-inertia-frame.ts'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'
import { configureBody, configureContact, ORIGINAL_TIME_FACTOR, ORIGINAL_PSI_HZ } from './original-physics.ts'
import type { Material } from './levels.ts'
import recovered from './original-debris-data.json' with { type: 'json' }
import type { IvpWorld } from './ivp-bridge.ts'

// Balls.nmo: Wood/Stone/Paper Explosion. Debris uses the actual broken-ball meshes.
export const DEBRIS_PHYSICS = recovered.materials
export const ORIGINAL_DEBRIS = recovered
type FadeColors = { from: number[]; to: number[] } | undefined
type Template = { name: string; hull: string; matrix: THREE.Matrix4; nativeHull: number[]; geometry: THREE.BufferGeometry; materials: THREE.MeshPhongMaterial[]; fades: FadeColors[]; origin: THREE.Vector3; direction: THREE.Vector3; impulsePosition: THREE.Vector3; wind?: THREE.Vector3 }
type Fragment = { mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial[]>; body: RAPIER.RigidBody; age: number; kind: Material; fades: FadeColors[]; wind?: THREE.Vector3 }
type NativeFragment = Omit<Fragment,'body'|'wind'> & { body:number; world:IvpWorld; initialRotation:THREE.Quaternion; wind?:number }
export class OriginalDebris {
  group = new THREE.Group()
  fragments: Fragment[] = []
  nativeFragments: NativeFragment[] = []
  private templates = new Map<Material, Template[]>()
  constructor(document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>) {
    for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
      this.templates.set(kind, document.objects.filter(o => o.name.toLowerCase().startsWith(`ball_${kind}_piece`)).map(object => {
        const source = document.meshes.find(m => m.id === object.mesh)!
        const data = DEBRIS_PHYSICS[kind], matrix = new THREE.Matrix4().fromArray(object.matrix)
        const direction = new THREE.Vector3(...data.impulseDirection as [number, number, number]).transformDirection(matrix); direction.z *= -1
        const [x, y, z] = data.impulsePosition
        const impulsePosition = new THREE.Vector3(x, y, -z!).multiplyScalar(SCALE).applyQuaternion(originalInertiaFrame(matrix))
        const force = recovered.wind.find(f => f.target === object.name)
        if (kind === 'paper' && !force) throw new Error(`Missing original paper wind: ${object.name}`)
        const wind = force ? new THREE.Vector3(force.direction[0], force.direction[1], -force.direction[2]!).normalize().multiplyScalar(force.impulse * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ) : undefined
        const fadeMaterials: Record<string, FadeColors> = recovered.lifecycle[kind].materials
        const fades = source.materials.map((id, index) => {
          // Original meshes include a null slot that no face uses.
          if (!source.faceMaterials.includes(index)) return undefined
          const name = document.materials.find(m => m.id === id)?.name
          const fade = name ? fadeMaterials[name] : undefined
          if (!fade) throw new Error(`Missing original fragment fade material: ${name}`)
          return fade
        })
        const scale=new THREE.Vector3().setFromMatrixScale(matrix)
        const nativeHull=source.positions.map((v,i)=>Math.fround(v*scale.getComponent(i%3)))
        return { name: object.name, hull: source.name!, matrix, nativeHull, geometry: originalGeometry(source, object.matrix, true), materials: source.materials.map(id => materials.get(id) || materials.values().next().value!), fades, origin: originalPosition(object), direction, impulsePosition, wind }
      }))
    }
  }
  /** Same fragment pool and fade materials, simulated in the player's IVP world. */
  spawnIvp(world:IvpWorld,kind:Material,position:THREE.Vector3,random=Math.random) {
    this.removeIvp(f=>f.kind===kind)
    const data=DEBRIS_PHYSICS[kind],sample=(range:readonly number[])=>range[0]===range[1]?range[0]!:range[0]!+(range[1]!-range[0]!)*random()
    for(const template of this.templates.get(kind)||[]) {
      const origin=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
      template.matrix.decompose(origin,rotation,scale);rotation.normalize()
      origin.add(new THREE.Vector3(position.x*4,position.y*4,-position.z*4))
      const body=world.convex(template.nativeHull,{...data,mass:sample(data.mass),friction:sample(data.friction),position:origin.toArray(),rotation:rotation.toArray(),frozen:data.startFrozen,collisionEnabled:data.enableCollision})
      const direction=new THREE.Vector3(...data.impulseDirection as [number,number,number]).transformDirection(template.matrix)
      const point=new THREE.Vector3(...data.impulsePosition as [number,number,number]).applyQuaternion(rotation).add(origin)
      world.pushAt(body,point.toArray(),direction.multiplyScalar(sample(data.impulse)).toArray())
      const wind=recovered.wind.find(w=>w.target===template.name)
      const controller=wind?world.force({body,position:wind.position,positionSpace:'core',direction:new THREE.Vector3(...wind.direction as [number,number,number]).normalize().toArray(),value:wind.impulse}):undefined
      const mesh=new THREE.Mesh(template.geometry,template.materials.map(m=>m.clone()))
      mesh.name=template.name;mesh.castShadow=mesh.receiveShadow=true
      const initialRotation=new THREE.Quaternion(-rotation.x,-rotation.y,rotation.z,rotation.w).invert()
      this.group.add(mesh);this.nativeFragments.push({mesh,body,world,age:0,kind,fades:template.fades,initialRotation,wind:controller})
    }
    this.stepIvp(0)
  }
  stepIvp(dt:number) {
    for(const fragment of this.nativeFragments) {
      fragment.age+=dt
      const state=fragment.world.state(fragment.body),lifetime=recovered.lifecycle[fragment.kind]
      fragment.mesh.position.set(state[0]!*.25,state[1]!*.25,-state[2]!*.25)
      fragment.mesh.quaternion.set(-state[3]!,-state[4]!,state[5]!,state[6]!).multiply(fragment.initialRotation)
      const fadeAge=fragment.age-lifetime.waitMs/1000
      if(fadeAge>=0) {
        if(fragment.wind!==undefined) {fragment.world.removeForce(fragment.wind);fragment.wind=undefined}
        this.fade(fragment,fadeAge,lifetime.fadeMs)
      }
    }
    this.removeIvp(f=>f.age>(recovered.lifecycle[f.kind].waitMs+recovered.lifecycle[f.kind].fadeMs)/1000)
  }
  private removeIvp(predicate:(fragment:NativeFragment)=>boolean) {
    this.nativeFragments=this.nativeFragments.filter(f=> {
      if(!predicate(f))return true
      f.world.remove(f.body);this.group.remove(f.mesh);f.mesh.material.forEach(m=>m.dispose());return false
    })
  }
  clearIvp() {this.removeIvp(()=>true)}
  spawn(world: RAPIER.World, kind: Material, position: THREE.Vector3, random = Math.random) {
    // The original has one fragment set per material. Reuse that bound on repeated transformations.
    this.remove(world, f => f.kind === kind)
    const data = DEBRIS_PHYSICS[kind], sample = (range: readonly number[]) => range[0] === range[1] ? range[0]! : range[0]! + (range[1]! - range[0]!) * random()
    for (const template of this.templates.get(kind) || []) {
      // The original moves the pieces' frame to Ball_Pos_Frame without copying
      // the rolling ball's orientation. Initial piece orientations are baked in.
      const p = template.origin.clone().add(position)
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setCcdEnabled(true))
      const properties = { ...data, mass: sample(data.mass), friction: sample(data.friction) }
      const collider = RAPIER.ColliderDesc.convexHull(template.geometry.attributes.position!.array as Float32Array)
      if (!collider) { world.removeRigidBody(body); continue }
      // Creation uses Ball, excluding the player/other fragments but admitting props.
      world.createCollider(configureContact(collider.setMass(properties.mass).setCollisionGroups(originalCollisionGroups(ORIGINAL_COLLISIONS.fragments[kind].group)), properties), body)
      applyOriginalConvexMass(body, properties.mass, [template.hull], template.matrix, data.massCenter)
      configureBody(body, properties)
      const impulse = template.direction.clone().multiplyScalar(sample(data.impulse) * SCALE * ORIGINAL_TIME_FACTOR)
      // Physics Impulse's self-referential path sends a core-space position to
      // IVP. Apply its linear/angular impulses directly to avoid subtracting two
      // rounded world positions on distant parts of the course.
      body.applyImpulse(impulse, true)
      body.applyTorqueImpulse(template.impulsePosition.clone().cross(impulse), true)
      const mesh = new THREE.Mesh(template.geometry, template.materials.map(m => m.clone()))
      mesh.name = template.name; mesh.castShadow = true; mesh.receiveShadow = true; mesh.position.copy(p)
      this.group.add(mesh); this.fragments.push({ mesh, body, age: 0, kind, fades: template.fades, wind: template.wind })
    }
  }
  beforeStep(dt: number) {
    for (const fragment of this.fragments) {
      if (fragment.wind && fragment.age < recovered.lifecycle[fragment.kind].waitMs / 1000 && fragment.body.isEnabled() && fragment.body.isDynamic()) {
        // The original controller retains a world-space direction while the
        // paper rotates; its application point is the authored origin/COM.
        fragment.body.applyImpulse(fragment.wind.clone().multiplyScalar(dt), true)
      }
    }
  }
  step(world: RAPIER.World, dt: number) {
    for (const fragment of this.fragments) {
      fragment.age += dt
      fragment.mesh.position.copy(fragment.body.translation()); fragment.mesh.quaternion.copy(fragment.body.rotation())
      const lifetime = recovered.lifecycle[fragment.kind], fadeAge = fragment.age - lifetime.waitMs / 1000
      if (fadeAge >= 0) this.fade(fragment,fadeAge,lifetime.fadeMs)
    }
    // Bezier Progression uses elapsed > duration for its final output. The
    // pieces remain physical through the zero-alpha endpoint, then are reset.
    this.remove(world, f => f.age > (recovered.lifecycle[f.kind].waitMs + recovered.lifecycle[f.kind].fadeMs) / 1000)
  }
  private fade(fragment:Pick<Fragment,'mesh'|'fades'>,fadeAge:number,fadeMs:number) {
    fragment.mesh.material.forEach((material, index) => {
        const colors = fragment.fades[index]
        if (!colors) return
        const t = Math.min(1, fadeAge / (fadeMs / 1000))
        const rgba = colors.from.map((v, i) => THREE.MathUtils.lerp(v, colors.to[i]!, t))
        material.color.setRGB(rgba[0]!, rgba[1]!, rgba[2]!); material.opacity = rgba[3]!
        // Set Diffuse v2 changes color/alpha without changing blend or Z-write.
      })
  }
  private remove(world: RAPIER.World, predicate: (fragment: Fragment) => boolean) {
    this.fragments = this.fragments.filter(f => {
      if (!predicate(f)) return true
      world.removeRigidBody(f.body); this.group.remove(f.mesh); f.mesh.material.forEach(m => m.dispose()); return false
    })
  }
  clear(world: RAPIER.World) { this.remove(world, () => true) }
  dispose() { this.clearIvp();this.templates.forEach(templates => templates.forEach(t => t.geometry.dispose())); this.templates.clear() }
}
