import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {OriginalPointExtra} from '../src/game/original-point-extra.ts'
const zero=()=>new THREE.Vector3()

test('activation gives 100 points once, retains six satellites and waits a full second before pursuit',()=>{
  const extra=new OriginalPointExtra(zero())
  assert.equal(extra.step(20,new THREE.Vector3(.751,0,0)).points,0)
  assert.equal(extra.stage,'idle')
  assert.deepEqual(extra.step(20,new THREE.Vector3(.75,0,0)),{activated:true,hits:[],points:100,ready:false})
  assert.equal(extra.remaining,6)
  for(let i=0;i<49;i++){assert.equal(extra.step(20,zero()).points,0);assert.equal(extra.stage,'away')}
  assert.equal(extra.step(20,zero()).points,0);assert.equal(extra.stage,'pursuit')
})
test('fly-away acceleration uses the saved activation point and previous-frame displacement',()=>{
  const extra=new OriginalPointExtra(zero());extra.step(20,zero())
  extra.step(20,new THREE.Vector3(100,100,100))
  assert.ok(Math.abs(extra.positions[0]!.y-.0255)<1e-8)
  assert.ok(Math.abs(extra.positions[0]!.z-(-.51))<1e-8)
  extra.step(20,new THREE.Vector3(-100,-100,-100))
  assert.ok(Math.abs(extra.positions[0]!.y-.05916)<1e-8)
  assert.ok(Math.abs(extra.positions[0]!.z-(-.5232))<1e-8)
})
test('collection uses squared distance 4 original units, awards each hit once and signals ready next frame',()=>{
  const extra=new OriginalPointExtra(zero());extra.stage='pursuit';extra.visible.fill(false);extra.visible[0]=true
  extra.positions[0]!.set(.5001,0,0)
  assert.equal(extra.step(20,zero()).points,0)
  extra.positions[0]!.set(.5,0,0)
  assert.deepEqual(extra.step(20,zero()),{activated:false,hits:[0],points:20,ready:false})
  assert.deepEqual(extra.step(20,zero()),{activated:false,hits:[],points:0,ready:true})
  assert.equal(extra.step(20,zero()).points,0)
})
test('all six physical pursuit trajectories return to a stationary player for exactly 220 points',()=>{
  const extra=new OriginalPointExtra(new THREE.Vector3(20,3,-5)),player=extra.origin.clone()
  let points=0,hits=0
  for(let i=0;i<3000&&extra.stage!=='done';i++){
    const result=extra.step(1000/60,player);points+=result.points;hits+=result.hits.length
    assert.ok(extra.positions.every(p=>p.toArray().every(Number.isFinite)))
  }
  assert.equal(extra.stage,'done');assert.equal(points,220);assert.equal(hits,6)
})
test('checkpoint or death cancellation prevents awards from outstanding satellites',()=>{
  const extra=new OriginalPointExtra(zero());assert.equal(extra.step(20,zero()).points,100)
  extra.cancel()
  for(let i=0;i<400;i++)assert.equal(extra.step(20,zero()).points,0)
  assert.equal(extra.remaining,0);assert.ok(extra.visible.every(v=>!v))
})
