import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalRespawn} from '../src/game/original-respawn.ts'

test('initial level entry goes straight to formation without a flash or life deduction',()=> {
  const r=new OriginalRespawn();r.beginInitial()
  assert.equal(r.active,true)
  assert.deepEqual(r.step(1000,0),['position-ball'],'initial entry has no death/life test or delayed link')
  assert.deepEqual(r.flash,[0,0,0,0])
  assert.deepEqual(r.step(1000,0),[])
  assert.deepEqual(r.step(1000,0),['physicalize-ball'])
  assert.deepEqual(r.step(1000,0),['ready'])
  assert.equal(r.active,false)
  r.begin();r.step(16,3);r.step(16,3)
  r.beginInitial();assert.deepEqual(r.flash,[0,0,0,0],'a new level clears an interrupted death flash')
  assert.deepEqual(r.step(16,3),['position-ball'])
})

test('fall keeps physics for one second, then removes, positions, forms and wakes on separate frames',()=> {
  const r=new OriginalRespawn()
  assert.equal(r.begin(),true);assert.equal(r.begin(),false)
  assert.deepEqual(r.step(16,3),[])
  assert.deepEqual(r.step(16,3),['clear-fragments'])
  assert.deepEqual(r.step(983,3),[])
  assert.deepEqual(r.step(1,3),['remove-ball'])
  assert.deepEqual(r.step(16,2),['position-ball'])
  assert.deepEqual(r.step(2983,2),[])
  assert.deepEqual(r.step(1,2),['physicalize-ball'])
  assert.equal(r.active,true)
  assert.deepEqual(r.step(16,2),['ready'])
  assert.equal(r.active,false)
  assert.deepEqual(r.step(16,2),[])
})

test('one-second frames fire removal on activation but still respect the intervening frame links',()=> {
  const r=new OriginalRespawn();r.begin()
  assert.deepEqual(r.step(1000,3),[])
  assert.deepEqual(r.step(1000,3),['clear-fragments','remove-ball'])
  assert.deepEqual(r.step(1000,2),['position-ball'])
  assert.deepEqual(r.step(1000,2),[])
  assert.deepEqual(r.step(1000,2),['physicalize-ball'])
  assert.deepEqual(r.step(1000,2),['ready'])
})

test('respawn event frames match the compiled upstream TimerMini float32 oracle',()=> {
  // Executing the upstream function at each rate gives these activation-inclusive
  // tick counts for its 1000 ms / 3000 ms delayers, rather than ceil(seconds*Hz).
  const samples=[[10,10,30],[30,31,91],[60,60,180],[120,121,361],[144,144,433]]
  for(const [hz,removalTicks,formationTicks] of samples) {
    const r=new OriginalRespawn();r.begin()
    const events:[number,string][]=[]
    for(let frame=1;frame<1000&&r.active;frame++)for(const event of r.step(1000/hz!,3))events.push([frame,event])
    assert.deepEqual(events,[[2,'clear-fragments'],[removalTicks!+1,'remove-ball'],[removalTicks!+2,'position-ball'],
      [removalTicks!+formationTicks!+1,'physicalize-ball'],[removalTicks!+formationTicks!+2,'ready']],`${hz} Hz`)
  }
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
