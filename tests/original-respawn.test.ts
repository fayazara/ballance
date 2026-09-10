import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalRespawn} from '../src/game/original-respawn.ts'

test('fall keeps physics for one second, then removes, positions, forms and wakes on separate frames',()=> {
  const r=new OriginalRespawn()
  assert.equal(r.begin(),true);assert.equal(r.begin(),false)
  assert.deepEqual(r.step(16,3),[])
  assert.deepEqual(r.step(16,3),['clear-fragments'])
  assert.deepEqual(r.step(999,3),[])
  assert.deepEqual(r.step(1,3),['remove-ball'])
  assert.deepEqual(r.step(16,2),['position-ball'])
  assert.deepEqual(r.step(2999,2),[])
  assert.deepEqual(r.step(1,2),['physicalize-ball'])
  assert.equal(r.active,true)
  assert.deepEqual(r.step(16,2),['ready'])
  assert.equal(r.active,false)
  assert.deepEqual(r.step(16,2),[])
})

test('life check is delayed by two script frames and the last ball ends without creating a replacement',()=> {
  const r=new OriginalRespawn();r.begin()
  assert.deepEqual(r.step(1000,0),[],'a long frame does not replace a two-frame graph link')
  assert.deepEqual(r.step(1,0),['game-over'])
  assert.equal(r.active,false)
  assert.deepEqual(r.flash,[0,0,0,0])
})

test('reset cancels an unfinished transition and its saved white flash returns to transparent',()=> {
  const r=new OriginalRespawn();r.begin();r.step(16,1);r.step(16,1)
  r.step(784,1)
  assert.ok(r.flash.every(v=>Math.abs(v-1)<1e-6),'the original curve reaches white at 40 percent')
  r.step(216,1);r.step(16,0);r.step(1000,0)
  assert.deepEqual(r.flash,[0,0,0,0])
  r.reset()
  assert.equal(r.active,false)
  assert.deepEqual(r.step(4000,0),[])
  assert.equal(r.begin(),true)
})
