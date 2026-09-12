import {test} from 'node:test'
import assert from 'node:assert/strict'
import {PerspectiveCamera,Vector3} from 'three'
import {OriginalCamera,responsiveCameraDistance,framePortraitCamera} from '../src/game/original-camera.ts'

test('portrait framing uses a capped pullback while preserving lens and aim',()=> {
  const fov=new OriginalCamera().verticalFov,target=new Vector3(0,0,0),eye=new Vector3(0,13,13)
  for(const aspect of [390/844,430/932,768/1024,4/3,16/9,390/844]) {
    const camera=new PerspectiveCamera(fov,aspect,.1,1000)
    camera.position.copy(eye);camera.lookAt(target)
    const rotation=camera.quaternion.clone()
    framePortraitCamera(camera,target);camera.updateMatrixWorld()
    assert.equal(camera.fov,fov,'no wide-angle stretching')
    assert.ok(camera.quaternion.equals(rotation),'viewing angle is unchanged')
    const ratio=camera.position.length()/eye.length()
    assert.ok(ratio>=1&&ratio<=1.400001)
    assert.ok(Math.abs(target.clone().project(camera).x)<1e-10)
    assert.ok(Math.abs(target.clone().project(camera).y)<1e-10)
    if(aspect>=4/3)assert.equal(ratio,1)
  }
  assert.equal(responsiveCameraDistance(390/844),1.4)
  assert.equal(responsiveCameraDistance(0),1)
})
