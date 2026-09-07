import * as THREE from 'three'
import { originalGeometry, SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'

// The six satellite frames in P_Extra_Point.nmo, in original coordinates.
export const POINT_SATELLITES = [[0, 0, 2.05], [0, 2, .05], [0, 0, -1.95], [-1.0047, -.9669, 1.48], [1.0025, .9975, -1.36], [-1.345, 1.3659, 0]]
export class OriginalCollectibleAssets {
  silver: THREE.SpriteMaterial
  bubble: THREE.MeshBasicMaterial
  lifeGeometry: THREE.BufferGeometry
  floorGeometry: THREE.BufferGeometry
  floorMaterial: THREE.MeshBasicMaterial
  lifeFloorGeometry: THREE.BufferGeometry
  lifeFloorMaterial: THREE.MeshBasicMaterial
  private oil: THREE.Texture
  constructor(life: OriginalDocument, points: OriginalDocument, lifeMaterials: Map<number, THREE.MeshPhongMaterial>, pointMaterials: Map<number, THREE.MeshPhongMaterial>) {
    const material = (doc: OriginalDocument, map: Map<number, THREE.MeshPhongMaterial>, name: string) => map.get(doc.materials.find(m => m.name === name)!.id)!
    const silver = material(life, lifeMaterials, 'P_Extra_Life_SilverBall').map!
    this.silver = new THREE.SpriteMaterial({ map: silver, transparent: true, depthWrite: false })
    // The original silver-ball billboard is circular, including on BMP exports without alpha.
    this.silver.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= 1.0 - smoothstep(0.44, 0.5, length(vMapUv - vec2(0.5)));')
    }
    this.silver.customProgramCacheKey = () => 'original-silver-billboard'
    this.oil = material(life, lifeMaterials, 'P_Extra_Life_Sphere').map!.clone()
    this.oil.needsUpdate = true
    this.bubble = new THREE.MeshBasicMaterial({ map: this.oil, color: 0xd6b4e3, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false })
    const sphere = life.objects.find(o => o.name === 'P_Extra_Life_Sphere')!
    this.lifeGeometry = originalGeometry(life.meshes.find(m => m.id === sphere.mesh)!, sphere.matrix)
    const shadow = life.objects.find(o => o.name === 'P_Extra_Life_Shadow')!
    this.lifeFloorGeometry = originalGeometry(life.meshes.find(m => m.id === shadow.mesh)!, shadow.matrix)
    this.lifeFloorMaterial = new THREE.MeshBasicMaterial({ map: material(life, lifeMaterials, 'P_Extra_Life_Schatten').map!, color: 0xb581c5, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
    const floor = points.objects.find(o => o.name === 'P_Extra_Point_Floor')!
    this.floorGeometry = originalGeometry(points.meshes.find(m => m.id === floor.mesh)!, floor.matrix)
    this.floorMaterial = new THREE.MeshBasicMaterial({ map: material(points, pointMaterials, 'ShadowPolyBig').map!, color: 0xd8bfdc, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
  }
  sprite(size: number) { const sprite = new THREE.Sprite(this.silver); sprite.scale.setScalar(size); return sprite }
  update(time: number) { this.oil.offset.set(Math.sin(time) * .2, Math.sin(time + Math.PI / 2) * .2) }
  dispose() { this.silver.dispose(); this.bubble.dispose(); this.oil.dispose(); this.lifeGeometry.dispose(); this.floorGeometry.dispose(); this.floorMaterial.dispose(); this.lifeFloorGeometry.dispose(); this.lifeFloorMaterial.dispose() }
}
export class OriginalCollectible {
  group = new THREE.Group()
  private animated = new THREE.Group()
  private satellites: THREE.Sprite[] = []
  private bubble?: THREE.Mesh
  private life: boolean
  constructor(assets: OriginalCollectibleAssets, life: boolean, position: THREE.Vector3) {
    this.life = life; this.group.position.copy(position); this.group.add(this.animated)
    this.animated.add(assets.sprite(life ? .3 : .25))
    const floor = new THREE.Mesh(life ? assets.lifeFloorGeometry : assets.floorGeometry, life ? assets.lifeFloorMaterial : assets.floorMaterial); this.group.add(floor)
    if (life) {
      this.bubble = new THREE.Mesh(assets.lifeGeometry, assets.bubble); this.animated.add(this.bubble)
    } else {
      for (const point of POINT_SATELLITES) {
        const sprite = assets.sprite(.125); sprite.position.set(point[0]! * SCALE, point[1]! * SCALE, -point[2]! * SCALE)
        this.animated.add(sprite); this.satellites.push(sprite)
      }
    }
  }
  update(time: number) {
    if (this.life) {
      // Saved animation endpoints: Y scale 1.2→0.8, Y position -0.4→1.2, period 2 seconds.
      const wave = .5 - Math.cos(time * Math.PI) * .5
      this.bubble!.scale.y = 1.2 - wave * .4
      this.animated.position.y = (-.4 + wave * 1.6) * SCALE
    } else {
      this.animated.rotation.set(time * .7, time * 2.2, time * .4)
      for (let i = 0; i < this.satellites.length; i++) this.satellites[i]!.scale.setScalar(.125 * (1 + Math.sin(time * 5 + i) * .15))
    }
  }
  dispose() { this.group.removeFromParent(); this.group.clear() }
}
