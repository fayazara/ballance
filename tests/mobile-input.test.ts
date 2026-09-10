import {test} from 'node:test'
import assert from 'node:assert/strict'
import {screenTilt,tiltAxes,padAxes,floatingPad,TouchPointers} from '../src/controls/mobile-input.ts'
test('screen-relative gyro directions work in portrait and both landscape rotations',()=> {
  const portrait=screenTilt(20,0,0);assert.ok(portrait.z>0);assert.equal(portrait.x,0)
  const right=screenTilt(0,20,0);assert.ok(right.x>0)
  const landscape=screenTilt(20,0,90);assert.ok(landscape.x>0);assert.ok(Math.abs(landscape.z)<1e-10)
  const reverse=screenTilt(20,0,270);assert.ok(reverse.x<0)
  assert.ok(screenTilt(20,0,180).z<0)
})
test('calibration removes a comfortable holding angle, ignores jitter, and bounds full tilt',()=> {
  const neutral=screenTilt(35,8,0)
  assert.deepEqual(tiltAxes(neutral,neutral),{x:0,z:0})
  assert.deepEqual(tiltAxes({x:neutral.x+.02,z:neutral.z-.02},neutral),{x:0,z:0})
  assert.deepEqual(tiltAxes({x:neutral.x+1,z:neutral.z-1},neutral),{x:1,z:-1})
  assert.ok(tiltAxes({x:neutral.x+.1,z:neutral.z},neutral,1.4).x>tiltAxes({x:neutral.x+.1,z:neutral.z},neutral,.6).x)
})
test('drag pad supports diagonals and returning to its neutral center',()=> {
  assert.deepEqual(padAxes(78,78,156),{x:0,z:0})
  assert.deepEqual(padAxes(78,0,156),{x:0,z:-1})
  assert.deepEqual(padAxes(150,4,156),{x:1,z:-1})
  assert.deepEqual(padAxes(0,78,156),{x:-1,z:0})
})
test('releasing one finger preserves another held direction; cancellation clears safely',()=> {
  const input=new TouchPointers()
  input.set(1,{x:0,z:-1});input.set(2,{x:1,z:0})
  assert.deepEqual(input.axes,{x:1,z:-1})
  assert.deepEqual(input.release(2),{x:0,z:-1})
  assert.deepEqual(input.release(2),{x:0,z:-1})
  input.clear();assert.deepEqual(input.axes,{x:0,z:0})
})

test('floating pad stays neutral at touch origin, bounds the thumb, and snaps diagonals',()=> {
  assert.deepEqual(floatingPad(0,0),{dx:0,dy:0,axes:{x:0,z:0}})
  assert.deepEqual(floatingPad(5,-4).axes,{x:0,z:0})
  assert.deepEqual(floatingPad(300,0),{dx:44,dy:0,axes:{x:1,z:0}})
  const diagonal=floatingPad(-200,-200)
  assert.ok(Math.abs(Math.hypot(diagonal.dx,diagonal.dy)-44)<1e-10)
  assert.deepEqual(diagonal.axes,{x:-1,z:-1})
  assert.deepEqual(floatingPad(0,30).axes,{x:0,z:1})
})
