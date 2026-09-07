import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalSlider, ORIGINAL_SLIDER } from '../src/game/original-slider.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY, FLOOR_PHYSICS, configureContact, PLAYER_PHYSICS, configureBody, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'
const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_34.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, parent?: OriginalObject, sector = 1) {
  const d = load('p_modul_34'), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: 'P_Modul_34_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const slider = new OriginalSlider(world, instance, d, new Map(d.materials.map(m => [m.id, material])), sector)
  return { slider, dispose: () => { slider.parts.forEach(p => p.mesh.geometry.dispose()); material.dispose() } }
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
test('sliding stone data preserves the free crate, frozen bodies and unlimited vertical slider', () => {
  assert.deepEqual(ORIGINAL_SLIDER.parts.map(p=>p.mass),[1.399999976158142,1.600000023841858])
  assert.ok(ORIGINAL_SLIDER.parts.every(p=>p.startFrozen && !p.fixed && p.hulls.length===1))
  assert.equal(ORIGINAL_SLIDER.slider.limitsEnabled,false)
  assert.equal(ORIGINAL_SLIDER.wake.distance,50);assert.equal(ORIGINAL_SLIDER.wake.axes,5)
  assert.equal(ORIGINAL_SLIDER.wakeTarget,'P_Modul_34_Schiebestein')
})
test('slider activation respects proximity, preserves the vertical axis and resets without leaking joints', {skip:!available},async()=>{
  await initialized
  const w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
  const t=make(w,undefined,3),s=t.slider,far=s.stone.origin.clone().add(new THREE.Vector3(30,0,30))
  try{
    s.update(far,2);w.step();assert.equal(s.active,false)
    for(let j=0;j<3;j++){
      for(let i=0;i<132;i++){s.update(far,3);w.step()}
      assert.equal(s.activated,false);assert.ok(Math.abs(s.travel)<.00001)
      assert.ok(new THREE.Vector3().copy(s.crate.body.translation()).distanceTo(s.crate.origin)<.00001)
      assert.equal(s.joint!.limitsEnabled(),false);assert.equal(w.impulseJoints.len(),1)
      // Remove support for this constraint-only check; the next test uses player contact.
      s.crate.body.setTranslation(s.crate.origin.clone().add(new THREE.Vector3(10,0,0)),true)
      for(let i=0;i<264;i++){
        s.update(s.stone.origin,3)
        s.stone.body.applyImpulse({x:.01,y:0,z:.02},true);s.stone.body.applyTorqueImpulse({x:.01,y:.02,z:.01},true)
        w.step()
      }
      assert.equal(s.activated,true);assert.ok(s.travel>2,'disabled ±1 source defaults must not limit travel')
      assert.ok(s.lateralError<.005);assert.ok(new THREE.Quaternion().copy(s.stone.body.rotation()).angleTo(new THREE.Quaternion())<.005)
      s.update(far,4);assert.equal(s.active,false);assert.equal(w.impulseJoints.len(),0)
      assert.ok(Math.abs(s.travel)<.00001);assert.equal(s.activated,false)
    }
  }finally{t.dispose();w.free()}
})
test('all 19 actual placements retain the crate support and slider axis after proximity wake', {skip:!available},async()=>{
  await initialized
  let count=0
  for(const index of [1,5,7,10,11]){
    const level=load(`level_${String(index).padStart(2,'0')}`),w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
    const trials:ReturnType<typeof make>[]=[]
    try{
      floor(w,level)
      for(const parent of level.objects.filter(o=>o.name.startsWith('P_Modul_34_'))){trials.push(make(w,parent));count++}
      for(let i=0;i<1320;i++){trials.forEach(t=>t.slider.update(t.slider.stone.origin,1));w.step()}
      for(const {slider:s} of trials){
        assert.equal(s.activated,true);assert.ok(s.lateralError<.005)
        assert.ok(s.travel<.3 && s.travel>-.05,`${index}/${s.name}: crate failed to support stone, travel=${s.travel}`)
        assert.ok(new THREE.Quaternion().copy(s.stone.body.rotation()).angleTo(new THREE.Quaternion())<.005)
      }
    }finally{trials.forEach(t=>t.dispose());w.free()}
  }
  assert.equal(count,19)
})
test('Level 1: stone ball clears the support crate and crosses the lowered stone bridge', {skip:!available},async()=>{
  await initialized
  const level=load('level_01'),w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
  floor(w,level);const t=make(w,level.objects.find(o=>o.name==='P_Modul_34_01')),s=t.slider
  try{
    s.update(s.stone.origin,1);w.step()
    const start=s.crate.origin.clone().add(new THREE.Vector3(3.5,2,0))
    const hit=w.castShape(start,{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.5),0,8,true,undefined,0x0004ffff)
    assert.ok(hit,'approach floor exists');start.y-=hit.time_of_impact-.01
    const ball=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x,start.y,start.z).setCcdEnabled(true))
    w.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS.stone.mass).setCollisionGroups(0x0004ffff),PLAYER_PHYSICS.stone),ball);configureBody(ball,PLAYER_PHYSICS.stone)
    let contact=false
    for(let i=0;i<396;i++){
      s.update(new THREE.Vector3().copy(ball.translation()),1);driveBall(ball,'stone',-1,0,PHYSICS_STEP);w.step()
      w.contactPair(ball.collider(0),s.crate.body.collider(0),m=>{if(m.numContacts())contact=true})
    }
    for(let attempt=0;attempt<2;attempt++) {
      for(let i=0;i<106;i++){s.update(new THREE.Vector3().copy(ball.translation()),1);driveBall(ball,'stone',1,0,PHYSICS_STEP);w.step()}
      for(let i=0;i<264;i++){s.update(new THREE.Vector3().copy(ball.translation()),1);driveBall(ball,'stone',-1,0,PHYSICS_STEP);w.step()}
    }
    const target=start.clone()
    for(let i=0;i<528;i++) {
      const p=ball.translation(),v=ball.linvel()
      s.update(new THREE.Vector3().copy(p),1)
      driveBall(ball,'stone',THREE.MathUtils.clamp((target.x-p.x)*2-v.x*1.3,-1,1),THREE.MathUtils.clamp((target.z-p.z)*2-v.z*1.3,-1,1),PHYSICS_STEP);w.step()
    }
    const support=w.castShape(ball.translation(),{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.48),0,.2,true,undefined,undefined,undefined,ball)
    assert.ok(support,'ball must remain supported on the floor after clearing the crate')
    assert.equal(contact,true)
    assert.ok(Math.abs(s.crate.body.translation().x-s.crate.origin.x)>1,'crate is moved by normal rolling contact')
    assert.ok(s.travel>.7,'stone should drop into the space vacated by the crate: '+s.travel)
    // Stage at the upper approach to verify the dropped stone now completes that path.
    const upper=s.stone.origin.clone().add(new THREE.Vector3(0,2,-2.5))
    const upperHit=w.castShape(upper,{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.5),0,5,true,undefined,0x0004ffff,undefined,ball)
    assert.ok(upperHit);upper.y-=upperHit.time_of_impact-.01
    ball.setTranslation(upper,true);ball.setLinvel({x:0,y:0,z:0},true);ball.setAngvel({x:0,y:0,z:0},true)
    let crossedStone=false
    for(let i=0;i<1056;i++){
      const p=ball.translation(),v=ball.linvel()
      s.update(new THREE.Vector3().copy(p),1)
      driveBall(ball,'stone',THREE.MathUtils.clamp((upper.x-p.x)*2-v.x*1.3,-1,1),THREE.MathUtils.clamp((s.stone.origin.z+2.5-p.z)*2-v.z*1.3,-1,1),PHYSICS_STEP);w.step()
      w.contactPair(ball.collider(0),s.stone.body.collider(0),m=>{if(m.numContacts())crossedStone=true})
    }
    assert.equal(crossedStone,true,'ball rolls over the dropped stone, not an unrelated floor')
    assert.ok(ball.translation().z>s.stone.origin.z+2)
    const exit=w.castShape(ball.translation(),{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.48),0,.2,true,undefined,undefined,undefined,ball)
    assert.ok(exit,'upper path exit must support the ball');assert.equal(exit.collider.parent(),null)

    assert.ok(s.lateralError<.005)
    assert.ok(new THREE.Quaternion().copy(s.stone.body.rotation()).angleTo(new THREE.Quaternion())<.005)
  }finally{t.dispose();w.free()}
})
