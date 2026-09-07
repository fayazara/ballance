import * as THREE from 'three'
import { OBB } from 'three/addons/math/OBB.js'
import type RAPIER from '@dimforge/rapier3d-compat'
import { originalGeometry, originalPosition, SCALE } from './original-data.ts'
import type { OriginalDocument, OriginalObject } from './original-data.ts'
import { ORIGINAL_PSI_HZ, ORIGINAL_TIME_FACTOR } from './original-physics.ts'

// P_Modul_18.nmo: SetPhysicsForce .1, world direction (0,1,0).
// The same force acts on every player material; only paper overcomes gravity.
export const FAN_FORCE = .1 * SCALE * ORIGINAL_TIME_FACTOR ** 2 * ORIGINAL_PSI_HZ
export class OriginalFan {
  name: string
  origin: THREE.Vector3
  column: OBB
  group = new THREE.Group()
  rotor: THREE.Mesh
  rotorAxis: THREE.Vector3
  air: THREE.Points
  active = false
  private ballBox = new OBB()
  private ballMatrix = new THREE.Matrix4()
  private position = new THREE.Vector3()
  private rotation = new THREE.Quaternion()
  private unitScale = new THREE.Vector3(1, 1, 1)
  constructor(parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, smoke?: THREE.Texture) {
    this.name = parent.name; this.origin = originalPosition(parent)
    const columnObject = document.objects.find(o => o.name.endsWith('_Kollisionsquader'))!
    const columnMesh = document.meshes.find(m => m.id === columnObject.mesh)!
    const local = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(columnMesh.positions, 3))
    // Convert handedness on both sides so OBB receives a proper (positive determinant) rotation.
    const minZ = local.min.z; local.min.z = -local.max.z; local.max.z = -minZ
    const flip = new THREE.Matrix4().makeScale(1, 1, -1)
    const matrix = new THREE.Matrix4().makeScale(SCALE, SCALE, -SCALE)
      .multiply(new THREE.Matrix4().fromArray(parent.matrix)).multiply(new THREE.Matrix4().fromArray(columnObject.matrix)).multiply(flip)
    this.column = new OBB().fromBox3(local).applyMatrix4(matrix)
    // Three's OBB transform only translates its center; this mesh's bounds are offset from zero.
    local.getCenter(this.column.center).applyMatrix4(matrix)
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
  }
  apply(body: RAPIER.RigidBody, ballBounds: THREE.Box3, dt: number) {
    const p = body.translation(), q = body.rotation()
    this.ballMatrix.compose(this.position.set(p.x, p.y, p.z), this.rotation.set(q.x, q.y, q.z, q.w), this.unitScale)
    this.ballBox.fromBox3(ballBounds).applyMatrix4(this.ballMatrix)
    ballBounds.getCenter(this.ballBox.center).applyMatrix4(this.ballMatrix)
    // Virtools Box Box Intersection tests the two oriented mesh bounds, not center distance.
    this.active = body.isDynamic() && this.column.intersectsOBB(this.ballBox)
    if (this.active) body.applyImpulse({ x: 0, y: FAN_FORCE * dt, z: 0 }, true)
    return this.active
  }
  update(time: number, player: THREE.Vector3, pixelHeight: number, fov: number) {
    // Rotate's original Per Second angle is -15 radians/s; reverse for handedness.
    this.rotor.quaternion.setFromAxisAngle(this.rotorAxis, 15 * time)
    this.air.visible = player.distanceToSquared(this.origin) < 20 ** 2
    if (!this.air.visible) return
    const positions = this.air.geometry.getAttribute('position'), sizes = this.air.geometry.getAttribute('size'), opacity = this.air.geometry.getAttribute('opacity')
    for (let i = 0; i < 100; i++) {
      const soft = i >= 60, life = soft ? .8 : .4
      const age = (time + i * life / (soft ? 40 : 60)) % life, progress = age / life
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
