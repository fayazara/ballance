import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Vector3} from 'three'
import {OriginalEndingCamera} from '../src/game/original-ending-camera.ts'
import data from '../src/game/original-ending-camera-data.json' with {type:'json'}

test('finish camera detaches after two presentation frames and stays behind the departing ball',()=> {
  const camera=new OriginalEndingCamera(),position=new Vector3(13,13,0),target=new Vector3()
  camera.start();camera.step(1000/60,target,position,target,false)
  assert.equal(camera.active,false)
  camera.step(1000/60,target,position,target,false)
  assert.equal(camera.active,true);assert.equal(camera.position.distanceTo(position),0)
  const departing=new Vector3(-400,0,5)
  for(let i=0;i<600;i++)camera.step(1000/60,departing,departing,target,true)
  assert.equal(camera.position.x,13);assert.equal(Math.abs(camera.position.z),0)
  assert.ok(Math.abs(camera.position.y-9.25)<.0001,'one self-relative -15 original-unit translation')
  assert.ok(camera.target.distanceTo(departing)<.001,'look target continues following the captured ball')
  camera.reset()
  camera.step(1000/60,target,position,target,true)
  assert.equal(camera.active,false,'reset cannot revive a completed ending')
  camera.start();camera.reset()
  for(let i=0;i<4;i++)camera.step(1000/60,target,position,target,false)
  assert.equal(camera.active,false,'reset cancels a pending detach too')
  assert.deepEqual(data.clipping,[3,2500])
})
