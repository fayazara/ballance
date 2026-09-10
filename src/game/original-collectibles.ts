import * as THREE from 'three'
import { originalGeometry, SCALE } from './original-data.ts'
import type { OriginalDocument } from './original-data.ts'

import {OriginalPointTrails,POINT_TRAIL,POINT_SATELLITES} from './original-point-trails.ts'
import {OriginalPointExtra} from './original-point-extra.ts'
export {POINT_SATELLITES} from './original-point-trails.ts'
export class OriginalCollectibleAssets {
  silver: THREE.SpriteMaterial
  trail: THREE.PointsMaterial
  private trailTexture: THREE.Texture
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
    this.trailTexture=new THREE.TextureLoader().load('/original/textures/ExtraParticle.png')
    this.trailTexture.colorSpace=THREE.SRGBColorSpace
    this.trail=new THREE.PointsMaterial({map:this.trailTexture,size:POINT_TRAIL.startSize,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending})
    this.trail.onBeforeCompile=shader=>{
      shader.vertexShader='attribute float trailAge; varying float vTrailFade;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('gl_PointSize = size;',`float age = clamp(trailAge, 0.0, 1.0); vTrailFade = mix(1.0, ${POINT_TRAIL.endColor}, age); gl_PointSize = size * mix(1.0, ${POINT_TRAIL.endSize/POINT_TRAIL.startSize}, age);`)
      shader.fragmentShader='varying float vTrailFade;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb *= vTrailFade; diffuseColor.a *= vTrailFade;')
    }
    this.trail.customProgramCacheKey=()=> 'original-point-trail-fade-v1'
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
  dispose() { this.trail.dispose(); this.trailTexture.dispose(); this.silver.dispose(); this.bubble.dispose(); this.oil.dispose(); this.lifeGeometry.dispose(); this.floorGeometry.dispose(); this.floorMaterial.dispose(); this.lifeFloorGeometry.dispose(); this.lifeFloorMaterial.dispose() }
}
export class OriginalCollectible {
  group = new THREE.Group()
  private animated = new THREE.Group()
  private satellites: THREE.Sprite[] = []
  private bubble?: THREE.Mesh
  private trails?: OriginalPointTrails
  private life: boolean
  point?:OriginalPointExtra
  private center:THREE.Sprite
  private floor:THREE.Mesh
  constructor(assets: OriginalCollectibleAssets, life: boolean, position: THREE.Vector3) {
    this.life = life; this.group.position.copy(position); this.group.add(this.animated)
    this.center=assets.sprite(life ? .3 : .25);this.animated.add(this.center)
    const floor = this.floor = new THREE.Mesh(life ? assets.lifeFloorGeometry : assets.floorGeometry, life ? assets.lifeFloorMaterial : assets.floorMaterial); this.group.add(floor)
    if (life) {
      this.bubble = new THREE.Mesh(assets.lifeGeometry, assets.bubble); this.animated.add(this.bubble)
    } else {
      this.point=new OriginalPointExtra(position)
      this.trails=new OriginalPointTrails(assets.trail);this.group.add(this.trails.mesh)
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
      const point=this.point!
      this.center.visible=this.floor.visible=point.stage==='idle'
      for(let i=0;i<this.satellites.length;i++) {
        this.satellites[i]!.position.copy(point.positions[i]!).sub(point.origin)
        this.satellites[i]!.visible=point.visible[i]!
      }
      this.trails?.update(time,this.satellites.map(s=>s.position),point.visible)
    }
  }
  dispose() { this.trails?.dispose(); this.group.removeFromParent(); this.group.clear() }
}
