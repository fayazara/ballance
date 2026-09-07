import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import type { GameState, Settings } from './engine'
import type { Material } from './levels'
import { loadOriginal, originalGeometry, originalPosition, OriginalMaterials, SCALE } from './original-data'
import type { OriginalDocument, OriginalObject } from './original-data'
import { OriginalAudio } from './original-audio'
import { OriginalFlames } from './original-flames'
import { PLAYER_PHYSICS, LOOSE_BALL_PHYSICS, CRATE_PHYSICS, DOME_PHYSICS, FLOOR_PHYSICS, PHYSICS_STEP, GRAVITY, configureBody, configureContact, driveBall } from './original-physics'

const RADIUS = 2 * SCALE
type Moving = { mesh: THREE.Mesh; body: RAPIER.RigidBody; origin: THREE.Vector3; sector: number }
type Trigger = { object: OriginalObject; position: THREE.Vector3; mesh?: THREE.Object3D; taken?: boolean; sector: number }
let rapierReady: Promise<void> | undefined
export class OriginalEngine {
  state: GameState = { phase: 'paused', level: 0, lives: 3, time: 500, score: 1000, material: 'wood', checkpoint: 0, speed: 0, message: '' }
  settings: Settings = { sound: false, quality: true, sensitivity: 1 }
  touch = { x: 0, z: 0, brake: false }
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, 1, .1, 1800)
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  worldGroup = new THREE.Group()
  surfaceSounds = new Map<number, 'Stone' | 'Wood' | 'Metal'>()
  physics?: RAPIER.World
  body?: RAPIER.RigidBody
  ball = new THREE.Group()
  materials = new OriginalMaterials()
  ballMaterials = new OriginalMaterials()
  ballModels = new Map<Material, THREE.Mesh>()
  dynamics: Moving[] = []
  flames: OriginalFlames[] = []
  flameTexture?: THREE.Texture
  moduleMaterials: OriginalMaterials[] = []
  pendingPoints: { mesh: THREE.Mesh; age: number }[] = []
  fallbackMaterial = new THREE.MeshPhongMaterial({ color: 0xbcb6a0 })
  particleGeometry = new THREE.SphereGeometry(.055, 6, 4)
  particleMaterial = new THREE.MeshBasicMaterial({ color: 0xdce7f3 })
  checkpoints: Trigger[] = []; resets: OriginalObject[] = []; pickups: Trigger[] = []; pads: Trigger[] = []
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
  constructor(host: HTMLElement, onState: (state: GameState) => void) {
    this.host = host; this.onState = onState
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.setClearColor(0xcfc7b7)
    this.renderer.domElement.setAttribute('aria-label', 'Original Ballance course')
    this.host.appendChild(this.renderer.domElement)
    this.scene.add(this.worldGroup, this.ball, new THREE.HemisphereLight(0xffffff, 0x6f6251, 1.8), this.shadowLight, this.shadowLight.target)
    this.shadowLight.castShadow = true; this.shadowLight.shadow.mapSize.set(2048, 2048)
    Object.assign(this.shadowLight.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 })
    this.shadowLight.shadow.bias = -.0003; this.shadowLight.shadow.normalBias = .02
    this.observer = new ResizeObserver(this.resize); this.observer.observe(host); this.resize()
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup)
    window.addEventListener('blur', this.blur); window.addEventListener('pointerdown', this.unlock)
    this.frame = requestAnimationFrame(this.animate)
  }
  async initialize() {
    await (rapierReady ??= RAPIER.init())
    const balls = await loadOriginal('balls'), materials = await this.ballMaterials.create(balls)
    this.flameTexture = await new THREE.TextureLoader().loadAsync('/original/textures/Particle_Flames.png')
    this.flameTexture.colorSpace = THREE.SRGBColorSpace
    if (this.disposed) { this.ballMaterials.dispose(); this.flameTexture?.dispose(); return }
    for (const kind of ['wood', 'stone', 'paper'] as Material[]) {
      const object = balls.objects.find(o => o.name.toLowerCase() === `ball_${kind}`)!
      const source = balls.meshes.find(m => m.id === object.mesh)!
      const mesh = new THREE.Mesh(originalGeometry(source, object.matrix, true), source.materials.map(id => materials.get(id)!))
      mesh.castShadow = true; mesh.receiveShadow = true; this.ballModels.set(kind, mesh)
    }
  }
  start(index = this.state.level) { void this.load(index).catch(error => { if (!this.disposed) { this.loading = false; this.state.phase = 'paused'; this.message(error instanceof Error ? error.message : 'Level could not load'); this.emit() } }) }
  async load(index: number) {
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
    const group = (name: string) => new Set(document.groups.find(g => g.name === name)?.members || [])
    const sector = (id: number) => Number(document.groups.find(g => /^Sector_/.test(g.name) && g.members.includes(id))?.name.slice(-2) || 1)
    const woodSounds = group('Sound_RollID_02'), metalSounds = group('Sound_RollID_03')
    const floors = new Set([...group('Phys_Floors'), ...group('Phys_FloorRails'), ...group('Phys_FloorStopper')])
    const invisible = new Set([...group('DepthTestCubes'), ...group('invisible')])
    const objects = new Map<number, THREE.Mesh>()
    for (const object of document.objects) {
      const source = document.meshes.find(m => m.id === object.mesh)
      if (!source || !source.indices.length || /^(PR_|PS_|PC_|P_Extra_|SkyLayer)/.test(object.name) || invisible.has(object.id)) continue
      // Several original files contain identical transformer instances at the same position.
      if (/^P_Trafo_/.test(object.name) && document.objects.some(o => o.id < object.id && o.name.split('_').slice(0, 3).join('_') === object.name.split('_').slice(0, 3).join('_') && originalPosition(o).distanceTo(originalPosition(object)) < .001)) continue
      const shared = modules.findIndex(m => object.name.toLowerCase().startsWith(m.name + '_'))
      if (shared >= 0) { this.addModule(object, modules[shared]!.document, moduleMaps[shared]!, sector(object.id)); continue }
      const geometry = originalGeometry(source, object.matrix)
      const mesh = new THREE.Mesh(geometry, source.materials.map(id => materials.get(id) || this.fallbackMaterial))
      mesh.name = object.name; mesh.visible = object.visible; mesh.receiveShadow = true
      this.worldGroup.add(mesh); objects.set(object.id, mesh)
      if (floors.has(object.id)) {
        const collider = this.physics.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)), FLOOR_PHYSICS))
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
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(life ? .28 : .18, 1), new THREE.MeshBasicMaterial({ color: life ? 0xc0ebff : 0xffe9a3 }))
      glow.position.copy(pickup.position); this.worldGroup.add(glow); pickup.mesh = glow
    }
    for (const start of triggers('PS_Levelstart')) this.addFlames(start, true)
    // Fire emitters are behavior objects in Virtools, so add their visual effect around the imported gates.
    for (const checkpoint of this.checkpoints) {
      this.addFlames(checkpoint, false)
      const light = new THREE.PointLight(0xbb39ff, 1.5, 4); light.position.copy(checkpoint.position).add(new THREE.Vector3(0, .9, 0)); this.worldGroup.add(light)
    }
    this.state = { phase: 'playing', level: index, lives: 3, time: 500, score: 1000, material: 'wood', checkpoint: 0, speed: 0, message: '' }
    this.checkpointMaterial = 'wood'; this.elapsed = 0; this.yaw = this.targetYaw = Math.PI / 2
    this.body = this.physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setCcdEnabled(true).setCanSleep(false))
    this.transform('wood', false); this.respawn(); this.loading = false; this.last = performance.now(); this.accumulator = 0
    this.audio.paused = false; this.audio.sync(); this.audio.effect('Misc_StartLevel'); this.emit()
  }
  addModule(parent: OriginalObject, document: OriginalDocument, materials: Map<number, THREE.MeshPhongMaterial>, sector: number) {
    for (const object of document.objects) {
      const source = document.meshes.find(m => m.id === object.mesh); if (!source || /Shadow|PE_UFO|PE_Box_slide/.test(object.name)) continue
      const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix)).toArray()
      const ballKind = /^P_Ball_(Wood|Stone|Paper)/.exec(object.name)?.[1]?.toLowerCase() as Material | undefined
      const moving = !!ballKind || /Pusher|Schiebestein|^P_Box_|^P_Dome_|P_Modul_34_Kiste/.test(object.name)
      const geometry = originalGeometry(source, matrix, moving)
      const mesh = new THREE.Mesh(geometry, source.materials.map(id => materials.get(id) || this.fallbackMaterial)); mesh.visible = !/Kollisionsquader/.test(object.name); mesh.castShadow = moving; mesh.receiveShadow = true; this.worldGroup.add(mesh)
      if (moving) {
        const origin = originalPosition({ ...object, matrix }); mesh.position.copy(origin)
        const body = this.physics!.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(origin.x, origin.y, origin.z).setCcdEnabled(true))
        const collider = ballKind && ballKind !== 'paper' ? RAPIER.ColliderDesc.ball(RADIUS) : RAPIER.ColliderDesc.convexHull(geometry.attributes.position!.array as Float32Array)
        const properties = ballKind ? LOOSE_BALL_PHYSICS[ballKind] : object.name.startsWith('P_Dome_') ? DOME_PHYSICS : object.name.includes('Schiebestein') ? { ...CRATE_PHYSICS, mass: 1.6, friction: .5, restitution: .4 } : object.name.includes('P_Modul_34_Kiste') ? { ...CRATE_PHYSICS, mass: 1.4, friction: .8, restitution: .4 } : object.name.includes('Pusher') ? { ...CRATE_PHYSICS, mass: 3, friction: .6, restitution: .4, angularDamping: 1 } : CRATE_PHYSICS
        configureBody(body, properties)
        if (collider) this.physics!.createCollider(configureContact(collider.setMass(properties.mass), properties), body)
        this.dynamics.push({ mesh, body, origin, sector })
      } else this.physics!.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(geometry.attributes.position!.array as Float32Array, Uint32Array.from(geometry.index!.array)), FLOOR_PHYSICS))
    }
  }
  addFlames(trigger: Trigger, start: boolean) {
    if (!this.flameTexture) return
    const offsets = start ? [[-7.26, 1.5, -6.14], [7.287, 1.5, -6.114], [-7.26, 1.5, 6.09], [7.287, 1.5, 6.114]] : [[.043, 1.5, -6.946], [.043, 1.5, 7.054]]
    const origins = offsets.map(offset => {
      const point = new THREE.Vector3(...offset).applyMatrix4(new THREE.Matrix4().fromArray(trigger.object.matrix)); point.multiplyScalar(SCALE); point.z *= -1; return point
    })
    const flames = new OriginalFlames(origins, this.flameTexture); this.flames.push(flames); this.worldGroup.add(flames.points)
  }
  transform(kind: Material, sound = true) {
    if (!this.body) return
    this.state.material = kind; this.ball.clear(); const model = this.ballModels.get(kind); if (model) this.ball.add(model)
    const properties = PLAYER_PHYSICS[kind]
    if (this.body.numColliders()) this.physics!.removeCollider(this.body.collider(0), true)
    const vertices = model?.geometry.attributes.position?.array as Float32Array | undefined
    const collider = kind === 'paper' && vertices ? RAPIER.ColliderDesc.convexHull(vertices)! : RAPIER.ColliderDesc.ball(RADIUS)
    this.physics!.createCollider(configureContact(collider.setMass(properties.mass), properties), this.body)
    this.body.recomputeMassPropertiesFromColliders(); configureBody(this.body, properties)
    if (sound) this.audio.effect('Misc_Trafo')
  }
  respawn() {
    if (!this.body || !this.resets.length) return
    const point = originalPosition(this.resets[this.state.checkpoint] || this.resets[0]!)
    this.body.setTranslation(point, true); this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true); this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.transform(this.checkpointMaterial, false); this.follow.copy(point); this.ball.position.copy(point)
    for (const item of this.dynamics.filter(d => d.sector === this.state.checkpoint + 1)) { item.body.setTranslation(item.origin, true); item.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true); item.body.setLinvel({ x: 0, y: 0, z: 0 }, true); item.body.setAngvel({ x: 0, y: 0, z: 0 }, true) }
    for (const pickup of this.pickups) if (pickup.sector === this.state.checkpoint + 1 && pickup.object.name.includes('Life')) { pickup.taken = false; if (pickup.mesh) pickup.mesh.visible = true }
    for (const particle of this.pendingPoints) this.worldGroup.remove(particle.mesh)
    this.pendingPoints = []
    this.padCooldown = this.elapsed + 1
  }
  step(dt: number) {
    if (!this.physics || !this.body) return
    this.elapsed += dt; this.state.time = Math.max(0, this.state.time - dt)
    if (!this.state.time) { this.state.phase = 'lost'; this.audio.paused = true; this.audio.sync(); return }
    let x = Number(this.keys.has('arrowright') || this.keys.has('d')) - Number(this.keys.has('arrowleft') || this.keys.has('a')) + this.touch.x
    let z = Number(this.keys.has('arrowdown') || this.keys.has('s')) - Number(this.keys.has('arrowup') || this.keys.has('w')) + this.touch.z
    if (this.keys.has('shift')) { x = 0; z = 0 }
    // Original arrow keys create independent axis controllers, including diagonal input.
    x = THREE.MathUtils.clamp(x, -1, 1); z = THREE.MathUtils.clamp(z, -1, 1)
    const dx = x * Math.cos(this.yaw) + z * Math.sin(this.yaw), dz = z * Math.cos(this.yaw) - x * Math.sin(this.yaw)
    const p = this.body.translation()
    const hit = this.physics.castShape(p, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(RADIUS - .02), 0, .15, true, undefined, undefined, undefined, this.body)
    const grounded = !!hit
    // Original force controllers remain active in the air; contact friction supplies rolling torque.
    driveBall(this.body, this.state.material, dx, dz, dt, this.settings.sensitivity)
    this.physics.timestep = dt
    this.physics.step()
    const position = this.body.translation(), velocity = this.body.linvel()
    this.state.speed = Math.hypot(velocity.x, velocity.z)
    for (const pickup of this.pickups) if (!pickup.taken && pickup.position.distanceTo(new THREE.Vector3(position.x, position.y, position.z)) < 1.05) {
      pickup.taken = true; if (pickup.mesh) pickup.mesh.visible = false
      if (pickup.object.name.includes('Life')) { this.state.lives++; this.audio.effect('Misc_extraball') } else {
        for (let i = 0; i < 22; i++) { const mesh = new THREE.Mesh(this.particleGeometry, this.particleMaterial); mesh.position.copy(pickup.position).add(new THREE.Vector3(Math.sin(i * 2.4) * .9, i / 22 + .2, Math.cos(i * 2.4) * .9)); this.worldGroup.add(mesh); this.pendingPoints.push({ mesh, age: -i * .035 }) }
        this.audio.effect('Extra_Hit')
      }
    }
    const playerPosition = new THREE.Vector3(position.x, position.y, position.z)
    this.pendingPoints = this.pendingPoints.filter(p => {
      p.age += dt
      if (p.age > .25) p.mesh.position.lerp(playerPosition, 1 - Math.exp(-dt * 3))
      if (p.age > .4 && p.mesh.position.distanceTo(playerPosition) < .4) { this.state.time += 5; this.worldGroup.remove(p.mesh); return false }
      return true
    })
    this.state.score = Math.floor(this.state.time * 2)
    for (const pad of this.pads) {
      const distance = Math.hypot(position.x - pad.position.x, position.z - pad.position.z)
      if (distance < 1.2 && position.y > pad.position.y && position.y - pad.position.y < 1.6 && this.elapsed > this.padCooldown) {
        const kind = /Stone/.test(pad.object.name) ? 'stone' : /Paper/.test(pad.object.name) ? 'paper' : 'wood'
        if (this.state.material !== kind) { this.transform(kind); this.padCooldown = this.elapsed + 1.2 }
      }
    }
    const checkpoint = this.checkpoints[this.state.checkpoint]
    if (checkpoint && Math.hypot(position.x - checkpoint.position.x, position.z - checkpoint.position.z) < 1.6 && Math.abs(position.y - checkpoint.position.y - RADIUS) < 2) {
      for (const particle of this.pendingPoints) this.worldGroup.remove(particle.mesh)
      this.pendingPoints = []
      this.state.checkpoint++; this.checkpointMaterial = this.state.material; this.audio.effect('Misc_Checkpoint'); this.message('Checkpoint')
    }
    if (this.finish && Math.hypot(position.x - this.finish.position.x, position.z - this.finish.position.z) < 3 && Math.abs(position.y - this.finish.position.y) < 3 && this.state.checkpoint === this.checkpoints.length) {
      this.state.score = (this.state.level + 1) * 100 + Math.floor(this.state.time * 2) + this.state.lives * 200
      this.state.phase = 'won'; this.audio.paused = true; this.audio.sync(); this.audio.effect('Music_EndCheckpoint')
    }
    const reset = this.resets[this.state.checkpoint] || this.resets[0]
    if (reset && position.y < originalPosition(reset).y - 22) {
      this.audio.effect('Misc_Fall')
      if (this.state.lives <= 0) { this.state.phase = 'lost'; this.audio.paused = true; this.audio.sync() } else { this.state.lives--; this.respawn() }
    }
    this.audio.roll(this.state.material, this.state.speed, grounded, hit ? this.surfaceSounds.get(hit.collider.handle) : 'Stone')
  }
  animate = (now: number) => {
    if (this.disposed) return
    const dt = Math.min((now - (this.last || now)) / 1000, .05); this.last = now
    if (!this.loading && this.state.phase === 'playing') {
      this.accumulator += dt
      while (this.accumulator >= PHYSICS_STEP && this.state.phase === 'playing') { this.step(PHYSICS_STEP); this.accumulator -= PHYSICS_STEP }
    }
    if (this.body) {
      const p = this.body.translation(); this.ball.position.set(p.x, p.y, p.z); this.ball.quaternion.copy(this.body.rotation())
      for (const item of this.dynamics) { item.mesh.position.copy(item.body.translation()); item.mesh.quaternion.copy(item.body.rotation()) }
      this.follow.lerp(this.ball.position, 1 - Math.exp(-dt * 8)); this.yaw += (this.targetYaw - this.yaw) * (1 - Math.exp(-dt * 9))
      const high = this.keys.has(' ') || this.touch.brake
      this.camera.position.copy(this.follow).add(new THREE.Vector3(Math.sin(this.yaw) * (high ? 8 : 13), high ? 22 : 13, Math.cos(this.yaw) * (high ? 8 : 13)))
      this.camera.lookAt(this.follow.clone().add(new THREE.Vector3(0, .25, 0)))
      this.shadowLight.position.copy(this.follow).add(new THREE.Vector3(-20, 40, 15)); this.shadowLight.target.position.copy(this.follow)
    }
    for (const flames of this.flames) flames.update(this.elapsed, this.renderer.domElement.height, this.camera.fov)
    for (const pickup of this.pickups) if (!pickup.taken && pickup.mesh) { pickup.mesh.rotation.y = this.elapsed; pickup.mesh.position.y = pickup.position.y + Math.sin(this.elapsed * 2.5) * .1 }
    if (this.state.message && now > this.messageUntil && !this.loading) this.state.message = ''
    this.renderer.render(this.scene, this.camera)
    if (now - this.emitAt > 100) { this.emitAt = now; this.emit() }
    this.frame = requestAnimationFrame(this.animate)
  }
  pause() { if (this.loading) return; if (this.state.phase === 'playing') this.state.phase = 'paused'; else if (this.state.phase === 'paused') this.state.phase = 'playing'; this.keys.clear(); this.audio.paused = this.state.phase !== 'playing'; this.audio.sync(); this.emit() }
  message(text: string) { this.state.message = text; this.messageUntil = performance.now() + 3000; this.emit() }
  emit() { this.onState({ ...this.state }) }
  setSettings(settings: Settings) { this.settings = settings; this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality ? 2 : 1)); this.renderer.shadowMap.enabled = settings.quality; this.audio.enabled = settings.sound; this.audio.sync() }
  unlock = () => { this.audio.unlock() }
  keydown = (event: KeyboardEvent) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName)) return
    const key = event.key.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault()
    this.audio.unlock(); this.keys.add(key)
    if (event.repeat) return
    if (key === 'escape') this.pause()
    if (key === 'r') this.start()
    if (key === 'q' || (event.shiftKey && key === 'arrowleft')) this.targetYaw += Math.PI / 2
    if (key === 'e' || (event.shiftKey && key === 'arrowright')) this.targetYaw -= Math.PI / 2
  }
  keyup = (event: KeyboardEvent) => { this.keys.delete(event.key.toLowerCase()) }
  blur = () => { this.keys.clear(); if (this.state.phase === 'playing') this.pause() }
  resize = () => { const w = this.host.clientWidth, h = this.host.clientHeight; this.camera.aspect = w / Math.max(h, 1); this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h) }
  clearLevel() {
    this.body = undefined; this.surfaceSounds.clear(); this.physics?.free(); this.physics = undefined
    this.worldGroup.traverse(object => { if (object instanceof THREE.Mesh) { if (object.geometry !== this.particleGeometry) object.geometry.dispose(); if (object.material !== this.particleMaterial && object.material instanceof THREE.MeshBasicMaterial) object.material.dispose() } })
    this.worldGroup.clear(); this.flames.forEach(f => f.dispose()); this.flames = []; this.pendingPoints = []; this.moduleMaterials.forEach(m => m.dispose()); this.moduleMaterials = []; this.materials.dispose(); this.sky?.dispose(); this.dynamics = []; this.pickups = []; this.checkpoints = []; this.pads = []
  }
  destroy() {
    this.disposed = true; this.generation++; cancelAnimationFrame(this.frame); this.observer.disconnect()
    window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); window.removeEventListener('pointerdown', this.unlock)
    this.clearLevel(); this.ballModels.forEach(m => m.geometry.dispose()); this.ballMaterials.dispose(); this.flameTexture?.dispose(); this.audio.dispose(); this.fallbackMaterial.dispose(); this.particleGeometry.dispose(); this.particleMaterial.dispose(); this.shadowLight.shadow.dispose(); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
