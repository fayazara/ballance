import { PLAYER_GROUPS } from './original-collisions.ts'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalEngine } from './original-engine'
import { originalPosition } from './original-data'
import { PHYSICS_STEP } from './original-physics'
import type { Material } from './levels'
import * as THREE from 'three'

// Explicit local test route only. No test controls are included in normal gameplay.
export function inspectOriginal(engine: OriginalEngine) {
  const style = document.createElement('style'); style.textContent = '.modal-backdrop { visibility: hidden } .original-test-panel.collapsed > :not(:first-child) { display: none !important }'; document.head.append(style)
  const panel = document.createElement('aside')
  panel.setAttribute('aria-label', 'Original game test controls')
  panel.className = 'original-test-panel'
  panel.style.cssText = 'position:fixed;top:100px;left:20px;z-index:30;padding:12px;background:#fffe;color:#222;max-width:420px;max-height:calc(100vh - 120px);overflow:auto;font:12px monospace;border-radius:8px'
  const output = document.createElement('output'); output.style.cssText = 'display:block;white-space:pre-wrap;margin-bottom:8px;max-height:360px;overflow:auto'; panel.append(output)
  const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:7px;border:1px solid #888;margin:3px;font:11px monospace'; b.onclick = () => { action(); update() }; panel.append(b) }
  let fanIndex = 0
  let pusherIndex = 0
  let hingeIndex = 0
  let bridgeCrossed = false
  let sackIndex = 0
  let sackCrossed = false
  let liftIndex = 0
  let sliderIndex = 0
  let armCrossed = false
  let armIndex = 0
  let swingIndex = 0
  let swingCrossed = false
  const update = () => {
    const p = engine.body?.translation()
    const domes = engine.worldGroup.children.filter(o => o.name === 'P_Dome_MF') as THREE.Mesh[]
    output.textContent = JSON.stringify({ phase: engine.state.phase, level: engine.state.level + 1, loading: engine.loading, position: p && [p.x, p.y, p.z].map(n => Number(n.toFixed(3))), speed: Number(engine.state.speed.toFixed(3)), velocity: engine.body?.linvel(), fans: { count: engine.fans.length, enabled: engine.fans.filter(f => f.inSector).map(f => f.name), running: engine.fans.filter(f => f.running).map(f => f.name), sound: engine.fans.filter(f => f.soundGain > 0).map(f => ({ name: f.name, gain: f.soundGain })), active: engine.fans.filter(f => f.active).map(f => f.name), selected: engine.fans[fanIndex]?.name, origin: engine.fans[fanIndex]?.origin.toArray() }, material: engine.state.material, checkpoint: engine.state.checkpoint, lives: engine.state.lives, points: engine.state.score, pendingPoints: engine.pickups.reduce((count,p)=>count+(p.visual?.point?.remaining??0),0), sectorPhysics: { objects: engine.sectorObjects.filter(o => o.active).map(o => o.name), gates: engine.pushers.filter(p => p.active).map(p => p.name), hinges: engine.hinges.filter(h => h.active).map(h => h.name), bridges: engine.chains.filter(c => c.active).map(c => c.name), joints: engine.physics?.impulseJoints.len() }, firstCrate: engine.sectorObjects.find(o => o.name === 'P_Box_01') && { position: engine.sectorObjects.find(o => o.name === 'P_Box_01')!.body.translation(), origin: engine.sectorObjects.find(o => o.name === 'P_Box_01')!.origin.toArray() }, cleanup: { count: engine.depthTest?.count, removed: engine.depthTest?.removedCount, limit: engine.depthTest?.limit }, lifts: engine.lifts.map(l => ({ name: l.name, active: l.active, awake: l.activated, travel: l.travel, lateralError: l.lateralError, fallen: l.walls.filter(p => p.body.translation().y < l.platform.body.translation().y - 1).length, platform: l.platform.body.translation() })), sliders: engine.sliders.map(s => ({ name: s.name, sector: s.sector, active: s.active, awake: s.activated, travel: s.travel, lateralError: s.lateralError, crate: s.crate.body.translation() })), armCrossed, arms: engine.arms.map(a => ({ name: a.name, sector: a.sector, active: a.active, angle: new THREE.Quaternion().copy(a.body.rotation()).angleTo(new THREE.Quaternion()), anchorError: a.anchorError })), swings: { crossed: swingCrossed, selected: engine.swings[swingIndex]?.name, instances: engine.swings.map(s => ({ name: s.name, sector: s.sector, active: s.active, stage: s.stage, cycles: s.cycles, elapsed: s.elapsed, hulls: s.body.numColliders(), anchorError: s.anchorError, position: s.body.translation(), origin: s.origin.toArray() })) }, sacks: { crossed: sackCrossed, selected: engine.sacks[sackIndex]?.name, instances: engine.sacks.map(s => ({ name: s.name, sector: s.sector, active: s.active, phase: s.phase, switches: s.switches, joints: s.connections.filter(c => c.joint).length, anchorError: s.anchorError, position: s.sack.body.translation(), origin: s.sack.origin.toArray() })) }, bridges: { crossed: bridgeCrossed, instances: engine.chains.map(c => ({ name: c.name, sector: c.sector, activated: c.activated, broken: c.broken, joints: c.connections.filter(j => j.joint).length, anchorError: c.anchorError, heights: c.parts.map(p => Number((p.body.translation().y - p.origin.y).toFixed(3))) })) }, hinges: { count: engine.hinges.length, selected: engine.hinges[hingeIndex] && { name: engine.hinges[hingeIndex]!.name, activated: engine.hinges[hingeIndex]!.activated, rotation: engine.hinges[hingeIndex]!.body.rotation(), anchorError: engine.hinges[hingeIndex]!.anchorError } }, pushers: engine.pushers.map(p => ({ name: p.name, sector: p.sector, travel: Number(p.travel.toFixed(3)), position: p.body.translation(), hulls: p.body.numColliders() })), domes: { count: domes.length, movable: engine.dynamics.filter(d => d.mesh.name === 'P_Dome_MF').length, centers: domes.map(m => new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3()).toArray()) }, debris: { count: engine.debris?.fragments.length, kinds: [...new Set(engine.debris?.fragments.map(f => f.kind))] }, transformation: { active: engine.transformation.active, age: Number(engine.transformation.age.toFixed(3)), committed: engine.transformation.committed, ballVisible: engine.ball.visible, bodyType: engine.body?.bodyType(), colliderEnabled: engine.body?.collider(0)?.isEnabled() }, audio: [...engine.audio.tracks].map(([name, audio]) => ({ name, playing: !audio.paused, ready: audio.readyState, error: audio.error?.code })) }, null, 1)
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
    const object = engine.sectorObjects.find(o => o.kind === 'P_Dome')
    if (object) engine.state.checkpoint = object.sector - 1
    const bounds = new THREE.Box3().setFromObject(dome), center = bounds.getCenter(new THREE.Vector3())
    engine.body.setTranslation({ x: bounds.max.x + .51, y: bounds.min.y + .52, z: center.z }, true)
    engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.yaw = engine.targetYaw = Math.PI / 2; run(3, -1)
  })
  button('Visit first crate', () => {
    const object = engine.sectorObjects.find(o => o.name === 'P_Box_01')
    if (!object || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear()
    engine.state.checkpoint = object.sector - 1; engine.checkpointMaterial = engine.state.material
    const start = object.origin.clone().add(new THREE.Vector3(2.5, 2, 0))
    const hit = engine.physics.castShape(start, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 8, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y -= hit.time_of_impact - .01
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.follow.copy(start); engine.yaw = engine.targetYaw = -Math.PI / 2; run(0)
  })
  button('Push loose crate 1 second', () => run(1, 1))
  const visitPusher = () => {
    const pusher = engine.pushers[pusherIndex]; if (!pusher || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear()
    const start = pusher.target.clone().addScaledVector(pusher.axis, -2.5)
    const hit = engine.physics.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 1.5, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, PLAYER_GROUPS, undefined, engine.body)
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
    const hit = engine.physics.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 3, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, PLAYER_GROUPS, undefined, engine.body)
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
  button('Load linked bridge course', () => { bridgeCrossed = false; engine.start(1) })
  button('Load weighted lift course', () => { liftIndex = 0; engine.start(6) })
  const visitLift = () => {
    const lift = engine.lifts[liftIndex]; if (!lift || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear(); lift.reset(); engine.touch.x = engine.touch.z = 0
    const gate = lift.parts.find(p => p.name.includes('Gate'))!
    const inward = lift.platform.origin.clone().sub(gate.origin); inward.y = 0; inward.normalize()
    const start = lift.platform.origin.clone().addScaledVector(inward, -3.5).add(new THREE.Vector3(0, 2, 0))
    const hit = engine.physics.castShape(start, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 8, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y -= hit.time_of_impact - .01
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = lift.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(start); engine.yaw = engine.targetYaw = Math.atan2(inward.x, inward.z); run(0)
  }
  button('Visit weighted lift', visitLift)
  button('Enter lift and knock wall', () => {
    const lift = engine.lifts[liftIndex]; if (!lift || !engine.body) return
    const gate = lift.parts.find(p => p.name.includes('Gate'))!
    const inward = lift.platform.origin.clone().sub(gate.origin); inward.y = 0; inward.normalize()
    const right = new THREE.Vector3(inward.z, 0, -inward.x)
    engine.state.phase = 'playing'; engine.touch.z = 1
    for (let i = 0; i < 396 && engine.state.phase === 'playing'; i++) {
      engine.step(PHYSICS_STEP)
      if (new THREE.Vector3().copy(engine.body.translation()).sub(lift.platform.origin).dot(inward) > -.5 && engine.body.translation().y > lift.platform.body.translation().y) break
    }
    run(.5, 1); engine.state.phase = 'playing'
    for (let i = 0; i < 1320 && engine.state.phase === 'playing'; i++) {
      const delta = lift.platform.origin.clone().sub(engine.body.translation()), v = new THREE.Vector3().copy(engine.body.linvel())
      engine.touch.z = THREE.MathUtils.clamp(delta.dot(inward) * 2 - v.dot(inward) * 1.3, -1, 1)
      engine.touch.x = THREE.MathUtils.clamp(delta.dot(right) * 2 - v.dot(right) * 1.3, -1, 1)
      engine.step(PHYSICS_STEP)
    }
    engine.touch.x = engine.touch.z = 0; run(0)
  })
  button('Load sliding stone course', () => { sliderIndex = 0; engine.start(0) })
  const visitSlider = () => {
    const slider = engine.sliders[sliderIndex]; if (!slider || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear(); slider.reset(); engine.touch.x = engine.touch.z = 0
    const start = slider.crate.origin.clone().add(new THREE.Vector3(3.5, 2, 0))
    const hit = engine.physics.castShape(start, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 8, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y -= hit.time_of_impact - .01
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = slider.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(start); engine.yaw = engine.targetYaw = -Math.PI / 2; run(0)
  }
  button('Visit sliding stone', visitSlider)
  button('Push support crate 3 seconds', () => run(3, 1))
  button('Clear support crate', () => {
    const slider = engine.sliders[sliderIndex]; if (!slider || !engine.body) return
    run(3, 1)
    for (let attempt = 0; attempt < 2; attempt++) { run(106 * PHYSICS_STEP, -1); run(2, 1) }
    const target = slider.crate.origin.clone().add(new THREE.Vector3(3.5, 0, 0))
    engine.state.phase = 'playing'
    for (let i = 0; i < 528 && engine.state.phase === 'playing'; i++) {
      const p = engine.body.translation(), v = engine.body.linvel()
      // The staged Level 1 view looks along -X: local forward=-X, local right=+Z.
      engine.touch.z = -THREE.MathUtils.clamp((target.x - p.x) * 2 - v.x * 1.3, -1, 1)
      engine.touch.x = THREE.MathUtils.clamp((target.z - p.z) * 2 - v.z * 1.3, -1, 1)
      engine.step(PHYSICS_STEP)
    }
    engine.touch.x = engine.touch.z = 0; run(0)
  })
  button('Cross lowered stone bridge', () => {
    const slider = engine.sliders[sliderIndex]; if (!slider || !engine.body || !engine.physics) return
    const start = slider.stone.origin.clone().add(new THREE.Vector3(0, 2, -2.5))
    const hit = engine.physics.castShape(start, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 5, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y -= hit.time_of_impact - .01
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.keys.clear(); engine.state.phase = 'playing'; engine.follow.copy(start); engine.yaw = engine.targetYaw = 0
    for (let i = 0; i < 1056 && engine.state.phase === 'playing'; i++) {
      const p = engine.body.translation(), v = engine.body.linvel()
      engine.touch.x = THREE.MathUtils.clamp((start.x - p.x) * 2 - v.x * 1.3, -1, 1)
      engine.touch.z = THREE.MathUtils.clamp((slider.stone.origin.z + 2.5 - p.z) * 2 - v.z * 1.3, -1, 1)
      engine.step(PHYSICS_STEP)
    }
    engine.touch.x = engine.touch.z = 0; run(0)
  })
  button('Load rotating arm course', () => { armIndex = 0; engine.start(8) })
  const visitArm = () => {
    const arm = engine.arms[armIndex]; if (!arm || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear(); arm.reset(); armCrossed = false; engine.touch.x = engine.touch.z = 0
    const radial = arm.spring.fixedPoint.clone().sub(arm.origin); radial.y = 0; radial.normalize()
    const direction = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), radial)
    const start = arm.origin.clone().addScaledVector(radial, 2.5).addScaledVector(direction, -1.5)
    const hit = engine.physics.castShape({ x: start.x, y: start.y + 2, z: start.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 8, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y += 2 - hit.time_of_impact + .01
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = arm.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(start); engine.yaw = engine.targetYaw = Math.atan2(direction.x, direction.z); run(0)
  }
  button('Visit rotating arm', visitArm)
  button('Next rotating arm', () => { armIndex = (armIndex + 1) % engine.arms.length; visitArm() })
  button('Push rotating arm 1 second', () => run(1, 1))
  button('Cross rotating arm', () => {
    const arm = engine.arms[armIndex]; if (!arm || !engine.body || !engine.physics) return
    const radial = arm.spring.fixedPoint.clone().sub(arm.origin); radial.y = 0; radial.normalize()
    const forward = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), radial), right = new THREE.Vector3(forward.z, 0, -forward.x)
    const target = arm.origin.clone().addScaledVector(radial, 2.5).addScaledVector(forward, 2)
    engine.state.phase = 'playing'
    for (let i = 0; i < 792 && engine.state.phase === 'playing'; i++) {
      const delta = target.clone().sub(engine.body.translation()), velocity = new THREE.Vector3().copy(engine.body.linvel())
      engine.touch.z = THREE.MathUtils.clamp(delta.dot(forward) * 2 - velocity.dot(forward) * 1.3, -1, 1)
      engine.touch.x = THREE.MathUtils.clamp(delta.dot(right) * 2 - velocity.dot(right) * 1.3, -1, 1)
      engine.step(PHYSICS_STEP)
    }
    const support = engine.physics.castShape(engine.body.translation(), { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.48), 0, .2, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    armCrossed = !!support && !support.collider.parent() && new THREE.Vector3().copy(engine.body.translation()).sub(arm.origin).dot(forward) > 1.5
    engine.touch.x = engine.touch.z = 0; run(0)
  })
  button('Load swinging platform course', () => { swingIndex = 0; swingCrossed = false; engine.start(8) })
  const visitSwing = (warmup = 0) => {
    const swing = engine.swings[swingIndex]; if (!swing || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear(); swing.reset(); swingCrossed = false
    const axis = swing.drives[0]!.direction.clone(); axis.y = 0; axis.normalize()
    // Keep the waiting ball outside the platform's swept path, then stage the approach.
    if (warmup) {
      engine.body.setTranslation(swing.origin.clone().addScaledVector(axis, -4).add(new THREE.Vector3(0, 1.1, 0)), true)
      engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      engine.state.checkpoint = swing.sector - 1; run(warmup)
    }
    const start = swing.origin.clone().addScaledVector(axis, -2)
    const hit = engine.physics.castShape({ x: start.x, y: start.y + 2, z: start.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 8, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y += 2 - hit.time_of_impact + .01
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = swing.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(start); engine.yaw = engine.targetYaw = Math.atan2(axis.x, axis.z); run(0)
  }
  button('Visit swinging platform', () => visitSwing())
  button('Stage return-stroke approach', () => visitSwing(2))
  button('Next swinging platform', () => { swingIndex = (swingIndex + 1) % engine.swings.length; visitSwing() })
  button('Cross swinging platform', () => {
    const swing = engine.swings[swingIndex]; if (!swing || !engine.body || !engine.physics) return
    const axis = swing.drives[0]!.direction.clone(); axis.y = 0; axis.normalize()
    engine.state.phase = 'playing'; engine.touch.z = 1
    let crossed = false
    for (let i = 0; i < 6 / PHYSICS_STEP && engine.state.phase === 'playing'; i++) {
      engine.step(PHYSICS_STEP)
      if (new THREE.Vector3().copy(engine.body.translation()).sub(swing.origin).dot(axis) > 2 && engine.body.translation().y > swing.origin.y) { crossed = true; break }
    }
    if (crossed) {
      const target = swing.origin.clone().addScaledVector(axis, 3), side = new THREE.Vector3(axis.z, 0, -axis.x)
      for (let i = 0; i < 396 && engine.state.phase === 'playing'; i++) {
        const delta = target.clone().sub(engine.body.translation()), velocity = new THREE.Vector3().copy(engine.body.linvel())
        engine.touch.z = THREE.MathUtils.clamp(delta.dot(axis) * 4 - velocity.dot(axis) * .8, -1, 1)
        engine.touch.x = THREE.MathUtils.clamp(delta.dot(side) * 4 - velocity.dot(side) * .8, -1, 1)
        engine.step(PHYSICS_STEP)
      }
      const support = engine.physics.castShape(engine.body.translation(), { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.48), 0, .15, true, undefined, PLAYER_GROUPS, undefined, engine.body)
      swingCrossed = !!support && !support.collider.parent() && new THREE.Vector3().copy(engine.body.translation()).sub(swing.origin).dot(axis) > 2.8
    }
    engine.touch.x = engine.touch.z = 0; run(0)
  })
  button('Load swinging sack course', () => { sackIndex = 0; sackCrossed = false; engine.start(7) })
  const visitSack = () => {
    const sack = engine.sacks[sackIndex]; if (!sack || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear(); sackCrossed = false
    for (const s of engine.sacks.filter(s => s.sector === sack.sector)) s.reset()
    const across = sack.drives[0]!.direction.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
    const point = sack.sack.origin.clone().addScaledVector(across, -2)
    const hit = engine.physics.castShape({ x: point.x, y: point.y + 3, z: point.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 }, new RAPIER.Ball(.5), 0, 10, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    point.y += 3 - hit.time_of_impact + .01
    engine.body.setTranslation(point, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = sack.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(point); engine.yaw = engine.targetYaw = Math.atan2(across.x, across.z); run(0)
  }
  button('Visit swinging sack', visitSack)
  button('Next swinging sack', () => { sackIndex = (sackIndex + 1) % engine.sacks.length; visitSack() })
  button('Watch swing 6 seconds', () => run(6))
  button('Cross swinging sack', () => {
    const sack = engine.sacks[sackIndex]; if (!sack || !engine.body) return
    const across = sack.drives[0]!.direction.clone().cross(new THREE.Vector3(0, 1, 0)).normalize()
    engine.state.phase = 'playing'; engine.touch.z = 1
    for (let i = 0; i < 4 / PHYSICS_STEP && engine.state.phase === 'playing'; i++) {
      engine.step(PHYSICS_STEP)
      if (new THREE.Vector3().copy(engine.body.translation()).sub(sack.sack.origin).dot(across) > 2 && engine.body.translation().y > sack.sack.origin.y - 2) { sackCrossed = true; break }
    }
    engine.touch.z = 0; run(0)
  })
  button('Visit linked bridge', () => {
    const chain = engine.chains[0]; if (!chain || !engine.body || !engine.physics) return
    engine.cancelTransformation(); engine.keys.clear(); chain.reset(); bridgeCrossed = false
    const first = chain.parts.find(p => p.name.endsWith('01'))!, last = chain.parts.find(p => p.name.endsWith('09'))!
    const axis = last.origin.clone().sub(first.origin).normalize(), start = first.origin.clone().addScaledVector(axis, -1.5)
    const hit = engine.physics.castRay(new RAPIER.Ray({ x: start.x, y: start.y + 3, z: start.z }, { x: 0, y: -1, z: 0 }), 10, true, undefined, PLAYER_GROUPS, undefined, engine.body)
    if (!hit) return
    start.y += 3 - hit.timeOfImpact + .51
    engine.body.setTranslation(start, true); engine.body.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    engine.state.checkpoint = chain.sector - 1; engine.checkpointMaterial = engine.state.material
    engine.follow.copy(start); engine.yaw = engine.targetYaw = Math.atan2(axis.x, axis.z); run(0)
  })
  button('Cross linked bridge', () => {
    const chain = engine.chains[0]; if (!chain || !engine.body) return
    const first = chain.parts.find(p => p.name.endsWith('01'))!, last = chain.parts.find(p => p.name.endsWith('09'))!
    const axis = last.origin.clone().sub(first.origin).normalize()
    engine.state.phase = 'playing'; engine.touch.z = 1
    for (let i = 0; i < 6 / PHYSICS_STEP && engine.state.phase === 'playing'; i++) {
      engine.step(PHYSICS_STEP)
      if (new THREE.Vector3().copy(engine.body.translation()).sub(last.origin).dot(axis) > 1 && engine.body.translation().y > last.origin.y - .1) { bridgeCrossed = true; break }
      if (chain.broken) break
    }
    engine.touch.z = 0; run(0)
  })
  button('Load fan course', () => { fanIndex = 0; engine.start(1) })
  const visitFan = () => {
    const fan = engine.fans[fanIndex]; if (!fan || !engine.body) return
    engine.state.checkpoint = fan.sector - 1
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
  button('Toggle test controls', () => panel.classList.toggle('collapsed'))
  panel.prepend(panel.lastElementChild!)
  document.body.append(panel); const interval = window.setInterval(update, 200)
  return () => { clearInterval(interval); panel.remove(); style.remove() }
}
