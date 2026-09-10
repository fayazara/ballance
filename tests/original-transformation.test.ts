import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { BallTransformation, transformerPose } from '../src/game/original-transformation.ts'
import { PHYSICS_STEP, PLAYER_PHYSICS, configureBody, configureContact, driveBall } from '../src/game/original-physics.ts'
import type { Material } from '../src/game/levels.ts'
import { OriginalTransformerVisual } from '../src/game/original-transformer-visual.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'

const initialized = RAPIER.init()
async function setup(current: Material = 'wood') {
  await initialized
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 }); world.timestep = PHYSICS_STEP
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, .5, 10).setTranslation(0, -.5, 0))
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(.8, .8, .3))
  world.createCollider(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS[current].mass), body)
  body.setLinvel({ x: 9, y: 1, z: 4 }, true); body.setAngvel({ x: 3, y: 2, z: 4 }, true)
  const sequence = new BallTransformation()
  let material = current, changes = 0
  const step = () => {
    // A held key cannot move the captured body, even if accidentally forwarded.
    if (sequence.active && !sequence.committed) driveBall(body, material, 1, 1, PHYSICS_STEP)
    sequence.step(PHYSICS_STEP, kind => {
      material = kind; changes++
      world.removeCollider(body.collider(0), true)
      world.createCollider(configureContact(RAPIER.ColliderDesc.ball(.5).setMass(PLAYER_PHYSICS[kind].mass), PLAYER_PHYSICS[kind]), body)
      body.recomputeMassPropertiesFromColliders(); configureBody(body, PLAYER_PHYSICS[kind])
    })
    world.step()
  }
  const until = (time: number) => { while (sequence.age < time && sequence.active) step() }
  return { world, body, sequence, until, step, get material() { return material }, get changes() { return changes } }
}
test('captures a moving ball, animates before swapping, and releases it without stored momentum', async () => {
  const t = await setup()
  try {
    assert.equal(t.sequence.begin(t.body, 'wood', 'stone', { x: 0, y: .75, z: 0 }), true)
    assert.equal(t.body.isFixed(), true); assert.equal(t.body.collider(0).isEnabled(), false)
    t.until(.35)
    assert.equal(t.material, 'wood'); assert.equal(t.changes, 0)
    assert.ok(t.body.translation().x < .1, 'ball snaps toward the center during ring opening')
    t.until(1.35)
    assert.ok(Math.abs(t.body.translation().x) < .001,'spring converges near the center without teleporting')
    assert.ok(Math.abs(t.body.translation().y - .75) < .001)
    t.until(2.36)
    assert.equal(t.sequence.ballVisible, false); assert.equal(t.material, 'wood')
    t.until(2.51)
    assert.equal(t.material, 'stone'); assert.equal(t.changes, 1)
    assert.equal(t.sequence.ballVisible, true); assert.equal(t.body.isDynamic(), true)
    assert.equal(t.body.collider(0).isEnabled(), true); assert.ok(Math.abs(t.body.mass() - 10) < .001)
    assert.equal(t.body.linvel().x, 0); assert.equal(t.body.angvel().z, 0)
    t.until(3)
    assert.equal(t.sequence.active, false); assert.equal(t.changes, 1)
    for (let i = 0; i < 100; i++) t.world.step()
    assert.ok(Math.abs(t.body.translation().y - .5) < .03, 'replacement has working floor collisions')
  } finally { t.world.free() }
})
test('all six material changes work; same-material pads and overlapping triggers are ignored', async () => {
  for (const from of ['wood', 'stone', 'paper'] as Material[]) for (const to of ['wood', 'stone', 'paper'] as Material[]) {
    const t = await setup(from)
    try {
      assert.equal(t.sequence.begin(t.body, from, to, { x: 0, y: .75, z: 0 }), from !== to)
      if (from === to) { assert.ok(t.body.isDynamic()); continue }
      assert.equal(t.sequence.begin(t.body, from, from, { x: 10, y: 10, z: 10 }), false)
      t.until(3)
      assert.equal(t.material, to); assert.equal(t.changes, 1)
      assert.ok(Math.abs(t.body.mass() - PLAYER_PHYSICS[to].mass) < .001)
    } finally { t.world.free() }
  }
})
test('capture Off completes its spring update and retains the residual position during the explosion delay', async () => {
  const t = await setup()
  try {
    t.sequence.begin(t.body,'wood','stone',{x:0,y:.75,z:0})
    // At 10 Hz the residual is large enough to distinguish retaining the last
    // spring position from the former unconditional center teleport.
    for(let i=0;i<13;i++)t.sequence.step(.1,()=>assert.fail('early replacement'))
    const before=t.body.translation()
    t.sequence.step(.1,()=>assert.fail('early replacement'))
    const stopped=t.body.translation()
    assert.notEqual(stopped.x,before.x,'Off frame still advances the spring')
    assert.ok(Math.abs(stopped.x)>.001,'the spring has not landed exactly at its target')
    for(let i=0;i<9;i++)t.sequence.step(.1,()=>assert.fail('early replacement'))
    assert.deepEqual(t.body.translation(),stopped,'no position setter runs after Off')
  } finally {t.world.free()}
})
test('spring activation records the starting position and moves only on the next frame',async()=>{
  const t=await setup()
  try {
    t.sequence.begin(t.body,'wood','stone',{x:0,y:.75,z:0})
    const start=t.body.translation()
    t.sequence.step(1/60,()=>assert.fail('early replacement'))
    assert.deepEqual(t.body.translation(),start)
    assert.ok(t.sequence.age>0,'the concurrently activated timer still consumes this frame')
    t.sequence.step(1/60,()=>assert.fail('early replacement'))
    assert.ok(t.body.translation().x<start.x)
  }finally{t.world.free()}
})
test('transformer stage boundaries match upstream float timers and zero-frame activation links', async () => {
  // Compiled TimerMini.cpp oracle: scripts/verify-original-transformer-clock.py.
  for(const [hz,capture,explosion,replacement] of [[10,14,10,2],[30,41,31,5],[60,82,60,9],[120,162,121,18],[144,195,144,22]]) {
    const t=await setup()
    try {
      t.sequence.begin(t.body,'wood','stone',{x:0,y:.75,z:0})
      const events:{frame:number;kind:string}[]=[]
      for(let frame=1;frame<=capture!+explosion!+replacement!;frame++) {
        t.sequence.step(1/hz!,()=>events.push({frame,kind:'replace'}),()=>events.push({frame,kind:'explode'}),()=>events.push({frame,kind:'physicalize'}))
        assert.equal(t.sequence.ballVisible,!t.sequence.shattered||t.sequence.committed)
        if(t.sequence.committed&&!t.sequence.physicalized){assert.ok(t.body.isFixed());assert.equal(t.body.collider(0).isEnabled(),false)}
      }
      assert.deepEqual(events,[{frame:capture!+explosion!-1,kind:'explode'},{frame:capture!+explosion!+replacement!-2,kind:'replace'},{frame:capture!+explosion!+replacement!,kind:'physicalize'}],`${hz} Hz`)
      assert.ok(t.body.isDynamic());assert.equal(t.body.collider(0).isEnabled(),true)
    } finally {t.world.free()}
  }
})
test('pausing advances nothing; cancelling at any stage restores physics and prevents a late swap', async () => {
  for (const age of [.1, 1, 2.4, 2.52]) {
    const t = await setup()
    try {
      t.sequence.begin(t.body, 'wood', 'stone', { x: 0, y: .75, z: 0 }); t.until(age)
      const before = { age: t.sequence.age, position: t.body.translation(), changes: t.changes }
      // The game pauses by withholding simulation steps; drawing a pose is read-only.
      for (let i = 0; i < 100; i++) transformerPose(t.sequence.age)
      assert.deepEqual({ age: t.sequence.age, position: t.body.translation(), changes: t.changes }, before)
      t.sequence.cancel(); t.step()
      assert.equal(t.sequence.active, false); assert.equal(t.sequence.ballVisible, true)
      assert.equal(t.body.isDynamic(), true); assert.equal(t.body.collider(0).isEnabled(), true)
      assert.equal(t.changes, before.changes)
    } finally { t.world.free() }
  }
})
test('a rearmed transformer can start while the previous visual tail remains at high refresh rates',async()=>{
  const t=await setup()
  try {
    t.sequence.begin(t.body,'wood','stone',{x:0,y:.75,z:0})
    for(let frame=0;frame<366;frame++)t.sequence.step(1/144,()=>{})
    assert.ok(t.sequence.physicalized)
    assert.ok(t.sequence.active,'visual tail still running after rearm and next entry delay')
    assert.equal(t.sequence.begin(t.body,'stone','paper',{x:1,y:.75,z:0}),true)
    assert.equal(t.sequence.physicalized,false)
    assert.equal(t.sequence.committed,false)
    assert.equal(t.sequence.kind,'paper')
    assert.equal(t.body.collider(0).isEnabled(),false)
  } finally {t.world.free()}
})
test('original ring opens, travels above the ball, flashes, and returns flush with its base', () => {
  assert.equal(transformerPose(0).opening, 0)
  assert.equal(transformerPose(.35).opening, 1)
  assert.ok(transformerPose(1.35).height > 1.29)
  assert.equal(transformerPose(1.35).flashing, true)
  const end = transformerPose(2.55)
  assert.ok(Math.abs(end.opening) < .000001); assert.equal(end.height, 0); assert.equal(end.flashing, false)
})
test('imported animation handles unused material slots and restores the stationary machine', t => {
  const file = new URL('../.local/original/animtrafo.json', import.meta.url)
  if (!existsSync(file)) { t.skip('requires the local original animation pack'); return }
  const document = JSON.parse(readFileSync(file, 'utf8')) as OriginalDocument
  const materials = new Map(document.materials.map(m => [m.id, new THREE.MeshPhongMaterial({ map: new THREE.Texture() })]))
  const visual = new OriginalTransformerVisual(document, materials)
  const machine = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshPhongMaterial())
  try {
    visual.begin({ id: 1, name: 'P_Trafo_Stone', mesh: 0, visible: true, matrix: new THREE.Matrix4().toArray() }, [machine])
    assert.equal(machine.visible, false)
    for (const age of [0, .2, .35, 1.35, 2.4, 2.55]) visual.update(age)
    visual.reset(); assert.equal(machine.visible, true); assert.equal(visual.group.visible, false)
  } finally { visual.dispose(); materials.forEach(m => { m.map?.dispose(); m.dispose() }); machine.geometry.dispose(); machine.material.dispose() }
})

test('gameplay capture uses the original local-frame spring samples',async()=>{
  const {default:oracle}=await import('../docs/original-transformer-spring-oracle.json',{with:{type:'json'}})
  for(const dt of new Set(oracle.samples.map(row=>row[0]))){
    const t=await setup()
    try{
      t.body.setTranslation({x:.8,y:.8,z:-.3},true)
      t.sequence.begin(t.body,'wood','stone',{x:0,y:.75,z:0},new THREE.Matrix4().elements)
      for(const row of oracle.samples.filter(row=>row[0]===dt&&row[1]!<12)){
        t.sequence.step(dt!/1000,()=>assert.fail('early swap'))
        const actual=t.body.translation()
        assert.deepEqual({...actual},{x:Math.fround(row[2]!)/4,y:Math.fround(row[3]!)/4,z:-Math.fround(row[4]!)/4})
      }
    }finally{t.world.free()}
  }
})
