import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import * as THREE from 'three'
import {OriginalCheckpoint} from '../src/game/original-checkpoint.ts'
import type {OriginalDocument,OriginalObject} from '../src/game/original-data.ts'
const marker:OriginalObject={id:1,name:'PC_TwoFlames_01',mesh:1,matrix:new THREE.Matrix4().toArray(),visible:true}

test('checkpoint uses the raised center and a strict three-dimensional 6.5-unit range',()=> {
  const checkpoint=new OriginalCheckpoint(marker)
  assert.ok(Math.abs(checkpoint.center.y-1.4948457479476929)<1e-9)
  for(const axis of ['x','y','z'] as const) {
    const point=checkpoint.center.clone();point[axis]+=6.5
    assert.equal(checkpoint.sample(point),false,'the exact radius is outside')
  }
  const high=checkpoint.center.clone().add(new THREE.Vector3(0,8,0))
  assert.ok(Math.abs(high.y*.25-.5)<2,'the old vertical tolerance would accept this overhead pass')
  assert.equal(checkpoint.sample(high),false)
  assert.equal(checkpoint.sample(checkpoint.center.clone().add(new THREE.Vector3(0,6.4999,0))),true)
  assert.equal(checkpoint.sample(checkpoint.center),false,'the active checkpoint sends only one event')
})

test('checkpoint outer gate retains original adaptive delays before enabling the inner trigger',()=> {
  const checkpoint=new OriginalCheckpoint(marker)
  checkpoint.sample(new THREE.Vector3(200,0,0))
  assert.equal(checkpoint.armed,false)
  assert.equal(checkpoint.gate.remaining,100)
  for(let frame=0;frame<99;frame++)assert.equal(checkpoint.sample(checkpoint.center),false)
  assert.equal(checkpoint.sample(checkpoint.center),true,'both zero-delay activation links can run on the gate polling frame')
  const fresh=new OriginalCheckpoint(marker)
  assert.equal(fresh.sample(fresh.center),true,'script reset restores the initial one-frame countdown')
})

const root=resolve('.local/original'),available=existsSync(resolve(root,'level_12.json'))
test('checkpoint switches its center flame to side flames only after collection, then polls their separate gate',()=> {
  const checkpoint=new OriginalCheckpoint(marker)
  assert.equal(checkpoint.smallFlames,false)
  checkpoint.sample(new THREE.Vector3(50,0,0))
  assert.equal(checkpoint.armed,true)
  assert.equal(checkpoint.smallFlames,false)
  for(let i=0;i<15&&!checkpoint.reached;i++)checkpoint.sample(checkpoint.center)
  assert.equal(checkpoint.reached,true)
  assert.equal(checkpoint.armed,false)
  assert.equal(checkpoint.smallFlames,true)
  assert.equal(checkpoint.smallGate.remaining,20)
  for(let i=0;i<19;i++)checkpoint.sample(new THREE.Vector3(200,0,0))
  assert.equal(checkpoint.smallFlames,true,'side flame shutoff waits for its authored polling frame')
  checkpoint.sample(new THREE.Vector3(200,0,0))
  assert.equal(checkpoint.smallFlames,false)
  assert.equal(checkpoint.smallGate.remaining,100)
  for(let i=0;i<100;i++)assert.equal(checkpoint.sample(checkpoint.center),false,'returning never recollects the checkpoint')
  assert.equal(checkpoint.smallFlames,true)
  assert.equal(checkpoint.armed,false)
})

test('all 51 placed checkpoints preserve their authored center and reject overhead passes',{skip:!available},()=> {
  let count=0
  for(let level=1;level<=12;level++) {
    const course=JSON.parse(readFileSync(resolve(root,`level_${String(level).padStart(2,'0')}.json`),'utf8')) as OriginalDocument
    const members=course.groups.find(g=>g.name==='PC_Checkpoints')!.members
    for(const id of members) {
      const object=course.objects.find(o=>o.id===id)!,checkpoint=new OriginalCheckpoint(object)
      const expected=new THREE.Vector3(0,1.4948457479476929,0).applyMatrix4(new THREE.Matrix4().fromArray(object.matrix))
      assert.ok(checkpoint.center.distanceTo(expected)<1e-9)
      assert.equal(checkpoint.sample(checkpoint.center.clone().add(new THREE.Vector3(0,8,0))),false,`${level}/${object.name}: overhead pass`)
      assert.equal(checkpoint.sample(checkpoint.center.clone().add(new THREE.Vector3(0,2,0))),true,`${level}/${object.name}: ball in the checkpoint`)
      assert.equal(checkpoint.sample(checkpoint.center),false)
      count++
    }
  }
  assert.equal(count,51)
})
