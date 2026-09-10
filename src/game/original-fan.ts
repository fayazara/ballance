import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import type RAPIER from '@dimforge/rapier3d-compat'
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { ORIGINAL_PSI_HZ, ORIGINAL_TIME_FACTOR } from './original-physics.ts'
import data from './original-fan-data.json' with { type: 'json' }
import { OriginalProximity } from './original-proximity.ts'
import { originalBox, originalBoxesIntersect } from './original-box.ts'

export const ORIGINAL_FAN = data

// P_Modul_18.nmo: SetPhysicsForce .1, world direction (0,1,0).
// The same force acts on every player material; only paper overcomes gravity.
export const FAN_FORCE = data.forceValue * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ
export class OriginalFan {
  name: string
  origin: THREE.Vector3
  column: OBB
  group = new THREE.Group()
  rotor: THREE.Mesh
  rotorAxis: THREE.Vector3
  air: THREE.Points
  sector: number
  inSector = false
  running = false
  soundActive = false
  soundGain = 0
  particleOrigin: THREE.Vector3
  soundOrigin: THREE.Vector3
  private soundInverse: THREE.Matrix4
  private outer = new OriginalProximity(data.outer)
  private force = new OriginalProximity(data.force)
  private sound = new OriginalProximity(data.sound)
  private rotorTime = 0
  private particleTime = 0
  active = false
  private ballMatrix = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private unitScale = new THREE.Vector3(1, 1, 1)
  constructor(parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number, smoke?: THREE.Texture) {
    this.name = parent.name; this.origin = originalPosition(parent); this.sector = sector
    const frame = (matrix: number[]) => new THREE.Matrix4().makeScale(SCALE, SCALE, -SCALE)
      .multiply(new THREE.Matrix4().fromArray(parent.matrix)).multiply(new THREE.Matrix4().fromArray(matrix))
    this.particleOrigin = new THREE.Vector3().setFromMatrixPosition(frame(data.outer.frame))
    const soundFrame = frame(data.sound.frame)
    this.soundOrigin = new THREE.Vector3().setFromMatrixPosition(soundFrame)
    this.soundInverse = soundFrame.clone().invert()
    const columnObject = document.objects.find(o => o.name.endsWith('_Kollisionsquader'))!
    const columnMesh = document.meshes.find(m => m.id === columnObject.mesh)!
    const local = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(columnMesh.positions, 3))
    // Convert handedness on both sides so OBB receives a proper (positive determinant) rotation.
    const minZ = local.min.z; local.min.z = -local.max.z; local.max.z = -minZ
    const flip = new THREE.Matrix4().makeScale(1, 1, -1)
    const matrix = new THREE.Matrix4().makeScale(SCALE, SCALE, -SCALE)
      .multiply(new THREE.Matrix4().fromArray(parent.matrix)).multiply(new THREE.Matrix4().fromArray(columnObject.matrix)).multiply(flip)
    this.column = originalBox(local, matrix)
    const object = document.objects.find(o => o.name.endsWith('_Rotor'))!
    const source = document.meshes.find(m => m.id === object.mesh)!
    const rotorMatrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
    this.rotor = new THREE.Mesh(originalGeometry(source, rotorMatrix.toArray(), true), source.materials.map(id => materials.get(id)!))
    this.rotor.position.copy(originalPosition({ ...object, matrix: rotorMatrix.toArray() }))
    this.rotorAxis = new THREE.Vector3(0, 1, 0).transformDirection(rotorMatrix); this.rotorAxis.z *= -1
    this.group.add(this.rotor)
    // Original two smoke streams, with bounded counts at a 50 Hz emission cadence.
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(100 * 3), 3))
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(new Float32Array(100), 1))
    geometry.setAttribute('opacity', new THREE.Float32BufferAttribute(new Float32Array(100), 1))
    const material = new THREE.ShaderMaterial({
      uniforms: { smoke: { value: smoke }, pixelScale: { value: 1 } },
      vertexShader: `attribute float size; attribute float opacity; uniform float pixelScale; varying float alpha;
        void main() { vec4 view = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * view;
          gl_PointSize = size * pixelScale / max(.1, -view.z); alpha = opacity; }`,
      fragmentShader: `uniform sampler2D smoke; varying float alpha;
        void main() { vec4 texel = texture2D(smoke, gl_PointCoord); gl_FragColor = vec4(texel.rgb, texel.a * alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    this.air = new THREE.Points(geometry, material); this.air.frustumCulled = false
    this.group.add(this.air)
    this.reset()
  }
  reset() {
    this.inSector = this.running = this.soundActive = this.active = false
    this.soundGain = this.rotorTime = this.particleTime = 0
    this.outer = new OriginalProximity(data.outer); this.force = new OriginalProximity(data.force); this.sound = new OriginalProximity(data.sound)
    this.rotor.quaternion.identity(); this.air.visible = false
  }
  step(player: THREE.Vector3, activeSector: number, dt: number) {
    if (this.sector !== activeSector) { if (this.inSector) this.reset(); return }
    this.inSector = true
    const event = this.outer.sample(player, this.particleOrigin)
    if (event === 4) {
      this.running = true; this.particleTime = 0
      this.force.restart(); this.sound.restart(); this.active = false
    } else if (event === 8) {
      // Outer exit switches off the two proximity watchers. Sector off additionally
      // destroys the force and sound controllers (separate original script inputs).
      this.running = false
    }
    if (this.running) {
      this.rotorTime += dt; this.particleTime += dt
      const soundEvent = this.sound.sample(player, this.soundOrigin)
      if (soundEvent === 4) this.soundActive = true
      else if (soundEvent === 8) this.soundActive = false
    }
    // Adapted from CKBuildingBlocks TT_Gravity_RT/Behaviors/ProximityVolumeControl.cpp
    // (Apache-2.0, see THIRD_PARTY.md): squared distance in the MF's local frame.
    const distance = player.clone().applyMatrix4(this.soundInverse).lengthSq()
    const near = data.soundNear ** 2, far = data.soundFar ** 2
    const normalized = distance < far ? (distance > near ? 1 - (distance - near) / (far - near) : 1) : 0
    this.soundGain = this.soundActive ? .02 * 50 ** normalized : 0
    this.air.visible = this.running
  }
  apply(body: RAPIER.RigidBody, ballBounds: THREE.Box3, dt: number) {
    if (!this.inSector || !body.isEnabled() || !body.isDynamic()) { this.active = false; return false }
    const p = body.translation(), q = body.rotation()
    const event = this.running ? this.force.sample(this.position.set(p.x, p.y, p.z), this.particleOrigin) : 0
    // EnterRange (4) refreshes CurrentLevel's player reference. Only InRange (1)
    // executes Box Box Intersection and creates/destroys the persistent controller.
    if (event === 1) {
      this.ballMatrix.compose(this.position.set(p.x, p.y, p.z), this.rotation.set(q.x, q.y, q.z, q.w), this.unitScale)
      // Virtools Box Box Intersection tests the two oriented mesh bounds, not center distance.
      this.active = originalBoxesIntersect(originalBox(ballBounds, this.ballMatrix), this.column)
    }
    if (this.active) body.applyImpulse({ x: 0, y: FAN_FORCE * dt, z: 0 }, true)
    return this.active
  }
  update(pixelHeight: number, fov: number) {
    // Rotate's original Per Second angle is -15 radians/s; reverse for handedness.
    this.rotor.quaternion.setFromAxisAngle(this.rotorAxis, -data.rotorRadiansPerSecond * this.rotorTime)
    if (!this.air.visible) return
    const positions = this.air.geometry.getAttribute('position'), sizes = this.air.geometry.getAttribute('size'), opacity = this.air.geometry.getAttribute('opacity')
    for (let i = 0; i < 100; i++) {
      const soft = i >= 60, life = soft ? .8 : .4
      const age = (this.particleTime + i * life / (soft ? 40 : 60)) % life, progress = age / life
      // PlanarEmitter starts on a [-1,1] square in the emitter's X/Y plane.
      const noise = (seed: number) => THREE.MathUtils.euclideanModulo(Math.sin(seed * 127.1) * 43758.5453, 1)
      positions.setXYZ(i, this.origin.x + (noise(i + 1) - .5) * .5, this.origin.y + age * (soft ? 9 : 10), this.origin.z + (noise(i + 101) - .5) * .5)
      // Fast stream evolves color only (flags 2); soft stream evolves size and color (flags 3).
      sizes.setX(i, soft ? THREE.MathUtils.lerp(.575, .75, progress) : 1)
      opacity.setX(i, (soft ? .1176 : .235) * (1 - progress) ** 2)
    }
    positions.needsUpdate = sizes.needsUpdate = opacity.needsUpdate = true
    ;(this.air.material as THREE.ShaderMaterial).uniforms.pixelScale!.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)))
  }
  dispose() { this.group.removeFromParent(); this.rotor.geometry.dispose(); this.air.geometry.dispose(); (this.air.material as THREE.Material).dispose() }
}
