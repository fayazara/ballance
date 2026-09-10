import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import * as THREE from 'three'
import {OriginalLightning,OriginalLightningState} from '../src/game/original-lightning.ts'
import data from '../src/game/original-lightning-data.json' with {type:'json'}
import type {OriginalDocument} from '../src/game/original-data.ts'

test('lightning textures advance per script frame and restart at the first texture',()=> {
  const s=new OriginalLightningState();s.start(16)
  assert.equal(s.texture,0);assert.equal(s.age,16)
  s.step(33);assert.equal(s.texture,1)
  s.step(1);assert.equal(s.texture,2)
  s.step(200);assert.equal(s.texture,0)
  s.start(16);assert.equal(s.texture,0);assert.equal(s.age,16)
  assert.ok(Math.abs(s.angle+Math.fround(data.radiansPerSecond*Math.fround(.016)))<1e-8)
})

test('sphere growth ends at 1.5 seconds and the light outlasts its 3-second shell',()=> {
  const s=new OriginalLightningState();s.start(100)
  for(let i=1;i<15;i++)s.step(100)
  assert.equal(s.scale,1);assert.equal(s.sphereVisible,true)
  for(let i=15;i<30;i++)s.step(100)
  assert.equal(s.sphereVisible,false);assert.equal(s.lightVisible,true)
  const angle=s.angle,texture=s.texture
  for(let i=30;i<39;i++)s.step(100)
  assert.equal(s.active,false);assert.equal(s.lightVisible,false)
  assert.equal(s.angle,angle);assert.equal(s.texture,texture)
  s.reset();assert.equal(s.scale,0);assert.deepEqual(s.lightColor,[0,0,0])
})

test('light flicker retains the original 28 authored blue-light keys',()=> {
  assert.equal(data.light.stages[0]!.curve.length,28)
  const s=new OriginalLightningState();s.start(0)
  assert.deepEqual(s.lightColor,[0,0,0])
  s.step(data.light.stages[0]!.curve[2]!.position[0]!*2500)
  assert.equal(s.lightColor[0],0);assert.equal(s.lightColor[1],0)
  assert.ok(Math.abs(s.lightColor[2]!-data.light.stages[0]!.curve[2]!.position[1]!)<1e-6)
})

test('rendered lightning uses imported geometry, all three textures and ONE/ONE blending',{skip:!existsSync('.local/original/balls.json')},()=> {
  const document=JSON.parse(readFileSync('.local/original/balls.json','utf8')) as OriginalDocument
  const textures=data.textureNames.map(name=>{const t=new THREE.Texture();t.name=`textures/${name}.png`;return t})
  const effect=new OriginalLightning(document,textures)
  const mesh=document.meshes.find(m=>m.id===document.objects.find(o=>o.name==='Ball_LightningSphere')!.mesh)!
  assert.equal(effect.mesh.geometry.index!.count,mesh.indices.length)
  assert.equal(effect.mesh.material.blendSrc,THREE.OneFactor);assert.equal(effect.mesh.material.blendDst,THREE.OneFactor)
  assert.equal(effect.mesh.material.depthWrite,false);assert.equal(effect.light.castShadow,false)
  effect.start(new THREE.Vector3(20,4,-5),16)
  assert.equal(effect.mesh.visible,true);assert.equal(effect.mesh.material.map,textures[0])
  assert.deepEqual(effect.light.position.toArray(),[20,6.25,-5])
  effect.follow(new THREE.Vector3(21,4,-5));assert.deepEqual(effect.light.position.toArray(),[21,6.25,-5])
  effect.step(16);assert.equal(effect.mesh.material.map,textures[1])
  effect.reset();assert.equal(effect.mesh.visible,false);assert.equal(effect.light.intensity,0)
  effect.dispose();textures.forEach(t=>t.dispose())
})
