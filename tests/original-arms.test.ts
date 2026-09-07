import { PLAYER_GROUPS } from '../src/game/original-collisions.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { OriginalArms, ORIGINAL_ARMS } from '../src/game/original-arms.ts'
import { springImpulse } from '../src/game/original-spring.ts'
import { originalGeometry } from '../src/game/original-data.ts'
import type { OriginalDocument, OriginalObject } from '../src/game/original-data.ts'
import { PHYSICS_STEP, GRAVITY, FLOOR_PHYSICS, configureContact, PLAYER_PHYSICS, configureBody, driveBall } from '../src/game/original-physics.ts'
import { LEVEL_FLOOR_GROUPS, LEVEL_STOPPER_GROUPS } from '../src/game/original-pusher.ts'
const pack = new URL('../.local/original/', import.meta.url)
const available = existsSync(new URL('p_modul_17.json', pack)), initialized = RAPIER.init()
const load = (name: string): OriginalDocument => JSON.parse(readFileSync(new URL(`${name}.json`, pack), 'utf8'))
function make(world: RAPIER.World, parent?: OriginalObject, sector = 1) {
  const d = load('p_modul_17'), material = new THREE.MeshPhongMaterial()
  const instance = parent || { id: 1, name: 'P_Modul_17_01', mesh: 0, matrix: new THREE.Matrix4().makeRotationY(.63).setPosition(12, 8, -20).toArray(), visible: true }
  const arm = new OriginalArms(world, instance, d, new Map(d.materials.map(m => [m.id, material])), sector)
  return { arm, dispose: () => { arm.mesh.geometry.dispose(); material.dispose() } }
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
test('rotating arms preserve the original three hulls, offset spring and unlimited hinge', () => {
  assert.equal(ORIGINAL_ARMS.body.mass, 3); assert.equal(ORIGINAL_ARMS.body.hulls.length, 3)
  assert.equal(ORIGINAL_ARMS.body.startFrozen, false); assert.equal(ORIGINAL_ARMS.hinge.limitsEnabled, false)
  assert.deepEqual(ORIGINAL_ARMS.spring.position1, [0,4,0]); assert.deepEqual(ORIGINAL_ARMS.spring.position2, [0,0,-4])
  assert.equal(ORIGINAL_ARMS.spring.length, 0)
  assert.ok(Math.abs(ORIGINAL_ARMS.spring.constant - .32) < 1e-7)
})
test('spring force includes axial and sideways damping with consistent time and length units', () => {
  const c = { length: 1, constant: 2, axialDamping: .3, globalDamping: .4 }
  const j = springImpulse(new THREE.Vector3(3,0,0), new THREE.Vector3(2,3,0), c, .01)
  assert.ok(j.distanceTo(new THREE.Vector3(-.188,-.024,0)) < 1e-12)
  const compression = springImpulse(new THREE.Vector3(.5,0,0), new THREE.Vector3(), c, .01)
  assert.ok(compression.x > 0, 'spring pushes when compressed, not a tension-only rope')
  assert.equal(springImpulse(new THREE.Vector3(), new THREE.Vector3(3,2,1), c, .01).length(), 0)
  const half = springImpulse(new THREE.Vector3(3,0,0), new THREE.Vector3(2,3,0), c, .005)
  assert.ok(half.multiplyScalar(2).distanceTo(j) < 1e-12)
})
test('rotating arm sector lifecycle removes its hinge and restores initial spring anchors', { skip: !available }, async () => {
  await initialized
  const w = new RAPIER.World({ x:0,y:GRAVITY,z:0 }); w.timestep = PHYSICS_STEP
  const t = make(w, undefined, 3), a = t.arm
  try {
    a.update(PHYSICS_STEP,2); w.step(); assert.equal(a.body.isEnabled(),false)
    const initialPoint = a.spring.point, fixedPoint = a.spring.fixedPoint.clone()
    const movingLever = initialPoint.clone().sub(a.pivot); movingLever.y = 0
    const fixedLever = fixedPoint.clone().sub(a.pivot); fixedLever.y = 0
    assert.ok(Math.abs(movingLever.length() - 2) < .00001, 'spring attachment retains the frame scale of two')
    assert.ok(Math.abs(fixedLever.length() - 1) < .00001)

    for (let repeat=0;repeat<3;repeat++) {
      a.update(PHYSICS_STEP,3)
      assert.equal(a.body.numColliders(),3); assert.ok(Math.abs(a.body.mass()-3)<1e-5)
      assert.equal(a.joint!.limitsEnabled(),false); assert.equal(w.impulseJoints.len(),1)
      a.body.applyTorqueImpulse(a.axis.clone().multiplyScalar(2),true)
      for (let i=0;i<132;i++) { a.update(PHYSICS_STEP,3);w.step() }
      assert.ok(new THREE.Quaternion().copy(a.body.rotation()).angleTo(new THREE.Quaternion())>.1)
      assert.ok(a.spring.point.distanceTo(initialPoint) > .1, 'first attachment follows the arm')
      assert.equal(a.spring.fixedPoint.distanceTo(fixedPoint), 0, 'second attachment stays fixed despite its initial arm reference')
      a.update(PHYSICS_STEP,4)
      assert.equal(a.body.isEnabled(),false);assert.equal(w.impulseJoints.len(),0)
      assert.ok(a.spring.point.distanceTo(initialPoint)<1e-5)
    }
  } finally { t.dispose();w.free() }
})
test('all six arm placements retain their pivots and spring back after deflection on original floors', { skip: !available }, async () => {
  await initialized
  let count=0
  for (const index of [3,7,9]) {
    const d=load(`level_${String(index).padStart(2,'0')}`),w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
    const trials: ReturnType<typeof make>[]=[]
    try {
      floor(w,d)
      for (const parent of d.objects.filter(o=>o.name.startsWith('P_Modul_17_'))) { trials.push(make(w,parent));count++ }
      for(const {arm:a} of trials){ a.update(PHYSICS_STEP,1);a.body.applyTorqueImpulse(a.axis.clone().multiplyScalar(2),true) }
      const peak=trials.map(()=>0)
      for(let i=0;i<60/PHYSICS_STEP;i++) {
        trials.forEach(t=>t.arm.update(PHYSICS_STEP,1));w.step()
        trials.forEach((t,j)=>{peak[j]=Math.max(peak[j]!,new THREE.Quaternion().copy(t.arm.body.rotation()).angleTo(new THREE.Quaternion()))})
      }
      trials.forEach(({arm:a},i)=>{
        const angle=new THREE.Quaternion().copy(a.body.rotation()).angleTo(new THREE.Quaternion())
        assert.ok(peak[i]!>.2,`must rotate after contact-like torque: ${peak[i]}`)
        assert.ok(angle<peak[i]!*.3,`must return under spring force: ${index}/${a.name} ${angle}/${peak[i]}`)
        assert.ok(a.anchorError<.005)
        assert.ok(a.axis.clone().applyQuaternion(a.body.rotation()).distanceTo(a.axis)<.001)
      })
    }finally{trials.forEach(t=>t.dispose());w.free()}
  }
  assert.equal(count,6)
})

test('wood, stone and paper push through the Level 9 arm and stop on the exit floor', { skip: !available }, async () => {
  await initialized
  for (const kind of ['wood','stone','paper'] as const) {
    const d=load('level_09'),w=new RAPIER.World({x:0,y:GRAVITY,z:0});w.timestep=PHYSICS_STEP
    floor(w,d)
    const t=make(w,d.objects.find(o=>o.name==='P_Modul_17_01')),a=t.arm
    try {
      a.update(PHYSICS_STEP,1);w.step()
      const start=a.origin.clone().add(new THREE.Vector3(-2.5,2,-1.5))
      const hit=w.castShape(start,{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.5),0,8,true,undefined,PLAYER_GROUPS)
      assert.ok(hit,'original approach floor');start.y-=hit.time_of_impact-.01
      const ball=w.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x,start.y,start.z).setCcdEnabled(true))
      let shape=RAPIER.ColliderDesc.ball(.5)
      if(kind==='paper') {
        const balls=load('balls'),o=balls.objects.find(o=>o.name==='Ball_Paper')!,g=originalGeometry(balls.meshes.find(m=>m.id===o.mesh)!,o.matrix,true)
        shape=RAPIER.ColliderDesc.convexHull(g.attributes.position!.array as Float32Array)!;g.dispose()
      }
      w.createCollider(configureContact(shape.setMass(PLAYER_PHYSICS[kind].mass).setCollisionGroups(PLAYER_GROUPS),PLAYER_PHYSICS[kind]),ball);configureBody(ball,PLAYER_PHYSICS[kind])
      let touched=false,peak=0,passed=false
      for(let i=0;i<792;i++) {
        a.update(PHYSICS_STEP,1)
        const p=ball.translation(),v=ball.linvel()
        driveBall(ball,kind,THREE.MathUtils.clamp((start.x-p.x)*2-v.x*1.3,-1,1),THREE.MathUtils.clamp((a.origin.z+2-p.z)*2-v.z*1.3,-1,1),PHYSICS_STEP);w.step()
        for(let j=0;j<a.body.numColliders();j++) w.contactPair(ball.collider(0),a.body.collider(j),m=>{if(m.numContacts())touched=true})
        peak=Math.max(peak,new THREE.Quaternion().copy(a.body.rotation()).angleTo(new THREE.Quaternion()))
        if(ball.translation().z>a.origin.z+1.5 && ball.translation().y>a.origin.y-.1) passed=true
      }
      assert.equal(passed,true,kind+' should roll past the arm')
      const support=w.castShape(ball.translation(),{x:0,y:0,z:0,w:1},{x:0,y:-1,z:0},new RAPIER.Ball(.48),0,.2,true,undefined,undefined,undefined,ball)
      assert.ok(support,kind+' must stop on the exit floor')
      assert.equal(support.collider.parent(),null)
      assert.ok(ball.translation().z>a.origin.z+1.5)
      assert.equal(touched,true,kind+' must contact the actual arm')
      assert.ok(peak>.05,kind+' did not deflect arm: '+peak)
      assert.ok(a.anchorError<.005)
    }finally{t.dispose();w.free()}
  }
})
