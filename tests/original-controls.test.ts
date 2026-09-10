import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ORIGINAL_CONTROLS,originalEngineKey,rebindOriginalControl} from '../src/controls/original-controls.ts'

test('desktop defaults use the original movement, rotation modifier, and overview keys',()=>{
  assert.equal(originalEngineKey('ArrowUp',ORIGINAL_CONTROLS),'arrowup')
  assert.equal(originalEngineKey('ArrowDown',ORIGINAL_CONTROLS),'arrowdown')
  assert.equal(originalEngineKey('ArrowLeft',ORIGINAL_CONTROLS),'arrowleft')
  assert.equal(originalEngineKey('ArrowRight',ORIGINAL_CONTROLS),'arrowright')
  assert.equal(originalEngineKey('ShiftLeft',ORIGINAL_CONTROLS),'shift')
  assert.equal(originalEngineKey('Space',ORIGINAL_CONTROLS),' ')
  for(const code of ['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyR','ShiftRight'])assert.equal(originalEngineKey(code,ORIGINAL_CONTROLS),undefined)
})
test('rebinding to another action swaps keys without disabling either control',()=>{
  const controls=rebindOriginalControl(ORIGINAL_CONTROLS,'forward','Space')
  assert.equal(originalEngineKey('Space',controls),'arrowup')
  assert.equal(originalEngineKey('ArrowUp',controls),' ')
  assert.equal(ORIGINAL_CONTROLS.keys.forward,'ArrowUp')
  assert.equal(new Set(Object.values(controls.keys)).size,6)
})
test('custom modifier maps to camera rotation and reserved navigation remains available',()=>{
  const controls=rebindOriginalControl(ORIGINAL_CONTROLS,'rotation','ControlLeft')
  assert.equal(originalEngineKey('ControlLeft',controls),'shift')
  assert.equal(originalEngineKey('ShiftLeft',controls),undefined)
  for(const code of ['Escape','Tab','MetaLeft','MetaRight',''])assert.equal(rebindOriginalControl(controls,'forward',code),controls)
})
