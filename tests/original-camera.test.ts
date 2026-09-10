import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {Matrix4,Vector3} from 'three'
import {OriginalCamera} from '../src/game/original-camera.ts'
import {OriginalEndingCamera} from '../src/game/original-ending-camera.ts'
import {originalIvpResetpoints} from '../src/game/original-ivp-level.ts'
import data from '../src/game/original-camera-data.json' with {type:'json'}

const close=(actual:number,expected:number,tolerance:number|string=1e-4)=>assert.ok(Math.abs(actual-expected)<(typeof tolerance==='number'?tolerance:1e-4),`${actual} != ${expected}${typeof tolerance==='string'?`: ${tolerance}`:''}`)
const heading=(frame:Matrix4)=>new Vector3(1,0,0).transformDirection(frame)

test('camera turns animate for 250 ms, then commit the input frame through the delayed completion link',()=> {
  for(const direction of ['left','right'] as const) {
    const camera=new OriginalCamera(),ball=new Vector3()
    camera.inspectAt(ball,0);camera.step(0,ball)
    assert.equal(camera.turn(direction),true)
    assert.equal(camera.turn(direction==='left'?'right':'left'),false,'secure keys prevent overlapping turns')
    camera.step(125,ball)
    close(heading(camera.orientation).x,Math.SQRT1_2)
    close(heading(camera.orientation).z,(direction==='left'?-1:1)*Math.SQRT1_2)
    close(camera.inputYaw,0)
    camera.step(125,ball)
    close(heading(camera.orientation).x,0)
    close(heading(camera.orientation).z,direction==='left'?-1:1)
    assert.equal(camera.turning,true,'exact duration is not the > duration completion')
    close(camera.inputYaw,0)
    camera.step(1,ball)
    close(camera.inputYaw,0,'completion output has a one-frame link')
    assert.equal(camera.turning,true)
    camera.step(1,ball)
    close(camera.inputYaw,direction==='left'?-Math.PI/2:Math.PI/2)
    assert.equal(camera.turning,false)
    assert.equal(camera.turn(direction),true)
  }
})

test('target and eye follow independently, with the eye observing the previous target position',()=> {
  const camera=new OriginalCamera(),ball=new Vector3()
  camera.inspectAt(ball,0)
  const startEye=camera.position.clone(),startTarget=camera.target.clone()
  ball.x=10
  camera.step(100,ball)
  assert.equal(camera.target.distanceTo(startTarget),0,'On only records previous position')
  assert.equal(camera.position.distanceTo(startEye),0)
  camera.step(100,ball)
  close(camera.target.x,10)
  close(camera.position.x,startEye.x)
  camera.step(100,ball)
  close(camera.position.x,startEye.x+5,'5/s position force follows a target that moved last frame')
  camera.step(100,ball)
  close(camera.position.x,startEye.x+10,'next step includes half of last displacement')
})

test('high view raises the original anchor by 50 units without moving its horizontal orbit',()=> {
  const camera=new OriginalCamera(),ball=new Vector3(2,3,4)
  camera.inspectAt(ball,0)
  const low=camera.position.clone()
  for(let i=0;i<600;i++)camera.step(1000/60,ball,true)
  close(camera.position.y-low.y,12.5,.001)
  close(camera.position.x,low.x);close(camera.position.z,low.z)
  for(let i=0;i<900;i++)camera.step(1000/60,ball,false)
  close(camera.position.y,low.y,.001)
  close(camera.position.x,low.x);close(camera.position.z,low.z)
  close(camera.verticalFov,2*Math.atan(Math.tan(1.0122909545898438/2)*3/4)*180/Math.PI)
  assert.deepEqual(camera.clipping,{near:.75,far:300})
})

test('ending detachment preserves the live anchor and both controllers rather than freezing the lagging eye',()=> {
  const live=new OriginalCamera(),continuous=new OriginalCamera(),ending=new OriginalEndingCamera()
  let ball=new Vector3()
  live.inspectAt(ball,0);continuous.inspectAt(ball,0)
  for(let frame=0;frame<12;frame++) {
    ball=new Vector3(frame*.4,frame*.1,0)
    live.step(1000/60,ball);continuous.step(1000/60,ball)
  }
  assert.ok(live.desiredPosition.distanceTo(live.position)>.5,'handoff must be tested while the eye is still lagging')
  ending.start()
  ending.step(1000/60,ball,live.position,live.target,false,live)
  assert.equal(ending.active,false)
  live.step(1000/60,ball);continuous.step(1000/60,ball)
  const detachedAnchor=live.desiredPosition.clone()
  ending.step(1000/60,ball,live.position,live.target,false,live)
  continuous.step(1000/60,ball)
  assert.equal(ending.active,true)
  assert.ok(ending.position.distanceTo(continuous.position)<1e-6,'handoff retains previous-frame eye velocity')
  assert.ok(ending.target.distanceTo(continuous.target)<1e-6,'handoff retains target tracking')
  for(let frame=0;frame<900;frame++)ending.step(1000/60,new Vector3(100,10,20),live.position,live.target,false,live)
  assert.ok(ending.position.distanceTo(detachedAnchor)<.001,'detached Cam_Pos is the desired anchor, not the incoming eye')
  assert.ok(ending.target.distanceTo(new Vector3(100,10,20))<.001)
})

const available=existsSync('.local/original/level_01.json')
test('all 63 authored checkpoint matrices restore camera position and orientation, cancelling pending turns',{skip:!available},()=> {
  const camera=new OriginalCamera()
  let count=0
  for(let level=1;level<=12;level++) {
    const course=JSON.parse(readFileSync(`.local/original/level_${String(level).padStart(2,'0')}.json`,'utf8'))
    for(const checkpoint of originalIvpResetpoints(course)) {
      const frame=new Matrix4().fromArray(checkpoint.matrix)
      camera.reset(checkpoint.matrix)
      const point=camera.position.clone().multiply(new Vector3(4,4,-4)).applyMatrix4(frame.clone().invert())
      close(point.x,22,.001);close(point.y,35,.001);close(point.z,0,.001)
      const right=heading(camera.steeringFrame).transformDirection(frame.clone().invert())
      close(right.x,0);close(right.y,0);close(right.z,1)
      const saved=camera.position.clone(),input=camera.steeringFrame.clone()
      camera.turn('left');camera.step(125,camera.target)
      camera.reset(checkpoint.matrix)
      assert.equal(camera.turning,false)
      assert.equal(camera.position.distanceTo(saved),0)
      assert.deepEqual(camera.steeringFrame.elements,input.elements)
      count++
    }
  }
  assert.equal(count,63)
  assert.equal(data.frames.Cam_Pos.parent,'Cam_Orient')
  assert.equal(data.frames.Cam_Orient.parent,'Cam_Target')
})
