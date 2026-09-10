import { replacePlayerCollider } from './original-player'
import { OriginalLift } from './original-lift'
import { OriginalSlider } from './original-slider'
import { OriginalArms } from './original-arms'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { GameState, Settings } from './engine'
import type { Material } from './levels'
import { loadOriginal, originalGeometry, originalPosition, originalSceneEntries, OriginalMaterials, SCALE } from './original-data'
import type { OriginalDocument, OriginalObject } from './original-data'
import { OriginalAudio } from './original-audio'
import { OriginalFlames } from './original-flames'
import { BallTransformation } from './original-transformation'
import { OriginalTransformerVisual } from './original-transformer-visual'
import { OriginalDebris } from './original-debris'
import { OriginalCollectible, OriginalCollectibleAssets } from './original-collectibles'
import { OriginalFan } from './original-fan'
import { OriginalHinge, ORIGINAL_HINGES } from './original-hinges'
import type { HingeKind } from './original-hinges'
import { OriginalChain, ORIGINAL_CHAIN } from './original-chain'
import { OriginalSack } from './original-sack'
import { OriginalSwing } from './original-swing'
import { OriginalDepthTest, ORIGINAL_DEPTH } from './original-depth'
import { OriginalSectorObject, ORIGINAL_OBJECTS } from './original-objects'
import type { OriginalObjectKind } from './original-objects'
import { OriginalPusher } from './original-pusher'
import { PLAYER_GROUPS, LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS, originalCollisionGroups } from './original-collisions'
import { FLOOR_PHYSICS, PHYSICS_STEP, GRAVITY, configureContact, driveBall } from './original-physics'
import { OriginalIvpRuntime } from './original-ivp-runtime'
import type { IvpVisuals } from './original-ivp-runtime'
import type { IvpModule } from './ivp-bridge'
import type { OriginalDriveKey } from './original-ivp-player'
import {ORIGINAL_CONTROLS,originalEngineKey,type OriginalControlSettings} from '../controls/original-controls'
import finishData from './original-finish-data.json'
import musicData from './original-music-data.json'
import {OriginalProximity} from './original-proximity'
import {OriginalUfo} from './original-ufo'
import {OriginalEndingCamera} from './original-ending-camera'
import endingCameraData from './original-ending-camera-data.json'
import {originalScriptDeltaMs} from './original-script-clock'
import {OriginalCamera} from './original-camera'
import {OriginalCheckpoint} from './original-checkpoint'
import checkpointData from './original-checkpoint-data.json'
import {OriginalRespawn} from './original-respawn'
import {batchOriginalScene} from './original-render-batching'
import {OriginalRenderBudget} from './original-render-budget'

const RADIUS = 2 * SCALE
type Moving = { mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number }
type Trigger = { object: OriginalObject; position: THREE.Vector3; mesh?: THREE.Object3D; visual?: OriginalCollectible; taken?: boolean; sector: number }
let rapierReady: Promise<void> | undefined
export class OriginalEngine {
  state: GameState = { phase: 'paused', level: 0, lives: 3, time: 500, score: 1000, material: 'wood', checkpoint: 0, speed: 0, message: '' }
  settings: Settings = { sound: false, quality: true, sensitivity: 1 }
  touch = { x: 0, z: 0, brake: false }
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, 1, .1, 1800)
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  private renderBudget=new OriginalRenderBudget()
  private coarsePointer=matchMedia('(pointer: coarse)').matches
  worldGroup = new THREE.Group()
  surfaceSounds = new Map<number, 'Stone' | 'Wood' | 'Metal'>()
  physics?: RAPIER.World
  body?: RAPIER.RigidBody
  native?: OriginalIvpRuntime
  endingAge?: number
  ufo?: OriginalUfo
  readonly endingCamera=new OriginalEndingCamera()
  readonly gameCamera=new OriginalCamera()
  readonly respawnSequence=new OriginalRespawn()
  private respawnFilter=document.createElement('div')
  private cameraInputFrame=new THREE.Matrix4().elements
  private musicProximity=new OriginalProximity(musicData.proximity)
  private musicResetAge=0
  private musicInitialExit=true
  private nativeModule?: IvpModule
  private ballsDocument?: OriginalDocument
  readonly originalSolver:boolean
  ball = new THREE.Group()
  materials = new OriginalMaterials()
  ballMaterials = new OriginalMaterials()
  ballModels = new Map<Material, THREE.Mesh>()
  transformation = new BallTransformation()
  transformerVisual?: OriginalTransformerVisual
  transformerMaterials = new OriginalMaterials()
  debris?: OriginalDebris
  collectibleAssets?: OriginalCollectibleAssets
  collectibleMaterials = [new OriginalMaterials(), new OriginalMaterials()]
  transformerMeshes = new Map<number, THREE.Mesh[]>()
  finishMeshes = new Map<string, Map<string, THREE.Mesh>>()
  dynamics: Moving[] = []
  depthTest?: OriginalDepthTest
  sectorObjects: OriginalSectorObject[] = []
  pushers: OriginalPusher[] = []
  hinges: OriginalHinge[] = []
  chains: OriginalChain[] = []
  sacks: OriginalSack[] = []
  lifts: OriginalLift[] = []
  sliders: OriginalSlider[] = []
  arms: OriginalArms[] = []
  swings: OriginalSwing[] = []
  flames: OriginalFlames[] = []
  flameTexture?: THREE.Texture
  smokeTexture?: THREE.Texture
  fans: OriginalFan[] = []
  moduleMaterials: OriginalMaterials[] = []
  fallbackMaterial = new THREE.MeshPhongMaterial({ color: 0xbcb6a0 })
  checkpoints: Trigger[] = []; resets: OriginalObject[] = []; pickups: Trigger[] = []; pads: Trigger[] = []
  checkpointTrigger?:OriginalCheckpoint
  checkpointScripts:OriginalCheckpoint[]=[]
  checkpointFlames=new Map<number,{center:OriginalFlames;sides:OriginalFlames}>()
  finish?: Trigger
  keys = new Set<string>()
  audio = new OriginalAudio()
  observer: ResizeObserver
  frame = 0; disposed = false; loading = false; generation = 0; last = 0; accumulator = 0; emitAt = 0
  yaw = Math.PI / 2; targetYaw = Math.PI / 2; follow = new THREE.Vector3(); elapsed = 0; padCooldown = 0; messageUntil = 0
  checkpointMaterial: Material = 'wood'
  shadowLight = new THREE.DirectionalLight(0xffffff, 1.6)
  sky?: THREE.CubeTexture
  host: HTMLElement
  onState: (state: GameState) => void
  constructor(host: HTMLElement, onState: (state: GameState) => void, originalSolver=false) {
    this.originalSolver=originalSolver
    this.host = host; this.onState = onState
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor(0xcfc7b7)
    this.renderer.domElement.setAttribute('aria-label', 'Original Ballance course')
    this.host.appendChild(this.renderer.domElement)
    this.respawnFilter.setAttribute('aria-hidden','true')
    this.respawnFilter.style.cssText='position:absolute;inset:0;pointer-events:none;display:none'
    this.host.appendChild(this.respawnFilter)
    this.scene.add(this.worldGroup, this.ball, new THREE.HemisphereLight(0xffffff, 0x6f6251, 1.8), this.shadowLight, this.shadowLight.target)
    this.shadowLight.castShadow = true; const shadowSize=this.coarsePointer?1024:2048;this.shadowLight.shadow.mapSize.set(shadowSize,shadowSize)
    Object.assign(this.shadowLight.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 })
    this.shadowLight.shadow.bias = -.0003; this.shadowLight.shadow.normalBias = .02
    this.observer = new ResizeObserver(this.resize); this.observer.observe(host); this.resize()
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup)
    window.addEventListener('blur', this.blur); window.addEventListener('pointerdown', this.unlock)
    this.frame = requestAnimationFrame(this.animate)
  }
  async initialize() {
    await (rapierReady ??= RAPIER.init())
    if(this.originalSolver) {
      const url=import.meta.env.VITE_IVP_MODULE_URL
      const {default:create}=await import(/* @vite-ignore */ url)
      this.nativeModule=await create()
    }
    this.renderer.domElement.dataset.physicsBackend=this.nativeModule?'ivp':'rapier'
    const balls = await loadOriginal('balls'), materials = await this.ballMaterials.create(balls)
    this.ballsDocument=balls
    this.flameTexture = await new THREE.TextureLoader().loadAsync('/original/textures/Particle_Flames.png')
    this.flameTexture.colorSpace = THREE.SRGBColorSpace
    this.smokeTexture = await new THREE.TextureLoader().loadAsync('/original/textures/Particle_Smoke.png')
    this.smokeTexture.colorSpace = THREE.SRGBColorSpace
    if (this.disposed) { this.ballMaterials.dispose(); this.flameTexture?.dispose(); this.smokeTexture.dispose(); return }
    for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
      const object = balls.objects.find(o => o.name.toLowerCase() === `ball_${kind}`)!
      const source = balls.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, object.matrix, true), source.materials.map(id => materials.get(id)!))
      batchOriginalScene(mesh)
      mesh.castShadow = true; mesh.receiveShadow = true; this.ballModels.set(kind, mesh)
    }
    this.debris = new OriginalDebris(balls, materials);batchOriginalScene(this.debris.group); this.scene.add(this.debris.group)
    const animation = await loadOriginal('animtrafo')
    const animationMaterials = await this.transformerMaterials.create(animation)
    if (this.disposed) { this.transformerMaterials.dispose(); return }
    this.transformerVisual = new OriginalTransformerVisual(animation, animationMaterials)
    batchOriginalScene(this.transformerVisual.group)
    this.scene.add(this.transformerVisual.group)
    const [life, points] = await Promise.all([loadOriginal('p_extra_life'), loadOriginal('p_extra_point')])
    const [lifeMaterials, pointMaterials] = await Promise.all([this.collectibleMaterials[0]!.create(life), this.collectibleMaterials[1]!.create(points)])
    if (this.disposed) { this.collectibleMaterials.forEach(m => m.dispose()); return }
    this.collectibleAssets = new OriginalCollectibleAssets(life, points, lifeMaterials, pointMaterials)
  }
  start(index = this.state.level) { void this.load(index).catch(error => { if (!this.disposed) { this.loading = false; this.state.phase = 'paused'; this.message(error instanceof Error ? error.message : 'Level could not load'); this.emit() } }) }
  async load(index: number) {
    this.cancelTransformation()
    const token = ++this.generation; this.loading = true; this.state.phase = 'paused'; this.audio.paused = true; this.audio.sync()
    this.state.message = 'Loading…'; this.emit()
    const document = await loadOriginal(`level_${String(index + 1).padStart(2, '0')}`)
    const sharedNames = document.groups.map(g => g.name.toLowerCase()).filter(n => /^p_(modul_|ball_|box$|dome$|trafo_)/.test(n))
    sharedNames.push('pe_balloon')
    const modules = await Promise.all([...new Set(sharedNames)].map(async name => ({ name, document: await loadOriginal(name), resources: new OriginalMaterials() })))
    const moduleMaps = await Promise.all(modules.map(m => m.resources.create(m.document)))
    const resource = new OriginalMaterials(), materials = await resource.create(document)
    const letter = String.fromCharCode(65 + index)
    // Original game has five sky faces. Reuse the downward cloud face above, beyond normal camera view.
    const sky = await new THREE.CubeTextureLoader().loadAsync(['Right', 'Left', 'Down', 'Down', 'Front', 'Back'].map(face => `/original/sky/Sky_${letter}_${face}.jpg`))
    sky.colorSpace = THREE.SRGBColorSpace
    if (this.disposed || token !== this.generation) { resource.dispose(); sky.dispose(); modules.forEach(m => m.resources.dispose()); return }
    this.clearLevel(); this.materials = resource; this.moduleMaterials = modules.map(m => m.resources); this.sky = sky; this.scene.background = sky
    this.physics = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 }); this.physics.timestep = PHYSICS_STEP
    this.depthTest = new OriginalDepthTest(document)
    const group = (name: string) => new Set(document.groups.find(g => g.name === name)?.members || [])
    const depthMembers = new Set(ORIGINAL_DEPTH.groups.flatMap(name => [...group(name)]))
    const sector = (id: number) => Number(document.groups.find(g => /^Sector_/.test(g.name) && g.members.includes(id))?.name.slice(-2) || 1)
    const woodSounds = group('Sound_RollID_02'), metalSounds = group('Sound_RollID_03')
    const floorStoppers = group('Phys_FloorStopper')
    const objects = new Map<number, THREE.Mesh>()
    for (const { object, source, floor, visible } of originalSceneEntries(document)) {
      // Several original files contain identical transformer instances at the same position.
      if (/^P_Trafo_/.test(object.name) && document.objects.some(o => o.id < object.id && o.name.split('_').slice(0, 3).join('_') === object.name.split('_').slice(0, 3).join('_') && originalPosition(o).distanceTo(originalPosition(object)) < .001)) continue
      const shared = modules.findIndex(m => object.name.toLowerCase().startsWith(m.name + '_'))
      if (shared >= 0) { this.addModule(object, modules[shared]!.document, moduleMaps[shared]!, sector(object.id), depthMembers.has(object.id)); continue }
      const geometry = originalGeometry(source, object.matrix)
      const mesh = new THREE.Mesh(geometry, source.materials.map(id => materials.get(id) || this.fallbackMaterial))
      mesh.name = object.name; mesh.visible = visible; mesh.receiveShadow = true
      this.worldGroup.add(mesh); objects.set(object.id, mesh)
      if (floor) {
        const collider = this.physics.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)).setCollisionGroups(floorStoppers.has(object.id) ? LEVEL_STOPPER_GROUPS : LEVEL_FLOOR_GROUPS), FLOOR_PHYSICS))
        this.surfaceSounds.set(collider.handle, woodSounds.has(object.id) ? 'Wood' : metalSounds.has(object.id) ? 'Metal' : 'Stone')
      }
    }
    const triggers = (name: string): Trigger[] => document.objects.filter(o => group(name).has(o.id)).sort((a, b) => a.name.localeCompare(b.name)).map(object => ({ object, position: originalPosition(object), mesh: objects.get(object.id), sector: sector(object.id) }))
    this.resets = triggers('PR_Resetpoints').map(t => t.object)
    this.checkpoints = triggers('PC_Checkpoints'); this.finish = triggers('PE_Levelende')[0]
    this.pickups = [...triggers('P_Extra_Point'), ...triggers('P_Extra_Life')]
    this.pads = [...triggers('P_Trafo_Wood'), ...triggers('P_Trafo_Stone'), ...triggers('P_Trafo_Paper')]
    for (const pickup of this.pickups) {
      if (pickup.mesh) pickup.mesh.visible = false
      const life = pickup.object.name.includes('Life')
      pickup.visual = new OriginalCollectible(this.collectibleAssets!, life, pickup.position)
      this.scene.add(pickup.visual.group); pickup.mesh = pickup.visual.group
    }
    for (const start of triggers('PS_Levelstart')) this.addFlames(start, true)
    // Fire emitters are behavior objects in Virtools, so add their visual effect around the imported gates.
    for (const checkpoint of this.checkpoints) this.addFlames(checkpoint, false)
    if(this.nativeModule) {
      const visuals:IvpVisuals=new Map()
      for(const [name,meshes] of this.finishMeshes)visuals.set(name,meshes)
      const add=(name:string,mesh:THREE.Mesh)=> {const parts=visuals.get(name)??new Map();parts.set(mesh.name,mesh);visuals.set(name,parts)}
      for(const item of this.sectorObjects) add(item.name,item.mesh)
      for(const item of this.pushers) add(item.name,item.mesh)
      for(const item of this.sliders) for(const part of item.parts) add(item.name,part.mesh)
      for(const item of this.hinges) add(item.name,item.mesh)
      for(const item of this.chains) for(const part of item.parts) add(item.name,part.mesh)
      for(const item of this.lifts) for(const part of item.parts) add(item.name,part.mesh)
      for(const item of this.sacks) for(const part of item.parts) add(item.name,part.mesh)
      for(const item of this.arms) add(item.name,item.mesh)
      for(const item of this.swings) add(item.name,item.mesh)
      this.native=new OriginalIvpRuntime(this.nativeModule,document,this.ballsDocument!,new Map(modules.map(m=>[m.name,m.document])),visuals)
    }
    this.state = { phase: 'playing', level: index, lives: 3, time: 500, score: 1000, material: 'wood', checkpoint: 0, speed: 0, message: '' }
    this.checkpointMaterial = 'wood'; this.elapsed = 0; this.yaw = this.targetYaw = Math.PI / 2
    this.body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false))
    // Start timing at the next RAF timestamp. performance.now() can be later
    // than the timestamp of an already queued RAF callback after asset loading.
    this.transform('wood', false); this.respawn();batchOriginalScene(this.worldGroup);batchOriginalScene(this.ball); this.loading = false; this.last = 0; this.accumulator = 0
    this.audio.music.start(index);this.musicProximity=new OriginalProximity(musicData.proximity);this.musicInitialExit=true;this.musicResetAge=0
    this.audio.paused = false; this.audio.sync(); this.audio.effect('Misc_StartLevel'); this.emit()
  }
  addModule(parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number, depthEligible = false) {
    if(this.nativeModule&&parent.name.startsWith('PE_Balloon_')) {
      const meshes=new Map<string,THREE.Mesh>()
      for(const object of document.objects) {
        const source=document.meshes.find(m=>m.id===object.mesh)
        if(!source||!object.name.startsWith('PE_Balloon_'))continue
        const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
        const mesh=new THREE.Mesh(originalGeometry(source,frame.toArray(),true),source.materials.map(id=>materials.get(id)||this.fallbackMaterial))
        mesh.name=object.name;mesh.position.copy(originalPosition({...object,matrix:frame.toArray()}))
        mesh.castShadow=mesh.receiveShadow=true;meshes.set(object.name,mesh);this.worldGroup.add(mesh)
      }
      this.finishMeshes.set(parent.name,meshes)
      this.ufo=new OriginalUfo(parent,document,materials);this.worldGroup.add(this.ufo.group)
      return
    }
    const objectKind = (Object.keys(ORIGINAL_OBJECTS) as OriginalObjectKind[]).find(kind => parent.name.startsWith(kind + '_'))
    if (objectKind) {
      const item = new OriginalSectorObject(this.physics!, parent, document, materials, sector, objectKind, depthEligible ? this.depthTest : undefined)
      this.sectorObjects.push(item); this.worldGroup.add(item.mesh)
      if (!ORIGINAL_OBJECTS[objectKind].fixed) this.dynamics.push(item)
      return
    }
    if (/^P_Modul_03_/.test(parent.name)) {
      const lift = new OriginalLift(this.physics!, parent, document, materials, sector, this.depthTest)
      this.lifts.push(lift); this.dynamics.push(...lift.parts)
      this.worldGroup.add(...lift.parts.map(p => p.mesh)); return
    }
    if (/^P_Modul_34_/.test(parent.name)) {
      const slider = new OriginalSlider(this.physics!, parent, document, materials, sector)
      this.sliders.push(slider); this.dynamics.push(...slider.parts)
      this.worldGroup.add(...slider.parts.map(p => p.mesh)); return
    }
    if (/^P_Modul_17_/.test(parent.name)) {
      const arm = new OriginalArms(this.physics!, parent, document, materials, sector)
      this.arms.push(arm); this.dynamics.push(arm); this.worldGroup.add(arm.mesh)
      for (let i = 0; i < arm.body.numColliders(); i++) this.surfaceSounds.set(arm.body.collider(i).handle, 'Wood')
      return
    }
    if (/^P_Modul_08_/.test(parent.name)) {
      const swing = new OriginalSwing(this.physics!, parent, document, materials, sector)
      this.swings.push(swing); this.dynamics.push(swing); this.worldGroup.add(swing.mesh, swing.decoration)
      for (let i = 0; i < swing.body.numColliders(); i++) this.surfaceSounds.set(swing.body.collider(i).handle, 'Wood')
      return
    }
    if (/^P_Modul_26_/.test(parent.name)) {
      const sack = new OriginalSack(this.physics!, parent, document, materials, sector)
      this.sacks.push(sack); this.dynamics.push(...sack.parts)
      this.worldGroup.add(sack.decoration, ...sack.parts.map(p => p.mesh)); return
    }
    if (/^P_Modul_29_/.test(parent.name)) {
      const chain = new OriginalChain(this.physics!, parent, document, materials, sector)
      this.chains.push(chain); this.dynamics.push(...chain.parts)
      for (const part of chain.parts) { this.worldGroup.add(part.mesh); this.surfaceSounds.set(part.body.collider(0).handle, 'Wood') }
      return
    }
    const hingeKind = Object.keys(ORIGINAL_HINGES).find(name => parent.name.startsWith(name + '_')) as HingeKind | undefined
    if (hingeKind) {
      const hinge = new OriginalHinge(this.physics!, parent, document, materials, sector, hingeKind)
      this.hinges.push(hinge); this.dynamics.push(hinge); this.worldGroup.add(hinge.mesh, hinge.decoration); return
    }
    if (/^P_Modul_01_/.test(parent.name)) {
      const pusher = new OriginalPusher(this.physics!, parent, document, materials, sector)
      this.pushers.push(pusher); this.dynamics.push(pusher); this.worldGroup.add(pusher.mesh); return
    }
    if (/^P_Modul_18_/.test(parent.name)) {
      // The Kollisionsquader is an airflow detector, never a physical wall.
      // The grille already belongs to the level's static floor mesh.
      const fan = new OriginalFan(parent, document, materials, sector, this.smokeTexture)
      this.fans.push(fan); this.worldGroup.add(fan.group); return
    }
    for (const object of document.objects) {
      const source = document.meshes.find(m => m.id === object.mesh); if (!source || /Shadow|PE_UFO|PE_Box_slide/.test(object.name)) continue
      const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix)).toArray()
      const geometry = originalGeometry(source, matrix)
      const mesh = new THREE.Mesh(geometry, source.materials.map(id => materials.get(id) || this.fallbackMaterial)); mesh.visible = !/Kollisionsquader/.test(object.name); mesh.receiveShadow = true; this.worldGroup.add(mesh)
      mesh.name = object.name
      if (/^P_Trafo_/.test(parent.name)) {
        const meshes = this.transformerMeshes.get(parent.id) || []; meshes.push(mesh); this.transformerMeshes.set(parent.id, meshes)
      }
      // These imported modules render over the authored course floor. Their
      // original scripts never Physicalize the visible machine/flame geometry.
      if(!/^(P_Trafo_|PS_FourFlames_|PC_TwoFlames_)/.test(parent.name))this.physics!.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)).setCollisionGroups(originalCollisionGroups('')), FLOOR_PHYSICS))
    }
  }
  addFlames(trigger: Trigger, start: boolean) {
    if (!this.flameTexture) return
    if(!start) {
      const parent=new THREE.Matrix4().fromArray(trigger.object.matrix)
      const point=(frame:number[])=>new THREE.Vector3().setFromMatrixPosition(
        parent.clone().multiply(new THREE.Matrix4().fromArray(frame))).multiply(new THREE.Vector3(SCALE,SCALE,-SCALE))
      const center=new OriginalFlames([point(checkpointData.frame)],this.flameTexture,checkpointData.centerParticles)
      const sides=new OriginalFlames(checkpointData.smallFrames.map(point),this.flameTexture,checkpointData.smallParticles)
      center.points.visible=sides.points.visible=false
      this.flames.push(center,sides);this.worldGroup.add(center.points,sides.points)
      this.checkpointFlames.set(trigger.object.id,{center,sides})
      return
    }
    const offsets = [[-7.26, 1.5, -6.14], [7.287, 1.5, -6.114], [-7.26, 1.5, 6.09], [7.287, 1.5, 6.114]]
    const origins = offsets.map(offset => {
      const point = new THREE.Vector3(...offset).applyMatrix4(new THREE.Matrix4().fromArray(trigger.object.matrix)); point.multiplyScalar(SCALE); point.z *= -1; return point
    })
    const flames = new OriginalFlames(origins, this.flameTexture); this.flames.push(flames); this.worldGroup.add(flames.points)
  }
  transform(kind: Material, sound = true) {
    if (!this.body) return
    this.state.material = kind; this.ball.clear(); const model = this.ballModels.get(kind); if (model) this.ball.add(model)
    const vertices = model?.geometry.attributes.position?.array as Float32Array | undefined
    replacePlayerCollider(this.physics!, this.body, kind, vertices)
    if(this.native) {this.moveNativeCaptured();this.native.material(kind);this.syncNativePlayer()}
    if (sound) this.audio.effect('Misc_Trafo')
  }
  respawn(hold=false,resetSector=true) {
    if(!hold)this.respawnSequence.reset()
    this.musicResetAge=musicData.resetDelayMs/1000;this.musicProximity.restart()
    this.endingAge=undefined
    this.ufo?.reset();this.endingCamera.reset()
    this.debris?.clearIvp()
    if (!this.body || !this.resets.length) return
    this.cancelTransformation()
    if (this.physics) this.debris?.clear(this.physics)
    const point = originalPosition(this.resets[this.state.checkpoint] || this.resets[0]!)
    this.body.setTranslation(point, true); this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.transform(this.checkpointMaterial, false); this.follow.copy(point); this.ball.position.copy(point)
    if(resetSector)this.resetSectorObjects()
    this.cancelPointExtras()
    this.armCheckpoint()
    this.padCooldown = this.elapsed + 1
    if(this.native) {
      const reset=this.resets[this.state.checkpoint]||this.resets[0]!
      const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(reset.matrix)).normalize()
      this.native.reset(this.state.checkpoint+1,this.checkpointMaterial,reset.matrix.slice(12,15),rotation.toArray(),false);this.syncNativePlayer()
      this.gameCamera.reset(reset.matrix);this.cameraInputFrame=[...this.gameCamera.steeringFrame.elements]
      this.yaw=this.targetYaw=this.gameCamera.inputYaw
      if(hold)this.native.capture()
      this.audio.contacts(this.native.sound.frame)
    }
    this.body.setEnabled(!hold);this.ball.visible=!hold
  }
  private resetSectorObjects() {
    this.depthTest?.resetSector(this.state.checkpoint + 1)
    for (const object of this.sectorObjects.filter(o => o.sector === this.state.checkpoint + 1)) object.reset()
    for (const item of this.dynamics.filter(d => d.sector === this.state.checkpoint + 1)) { item.body.setTranslation(item.origin, true); item.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); item.body.setLinvel({ x: 0, y: 0, z: 0 }, true); item.body.setAngvel({ x: 0, y: 0, z: 0 }, true) }
    for (const hinge of this.hinges.filter(h => h.sector === this.state.checkpoint + 1)) hinge.reset()
    for (const pusher of this.pushers.filter(p => p.sector === this.state.checkpoint + 1)) pusher.reset()
    for (const chain of this.chains.filter(c => c.sector === this.state.checkpoint + 1)) chain.reset()
    for (const sack of this.sacks.filter(s => s.sector === this.state.checkpoint + 1)) sack.reset()
    for (const lift of this.lifts.filter(l => l.sector === this.state.checkpoint + 1)) lift.reset()
    for (const slider of this.sliders.filter(s => s.sector === this.state.checkpoint + 1)) slider.reset()
    for (const arm of this.arms.filter(a => a.sector === this.state.checkpoint + 1)) arm.reset()
    for (const swing of this.swings.filter(s => s.sector === this.state.checkpoint + 1)) swing.reset()
    for (const fan of this.fans.filter(f => f.sector === this.state.checkpoint + 1)) fan.reset()
    this.audio.stopFans()
    for (const pickup of this.pickups) if (pickup.sector === this.state.checkpoint + 1 && pickup.object.name.includes('Life')) { pickup.taken = false; if (pickup.mesh) pickup.mesh.visible = true }
    this.native?.activate(this.state.checkpoint+1,true)
  }
  beginTransformation(pad: Trigger, kind: Material) {
    if (!this.body) return
    // TT Set Dynamic Position subtracts its (0, -3, 0) offset in the machine's frame.
    const center = new THREE.Vector3(0, 3, 0).applyMatrix4(new THREE.Matrix4().fromArray(pad.object.matrix)).multiplyScalar(SCALE); center.z *= -1
    if (!this.transformation.begin(this.body, this.state.material, kind, center)) return
    this.native?.capture()
    this.transformerVisual?.begin(pad.object, this.transformerMeshes.get(pad.object.id) || [])
    this.state.speed = 0
    if(this.native)this.audio.contacts(this.native.sound.frame)
    else this.audio.roll(this.state.material,0,false)
    this.audio.effect('Misc_Trafo')
  }
  private armCheckpoint() {
    const checkpoint=this.checkpoints[this.state.checkpoint]
    this.checkpointTrigger=checkpoint?new OriginalCheckpoint(checkpoint.object):undefined
    if(this.checkpointTrigger)this.checkpointScripts[this.state.checkpoint]=this.checkpointTrigger
  }
  private reachCheckpoint() {
    this.cancelPointExtras()
    this.state.checkpoint++;this.checkpointMaterial=this.state.material
    this.audio.effect('Misc_Checkpoint');this.message('Checkpoint')
    this.armCheckpoint()
  }
  cancelTransformation() {
    this.transformation.cancel(); this.transformerVisual?.reset(); this.ball.visible = true
    if(this.native&&this.native.player.body===undefined) {this.moveNativeCaptured();this.native.material(this.state.material);this.syncNativePlayer()}
    this.audio.stop('Misc_Trafo')
  }
  private checkPlayerDeath() {
    const reset=this.resets[this.state.checkpoint]||this.resets[0]
    const dead=this.native?!!this.native.deathTest.hit:!!reset&&this.body!.translation().y<originalPosition(reset).y-22
    if(!dead)return false
    if(!this.respawnSequence.begin())return true
    this.keys.clear();this.touch={x:0,z:0,brake:false}
    this.native?.input(new Set(),this.yaw)
    this.cancelPointExtras()
    this.audio.effect('Misc_Fall')
    return true
  }
  private stepRespawn(dt:number) {
    for(const event of this.respawnSequence.step(dt*1000,this.state.lives)) {
      if(event==='game-over') {this.state.phase='lost';this.audio.paused=true;this.audio.sync();return}
      if(event==='clear-fragments') {
        this.debris?.clearIvp();if(this.physics)this.debris?.clear(this.physics)
      }
      if(event==='remove-ball') {
        this.cancelTransformation();this.native?.capture();this.body!.setEnabled(false);this.ball.visible=false
        this.state.lives--;this.resetSectorObjects()
      }
      if(event==='position-ball')this.respawn(true,false)
      if(event==='physicalize-ball') {
        this.native?.material(this.state.material);this.body!.setEnabled(true);this.ball.visible=true
      }
      if(event==='ready') {
        const body=this.native?.player.body
        if(body!==undefined)this.native!.world.wake(body)
        this.native?.deathTest.restart()
      }
    }
    this.elapsed+=dt
    if(this.native) {
      this.native.input(new Set(),this.yaw)
      for(const sound of this.native.step(dt*1000))this.audio.effect(sound)
      this.audio.contacts(this.native.sound.frame);this.syncNativePlayer();this.debris?.stepIvp(dt)
    } else {this.physics!.timestep=dt;this.physics!.step()}
  }
  step(dt: number) {
    if (!this.physics || !this.body) return
    this.audio.stepMusic(dt)
    if(this.respawnSequence.active){this.stepRespawn(dt);return}
    if(this.finish&&this.state.checkpoint===this.checkpoints.length&&this.endingAge===undefined) {
      this.audio.music.lastCheckpoint()
      this.musicResetAge=Math.max(0,this.musicResetAge-dt)
      if(!this.musicResetAge) {
        const event=this.musicProximity.sample(this.ball.position,this.finish.position)
        if(event===4)this.audio.music.approach(true)
        else if(event===8) {if(this.musicInitialExit)this.musicInitialExit=false;else this.audio.music.approach(false)}
      }
    }
    if(this.native&&this.endingAge!==undefined) {
      this.elapsed+=dt;this.endingAge+=dt
      this.native.input(new Set(),this.yaw)
      for(const sound of this.native.step(dt*1000))this.audio.effect(sound)
      this.audio.contacts(this.native.sound.frame)
      this.syncNativePlayer();this.debris?.stepIvp(dt)
      const timing=finishData.presentation
      if(this.endingAge*1000>=timing.skyFadeMs+(this.state.level===11?timing.lastLevelWaitMs:timing.waitMs))this.completeCourse()
      return
    }
    this.elapsed += dt; this.state.time = Math.max(0, this.state.time - dt)
    if (!this.state.time) { this.cancelTransformation(); this.state.phase = 'lost'; this.audio.paused = true; this.audio.sync(); return }
    const player = new THREE.Vector3().copy(this.body.translation())
    const checkpointPlayer=new THREE.Vector3(player.x*4,player.y*4,-player.z*4)
    // Earlier checkpoints retain their side-flame proximity scripts. Future
    // checkpoints do not start until Gameplay activates the next one.
    for(let i=0;i<this.state.checkpoint;i++)this.checkpointScripts[i]?.sample(checkpointPlayer)
    if(this.checkpointTrigger?.sample(checkpointPlayer))this.reachCheckpoint()
    this.native?.activate(this.state.checkpoint+1)
    if(!this.native) {
    for (const object of this.sectorObjects) object.update(this.state.checkpoint + 1)
    for (const pusher of this.pushers) pusher.update(player, this.state.checkpoint + 1)
    for (const hinge of this.hinges) hinge.update(player, this.state.checkpoint + 1)
    for (const chain of this.chains) if (chain.update(player, this.state.material, this.state.checkpoint + 1)) this.audio.effect(ORIGINAL_CHAIN.sound)
    for (const sack of this.sacks) sack.update(dt, this.state.checkpoint + 1)
    for (const lift of this.lifts) lift.update(player, this.state.checkpoint + 1, dt)
    for (const slider of this.sliders) slider.update(player, this.state.checkpoint + 1)
    for (const arm of this.arms) arm.update(dt, this.state.checkpoint + 1)
    for (const swing of this.swings) swing.update(dt, this.state.checkpoint + 1)
    }
    for (const fan of this.fans) { fan.step(player, this.state.checkpoint + 1, dt); this.audio.fan(fan.name, fan.soundGain) }
    this.stepCollectibles(dt)
    if (this.transformation.active) {
      this.transformation.step(dt, kind => this.transform(kind, false), () => {
        const p = this.body!.translation()
        if(this.native)this.debris?.spawnIvp(this.native.world,this.state.material,new THREE.Vector3(p.x,p.y,p.z))
        else this.debris?.spawn(this.physics!, this.state.material, new THREE.Vector3(p.x, p.y, p.z))
      })
      this.ball.visible = this.transformation.ballVisible
      this.transformerVisual?.update(this.transformation.age)
      this.debris?.beforeStep(dt)
      if(this.native) {this.moveNativeCaptured();for(const sound of this.native.step(dt*1000))this.audio.effect(sound);this.audio.contacts(this.native.sound.frame);this.syncNativePlayer()}
      else {this.physics.timestep = dt;this.physics.step()}
      if(this.checkPlayerDeath())return
      this.state.speed = 0; this.state.score = Math.floor(this.state.time * 2)
      if(!this.native)this.depthTest?.update()
      if(this.native)this.debris?.stepIvp(dt)
      else this.debris?.step(this.physics, dt)
      if (!this.transformation.active) { this.transformerVisual?.reset(); this.padCooldown = this.elapsed + .3 }
      return
    }
    let x = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a')) + this.touch.x
    let z = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w')) + this.touch.z
    if (this.keys.has('shift')) { x = 0; z = 0 }
    // Original arrow keys create independent axis controllers, including diagonal input.
    x = THREE.MathUtils.clamp(x, -1, 1); z = THREE.MathUtils.clamp(z, -1, 1)
    const dx = x * Math.cos(this.yaw) + z * Math.sin(this.yaw), dz = z * Math.cos(this.yaw) - x * Math.sin(this.yaw)
    const p = this.body.translation()
    const hit = this.native?null:this.physics.castShape(p, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(RADIUS - .02), 0, .15, true, undefined, PLAYER_GROUPS, undefined, this.body)
    const grounded = this.native?this.native.grounded:!!hit
    // Original force controllers remain active in the air; contact friction supplies rolling torque.
    if(this.native) {
      const held=new Set<OriginalDriveKey>()
      if(!this.keys.has('shift')) {
        if(this.keys.has('arrowleft')||this.keys.has('a')||this.touch.x<0) held.add('left')
        if(this.keys.has('arrowright')||this.keys.has('d')||this.touch.x>0) held.add('right')
        if(this.keys.has('arrowup')||this.keys.has('w')||this.touch.z<0) held.add('forward')
        if(this.keys.has('arrowdown')||this.keys.has('s')||this.touch.z>0) held.add('backward')
      }
      this.native.input(held,this.cameraInputFrame)
    } else driveBall(this.body, this.state.material, dx, dz, dt, this.settings.sensitivity)
    const bounds = this.ballModels.get(this.state.material)?.geometry.boundingBox
    if (!this.native&&bounds) for (const fan of this.fans) fan.apply(this.body, bounds, dt)
    this.physics.timestep = dt
    this.debris?.beforeStep(dt)
    if(this.native) {for(const sound of this.native.step(dt*1000))this.audio.effect(sound);this.audio.contacts(this.native.sound.frame);this.syncNativePlayer()}
    else this.physics.step()
    if(!this.native)this.depthTest?.update()
    if(this.native)this.debris?.stepIvp(dt)
    else this.debris?.step(this.physics, dt)
    if(this.checkPlayerDeath())return
    const position = this.body.translation(), velocity = this.body.linvel()
    this.state.speed = Math.hypot(velocity.x, velocity.z)
    this.state.score = Math.floor(this.state.time * 2)
    for (const pad of this.pads) {
      const distance = Math.hypot(position.x - pad.position.x, position.y - pad.position.y, position.z - pad.position.z)
      if (distance < 4.3 * SCALE && position.y > pad.position.y && this.elapsed > this.padCooldown) {
        const kind = /Stone/.test(pad.object.name) ? 'stone' : /Paper/.test(pad.object.name) ? 'paper' : 'wood'
        if (this.state.material !== kind) { this.beginTransformation(pad, kind); return }
      }
    }
    const reachedFinish=this.native?this.native.finish?.stage==='departing':this.finish&&Math.hypot(position.x-this.finish.position.x,position.z-this.finish.position.z)<3&&Math.abs(position.y-this.finish.position.y)<3
    if (reachedFinish && this.state.checkpoint === this.checkpoints.length) {
      this.audio.music.finish();this.audio.sync()
      if(this.native) {
        this.endingAge=0;this.keys.clear();this.touch.x=this.touch.z=0;this.native.input(new Set(),this.yaw)
        this.endingCamera.start()
        if(this.state.level===11)this.ufo?.start()
      }
      else this.completeCourse()
    }
    if(!this.native)this.audio.roll(this.state.material,this.state.speed,grounded,hit?this.surfaceSounds.get(hit.collider.handle):'Stone')
  }
  animate = (now: number) => {
    if (this.disposed) return
    const elapsedMs=Math.max(0,now-(this.last||now));this.last=now
    if(!this.loading&&this.state.phase==='playing') {
      const ratio=this.renderBudget.sample(elapsedMs)
      if(Math.abs(this.renderer.getPixelRatio()-ratio)>.001)this.renderer.setPixelRatio(ratio)
    }
    const dt=elapsedMs>0?(this.native?originalScriptDeltaMs(elapsedMs)/1000:Math.min(elapsedMs/1000,.05)):0
    if (!this.loading && this.state.phase === 'playing'&&dt>0) {
      this.stepEndingVisuals(dt)
      if(this.native)this.step(dt)
      else {
        this.accumulator += dt
        while (this.accumulator >= PHYSICS_STEP && this.state.phase === 'playing') { this.step(PHYSICS_STEP); this.accumulator -= PHYSICS_STEP }
      }
    }
    if (this.body) {
      const p = this.body.translation(); this.ball.position.set(p.x, p.y, p.z); this.ball.quaternion.copy(this.body.rotation())
      if(!this.native)for (const item of this.dynamics) { item.mesh.position.copy(item.body.translation()); item.mesh.quaternion.copy(item.body.rotation()) }
      this.native?.syncVisuals()
      if(this.ufo?.hidePlayer)this.ball.visible=false
      if(this.native) {
        this.follow.copy(this.ball.position)
        this.camera.position.copy(this.gameCamera.position);this.camera.lookAt(this.gameCamera.target)
      } else {
        this.follow.lerp(this.ball.position, 1 - Math.exp(-dt * 8)); this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-dt * 9))
        const high = this.keys.has(' ') || this.touch.brake
        this.camera.position.copy(this.follow).add(new THREE.Vector3(Math.sin(this.yaw) * (high ? 8 : 13), high ? 22 : 13, Math.cos(this.yaw) * (high ? 8 : 13)))
        this.camera.lookAt(this.follow.clone().add(new THREE.Vector3(0, .25, 0)))
      }
      if(this.endingCamera.active) {
        this.camera.position.copy(this.endingCamera.position);this.camera.lookAt(this.endingCamera.target)
      }
      const near=this.endingCamera.active?endingCameraData.clipping[0]!*SCALE:this.native?this.gameCamera.clipping.near:.1
      const far=this.endingCamera.active?endingCameraData.clipping[1]!*SCALE:this.native?this.gameCamera.clipping.far:1800
      const fov=this.native?this.gameCamera.verticalFov:45
      if(this.camera.near!==near||this.camera.far!==far||this.camera.fov!==fov) {
        this.camera.near=near;this.camera.far=far;this.camera.fov=fov
        this.camera.updateProjectionMatrix()
      }
      this.shadowLight.position.copy(this.follow).add(new THREE.Vector3(-20, 40, 15)); this.shadowLight.target.position.copy(this.follow)
    }
    for(let i=0;i<this.checkpoints.length;i++) {
      const effect=this.checkpointFlames.get(this.checkpoints[i]!.object.id),script=this.checkpointScripts[i]
      if(!effect)continue
      effect.center.points.visible=i===this.state.checkpoint&&!!script?.armed
      effect.sides.points.visible=i<this.state.checkpoint&&!!script?.smallFlames
    }
    for (const flames of this.flames) if(flames.points.visible)flames.update(this.elapsed, this.renderer.domElement.height, this.camera.fov)
    for (const fan of this.fans) fan.update(this.renderer.domElement.height, this.camera.fov)
    this.collectibleAssets?.update(this.elapsed)
    for (const pickup of this.pickups) if (!pickup.taken||(pickup.visual?.point&&pickup.visual.point.stage!=='done')) pickup.visual?.update(this.elapsed)
    if (this.state.message && now > this.messageUntil && !this.loading) this.state.message = ''
    this.renderer.render(this.scene, this.camera)
    const flash=this.respawnSequence.flash
    this.respawnFilter.style.display=flash[3]!>0?'block':'none'
    this.respawnFilter.style.backgroundColor=`rgba(${flash[0]!*255},${flash[1]!*255},${flash[2]!*255},${flash[3]})`
    if (now - this.emitAt > 100) { this.emitAt = now; this.emit() }
    this.frame = requestAnimationFrame(this.animate)
  }
  stepEndingVisuals(dt:number) {
    if(!this.native)return
    const native=this.native
    // Ball Navigation precedes Cam Navigation in Gameplay_Ingame. Capture the
    // force reference before this frame can commit a completed camera turn.
    this.cameraInputFrame=[...this.gameCamera.steeringFrame.elements]
    if(this.ufo)for(const sound of this.ufo.step(dt*1000,{
      get pose(){return native.player.pose},capture:()=>native.capture(),moveCaptured:pose=>native.player.moveCaptured(pose),
    }))this.audio.effect(sound)
    this.endingCamera.step(dt*1000,native.player.renderPose.position,this.gameCamera.position,
      this.gameCamera.target,this.ufo?.stage==='flight',this.gameCamera)
    if(!this.endingCamera.active)this.gameCamera.step(dt*1000,native.player.renderPose.position,
      this.endingAge===undefined&&(this.keys.has(' ')||this.touch.brake))
    this.yaw=this.targetYaw=this.gameCamera.inputYaw
  }
  private stepCollectibles(dt:number) {
    if(!this.body)return
    const player=new THREE.Vector3().copy(this.body.translation())
    for(const pickup of this.pickups) {
      const point=pickup.visual?.point
      if(point) {
        if(point.stage==='idle'&&(pickup.taken||pickup.sector!==this.state.checkpoint+1))continue
        const event=point.step(dt*1000,player)
        if(event.activated){pickup.taken=true;this.audio.effect('Extra_Start')}
        if(event.hits.length)this.audio.effect('Extra_Hit')
        this.state.time+=event.points/2
        if(event.ready&&pickup.mesh)pickup.mesh.visible=false
      } else if(!pickup.taken&&pickup.sector===this.state.checkpoint+1&&pickup.position.distanceTo(player)<4.5*SCALE) {
        pickup.taken=true;if(pickup.mesh)pickup.mesh.visible=false
        this.state.lives++;this.audio.effect('Misc_extraball')
      }
    }
  }
  private cancelPointExtras() {
    for(const pickup of this.pickups)if(pickup.taken&&pickup.visual?.point) {
      pickup.visual.point.cancel();if(pickup.mesh)pickup.mesh.visible=false
    }
  }
  pause() { if (this.loading) return; if (this.state.phase === 'playing') this.state.phase = 'paused'; else if (this.state.phase === 'paused') this.state.phase = 'playing'; this.last=0;this.keys.clear();this.touch={x:0,z:0,brake:false}; this.audio.paused = this.state.phase !== 'playing'; this.audio.sync(); if (this.transformation.active) this.audio.resumeEffect('Misc_Trafo'); this.emit() }
  private completeCourse() {
    this.state.score=(this.state.level+1)*100+Math.floor(this.state.time*2)+this.state.lives*200
    this.state.phase='won';this.audio.paused=true;this.audio.sync();this.emit()
  }
  message(text: string) { this.state.message = text; this.messageUntil = performance.now() + 3000; this.emit() }
  emit() { this.onState({ ...this.state }) }
  setSettings(settings: Settings) { this.settings = settings; this.resize(); this.renderer.shadowMap.enabled = settings.quality; this.audio.enabled = settings.sound; this.audio.sync() }
  unlock = () => { this.audio.unlock() }
  controls:OriginalControlSettings=ORIGINAL_CONTROLS
  setControls(controls:OriginalControlSettings) {this.controls=controls;this.keys.clear()}
  turnCamera(direction:'left'|'right') {
    if(this.state.phase!=='playing'||this.endingAge!==undefined||this.respawnSequence.active)return
    if(this.controls.invertRotation)direction=direction==='left'?'right':'left'
    if(this.native)this.gameCamera.turn(direction)
    else this.targetYaw+=(direction==='left'?1:-1)*Math.PI/2
  }
  keydown = (event: KeyboardEvent) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName)) return
    const key = event.code==='Escape'?'escape':event.code==='Enter'?'enter':originalEngineKey(event.code,this.controls)
    if(!key)return
    if(this.respawnSequence.active&&this.state.phase==='playing'){event.preventDefault();return}
    if(this.endingAge!==undefined&&this.state.phase==='playing'&&this.endingAge*1000>=finishData.presentation.skyFadeMs&&['escape','enter',' '].includes(key)) {
      event.preventDefault();this.completeCourse();return
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault()
    this.audio.unlock(); this.keys.add(key)
    if (event.repeat) return
    if (key === 'escape') this.pause()
    if (this.keys.has('shift') && key === 'arrowleft') {
      this.turnCamera('left')
    }
    if (this.keys.has('shift') && key === 'arrowright') {
      this.turnCamera('right')
    }
  }
  keyup = (event: KeyboardEvent) => { const key=originalEngineKey(event.code,this.controls);if(key)this.keys.delete(key) }
  blur = () => { this.keys.clear(); if (this.state.phase === 'playing') this.pause() }
  resize = () => { const w = this.host.clientWidth, h = this.host.clientHeight; this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(this.renderBudget.configure(w,h,devicePixelRatio,this.settings.quality,this.coarsePointer)); this.renderer.setSize(w, h) }
  clearLevel() {
    this.respawnSequence.reset();this.respawnFilter.style.display='none'
    this.endingAge=undefined
    this.endingCamera.reset()
    this.audio.music.clear();this.audio.sync()
    this.audio.contacts({rolls:[],impacts:[]})
    this.debris?.clearIvp();this.native?.dispose();this.native=undefined
    this.depthTest = undefined
    this.sectorObjects = []
    this.chains = []
    this.sacks = []
    this.lifts = []; this.sliders = []; this.arms = []; this.swings = []
    this.cancelTransformation(); this.transformerMeshes.clear()
    this.finishMeshes.clear()
    this.ufo=undefined
    this.fans.forEach(f => f.dispose()); this.fans = []; this.audio.stopFans()
    if (this.physics) this.debris?.clear(this.physics)
    this.body = undefined; this.surfaceSounds.clear(); this.physics?.free(); this.physics = undefined
    this.pickups.forEach(p => p.visual?.dispose())
    this.worldGroup.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); if (object.material instanceof THREE.MeshBasicMaterial) object.material.dispose() } })
    this.worldGroup.clear(); this.flames.forEach(f => f.dispose()); this.flames = []; this.checkpointFlames.clear();this.checkpointScripts=[];this.checkpointTrigger=undefined; this.moduleMaterials.forEach(m => m.dispose()); this.moduleMaterials = []; this.materials.dispose(); this.sky?.dispose(); this.dynamics = []; this.pushers = []; this.hinges = []; this.pickups = []; this.checkpoints = []; this.pads = []
  }
  private moveNativeCaptured() {
    if(!this.native||!this.body||this.native.player.body!==undefined) return
    const p=this.body.translation(),q=this.body.rotation()
    this.native.player.moveCaptured({position:[p.x*4,p.y*4,-p.z*4],rotation:[-q.x,-q.y,q.z,q.w]})
  }
  syncNativePlayer() {
    if(!this.native||!this.body) return
    const pose=this.native.player.renderPose
    this.body.setTranslation(pose.position,true);this.body.setRotation(pose.rotation,true)
    const handle=this.native.player.body
    const velocity=handle===undefined?[0,0,0]:this.native.world.state(handle).slice(7,10)
    this.body.setLinvel({x:velocity[0]!*.5,y:velocity[1]!*.5,z:-velocity[2]!*.5},true)
  }
  destroy() {
    this.respawnFilter.remove()
    this.disposed = true; this.generation++; cancelAnimationFrame(this.frame); this.observer.disconnect()
    window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); window.removeEventListener('pointerdown', this.unlock)
    this.clearLevel(); this.collectibleAssets?.dispose(); this.collectibleMaterials.forEach(m => m.dispose()); this.debris?.dispose(); this.transformerVisual?.dispose(); this.transformerMaterials.dispose(); this.ballModels.forEach(m => m.geometry.dispose()); this.ballMaterials.dispose(); this.flameTexture?.dispose(); this.smokeTexture?.dispose(); this.audio.dispose(); this.fallbackMaterial.dispose(); this.shadowLight.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
