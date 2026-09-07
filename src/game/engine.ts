import * as THREE from 'three'
import { levels } from './levels.ts'
import type { Material, Point } from './levels.ts'
import { RADIUS, stepBall } from './physics.ts'
import { bridgeSpans } from './geometry.ts'
import type { Ball } from './physics.ts'
export type Phase = 'menu' | 'playing' | 'paused' | 'won' | 'lost'
export type GameState = { phase: Phase; level: number; lives: number; time: number; score: number; material: Material; checkpoint: number; speed: number; message: string }
export type Settings = { sound: boolean; quality: boolean; sensitivity: number }
const colors = { wood: '#bb7841', stone: '#8b9291', paper: '#eee5d1' }

function texture(kind: 'wood' | 'stone' | 'paper' | 'tile') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
  const c = canvas.getContext('2d')!
  let seed = 412
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  c.fillStyle = kind === 'wood' ? '#a77549' : kind === 'paper' ? '#e6ddc7' : kind === 'tile' ? '#c1b6a0' : '#92948a'
  c.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 6000; i++) {
    c.fillStyle = `rgba(${random() > 0.5 ? '255,245,220' : '45,31,17'},${random() * 0.14})`
    const x = random() * 256, y = random() * 256
    c.fillRect(x, y, kind === 'wood' ? random() * 70 : random() * 4 + 1, 1 + random() * 3)
  }
  if (kind === 'wood') {
    for (let i = 0; i < 28; i++) {
      c.strokeStyle = `rgba(60,31,12,${0.12 + random() * 0.22})`; c.lineWidth = random() * 2 + 0.3; c.beginPath()
      for (let x = 0; x <= 256; x += 4) {
        const y = i * 10 + Math.sin(x * 0.025 + i) * 6 + Math.sin(x * 0.06) * 2
        if (!x) c.moveTo(x, y); else c.lineTo(x, y)
      }
      c.stroke()
    }
  }
  if (kind === 'tile') {
    c.strokeStyle = '#938a77'; c.lineWidth = 2
    for (let y = 0; y <= 256; y += 64) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(256, y); c.stroke()
      for (let x = (y / 64 % 2) * 64; x < 256; x += 128) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 64); c.stroke() }
    }
  }
  if (kind === 'paper') {
    c.strokeStyle = '#c4baa4'; c.lineWidth = 0.5
    for (let i = 0; i < 22; i++) { c.beginPath(); c.moveTo(random() * 256, random() * 256); c.lineTo(random() * 256, random() * 256); c.stroke() }
  }
  const result = new THREE.CanvasTexture(canvas); result.colorSpace = THREE.SRGBColorSpace
  result.wrapS = result.wrapT = THREE.RepeatWrapping; result.anisotropy = 4
  return result
}

export class GameEngine {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
  world = new THREE.Group()
  scenery = new THREE.Group()
  clouds: THREE.Sprite[] = []
  skyTexture?: THREE.Texture
  disposed = false
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 40, 28))
  ball: Ball = { x: 0, y: RADIUS, z: 6, vx: 0, vy: 0, vz: 0, material: 'wood', grounded: true }
  state: GameState = { phase: 'menu', level: 0, lives: 5, time: 240, score: 0, material: 'wood', checkpoint: 0, speed: 0, message: '' }
  settings: Settings = { sound: false, quality: true, sensitivity: 1 }
  keys = new Set<string>()
  touch = { x: 0, z: 0, brake: false }
  broken = new Set<number>()
  coins: THREE.Mesh[] = []
  pads: THREE.Group[] = []
  checkpoints: THREE.Group[] = []
  surfaceGroups: THREE.Group[] = []
  crates: { mesh: THREE.Mesh; x: number; z: number; y: number; gone: boolean }[] = []
  fans: THREE.Group[] = []
  goal = new THREE.Group()
  materials: Record<Material, THREE.MeshStandardMaterial>
  maps: THREE.Texture[] = []
  observer: ResizeObserver
  frame = 0
  last = 0
  accumulator = 0
  elapsed = 0
  lastEmit = 0
  messageUntil = 0
  checkpointMaterial: Material = 'wood'
  fanCooldown = 0
  angle = 0
  desiredAngle = 0
  audio?: AudioContext
  mutedGain?: GainNode
  ambient?: OscillatorNode
  onState: (state: GameState) => void
  host: HTMLElement
  constructor(host: HTMLElement, onState: (state: GameState) => void) {
    this.host = host; this.onState = onState
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap; this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.setAttribute('aria-label', 'Three-dimensional floating Ballance course')
    host.appendChild(this.renderer.domElement)
    this.scene.background = new THREE.Color('#e7ddc9'); this.scene.fog = new THREE.FogExp2('#e7ddc9', 0.008)
    this.scene.add(new THREE.HemisphereLight('#fff9e9', '#81745b', 2))
    const sun = new THREE.DirectionalLight('#fff2ce', 2.8); sun.position.set(-25, 45, 18)
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 45, bottom: -45, near: 0.5, far: 130 })
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.025; sun.target.position.set(0, 0, -12)
    this.scene.add(sun, sun.target)
    const wood = texture('wood'), stone = texture('stone'), paper = texture('paper')
    this.maps.push(wood, stone, paper)
    this.materials = { wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.43, metalness: 0.08 }), stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.92 }), paper: new THREE.MeshStandardMaterial({ map: paper, roughness: 1, flatShading: true }) }
    this.ballMesh.material = this.materials.wood; this.ballMesh.castShadow = true; this.ballMesh.receiveShadow = true
    this.scene.add(this.world, this.ballMesh, this.scenery)
    this.createAtmosphere()
    this.camera.position.set(37, 34, 44)
    this.load(0)
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host); this.resize()
    window.addEventListener('keydown', this.keydown); window.addEventListener('keyup', this.keyup)
    window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.visibility)
    this.frame = requestAnimationFrame(this.animate)
  }
  createAtmosphere() {
    const sky = document.createElement('canvas'); sky.width = sky.height = 512
    const skyContext = sky.getContext('2d')!, pixels = skyContext.createImageData(512, 512)
    const hash = (x: number, y: number) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v) }
    const noise = (x: number, y: number) => {
      const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy)
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), u), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v)
    }
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const n = noise(x / 100, y / 45) * 0.6 + noise(x / 45, y / 20) * 0.25 + noise(x / 20, y / 10) * 0.15
      const cloud = THREE.MathUtils.smoothstep(n, 0.38, 0.75) * (0.3 + y / 730)
      const base = [213 + y / 512 * 14, 207 + y / 512 * 10, 185 + y / 512 * 12]
      const i = (y * 512 + x) * 4
      for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] = THREE.MathUtils.lerp(base[channel]!, [250, 244, 226][channel]!, cloud)
      pixels.data[i + 3] = 255
    }
    skyContext.putImageData(pixels, 0, 0)
    const skyMap = new THREE.CanvasTexture(sky); skyMap.colorSpace = THREE.SRGBColorSpace; this.maps.push(skyMap); this.scene.background = skyMap
    new THREE.TextureLoader().load('/textures/cloudscape.jpg', map => {
      if (this.disposed) { map.dispose(); return }
      map.colorSpace = THREE.SRGBColorSpace; this.maps.push(map); this.skyTexture = map
      this.scene.background = map; this.resize()
    }, undefined, () => { /* Procedural sky remains available if the texture fails. */ })
    const c = document.createElement('canvas'); c.width = c.height = 128
    const ctx = c.getContext('2d')!, grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,252,237,.6)'); grad.addColorStop(0.45, 'rgba(255,252,237,.3)'); grad.addColorStop(1, 'rgba(255,252,237,0)')
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128)
    const map = new THREE.CanvasTexture(c); this.maps.push(map)
    for (let i = 0; i < 65; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0.22, depthWrite: false }))
      const a = i * 2.39996, r = 25 + i * 1.4
      sprite.position.set(Math.cos(a) * r, -12 - (i % 7) * 3, Math.sin(a) * r - 15)
      sprite.scale.set(35 + i % 5 * 12, 12 + i % 4 * 6, 1); sprite.userData.baseX = sprite.position.x; this.clouds.push(sprite); this.scenery.add(sprite)
    }
    // Distant islands give the cloud ocean depth and parallax as the camera follows the ball.
    const rockMaterial = new THREE.MeshStandardMaterial({ color: '#827f72', roughness: 1, flatShading: true })
    const capMaterial = new THREE.MeshStandardMaterial({ color: '#9c9c80', roughness: 1, flatShading: true })
    for (let i = 0; i < 9; i++) {
      const island = new THREE.Group(), side = i % 2 ? 1 : -1
      island.position.set(side * (32 + i * 5), -13 - (i % 3) * 5, -18 - i * 12)
      const radius = 3.5 + i % 3 * 1.7, height = 8 + i % 4 * 3
      const geometry = new THREE.CylinderGeometry(radius, 0.2, height, 7, 3)
      const points = geometry.getAttribute('position')
      for (let j = 0; j < points.count; j++) {
        const x = points.getX(j), y = points.getY(j), z = points.getZ(j)
        const wobble = 1 + Math.sin(y * 3.1 + x * 2.3 + z * 4.1) * 0.13
        points.setXYZ(j, x * wobble, y, z * wobble)
      }
      geometry.computeVertexNormals()
      const rock = new THREE.Mesh(geometry, rockMaterial); rock.position.y = -height / 2; island.add(rock)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius, 0.45, 7), capMaterial); island.add(cap)
      if (i % 3 === 0) for (let j = 0; j < 3; j++) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.5 + j * 0.7, 0.45), rockMaterial)
        pillar.position.set(Math.sin(j * 2) * 2, 1.2 + j * 0.35, Math.cos(j * 2) * 2); island.add(pillar)
      }
      island.rotation.y = i * 1.2; this.scenery.add(island)
    }
    const motes = new Float32Array(240 * 3)
    for (let i = 0; i < 240; i++) { motes[i * 3] = Math.sin(i * 74) * 55; motes[i * 3 + 1] = Math.cos(i * 43) * 15; motes[i * 3 + 2] = Math.sin(i * 21) * 65 - 20 }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(motes, 3))
    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.06, color: '#fff8de', transparent: true, opacity: 0.65 })))
  }
  box(group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh
  }
  ring(point: Point, color: string, radius = 1) {
    const group = new THREE.Group(); group.position.set(point.x, point.y + 0.045, point.z)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 8, 64), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.4 }))
    ring.rotation.x = -Math.PI / 2; group.add(ring)
    const inner = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false }))
    inner.rotation.x = -Math.PI / 2; group.add(inner); return group
  }
  disposeWorld() {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), maps = new Set<THREE.Texture>()
    this.world.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!Object.values(this.materials).includes(m)) { materials.add(m); if (m.map && !this.maps.includes(m.map)) maps.add(m.map) } } } })
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); maps.forEach(m => m.dispose()); this.world.clear()
  }
  load(index: number) {
    this.disposeWorld(); this.coins = []; this.pads = []; this.checkpoints = []; this.surfaceGroups = []; this.crates = []; this.fans = []; this.broken.clear()
    const level = levels[index]; this.state = { ...this.state, level: index, time: level.time, score: 0, lives: 5, checkpoint: 0, material: 'wood', speed: 0, message: '' }
    this.checkpointMaterial = 'wood'; this.fanCooldown = 0; this.angle = this.desiredAngle = 0
    const tileMap = texture('tile')
    const tile = new THREE.MeshStandardMaterial({ map: tileMap, roughness: 0.88 })
    const edge = new THREE.MeshStandardMaterial({ color: '#756e5c', roughness: 0.9 })
    const metal = new THREE.MeshStandardMaterial({ color: '#82715a', roughness: 0.34, metalness: 0.75 })
    const timber = this.materials.wood
    level.surfaces.forEach(s => {
      const group = new THREE.Group(); group.position.set(s.x, s.y, s.z)
      if (s.endY !== undefined) {
        group.position.y = (s.y + s.endY) / 2
        if (s.axis === 'z') group.rotation.x = Math.atan2(s.endY - s.y, s.d)
        else group.rotation.z = Math.atan2(s.endY - s.y, s.w)
      }
      const w = s.endY !== undefined && s.axis === 'x' ? Math.hypot(s.w, s.endY - s.y) : s.w
      const d = s.endY !== undefined && s.axis === 'z' ? Math.hypot(s.d, s.endY - s.y) : s.d
      if (s.kind === 'rail') {
        const alongX = w > d, length = alongX ? w : d, spread = (alongX ? d : w) * 0.27
        for (const sign of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, length, 12), metal)
          if (alongX) { rail.rotation.z = Math.PI / 2; rail.position.z = sign * spread } else { rail.rotation.x = Math.PI / 2; rail.position.x = sign * spread }
          rail.position.y = -0.06; rail.castShadow = true; group.add(rail)
        }
        for (let p = -length / 2 + 0.5; p < length / 2; p += 1.4) this.box(group, alongX ? 0.14 : spread * 2 + 0.4, 0.13, alongX ? spread * 2 + 0.4 : 0.14, alongX ? p : 0, -0.19, alongX ? 0 : p, metal)
      } else if (s.kind === 'wood' || s.kind === 'fragile') {
        const alongX = w > d, length = alongX ? w : d, count = Math.ceil(length / 0.48)
        const visibleSpans = bridgeSpans(s, level.surfaces), thickness = s.kind === 'fragile' ? 0.10 : 0.22
        for (let i = 0; i < count; i++) {
          const plankStart = -length / 2 + i * length / count + 0.0175
          const plankEnd = -length / 2 + (i + 1) * length / count - 0.0175
          for (const [spanStart, spanEnd] of visibleSpans) {
            const start = Math.max(plankStart, spanStart), end = Math.min(plankEnd, spanEnd)
            if (end - start < 0.001) continue
            const middle = (start + end) / 2
            this.box(group, alongX ? end - start : w, thickness, alongX ? d : end - start, alongX ? middle : 0, -thickness / 2, alongX ? 0 : middle, timber)
          }
        }
        for (const sign of [-1, 1]) this.box(group, alongX ? w : 0.12, 0.22, alongX ? 0.12 : d, alongX ? 0 : sign * (w / 2 - 0.13), -0.3, alongX ? sign * (d / 2 - 0.13) : 0, metal)
      } else {
        const map = tileMap.clone(); map.repeat.set(w / 3, d / 3); map.needsUpdate = true
        this.box(group, w, 0.48, d, 0, -0.24, 0, new THREE.MeshStandardMaterial({ map, roughness: 0.88 }))
        this.box(group, w + 0.12, 0.10, d + 0.12, 0, -0.46, 0, edge)
        this.box(group, w * 0.74, 0.22, d * 0.74, 0, -0.62, 0, edge)
        for (const x of [-1, 1]) for (const z of [-1, 1]) {
          this.box(group, 0.16, 0.055, 0.16, x * (w / 2 - 0.25), 0.025, z * (d / 2 - 0.25), metal)
        }
      }
      this.surfaceGroups.push(group); this.world.add(group)
    })
    // The first map only supplies clones on stone platforms.
    tile.dispose(); tileMap.dispose()
    level.coins.forEach(p => {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.23), new THREE.MeshStandardMaterial({ color: '#f7bb53', emissive: '#d99831', emissiveIntensity: 0.75, metalness: 0.65, roughness: 0.2 }))
      mesh.position.set(p.x, p.y + 1, p.z); this.coins.push(mesh); this.world.add(mesh)
    })
    level.checkpoints.forEach(p => { const ring = this.ring(p, '#bc8c48', 1.2); this.checkpoints.push(ring); this.world.add(ring) })
    level.pads.forEach(p => {
      const group = this.ring(p, colors[p.material], 1.05)
      const symbol = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, p.material === 'paper' ? 0 : 2), this.materials[p.material]); symbol.position.y = 1.9; group.add(symbol)
      for (const sign of [-1, 1]) this.box(group, 0.12, 0.55, 0.12, sign * 1, 0.25, 0, metal)
      this.pads.push(group); this.world.add(group)
    })
    level.crates.forEach(p => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 1.1), timber); mesh.position.set(p.x, p.y + 0.7, p.z); mesh.castShadow = true; this.world.add(mesh)
      const frame = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#493826' })); mesh.add(frame)
      this.crates.push({ mesh, ...p, gone: false })
    })
    level.fans.forEach(p => {
      const group = this.ring(p, '#8faaa0', 0.85)
      for (let i = 0; i < 4; i++) { const blade = this.box(group, 0.2, 0.05, 1.5, 0, 0.06, 0, metal); blade.rotation.y = i * Math.PI / 4 }
      for (let i = 0; i < 8; i++) {
        const streak = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), new THREE.MeshBasicMaterial({ color: '#d6e4d6', transparent: true, opacity: 0.6 }))
        streak.position.set(Math.sin(i * 3) * 0.65, 0.8 + i * 0.25, Math.cos(i * 3) * 0.65); group.add(streak)
      }
      this.fans.push(group); this.world.add(group)
    })
    this.goal = this.ring(level.finish, '#c59a56', 1.65)
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.10, 12, 64), metal); arch.position.y = 1.6; this.goal.add(arch)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.35, 48), new THREE.MeshBasicMaterial({ color: '#e7c17f', transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false })); glow.position.y = 1.6; this.goal.add(glow)
    for (const sign of [-1, 1]) { this.box(this.goal, 0.36, 2.4, 0.36, sign * 2, 1.2, 0, edge); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffdfa0' })); orb.position.set(sign * 2, 2.6, 0); this.goal.add(orb) }
    this.world.add(this.goal)
    this.respawn(); this.emit()
  }
  respawn() {
    const l = levels[this.state.level], p = this.state.checkpoint ? l.checkpoints[this.state.checkpoint - 1]! : l.start
    this.ball = { ...p, y: p.y + RADIUS, vx: 0, vy: 0, vz: 0, material: this.checkpointMaterial, grounded: true }
    this.changeMaterial(this.checkpointMaterial, false)
    this.broken.clear(); this.surfaceGroups.forEach(g => { g.visible = true })
    this.crates.forEach((crate, i) => { Object.assign(crate, l.crates[i], { gone: false }); crate.mesh.position.set(crate.x, crate.y + 0.7, crate.z); crate.mesh.visible = true })
    this.fanCooldown = 0; this.syncBall()
  }
  changeMaterial(material: Material, notify = true) {
    this.ball.material = material; this.state.material = material; this.ballMesh.material = this.materials[material]
    if (notify) { this.message(material === 'stone' ? 'Stone' : material === 'paper' ? 'Paper' : 'Wood'); this.tone(440, 0.18) }
  }
  start(index = this.state.level) { this.load(index); this.state.phase = 'playing'; this.keys.clear(); this.state.message = ''; this.enableAudio(); this.emit() }
  menu(index = this.state.level) { this.state.phase = 'menu'; this.load(index); this.emit() }
  pause() { if (this.state.phase === 'playing') this.state.phase = 'paused'; else if (this.state.phase === 'paused') this.state.phase = 'playing'; this.keys.clear(); this.touch = { x: 0, z: 0, brake: false }; this.emit() }
  message(text: string) { this.state.message = text; this.messageUntil = this.elapsed + 4; this.emit() }
  emit() { this.onState({ ...this.state }) }
  enableAudio() {
    if (!this.settings.sound) return
    this.audio ??= new AudioContext(); void this.audio.resume()
    if (!this.ambient) {
      this.mutedGain = this.audio.createGain(); this.mutedGain.gain.value = 0.012; this.mutedGain.connect(this.audio.destination)
      this.ambient = this.audio.createOscillator(); this.ambient.type = 'sine'; this.ambient.frequency.value = 130.81; this.ambient.connect(this.mutedGain); this.ambient.start()
    }
    if (this.mutedGain) this.mutedGain.gain.value = 0.012
  }
  setSettings(settings: Settings) {
    this.settings = settings; this.renderer.setPixelRatio(Math.min(devicePixelRatio, settings.quality ? 2 : 1)); this.renderer.shadowMap.enabled = settings.quality; this.resize()
    if (settings.sound) this.enableAudio(); else if (this.mutedGain) this.mutedGain.gain.value = 0
  }
  tone(frequency: number, duration: number) {
    if (!this.settings.sound || !this.audio) return
    const oscillator = this.audio.createOscillator(), gain = this.audio.createGain(), now = this.audio.currentTime
    oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.045, now); gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(now + duration)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }
  keydown = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).matches('input, select, textarea')) return
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
    if (e.repeat) return
    this.keys.add(e.code)
    if (e.code === 'Escape' || e.code === 'KeyP') this.pause()
    if (e.code === 'KeyR' && ['playing', 'paused', 'lost'].includes(this.state.phase)) this.start()
    if (e.code === 'KeyQ') this.desiredAngle -= Math.PI / 2
    if (e.code === 'KeyE') this.desiredAngle += Math.PI / 2
  }
  keyup = (e: KeyboardEvent) => { this.keys.delete(e.code) }
  blur = () => { this.keys.clear(); if (this.state.phase === 'playing') this.pause() }
  visibility = () => { if (document.hidden) this.blur() }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.host
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h)
    if (this.skyTexture) {
      const image = this.skyTexture.image as HTMLImageElement
      const ratio = image.width / image.height, aspect = w / h
      this.skyTexture.repeat.set(Math.min(1, aspect / ratio), Math.min(1, ratio / aspect))
      this.skyTexture.offset.set((1 - this.skyTexture.repeat.x) / 2, (1 - this.skyTexture.repeat.y) / 2)
    }
  }
  syncBall() { this.ballMesh.position.set(this.ball.x, this.ball.y, this.ball.z) }
  update(dt: number) {
    const level = levels[this.state.level], ball = this.ball
    this.state.time = Math.max(0, this.state.time - dt)
    if (this.state.time <= 0) { this.state.phase = 'lost'; this.message('Time’s up'); return }
    let x = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA')) + this.touch.x
    let z = Number(this.keys.has('ArrowDown') || this.keys.has('KeyS')) - Number(this.keys.has('ArrowUp') || this.keys.has('KeyW')) + this.touch.z
    const cos = Math.cos(this.angle), sin = Math.sin(this.angle), sx = x
    x = sx * cos + z * sin; z = -sx * sin + z * cos
    const oldX = ball.x, oldZ = ball.z
    const surface = stepBall(ball, level, { x, z, brake: this.keys.has('Space') || this.touch.brake, strength: this.settings.sensitivity }, this.broken, dt)
    if (surface >= 0 && level.surfaces[surface]!.kind === 'fragile' && ball.material !== 'paper' && ball.grounded) {
      this.broken.add(surface); this.surfaceGroups[surface]!.visible = false; ball.grounded = false
      this.message('Too heavy. Transform into paper before the bridge.'); this.tone(110, 0.3)
    }
    this.crates.forEach(crate => {
      if (crate.gone) return
      if (Math.abs(ball.x - crate.x) < 1.3 + RADIUS && Math.abs(ball.z - crate.z) < 0.55 + RADIUS && Math.abs(ball.y - (crate.y + RADIUS)) < 1) {
        if (ball.material === 'stone') {
          crate.x += ball.vx * dt * 0.85; crate.z += ball.vz * dt * 0.85
          ball.vx *= 0.99; ball.vz *= 0.99
          if (Math.abs(crate.z - level.crates[0]!.z) > 2.6 || Math.abs(crate.x - level.crates[0]!.x) > 2.6) { crate.gone = true; crate.mesh.visible = false; this.message('Path cleared'); this.tone(220, 0.25) }
          crate.mesh.position.set(crate.x, crate.y + 0.7, crate.z)
        } else { ball.x = oldX; ball.z = oldZ; ball.vx *= -0.15; ball.vz *= -0.15; if (this.state.message !== 'This obstacle needs a stone ball.') this.message('This obstacle needs a stone ball.') }
      }
    })
    level.pads.forEach(p => { if (Math.hypot(ball.x - p.x, ball.z - p.z) < 0.85 && Math.abs(ball.y - p.y - RADIUS) < 0.4 && ball.material !== p.material) this.changeMaterial(p.material) })
    level.checkpoints.forEach((p, i) => {
      if (i + 1 > this.state.checkpoint && Math.hypot(ball.x - p.x, ball.z - p.z) < 1.5 && Math.abs(ball.y - p.y - RADIUS) < 0.4) {
        this.state.checkpoint = i + 1; this.checkpointMaterial = ball.material; this.state.score += 100; this.message('Checkpoint saved'); this.tone(660, 0.25)
      }
    })
    this.coins.forEach(coin => {
      if (coin.visible && coin.position.distanceTo(this.ballMesh.position) < 1) { coin.visible = false; this.state.score += 50; this.state.time += 10; this.tone(880, 0.18); this.message('+50 points · +10 seconds') }
    })
    this.fanCooldown = Math.max(0, this.fanCooldown - dt)
    level.fans.forEach(p => {
      if (Math.hypot(ball.x - p.x, ball.z - p.z) < 1 && ball.grounded && this.fanCooldown === 0) {
        if (ball.material === 'paper') { ball.vy = 8; ball.vz = -5.3; ball.grounded = false; this.fanCooldown = 2; this.message('Updraft'); this.tone(550, 0.5) }
        else if (this.state.message !== 'Only paper can ride the updraft.') this.message('Only paper can ride the updraft.')
      }
    })
    if (ball.y < -14) {
      this.state.lives -= 1; this.tone(150, 0.4)
      if (this.state.lives <= 0) { this.state.phase = 'lost'; this.emit() }
      else { this.respawn(); this.message('Checkpoint restored') }
    }
    const finish = level.finish
    if (Math.hypot(ball.x - finish.x, ball.z - finish.z) < 1.4 && Math.abs(ball.y - finish.y - RADIUS) < 0.5) {
      if (ball.material === 'wood') { this.state.phase = 'won'; this.state.score += Math.floor(this.state.time) * 5; this.tone(1046, 0.7); this.emit() }
      else if (this.state.message !== 'Return to wood before entering the portal.') this.message('Return to wood before entering the portal.')
    }
    const movement = new THREE.Vector3(ball.x - oldX, 0, ball.z - oldZ)
    if (movement.lengthSq() > 0) { const axis = new THREE.Vector3(movement.z, 0, -movement.x).normalize(); this.ballMesh.rotateOnWorldAxis(axis, movement.length() / RADIUS) }
    this.state.speed = Math.hypot(ball.vx, ball.vz); this.syncBall()
  }
  animate = (now: number) => {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.05) : 0; this.last = now; this.elapsed += dt
    if (!this.reducedMotion) this.clouds.forEach((cloud, i) => { cloud.position.x = cloud.userData.baseX + Math.sin(this.elapsed * 0.018 + i) * 5 })
    this.angle = THREE.MathUtils.damp(this.angle, this.desiredAngle, 7, dt)
    if (this.state.phase === 'playing') {
      this.accumulator += dt
      while (this.accumulator >= 1 / 120 && this.state.phase === 'playing') { this.update(1 / 120); this.accumulator -= 1 / 120 }
    } else this.accumulator = 0
    if (this.state.message && this.elapsed > this.messageUntil) this.state.message = ''
    this.coins.forEach((coin, i) => { coin.rotation.y = this.elapsed * 1.2; coin.position.y = levels[this.state.level]!.coins[i]!.y + 1 + Math.sin(this.elapsed * 2 + i) * 0.12 })
    this.pads.forEach(pad => { pad.children[2]!.rotation.y = this.elapsed; pad.children[2]!.position.y = 1.85 + Math.sin(this.elapsed * 2) * 0.15 })
    this.fans.forEach(fan => { for (let i = 2; i < 6; i++) fan.children[i]!.rotation.y += dt * 5; for (let i = 6; i < fan.children.length; i++) fan.children[i]!.position.y = (this.elapsed * 2 + i * 0.4) % 3 + 0.1 })
    const menu = this.state.phase === 'menu'
    const target = new THREE.Vector3(), position = new THREE.Vector3()
    if (menu) {
      target.set(this.camera.aspect < 0.85 ? 3 : -7, 0, -10)
      position.set(33 + Math.sin(this.elapsed * 0.06) * 2, 32, 39)
    } else {
      target.set(this.ball.x, Math.max(this.ball.y - 0.5, -1), this.ball.z - 2)
      position.set(this.ball.x + Math.sin(this.angle) * 13, Math.max(this.ball.y, -1) + 12, this.ball.z + Math.cos(this.angle) * 13)
    }
    this.camera.position.lerp(position, 1 - Math.exp(-dt * (menu ? 2 : 5)))
    const look = this.camera.userData.look as THREE.Vector3 | undefined
    if (!look) this.camera.userData.look = target.clone(); else look.lerp(target, 1 - Math.exp(-dt * 6))
    this.camera.lookAt(this.camera.userData.look)
    this.renderer.render(this.scene, this.camera)
    if (this.elapsed - this.lastEmit > 0.1) { this.lastEmit = this.elapsed; this.emit() }
    this.frame = requestAnimationFrame(this.animate)
  }
  destroy() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect(); window.removeEventListener('keydown', this.keydown); window.removeEventListener('keyup', this.keyup); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibility)
    void this.audio?.close(); this.disposeWorld()
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()) } else if (o instanceof THREE.Sprite) o.material.dispose() })
    Object.values(this.materials).forEach(m => m.dispose()); this.maps.forEach(t => t.dispose()); this.renderer.dispose(); this.renderer.domElement.remove()
  }
}
