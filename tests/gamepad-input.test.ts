import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ControllerActions,controllerAxis,controllerName,readController,selectController,type ControllerPad,type ControllerAction} from '../src/controls/gamepad-input.ts'

function pad(overrides:Partial<ControllerPad>={},pressed:number[]=[]):ControllerPad {
  return {id:'DualSense Wireless Controller',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i),touched:pressed.includes(i),value:pressed.includes(i)?1:0})),...overrides}
}
test('resting drift is ignored and stick travel reaches full strength in all directions',()=>{
  for(const value of [-.2,-.08,0,.1,.2,NaN])assert.equal(controllerAxis(value),0)
  assert.ok(Math.abs(controllerAxis(.6)-.5)<1e-10)
  assert.equal(controllerAxis(-1),-1)
  assert.equal(controllerAxis(2),1)
  assert.deepEqual(readController(pad({axes:[-1,1]})).input,{x:-1,z:1,brake:false})
})
test('PS5 standard mapping provides D-pad, shoulders, overview, confirm, back and Options',()=>{
  const result=readController(pad({},[0,1,3,4,5,9,12,15]))
  assert.deepEqual(result.input,{x:1,z:-1,brake:true})
  assert.deepEqual([...result.actions],['accept','back','pause','cameraLeft','cameraRight','right','up'])
  assert.equal(controllerName(pad()),'PS5 controller')
  assert.equal(controllerName(pad({id:'054c-0ce6-Wireless Controller'})),'PS5 controller')
  assert.deepEqual(readController(pad({axes:[1,-1]},[12,15])).input,{x:1,z:-1,brake:false})
  assert.deepEqual(readController(pad({},[12,13,14,15])).input,{x:0,z:0,brake:false})
})
test('raw joystick uses primary axes without guessing standard extra button indices',()=>{
  const result=readController(pad({mapping:'',axes:[.6,0]},[0,3,4,9,12]))
  assert.ok(Math.abs(result.input.x-.25)<1e-10)
  assert.equal(result.input.z,0)
  assert.equal(result.input.brake,false)
  assert.deepEqual([...result.actions],['accept'])
  assert.deepEqual(readController(pad({axes:[],buttons:[]})).input,{x:0,z:0,brake:false})
})
test('small stick movements produce gentle force while full travel and D-pad retain full power',()=>{
  assert.ok(Math.abs(readController(pad({axes:[.3,0]})).input.x-.015625)<1e-10)
  assert.ok(Math.abs(readController(pad({axes:[.6,0]})).input.x-.25)<1e-10)
  assert.equal(readController(pad({axes:[1,0]})).input.x,1)
  assert.equal(readController(pad({},[15])).input.x,1)
  assert.ok(readController(pad({axes:[.65,0]})).actions.has('right'),'menus retain their original threshold')
})
test('detects already-connected controllers in sparse slots and retains selection until unplugged',()=>{
  const first=pad({index:2}),second=pad({index:4})
  assert.equal(selectController([null,null,first,null,second]),first)
  assert.equal(selectController([first,second],4),second)
  assert.equal(selectController([first,{...second,connected:false}],4),first)
  assert.equal(selectController([null,{...first,connected:false}]),null)
})
test('holding confirm or pause fires once; navigation repeats after a delay',()=>{
  const edges=new ControllerActions(),held=new Set<ControllerAction>(['pause','accept','down'])
  assert.deepEqual(edges.update(held,0),['pause','accept','down'])
  assert.deepEqual(edges.update(held,399),[])
  assert.deepEqual(edges.update(held,400),['down'])
  assert.deepEqual(edges.update(held,559),[])
  assert.deepEqual(edges.update(held,560),['down'])
  edges.update(new Set(),600)
  assert.deepEqual(edges.update(held,610),['pause','accept','down'])
})
test('focus recovery primes held buttons until released, preventing accidental resume or selection',()=>{
  const edges=new ControllerActions(),held=new Set<ControllerAction>(['accept','down'])
  edges.reset(held)
  assert.deepEqual(edges.update(held,1000),[])
  edges.update(new Set(),1001)
  assert.deepEqual(edges.update(held,1002),['accept','down'])
})
