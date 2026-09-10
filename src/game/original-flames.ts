import * as THREE from 'three'

interface FlameSettings {
  emissionDelay:number;lifespan:number;lifespanVariance:number
  speed:number;speedVariance:number;initialSize:number;sizeVariance:number;endingSize:number
}
const startSettings:FlameSettings={emissionDelay:.02,lifespan:1,lifespanVariance:.25,
  speed:8,speedVariance:3,initialSize:3,sizeVariance:.3,endingSize:.1}
// PS_FourFlames.nmo: 20 ms emission, 1 ± .25 s lifetime, 8 ± 3 units/s,
// 3 ± .3 initial size -> .1 final size, 50 particles, additive blending.
// Original texture with a violet tint to retain the requested hue under additive overlap.
export class OriginalFlames {
  points: THREE.Points
  geometry = new THREE.BufferGeometry()
  material: THREE.ShaderMaterial
  origins: THREE.Vector3[]
  settings:FlameSettings
  constructor(origins: THREE.Vector3[], texture: THREE.Texture, settings:FlameSettings=startSettings) {
    this.origins = origins
    this.settings=settings
    const count = origins.length * 50
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1))
    this.geometry.setAttribute('opacity', new THREE.BufferAttribute(new Float32Array(count), 1))
    this.material = new THREE.ShaderMaterial({
      uniforms: { flame: { value: texture }, pixelScale: { value: 1 } },
      vertexShader: `attribute float size; attribute float opacity; uniform float pixelScale; varying float alpha;
        void main() { vec4 view = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * view;
          gl_PointSize = size * pixelScale / max(.1, -view.z); alpha = opacity; }`,
      fragmentShader: `uniform sampler2D flame; varying float alpha;
        void main() { vec4 texel = texture2D(flame, vec2(gl_PointCoord.x, 1. - gl_PointCoord.y));
          gl_FragColor = vec4(texel.rgb * vec3(.65, .12, 1.), texel.a * alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    })
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false
  }
  update(time: number, pixelHeight: number, fov: number) {
    const positions = this.geometry.getAttribute('position'), sizes = this.geometry.getAttribute('size'), opacity = this.geometry.getAttribute('opacity')
    const noise = (n: number) => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value) }
    for (let emitter = 0; emitter < this.origins.length; emitter++) {
      const origin = this.origins[emitter]!
      for (let i = 0; i < 50; i++) {
        const index = emitter * 50 + i, seed = index + 1
        const settings=this.settings
        const life = settings.lifespan + (noise(seed)*2-1)*settings.lifespanVariance
        const age = (time + i * settings.emissionDelay) % life, progress = age / life
        const speed = (settings.speed + (noise(seed + 70)*2-1)*settings.speedVariance)*.25
        const drift = age * speed * .05236
        positions.setXYZ(index, origin.x + Math.sin(seed * 4.1 + age * 3) * drift, origin.y + age * speed, origin.z + Math.cos(seed * 3.7 + age * 2) * drift)
        sizes.setX(index, THREE.MathUtils.lerp((settings.initialSize+(noise(seed+13)*2-1)*settings.sizeVariance)*.25, settings.endingSize*.25, progress))
        opacity.setX(index, (1 - progress) * .3)
      }
    }
    positions.needsUpdate = sizes.needsUpdate = opacity.needsUpdate = true
    this.material.uniforms.pixelScale!.value = pixelHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)))
  }
  dispose() { this.geometry.dispose(); this.material.dispose() }
}
