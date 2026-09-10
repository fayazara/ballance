import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalPhysicsClock} from '../src/game/original-physics-clock.ts'
import fixtures from './fixtures/original-physics-clock.json' with {type:'json'}
import {originalScriptDeltaMs} from '../src/game/original-script-clock.ts'
import settings from '../src/game/original-time-settings-data.json' with {type:'json'}

test('physics frame smoothing matches the supplied DLL arithmetic at six frame rates and after frame spikes',()=> {
  assert.equal(fixtures.cases.length,125)
  for(const sample of fixtures.cases) {
    const clock=new OriginalPhysicsClock();clock.filteredMs=sample.previousMs
    assert.equal(clock.step(sample.deltaMs,sample.timeFactor),sample.physicsSeconds)
    assert.equal(clock.filteredMs,sample.filteredMs)
  }
})

test('both recovered menu timing branches retain frame stalls up to one second',()=> {
  for(const branch of settings.branches) {
    assert.equal(branch.minimumDeltaMs,1)
    assert.equal(branch.maximumDeltaMs,1000)
    assert.equal(branch.timeScale,1)
    assert.equal(branch.behaviorMode,1)
  }
  assert.deepEqual([0,.25,1,16,50,100,250,1000,5000].map(originalScriptDeltaMs),[1,1,1,16,50,100,250,1000,1000])
  assert.equal(originalScriptDeltaMs(1000/60),Math.fround(1000/60))
  for(const invalid of [-1,NaN,Infinity])assert.throws(()=>originalScriptDeltaMs(invalid))
})

test('script time and smoothed physics time stay distinct during frame stalls and recovery',()=> {
  const clock=new OriginalPhysicsClock()
  const input=[1000,1000,1000,1000]
  const simulation=input.map(ms=>clock.step(originalScriptDeltaMs(ms)))
  assert.deepEqual(simulation,fixtures.cases.slice(120,124).map(sample=>sample.physicsSeconds))
  assert.ok(clock.step(originalScriptDeltaMs(1000/60))>1,'the filter retains the preceding stall while script timers immediately resume at 60 Hz')
})
