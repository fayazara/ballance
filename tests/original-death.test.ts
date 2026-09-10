import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import * as THREE from 'three'
import {OriginalDeathTest} from '../src/game/original-death.ts'
import {originalIvpResetpoints} from '../src/game/original-ivp-level.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'

const ball=new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1))
const at=(x=0,y=0,z=0)=>new THREE.Matrix4().makeTranslation(x,y,z)
const fixture=():OriginalDocument=>({objects:[
  {id:1,name:'first object',mesh:1,matrix:at().toArray(),visible:false},
  {id:2,name:'first group member',mesh:1,matrix:at(10).toArray(),visible:false}],
  meshes:[{id:1,positions:[-1,-1,-1,1,1,1],normals:[],uvs:[],indices:[],materials:[],faceMaterials:[]}],
  materials:[],textures:[],groups:[{name:'DepthTestCubes',members:[2,1]}]})

test('death polling follows group order, one-frame links, iterator exhaustion and restart',()=> {
  const death=new OriginalDeathTest(fixture())
  assert.equal(death.sample(ball,at()),undefined,'frame 1 checks group member 2, not object-array order')
  assert.equal(death.sample(ball,at()),'first object','frame 2 checks group member 1')
  assert.equal(death.sample(ball,at(100)),'first object','a hit remains latched until a new ball')
  death.restart()
  assert.equal(death.sample(ball,at(100)),undefined)
  assert.equal(death.sample(ball,at(100)),undefined)
  assert.equal(death.sample(ball,at(10)),undefined,'the exhausted iterator has no element on frame 3')
  assert.equal(death.sample(ball,at(10)),'first group member','the next frame restarts the group')
})

test('death volumes use touching local boxes, including rotated and scaled volume frames',()=> {
  const course=fixture();course.groups[0]!.members=[1]
  let death=new OriginalDeathTest(course)
  assert.equal(death.sample(ball,at(2)), 'first object','touching faces count as intersection')
  death.restart();assert.equal(death.sample(ball,at(2.00001)),undefined)
  course.objects[0]!.matrix=new THREE.Matrix4().compose(new THREE.Vector3(),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4),new THREE.Vector3(4,1,.25)).toArray()
  death=new OriginalDeathTest(course)
  const small=new THREE.Box3(new THREE.Vector3(-.1,-.1,-.1),new THREE.Vector3(.1,.1,.1))
  assert.equal(death.sample(small,at(2,0,-2)),'first object','inside the rotated long axis')
  death.restart();assert.equal(death.sample(small,at(2,0,2)),undefined,'inside its world AABB but outside its oriented box')
  death.restart();assert.equal(death.sample(small,at(0,1.2)),undefined,'vertical separation is not ignored')
})

const root=resolve('.local/original'),available=existsSync(resolve(root,'level_12.json'))
const read=(name:string)=>JSON.parse(readFileSync(resolve(root,name+'.json'),'utf8')) as OriginalDocument

test('every authored death volume is reachable while all 63 reset points remain safe for all three balls',{skip:!available},t=> {
  const balls=read('balls'),bounds=['wood','stone','paper'].map(kind=>{
    const object=balls.objects.find(o=>o.name.toLowerCase()===`ball_${kind}`)!,mesh=balls.meshes.find(m=>m.id===object.mesh)!
    return new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(mesh.positions,3))
  })
  let volumes=0,resets=0
  for(let level=1;level<=12;level++) {
    const course=read(`level_${String(level).padStart(2,'0')}`),death=new OriginalDeathTest(course)
    assert.ok(death.volumes.length>0)
    for(const volume of death.volumes) {
      for(const box of bounds) {
        death.restart()
        for(let frame=0;frame<=death.volumes.length;frame++)death.sample(box,at(...volume.box.center.toArray() as [number,number,number]))
        assert.ok(death.hit,`Level ${level}/${volume.name}: detects a ball inside the volume`)
      }
      volumes++
    }
    for(const reset of originalIvpResetpoints(course)) {
      for(const box of bounds) {
        death.restart()
        for(let frame=0;frame<2*(death.volumes.length+1);frame++)death.sample(box,new THREE.Matrix4().fromArray(reset.matrix))
        assert.equal(death.hit,undefined,`Level ${level}/${reset.name}: the reset must not kill a ball`)
      }
      resets++
    }
    for(const box of bounds) {
      death.restart()
      for(let frame=0;frame<2*(death.volumes.length+1);frame++)death.sample(box,at(1e6,-1e6,1e6))
      assert.equal(death.hit,undefined,'the source has volumes, not an infinite death plane')
    }
  }
  assert.equal(resets,63)
  t.diagnostic(JSON.stringify({levels:12,volumes,resetMaterialCases:resets*3}))
})
