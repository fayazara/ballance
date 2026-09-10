import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalPointTrailState,pointSatellitePosition,POINT_TRAIL} from '../src/game/original-point-trails.ts'
import {OriginalPointTrails} from '../src/game/original-point-trails.ts'
import * as THREE from 'three'

test('trail culling bounds follow emitted dots through pursuit and retain old stationary dots',()=> {
  const trail=new OriginalPointTrails(new THREE.PointsMaterial())
  const positions=Array.from({length:6},(_,i)=>new THREE.Vector3(200+i,50,-100))
  trail.update(0,positions);trail.update(.02,positions)
  for(const p of positions)p.x+=10
  trail.update(.04,positions)
  assert.equal(trail.mesh.frustumCulled,true)
  assert.ok(trail.state.dots.length>=12)
  for(const dot of trail.state.dots)assert.ok(trail.geometry.boundingSphere!.containsPoint(dot.position))
  trail.dispose()
})

test('red dots remain at emitted positions while each silver satellite continues orbiting',()=>{
  const trail=new OriginalPointTrailState();trail.update(0);trail.update(.02)
  assert.equal(trail.dots.length,6)
  const first=trail.dots[0]!,position=first.position.clone()
  trail.update(.1)
  assert.ok(first.position.equals(position))
  assert.ok(first.position.distanceTo(pointSatellitePosition(0,.1))>.1)
  assert.equal(new Set(trail.dots.map(d=>d.emitter)).size,6)
})
test('paused time produces no new particles and expired dots leave the bounded pool',()=>{
  const trail=new OriginalPointTrailState();trail.update(0)
  for(let i=1;i<=600;i++)trail.update(i/60)
  assert.ok(trail.dots.length>100&&trail.dots.length<=6*POINT_TRAIL.capacity)
  assert.ok(trail.dots.every(dot=>10-dot.born<1))
  const count=trail.dots.length;trail.update(10);assert.equal(trail.dots.length,count)
  trail.update(0);assert.equal(trail.dots.length,0)
  trail.update(.02);assert.equal(trail.dots.length,6)
  trail.reset();assert.equal(trail.dots.length,0)
})
test('independent orbit planes keep the original two-unit radius',()=>{
  for(let i=0;i<6;i++)for(const t of [0,.2,1,13.5])assert.ok(Math.abs(pointSatellitePosition(i,t).length()-.5)<1e-8)
  assert.ok(Math.abs(pointSatellitePosition(0,.3).y)<1e-8)
  assert.ok(Math.abs(pointSatellitePosition(1,.3).x)>.1)
})
