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
test('analog force scales real native acceleration and updates while the stick stays held',{skip:!available},async()=>{
  const w=await world(),player=new OriginalIvpPlayer(w,document(),'wood',pose)
  const force=w.force.bind(w),values:number[]=[]
  w.force=descriptor=>{values.push(descriptor.value);return force(descriptor)}
  const run=()=>{for(let i=0;i<30;i++)w.step();return w.state(player.body!)[7]!}
  try {
    player.drive('controller',[1,0,0],1)
    const full=run()
    player.respawn('wood',pose)
    player.drive('controller',[1,0,0],.25)
    const gentle=run()
    assert.ok(full>0)
    assert.ok(Math.abs(gentle/full-.25)<.001,`quarter force must yield quarter acceleration: ${gentle/full}`)
    player.drive('controller',[1,0,0],.5)
    const stronger=run()
    assert.equal(values.at(-1)!/values[0]!,.5,'changing magnitude must update the held force')
    assert.ok(stronger>gentle*2,'held stick accelerates more strongly after increasing tilt')
    player.drive('controller',undefined)
    const coast=run()
    assert.ok(coast>0&&coast<=stronger,'centering the stick coasts with native damping instead of accelerating')
    const creations=values.length
    player.drive('controller',[1,0,0],0)
    assert.equal(values.length,creations,'zero strength does not reattach a force')
    player.respawn('wood',pose)
    player.drive('right',[1,0,0])
    assert.ok(Math.abs(run()-full)<1e-5,'keyboard drive retains the original full strength')
  } finally {player.dispose();w.dispose()}
})
test('initial formation can construct the player without creating any native body',{skip:!available},async()=> {
  const w=await world(),sphere=w.sphere.bind(w),convex=w.convex.bind(w)
  let creations=0
  w.sphere=(...args)=>{creations++;return sphere(...args)}
  w.convex=(...args)=>{creations++;return convex(...args)}
  try {
    for(const kind of ['wood','stone','paper'] as const) {
      const player=new OriginalIvpPlayer(w,document(),kind,pose,false)
      assert.equal(creations,0);assert.equal(player.body,undefined)
      assert.deepEqual(player.pose,pose)
      player.drive('right',[1,0,0]);w.step()
      assert.equal(creations,0);assert.deepEqual(player.pose,pose)
      player.release(kind)
      assert.equal(creations,1)
      assert.deepEqual(w.state(player.body!).slice(7,13),[0,0,0,0,0,0])
      player.dispose();creations=0
    }
  } finally {w.dispose()}
})

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

test('all six material replacements preserve a non-identity world pose without inherited drive or momentum',{skip:!available},async()=>{
  const {default:create}=await import(pathToFileURL(binary).href)
  const replay=new IvpReplay(await create(),0),player=new OriginalIvpPlayer(replay,document(),'wood',pose)
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.73,-1.19,.42)).normalize()
  const target={position:[37.125,19.75,-48.625],rotation:rotation.toArray()}
  try {
    for(const from of ['wood','paper','stone'] as const)for(const to of ['wood','paper','stone'] as const) {
      if(from===to)continue
      player.respawn(from,target);player.drive('forward',[0,0,1])
      for(let i=0;i<10;i++)replay.step()
      const captured=player.capture()
      player.moveCaptured({...captured,position:target.position})
      player.release(to)
      for(let i=0;i<20;i++) {
        replay.step();const state=replay.state(player.body!)
        assert.deepEqual(state.slice(7,13),[0,0,0,0,0,0],`${from} to ${to}: no old velocity or force`)
        assert.ok(new THREE.Vector3(...state.slice(0,3)).distanceTo(new THREE.Vector3(...target.position))<1e-5)
        const actual=new THREE.Quaternion(...state.slice(3,7)).normalize()
        assert.ok(1-Math.abs(actual.dot(new THREE.Quaternion(...captured.rotation)))<1e-6,`${from} to ${to}: copied world orientation`)
      }
    }
  } finally {player.dispose();replay.world.dispose()}
  assert.ok(replay.compare(resolve(binary,'..')).samples>=120)
})

test('replacement selection updates bounds while keeping the ball unphysicalized',{skip:!available},async()=>{
  const w=await world(),assets=document(),player=new OriginalIvpPlayer(w,assets,'stone',pose)
  try {
    assert.throws(()=>player.selectCapturedMaterial('paper'),/Capture the player/)
    const saved=player.capture(),oldBounds=player.localBounds
    player.selectCapturedMaterial('paper')
    assert.equal(player.body,undefined)
    assert.equal(player.material,'paper')
    assert.deepEqual(player.pose,saved)
    const object=assets.objects.find(o=>o.name==='Ball_Paper')!,mesh=assets.meshes.find(m=>m.id===object.mesh)!
    const expected=new THREE.Box3().setFromArray(mesh.positions.map(Math.fround))
    assert.ok(player.localBounds.equals(expected))
    assert.equal(player.localBounds.equals(oldBounds),false)
    for(let i=0;i<2;i++)w.step()
    assert.equal(player.body,undefined,'selection alone must not create collision physics')
    player.release('paper')
    assert.ok(player.body!==undefined)
    assert.ok(player.localBounds.equals(expected))
  } finally {player.dispose();w.dispose()}
})

test('transformer capture and native release preserve pose at every saved machine across all twelve levels',{skip:!available},async()=>{
  const {default:RAPIER}=await import('@dimforge/rapier3d-compat')
  const {BallTransformation}=await import('../src/game/original-transformation.ts')
  const {OriginalTransformerFrame}=await import('../src/game/original-transformer-spring.ts')
  await RAPIER.init()
  const native=await world(),comparison=new RAPIER.World({x:0,y:0,z:0})
  const body=comparison.createRigidBody(RAPIER.RigidBodyDesc.dynamic())
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,-.7,.5))
  const player=new OriginalIvpPlayer(native,document(),'wood',pose)
  const pairs=[['wood','stone'],['stone','paper'],['paper','wood'],['wood','paper'],['paper','stone'],['stone','wood']] as const
  const oracle=JSON.parse(readFileSync(resolve('docs/original-transformer-spring-oracle.json'),'utf8'))
  const stopped=oracle.samples.find((r:number[])=>r[0]===100&&r[1]===13) as number[]
  let count=0,tilted=0
  try{
    for(let level=1;level<=12;level++){
      const course=JSON.parse(readFileSync(resolve(`.local/original/level_${String(level).padStart(2,'0')}.json`),'utf8')) as OriginalDocument
      const ids=new Set(course.groups.filter(g=>g.name.startsWith('P_Trafo_')).flatMap(g=>g.members))
      for(const machine of course.objects.filter(o=>ids.has(o.id))){
        for(const [from,to] of pairs){
        const frame=new OriginalTransformerFrame(machine.matrix)
        const start=frame.rendered({x:3.2,y:3.2,z:1.2}),target=frame.rendered({x:0,y:3,z:0})
        player.respawn(from,{position:[start.x*4,start.y*4,-start.z*4],rotation:rotation.toArray()})
        player.drive('right',[1,0,0])
        const initial=player.renderPose
        body.setTranslation(initial.position,true);body.setRotation(initial.rotation,true)
        const sequence=new BallTransformation()
        sequence.begin(body,from,to,target,machine.matrix);player.capture()
        const transfer=()=>{
          const p=body.translation(),q=body.rotation()
          player.moveCaptured({position:[p.x*4,p.y*4,-p.z*4],rotation:[-q.x,-q.y,q.z,q.w]})
        }
        let swaps=0,releases=0
        for(let tick=0;tick<30&&sequence.active;tick++){
          sequence.step(.1,kind=>{transfer();player.selectCapturedMaterial(kind);swaps++},()=>{},()=>{
            transfer();const before=player.pose;player.release(to);releases++
            const after=player.pose
            for(let axis=0;axis<3;axis++)assert.ok(Math.abs(before.position[axis]!-after.position[axis]!)<.0002,`Level ${level} ${machine.name}: release translation`)
            assert.ok(1-Math.abs(new THREE.Quaternion(...after.rotation).dot(rotation))<1e-6,'capture must not rotate the replacement to the machine')
            assert.deepEqual(native.state(player.body!).slice(7,13),[0,0,0,0,0,0],'old input and velocity must not survive replacement')
          })
          if(!sequence.physicalized){transfer();assert.equal(player.body,undefined)}
        }
        assert.equal(swaps,1);assert.equal(releases,1);assert.equal(player.material,to)
        assert.equal(sequence.active,false)
        const final=frame.local(player.renderPose.position)
        assert.ok(Math.hypot(final.x-stopped[2]!,final.y-stopped[3]!,final.z-stopped[4]!)<.003,`Level ${level} ${machine.name}: capture ends near local target ${JSON.stringify(final)}`)
        if(Math.abs(machine.matrix[5]!-1)>.001)tilted++
        count++
        }
      }
    }
    assert.equal(count,1170);assert.ok(tilted>0)
  }finally{player.dispose();native.dispose();comparison.free()}
})
