import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalLift, ORIGINAL_LIFT } from '../src/game/original-lift.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY, FLOOR_PHYSICS, configureContact, PLAYER_PHYSICS, configureBody, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'
const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_03.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, parent?: OriginalObject, sector = 1) {
  const d = load('p_modul_03'), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: 'P_Modul_03_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const lift = new OriginalLift(world, instance, d, new Map(d.materials.map(m => [m.id, material])), sector)
  return { lift, dispose: () => { lift.parts.forEach(p => p.mesh.geometry.dispose()); material.dispose() } }
}
function floor(world: RAPIER.World, level: OriginalDocument) {
  const stoppers = new Set(level.groups.find(g => g.name === 'Phys_FloorStopper')?.members)
  const floors = new Set(level.groups.filter(g => ['Phys_Floors', 'Phys_FloorRails', 'Phys_FloorStopper'].includes(g.name)).flatMap(g => g.members))
  for (const o of level.objects.filter(o => floors.has(o.id))) {
    const source = level.meshes.find(m => m.id === o.mesh); if (!source) continue
    const g = originalGeometry(source, o.matrix)
    world.createCollider(configureContact(RAPIER.ColliderDesc.trimesh(g.attributes.position!.array as Float32Array, Uint32Array.from(g.index!.array)).setCollisionGroups(stoppers.has(o.id) ? LEVEL_STOPPER_GROUPS : LEVEL_FLOOR_GROUPS), FLOOR_PHYSICS)); g.dispose()
  }
}
test('weighted lift data contains eight loose weights, an open doorway and a spring-driven vertical platform',()=>{
  assert.equal(ORIGINAL_LIFT.parts.length,9)
  assert.equal(ORIGINAL_LIFT.parts.find(p=>p.target.includes('Gate'))!.hulls.length,3)
  assert.equal(ORIGINAL_LIFT.parts.find(p=>p.target.includes('Floor'))!.mass,3)
  assert.equal(ORIGINAL_LIFT.parts.reduce((m,p)=>m+p.mass,0),19)
  assert.equal(ORIGINAL_LIFT.spring.constant,15);assert.equal(ORIGINAL_LIFT.spring.length,0)
  assert.equal(ORIGINAL_LIFT.slider.limitsEnabled,false);assert.equal(ORIGINAL_LIFT.wake.distance,35)
})
test('the lift remains frozen far away and resets all nine bodies and its joint after activation', {skip:!available},async()=>{
  await initialized
  const w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
  const t=make(w,undefined,3),l=t.lift,far=l.wakeOrigin.clone().add(new THREE.Vector3(20,0,20))
  try{
    for(let repeat=0;repeat<3;repeat++){
      for(let i=0;i<132;i++){l.update(far,3,PHYSICS_STEP);w.step()}
      assert.equal(l.activated,false);assert.equal(w.impulseJoints.len(),1)
      l.parts.forEach(p=>assert.ok(new THREE.Vector3().copy(p.body.translation()).distanceTo(p.origin)<1e-5))
      for(let i=0;i<264;i++){l.update(l.wakeOrigin,3,PHYSICS_STEP);w.step()}
      assert.equal(l.activated,true);assert.equal(l.platform.body.numColliders(),1)
      assert.equal(l.parts.find(p=>p.name.includes('Gate'))!.body.numColliders(),3)
      assert.ok(l.lateralError<.005)
      l.update(far,4,PHYSICS_STEP);assert.equal(l.active,false);assert.equal(w.impulseJoints.len(),0)
    }
  }finally{t.dispose();w.free()}
})
test('removing wall weight raises the spring platform by the recovered mass-to-stiffness ratio', {skip:!available},async()=>{
  await initialized
  const w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
  const t=make(w),l=t.lift
  try{
    for(let i=0;i<7920;i++){l.update(l.wakeOrigin,1,PHYSICS_STEP);w.step()}
    const loaded=l.platform.body.translation().y
    for(const wall of l.walls) wall.body.setEnabled(false)
    for(let i=0;i<7920;i++){l.update(l.wakeOrigin,1,PHYSICS_STEP);w.step()}
    const rise=l.platform.body.translation().y-loaded
    assert.ok(Math.abs(rise-16*20/(15*4))<.15,`loaded-to-empty rise ${rise}`)
    assert.ok(l.lateralError<.005)
    assert.ok(new THREE.Quaternion().copy(l.platform.body.rotation()).angleTo(new THREE.Quaternion())<.005)
  }finally{t.dispose();w.free()}
})
test('all nine lifts stay constrained and retain their wall load in the original level geometry', {skip:!available},async()=>{
  await initialized
  let count=0
  for(const index of [7,9,10,12]){
    const level=load(`level_${String(index).padStart(2,'0')}`),w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
    const trials:ReturnType<typeof make>[]=[]
    try{
      floor(w,level)
      for(const parent of level.objects.filter(o=>o.name.startsWith('P_Modul_03_'))){trials.push(make(w,parent));count++}
      for(let i=0;i<2640;i++){trials.forEach(t=>t.lift.update(t.lift.wakeOrigin,1,PHYSICS_STEP));w.step()}
      trials.forEach(({lift:l})=>{
        assert.ok(l.lateralError<.005)
        assert.ok(Math.abs(l.travel)<1.5,`${index}/${l.name} unexpected loaded height ${l.travel}`)
        for(const wall of l.walls)assert.ok(wall.body.translation().y>l.platform.body.translation().y,`${index}/${l.name}/${wall.name} fell without player contact`)
      })
    }finally{trials.forEach(t=>t.dispose());w.free()}
  }
  assert.equal(count,9)
})
test('wood enters the Level 7 doorway, knocks a wall off and rides the rising platform', {skip:!available},async()=>{
  await initialized
  const level=load('level_07'),w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
  floor(w,level);const t=make(w,level.objects.find(o=>o.name==='P_Modul_03_01')),l=t.lift
  try{
    l.setActive(true);w.step()
    const gate=l.parts.find(p=>p.name.includes('Gate'))!
    const inward=l.platform.origin.clone().sub(gate.origin);inward.y=0;inward.normalize()
    const start=l.platform.origin.clone().addScaledVector(inward,-3.5).add(new THREE.Vector3(0,2,0))
    const hit=w.castShape(start,{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.5),0,8,true,undefined,0x0004ffff)
    assert.ok(hit,'original approach floor');start.y-=hit.time_of_impact-.01
    const ball=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x,start.y,start.z).setCcdEnabled(true))
    w.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS.wood.mass).setCollisionGroups(0x0004ffff),PLAYER_PHYSICS.wood),ball);configureBody(ball,PLAYER_PHYSICS.wood)
    let boarded=false
    for(let i=0;i<396;i++){
      l.update(new THREE.Vector3().copy(ball.translation()),1,PHYSICS_STEP);driveBall(ball,'wood',inward.x,inward.z,PHYSICS_STEP);w.step()
      const progress=new THREE.Vector3().copy(ball.translation()).sub(l.platform.origin).dot(inward)
      if(progress>-.5 && ball.translation().y>l.platform.body.translation().y){boarded=true;break}
    }
    assert.equal(boarded,true,JSON.stringify(ball.translation()))
    const before=l.platform.body.translation().y
    // Push the wall across the platform, then counter-steer to remain inside the rim.
    let contacted=false
    for(let i=0;i<66;i++){
      l.update(new THREE.Vector3().copy(ball.translation()),1,PHYSICS_STEP);driveBall(ball,'wood',inward.x,inward.z,PHYSICS_STEP);w.step()
      for(const wall of l.walls)w.contactPair(ball.collider(0),wall.body.collider(0),m=>{if(m.numContacts())contacted=true})
    }
    for(let i=0;i<1320;i++){
      const p=ball.translation(),v=ball.linvel()
      l.update(new THREE.Vector3().copy(p),1,PHYSICS_STEP)
      driveBall(ball,'wood',THREE.MathUtils.clamp((l.platform.origin.x-p.x)*2-v.x*1.3,-1,1),THREE.MathUtils.clamp((l.platform.origin.z-p.z)*2-v.z*1.3,-1,1),PHYSICS_STEP);w.step()
    }
    assert.equal(contacted,true)
    assert.ok(l.walls.some(p=>p.body.translation().y<l.platform.body.translation().y-1),'a wall must actually leave the platform')
    assert.ok(l.platform.body.translation().y>before+.25,'reduced weight raises platform')
    const support=w.castShape(ball.translation(),{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.48),0,.2,true,undefined,undefined,undefined,ball)
    assert.ok(support?.collider.parent()?.handle===l.platform.body.handle,'ball stays aboard as the lift rises')
  }finally{t.dispose();w.free()}
})
test('wood, stone and paper load the lift according to their recovered masses', {skip:!available},async()=>{
  await initialized
  const heights:Record<string,number>={}
  for(const kind of ['wood','stone','paper'] as const){
    const w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
    const t=make(w),l=t.lift
    try{
      for(let i=0;i<2640;i++){l.update(l.wakeOrigin,1,PHYSICS_STEP);w.step()}
      const p=l.platform.body.translation(),ball=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y+.8,p.z).setCcdEnabled(true))
      let shape=RAPIER.ColliderDesc.ball(.5)
      if(kind==='paper'){
        const d=load('balls'),o=d.objects.find(o=>o.name==='Ball_Paper')!,g=originalGeometry(d.meshes.find(m=>m.id===o.mesh)!,o.matrix,true)
        shape=RAPIER.ColliderDesc.convexHull(g.attributes.position!.array as Float32Array)!;g.dispose()
      }
      w.createCollider(configureContact(shape.setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(0x0004ffff),PLAYER_PHYSICS[kind]),ball);configureBody(ball,PLAYER_PHYSICS[kind])
      for(let i=0;i<7920;i++){l.update(new THREE.Vector3().copy(ball.translation()),1,PHYSICS_STEP);w.step()}
      heights[kind]=l.platform.body.translation().y
      assert.ok(ball.translation().y>l.platform.body.translation().y && ball.translation().y<l.platform.body.translation().y+1)
    }finally{t.dispose();w.free()}
  }
  assert.ok(Math.abs(heights.wood!-heights.stone!-(10-1.9)*20/60)<.15)
  assert.ok(Math.abs(heights.paper!-heights.wood!-(1.9-.2)*20/60)<.15)
})
