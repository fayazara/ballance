import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {batchOpaqueGroups} from '../src/game/original-render-batching.ts'
import {OriginalRenderBudget} from '../src/game/original-render-budget.ts'
import {OriginalFlames} from '../src/game/original-flames.ts'
import checkpoint from '../src/game/original-checkpoint-data.json' with {type:'json'}

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

test('mixed floor batches never move triangles across transparent or non-depth-writing groups',()=> {
  for(const transparent of [true,false]) {
    const g=new THREE.BufferGeometry(),order=[0,1,0,2,0,1,0,2,0]
    g.setIndex(Array.from({length:order.length*3},(_,i)=>i))
    order.forEach((material,i)=>g.addGroup(i*3,3,material))
    const materials=[new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial(),new THREE.MeshBasicMaterial({transparent,depthWrite:false})]
    assert.equal(batchOpaqueGroups(g,materials),true)
    assert.equal(g.groups.length,7)
    const barriers=g.groups.filter(g=>g.materialIndex===2)
    assert.deepEqual(barriers,[{start:9,count:3,materialIndex:2},{start:21,count:3,materialIndex:2}])
    const actual=g.groups.flatMap(group=>Array.from({length:group.count/3},(_,i)=>({material:group.materialIndex,indices:Array.from(g.index!.array.slice(group.start+i*3,group.start+i*3+3))})))
    actual.sort((a,b)=>a.indices[0]!-b.indices[0]!)
    assert.deepEqual(actual,order.map((material,i)=>({material,indices:[i*3,i*3+1,i*3+2]})))
    assert.equal(batchOpaqueGroups(g,materials),false)
  }
})

test('flame culling bounds contain every particle and paused effects do not upload unchanged buffers',()=> {
  for(const settings of [undefined,checkpoint.centerParticles,checkpoint.smallParticles]) {
    const flames=new OriginalFlames([new THREE.Vector3(30,20,-80),new THREE.Vector3(-5,1,9)],new THREE.Texture(),settings)
    assert.equal(flames.points.frustumCulled,true)
    for(const time of [0,.02,.4,1,10,250]) {
      flames.update(time,1000,45)
      const position=flames.geometry.getAttribute('position'),size=flames.geometry.getAttribute('size')
      for(let i=0;i<position.count;i++) {
        const p=new THREE.Vector3().fromBufferAttribute(position,i),sphere=flames.geometry.boundingSphere!
        assert.ok(p.distanceTo(sphere.center)+size.getX(i)/2<=sphere.radius,'bound must include the entire sprite, not only its center')
      }
    }
    const position=flames.geometry.attributes.position!,version=position.version
    flames.update(250,500,45);assert.equal(position.version,version)
    const scale=flames.material.uniforms.pixelScale!.value
    flames.update(250,1000,45);assert.equal(flames.material.uniforms.pixelScale!.value,scale*2)
    flames.update(251,1000,45);assert.ok(position.version>version)
    flames.dispose()
  }
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
