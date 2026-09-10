import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as THREE from 'three'
import {IvpWorld} from '../src/game/ivp-bridge.ts'
import {OriginalIvpPlayer} from '../src/game/original-ivp-player.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
import {IvpReplay} from '../scripts/ivp-replay.ts'
const binary=resolve(process.env.BALLANCE_IVP_BUILD ?? '.local/ivp-simulation','ivp-simulation.mjs')
const pack=resolve('.local/original/balls.json'),available=existsSync(binary)&&existsSync(pack)
const document=()=>JSON.parse(readFileSync(pack,'utf8')) as OriginalDocument
const pose={position:[0,10,0],rotation:[0,0,0,1]}
async function world() {const {default:create}=await import(pathToFileURL(binary).href);return new IvpWorld(await create(),0)}
test('IVP player preserves independent key forces and clears them through capture and material recreation',{skip:!available},async()=> {
  const w=await world(),player=new OriginalIvpPlayer(w,document(),'wood',pose)
  try {
    const old=player.body!
    player.drive('right',[1,0,0]);player.drive('left',[-1,0,0])
    for(let tick=0;tick<66;++tick) w.step()
    assert.ok(Math.abs(w.state(old)[7]!)<1e-6,'opposing original controllers cancel')
    assert.equal(w.state(old)[16],8,'regression requires a sleeping body before releasing an opposing key')
    player.drive('left',undefined)
    for(let tick=0;tick<66;++tick) {player.drive('right',[1,0,0]);w.step()}
    assert.ok(w.state(old)[7]!>5,`holding a key produces sustained input: ${w.state(old)}`)
    const saved=player.capture()
    assert.throws(()=>w.state(old),/state read failed/)
    player.drive('right',[1,0,0])
    for(let tick=0;tick<66;++tick) w.step()
    assert.deepEqual(player.pose,saved,'unphysicalized ball is controlled by its visual pose')
    player.moveCaptured({position:[12,14,16],rotation:[0,0,0,1]});player.release('paper')
    const paper=player.body!
    for(let tick=0;tick<66;++tick) w.step()
    assert.deepEqual(w.state(paper).slice(7,13),[0,0,0,0,0,0],'old material controllers must not leak onto the paper body')
    assert.ok(Math.abs(w.state(paper)[13]!-.2215117932)<1e-6,'paper uses the recovered convex inertia')
    player.respawn('stone',pose)
    assert.throws(()=>w.state(paper),/state read failed/)
    assert.deepEqual(player.pose,pose)
    assert.ok(Math.abs(w.state(player.body!)[13]!-16)<1e-6)
    assert.throws(()=>player.moveCaptured(pose),/Capture the player/)
  } finally {player.dispose();w.dispose()}
  player.dispose();assert.throws(()=>player.pose,/disposed/)
})
test('native and WASM player input, sleep, capture and respawn agree for every material',{skip:!available},async()=> {
  const {default:create}=await import(pathToFileURL(binary).href)
  const replay=new IvpReplay(await create(),0),player=new OriginalIvpPlayer(replay,document(),'wood',pose)
  const simulate=(count:number)=> {for(let tick=0;tick<count;++tick) {replay.step();replay.state(player.body!)}}
  try {
    for(const material of ['wood','paper','stone'] as const) {
      player.respawn(material,pose)
      simulate(66)
      assert.equal(replay.state(player.body!)[16],8,'idle ball must be able to sleep')
      player.drive('right',[1,0,0]);simulate(66)
      assert.ok(replay.state(player.body!)[7]!>1,'press wakes each material')
      player.respawn(material,pose)
      player.drive('left',[-1,0,0]);player.drive('right',[1,0,0]);simulate(66)
      assert.equal(replay.state(player.body!)[16],8,'opposing controllers may sleep')
      player.drive('left',undefined);simulate(66)
      assert.ok(replay.state(player.body!)[7]!>1,'release wakes the surviving controller')
      player.capture();player.moveCaptured({position:[10,20,30],rotation:[0,0,0,1]})
      player.release(material);simulate(66)
      assert.deepEqual(replay.state(player.body!).slice(7,13),[0,0,0,0,0,0])
    }
  } finally {player.dispose();replay.world.dispose()}
  const result=replay.compare(resolve(binary,'..'))
  assert.ok(result.samples>=990)
})
test('IVP player pose maps original rotation and position into the reflected Three.js scene',{skip:!available},async()=> {
  const w=await world(),rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.31,-.63,.18))
  const origin=new THREE.Vector3(31,27,-48),player=new OriginalIvpPlayer(w,document(),'paper',{position:origin.toArray(),rotation:rotation.toArray()})
  try {
    const vertex=new THREE.Vector3(.3,1.7,-.8),flip=new THREE.Vector3(1,1,-1)
    const original=vertex.clone().applyQuaternion(rotation).add(origin).multiply(flip).multiplyScalar(.25)
    const rendered=vertex.clone().multiply(flip).multiplyScalar(.25).applyQuaternion(player.renderPose.rotation).add(player.renderPose.position)
    assert.ok(original.distanceTo(rendered)<1e-10,'reflection must affect quaternion axes as well as translation')
    player.drive('forward',[0,0,1]);w.step()
    assert.ok(Math.abs(player.speed-Math.hypot(...w.state(player.body!).slice(7,10))*.5)<1e-10,'rendered speed includes geometry and original clock conversion')
  } finally {player.dispose();w.dispose()}
})
