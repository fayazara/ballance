import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalDynamicPosition,type Position3} from '../src/game/original-dynamic-position.ts'
import data from '../src/game/original-ufo-data.json' with {type:'json'}
import fixtures from './fixtures/original-dynamic-position.json' with {type:'json'}
import * as THREE from 'three'
import {UfoRotationTrack,ufoCurve} from '../src/game/original-ufo-animation.ts'

test('UFO controller matches the recovered DLL arithmetic for every waypoint at four frame durations',()=> {
  assert.equal(fixtures.cases.length,53)
  for(const sample of fixtures.cases) {
    const controller=new OriginalDynamicPosition()
    controller.start(sample.previous as unknown as Position3)
    const actual=controller.step(sample.current as unknown as Position3,sample.target as unknown as Position3,
      sample.force as unknown as Position3,sample.damping as unknown as Position3,sample.deltaMs,sample.offset as unknown as Position3)
    assert.deepEqual(actual,sample.expected,`row ${sample.row}, frame ${sample.deltaMs} ms`)
  }
})

test('dynamic position preserves overshoot, frame displacement, and restart semantics',()=> {
  const controller=new OriginalDynamicPosition()
  let position:Position3=[0,0,0]
  controller.start(position)
  const observed=[]
  for(let i=0;i<4;i++) {
    position=controller.step(position,[1,0,0],[1,0,0],[.5,0,0],1000)
    observed.push(position[0])
  }
  assert.deepEqual(observed,[1,1.5,1.25,.875],'this controller is not a clamped interpolation')
  controller.start([30,20,10])
  assert.deepEqual(controller.step([30,20,10],[0,0,0],[0,0,0],[1,1,1],17),[30,20,10],
    'restarting clears the old flight displacement')
  assert.deepEqual(controller.step([31,22,13],[0,0,0],[0,0,0],[.5,.5,.5],0),[31.5,23,14.5],
    'damping is applied per callback even when the force time step is zero')
})

test('UFO data retains all thirteen waypoints, ball-relative grab approach, and original spin angle',()=> {
  assert.deepEqual(data.initialPosition,[-500,100,100])
  assert.equal(data.rows.length,13)
  assert.equal(data.rows.reduce((sum,row)=>sum+row.waitMs,0),18800)
  assert.deepEqual(data.rows.flatMap((row,i)=>row.reference==='ball'?[i]:[]),[4,5,6])
  assert.deepEqual(data.rows.flatMap((row,i)=>row.startGrab?[i]:[]),[5])
  assert.equal(data.spin.radiansPerSecond,Math.fround(150*Math.PI/180))
  assert.equal(data.spin.topMultiplier,-1)
  assert.equal(data.grab.durationMs,1000)
  assert.equal(data.flash.durationMs,800)
  assert.deepEqual(data.dynamicPosition.offset,[0,0,0])
  assert.equal(data.dynamicPosition.distanceLimit,0)
})

test('UFO graph preserves delayed boarding activation and the separate delayed ball-centering step',()=> {
  const links=Object.values(data.graph).flat()
  const edge=(index:number)=> {
    const found=links.find(link=>link.index===index)
    assert.ok(found);return [found.source,found.destination,found.initialDelayFrames,found.currentDelayFrames]
  }
  assert.deepEqual(edge(1757),[1198,1265,1,1])
  assert.deepEqual(edge(1758),[1266,1640,1,1])
  assert.deepEqual(edge(1609),[1285,1390,1,1])
  assert.deepEqual(edge(1613),[1279,1366,1,1])
  assert.deepEqual(edge(1499),[1477,1436,0,0])
  assert.deepEqual(edge(1500),[1438,1469,0,0])
  assert.deepEqual(edge(1501),[1470,1489,1,1])
  assert.deepEqual(edge(1760),[1641,1726,0,0])
})

test('all eight claw tracks begin at the saved local orientation and pass through every authored key',()=> {
  assert.equal(data.grab.tracks.length,8)
  for(const track of data.grab.tracks) {
    const part=data.hierarchy.find(part=>part.name===track.name)!
    const parent=data.hierarchy.find(parent=>parent.name===part.parent)!
    const local=new THREE.Matrix4().fromArray(part.matrix).premultiply(new THREE.Matrix4().fromArray(parent.matrix).invert())
    const rotation=new THREE.Quaternion()
    local.decompose(new THREE.Vector3(),rotation,new THREE.Vector3())
    const animation=new UfoRotationTrack(track.keys)
    assert.ok(rotation.angleTo(animation.sample(0).conjugate())<1e-5,`${track.name}: no initial finger snap`)
    for(const key of track.keys)assert.ok(animation.sample(key.time).angleTo(new THREE.Quaternion().fromArray(key.rotation).normalize())<1e-6)
    for(let time=0;time<100;time+=.125)assert.ok(Math.abs(animation.sample(time).length()-1)<1e-10)
    const boundary=59,epsilon=.001
    const left=animation.sample(boundary-epsilon).angleTo(animation.sample(boundary))/epsilon
    const right=animation.sample(boundary).angleTo(animation.sample(boundary+epsilon))/epsilon
    assert.ok(Math.abs(left-right)<.0001,`${track.name}: continuous angular velocity at unevenly spaced key`)
  }
})

test('authored animation progression is linear while the flash starts bright and fades to zero',()=> {
  for(const progress of [0,.1,.35,.59,.7,.75,1])assert.ok(Math.abs(ufoCurve(data.grab.curve,progress)-progress)<1e-8)
  assert.equal(ufoCurve(data.flash.curve,0),data.flash.curve[0]!.position[1])
  assert.equal(ufoCurve(data.flash.curve,data.flash.curve[1]!.position[0]!),1)
  assert.equal(ufoCurve(data.flash.curve,1),0)
  assert.ok(ufoCurve(data.flash.curve,.5)<.3)
})
