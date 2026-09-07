import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalEngine } from './original-engine'
import { originalPosition } from './original-data'
import { PHYSICS_STEP } from './original-physics'
import type { Material } from './levels'
import * as THREE from 'three'

// Explicit local test route only. No test controls are included in normal gameplay.
export function inspectOriginal(engine: OriginalEngine) {
  const style = document.createElement('style'); style.textContent = '.modal-backdrop { visibility: hidden }'; document.head.append(style)
  const panel = document.createElement('aside')
  panel.setAttribute('aria-label', 'Original game test controls')
  panel.style.cssText = 'position:fixed;top:100px;left:20px;z-index:30;padding:12px;background:#fffe;color:#222;max-width:420px;font:12px monospace;border-radius:8px'
  const output = document.createElement('output'); output.style.cssText = 'display:block;white-space:pre-wrap;margin-bottom:8px;max-height:360px;overflow:auto'; panel.append(output)
  const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:7px;border:1px solid #888;margin:3px;font:11px monospace'; b.onclick = () => { action(); update() }; panel.append(b) }
  let fanIndex = 0
  let pusherIndex = 0
  let hingeIndex = 0
  const update = () => {
    const p = engine.body?.translation()
    const domes = engine.worldGroup.children.filter(o => o.name === 'P_Dome_MF') as THREE.Mesh[]
    output.textContent = JSON.stringify({ phase: engine.state.phase, level: engine.state.level + 1, loading: engine.loading, position: p && [p.x, p.y, p.z].map(n => Number(n.toFixed(3))), speed: Number(engine.state.speed.toFixed(3)), velocity: engine.body?.linvel(), fans: { count: engine.fans.length, active: engine.fans.filter(f => f.active).map(f => f.name), selected: engine.fans[fanIndex]?.name, origin: engine.fans[fanIndex]?.origin.toArray() }, material: engine.state.material, checkpoint: engine.state.checkpoint, lives: engine.state.lives, points: engine.state.score, pendingPoints: engine.pendingPoints.length, hinges: { count: engine.hinges.length, selected: engine.hinges[hingeIndex] && { name: engine.hinges[hingeIndex]!.name, activated: engine.hinges[hingeIndex]!.activated, rotation: engine.hinges[hingeIndex]!.body.rotation(), anchorError: engine.hinges[hingeIndex]!.anchorError } }, pushers: engine.pushers.map(p => ({ name: p.name, sector: p.sector, travel: Number(p.travel.toFixed(3)), position: p.body.translation(), hulls: p.body.numColliders() })), domes: { count: domes.length, movable: engine.dynamics.filter(d => d.mesh.name === 'P_Dome_MF').length, centers: domes.map(m => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).toArray()) }, debris: { count: engine.debris?.fragments.length, kinds: [...new Set(engine.debris?.fragments.map(f => f.kind))] }, transformation: { active: engine.transformation.active, age: Number(engine.transformation.age.toFixed(3)), committed: engine.transformation.committed, ballVisible: engine.ball.visible, bodyType: engine.body?.bodyType(), colliderEnabled: engine.body?.collider(0)?.isEnabled() }, audio: [...engine.audio.tracks].map(([name, audio]) => ({ name, playing: !audio.paused, ready: audio.readyState, error: audio.error?.code })) }, null, 1)
  }
  const run = (seconds: number, direction = 0) => {
    if (engine.loading || !engine.body) return
    engine.state.phase = 'playing'; engine.touch.z = direction
    for (let i = 0; i < seconds / PHYSICS_STEP && engine.state.phase === 'playing'; i++) engine.step(PHYSICS_STEP)
    engine.touch.z = 0; if (engine.state.phase === 'playing') engine.state.phase = 'paused'; engine.audio.paused = true; engine.audio.sync(); engine.emit()
  }
  button('Advance 0.1 seconds', () => run(.1))
  button('Advance 0.5 seconds', () => run(.5))
  button('Hold input 1 second', () => run(1, -1))
  button('Advance 2.4 seconds', () => run(2.4))
  button('Settle 2 seconds', () => run(2))
  button('Roll forward 2 seconds', () => run(2, -1))
  button('Roll backward 3 seconds', () => run(3, 1))
  button('Push dome 3 seconds', () => {
    const dome = engine.worldGroup.children.find(o => o.name === 'P_Dome_MF'); if (!dome || !engine.body) return
    engine.cancelTransformation()
    const bounds = new THREE.Box3().setFromObject(dome), center = bounds.getCenter(new THREE.Vector3())
    engine.body.setTranslation({ x: bounds.max.x + .51, y: bounds.min.y + .52, z: center.z }, true)
    engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.yaw = engine.targetYaw = Math.PI / 2; run(3, -1)
  })
  const visitPusher = () => {
    const pusher = engine.pushers[pusherIndex]; if (!pusher || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear()
    const start = pusher.target.clone().addScaledVector(pusher.axis, -2.5)
    const hit = engine.physics.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 1.5, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, 0x0004ffff, undefined, engine.body)
    if (!hit) return
    start.y += 1.5 - hit.timeOfImpact + .51
    engine.state.checkpoint = pusher.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.follow.copy(start); engine.yaw = engine.targetYaw = Math.atan2(pusher.axis.x, pusher.axis.z)
    run(0)
  }
  button('Visit gate target', visitPusher)
  button('Next gate target', () => { pusherIndex = (pusherIndex + 1) % engine.pushers.length; visitPusher() })
  button('Push gate 3 seconds', () => run(3, 1))
  button('Back away 1.2 seconds', () => run(1.2, -1))
  button('Cross gate passage', () => {
    const first = engine.pushers[0], last = engine.pushers[1]; if (!first || !last || !engine.body || !engine.physics) return
    const across = new THREE.Vector3(-first.axis.z, 0, first.axis.x), start = first.passage.clone().addScaledVector(across, -2)
    const hit = engine.physics.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 3, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, 0x0004ffff, undefined, engine.body)
    if (!hit) return
    start.y += 3 - hit.timeOfImpact + .51
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.yaw = engine.targetYaw = Math.atan2(across.x, across.z)
    engine.state.phase = 'playing'; engine.touch.z = 1
    for (let i = 0; i < 3 / PHYSICS_STEP && engine.state.phase === 'playing'; i++) {
      engine.step(PHYSICS_STEP)
      if (new THREE.Vector3().copy(engine.body.translation()).sub(last.passage).dot(across) > 1) break
    }
    engine.touch.z = 0; run(0)
  })
  button('Load seesaw course', () => { hingeIndex = 0; engine.start(1) })
  button('Load pivoting planks', () => { hingeIndex = 0; engine.start(6) })
  button('Load flap course', () => { hingeIndex = 0; engine.start(8) })
  const visitHinge = () => {
    const hinge = engine.hinges[hingeIndex]; if (!hinge || !engine.body) return
    engine.cancelTransformation(); engine.keys.clear(); hinge.reset()
    const bounds = hinge.mesh.geometry.boundingBox!, point = bounds.getCenter(new THREE.Vector3()).add(hinge.origin)
    point.y = bounds.max.y + hinge.origin.y + .55
    // A small off-center landing applies weight through the actual ball collider.
    point.addScaledVector(new THREE.Vector3(0, 1, 0).cross(hinge.axis).normalize(), .3)
    engine.body.setTranslation(point, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = hinge.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(point); run(0)
  }
  button('Visit hinged part', visitHinge)
  button('Next hinged part', () => { hingeIndex = (hingeIndex + 1) % engine.hinges.length; visitHinge() })
  button('Load fan course', () => { fanIndex = 0; engine.start(1) })
  const visitFan = () => {
    const fan = engine.fans[fanIndex]; if (!fan || !engine.body) return
    engine.cancelTransformation(); engine.keys.clear()
    engine.body.setTranslation({ x: fan.origin.x, y: fan.origin.y + .55, z: fan.origin.z }, true)
    engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    engine.follow.copy(fan.origin); engine.yaw = engine.targetYaw = Math.PI / 2; run(0)
  }
  button('Visit selected fan', visitFan)
  button('Rise 1 second', () => run(1))
  button('Next fan', () => { fanIndex = (fanIndex + 1) % engine.fans.length; visitFan() })
  button('Transfer to upper fan', () => {
    const target = engine.fans.find(f => f.name.endsWith('_12')); if (!target || !engine.body) return
    engine.state.phase = 'playing'
    for (let i = 0; i < 4 / PHYSICS_STEP && engine.state.phase === 'playing'; i++) {
      const p = engine.body.translation(), v = engine.body.linvel()
      // Test pilot uses the same capped arrow-key force; no position/velocity changes.
      const x = THREE.MathUtils.clamp((target.origin.x - p.x) * 8 - v.x * .8, -1, 1)
      const z = THREE.MathUtils.clamp((target.origin.z - p.z) * 8 - v.z * .8, -1, 1)
      engine.touch.z = x; engine.touch.x = -z; engine.step(PHYSICS_STEP)
    }
    engine.touch.x = engine.touch.z = 0; run(0)
  })
  button('Respawn', () => engine.respawn())
  button('Force fall', () => { const p = engine.body!.translation(); engine.body!.setTranslation({ ...p, y: p.y - 80 }, true); run(.1) })
  button('Next checkpoint', () => { const point = engine.checkpoints[engine.state.checkpoint]?.position; if (!point) return; engine.body!.setTranslation({ x: point.x, y: point.y + .7, z: point.z }, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); run(.1) })
  button('First extra', () => { const point = engine.pickups.find(p => p.object.name.includes('Point') && !p.taken)?.position; if (!point) return; engine.body!.setTranslation(point, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); run(1.8) })
  for (const name of ['Stone', 'Wood', 'Paper']) button(`${name} transformer`, () => { engine.cancelTransformation(); const pad = engine.pads.find(p => p.object.name.includes(name)); if (!pad) return; const p = originalPosition(pad.object); engine.body!.setTranslation({ x: p.x + .6, y: p.y + .8, z: p.z + .3 }, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.padCooldown = 0; run(.2) })
  for (const life of [true, false]) button(life ? 'View extra life' : 'View extra points', () => {
    engine.cancelTransformation()
    const point = engine.pickups.find(p => p.object.name.includes(life ? 'Life' : 'Point') && !p.taken)?.position
    if (!point) return
    engine.body!.setTranslation({ x: point.x + 1.6, y: point.y, z: point.z }, true)
    engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); run(0)
  })
  button('Collect extra life', () => { const point = engine.pickups.find(p => p.object.name.includes('Life') && !p.taken)?.position; if (!point) return; engine.body!.setTranslation(point, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); run(.1) })
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) button(kind, () => { engine.cancelTransformation(); engine.transform(kind, false) })
  button('Finish trigger', () => { if (!engine.finish) return; engine.state.checkpoint = engine.checkpoints.length; const p = engine.finish.position; engine.body!.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true); run(.1) })
  document.body.append(panel); const interval = window.setInterval(update, 200)
  return () => { clearInterval(interval); panel.remove(); style.remove() }
}
