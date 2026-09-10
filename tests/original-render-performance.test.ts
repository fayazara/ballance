import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {batchOpaqueGroups} from '../src/game/original-render-batching.ts'
import {OriginalRenderBudget} from '../src/game/original-render-budget.ts'

test('opaque face batches retain each oriented triangle and material without touching positions',()=> {
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,1,1,0],3))
  g.setIndex([0,1,2,1,3,2,2,1,0]);g.addGroup(0,3,0);g.addGroup(3,3,1);g.addGroup(6,3,0)
  // Imported material tables can contain unused undefined slots.
  const position=g.attributes.position,materials=[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial(),undefined]
  assert.equal(batchOpaqueGroups(g,materials),true)
  assert.equal(g.attributes.position,position)
  assert.deepEqual([...g.index!.array],[0,1,2,2,1,0,1,3,2])
  assert.deepEqual(g.groups,[{start:0,count:6,materialIndex:0},{start:6,count:3,materialIndex:1}])
  assert.equal(batchOpaqueGroups(g,materials),false,'already batched geometry is unchanged')
  g.clearGroups();g.addGroup(0,3,0);g.addGroup(3,3,1);g.addGroup(6,3,0)
  materials[1]!.transparent=true
  assert.equal(batchOpaqueGroups(g,materials),false,'alpha-blended faces preserve authored ordering')
})

test('phone render budget caps retina pixels and responds only to sustained slow frames',()=> {
  const budget=new OriginalRenderBudget()
  assert.equal(budget.configure(390,844,3,true,true),1.5)
  for(let i=0;i<30;i++)budget.sample(33.3)
  assert.equal(budget.ratio,1.5)
  for(let i=0;i<35;i++)budget.sample(33.3)
  assert.equal(budget.ratio,1.35)
  for(let i=0;i<1000;i++)budget.sample(33.3)
  assert.equal(budget.ratio,.75)
  for(let i=0;i<660;i++)budget.sample(16.67)
  assert.ok(budget.ratio>.75&&budget.ratio<1)
  const before=budget.ratio;budget.sample(4000);assert.equal(budget.ratio,before)
  assert.ok(budget.configure(5000,3000,2,true,false)<=1,'large desktop canvases also have a pixel ceiling')
  budget.configure(390,844,3,true,true)
  for(let i=0;i<10;i++)budget.sample(200)
  assert.equal(budget.ratio,1.35,'severe sustained stalls must also lower phone resolution')
})
