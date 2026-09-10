import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalDebrisClock} from '../src/game/original-debris-clock.ts'
import oracle from '../docs/original-debris-clock-oracle.json' with {type:'json'}
test('fade and removal frames match compiled upstream TimeTimer and BezierProgression code',()=>{
  for(const [index,start,end] of oracle.cases){
    const schedule=oracle.schedulesMs[index!]!,clock=new OriginalDebrisClock(20000,2000)
    clock.request();const actual:{kind:string;frame:number}[]=[]
    for(let frame=1;frame<=end!+2;frame++){
      const result=clock.step(schedule[(frame-1)%schedule.length]!)
      if(result.fadeStarted)actual.push({kind:'fade',frame})
      if(result.removed)actual.push({kind:'remove',frame})
    }
    assert.deepEqual(actual,[{kind:'fade',frame:start},{kind:'remove',frame:end}],`frame schedule ${schedule}`)
  }
})
test('pool timer runs before fragments exist and fade consumes its activation frame',()=>{
  const c=new OriginalDebrisClock(20000,2000);c.request()
  for(let i=0;i<199;i++)assert.equal(c.step(100).fadeStarted,false)
  assert.equal(c.elapsedMs,19900)
  assert.deepEqual(c.step(100),{fadeStarted:true,removed:false})
  assert.equal(c.fadeMs,100)
  for(let i=0;i<19;i++)assert.equal(c.step(100).removed,false)
  assert.equal(c.fadeMs,2000,'transparent endpoint remains physical')
  assert.equal(c.step(100).removed,true)
  assert.equal(c.fadeMs,undefined)
})
test('reuse fades the existing pool early and restarts its timer on the following frame',()=>{
  const c=new OriginalDebrisClock(20000,2000);c.request();c.step(100);c.step(100)
  c.request();assert.equal(c.step(100).fadeStarted,true)
  assert.equal(c.waiting,false);assert.equal(c.requested,true)
  c.step(100)
  assert.equal(c.waiting,true);assert.equal(c.requested,false)
  assert.equal(c.elapsedMs,100);assert.equal(c.fadeMs,200)
  for(let i=0;i<19;i++)c.step(100)
  assert.equal(c.fadeMs,undefined)
  assert.equal(c.waiting,true,'new pool lifetime continues after old pool removal')
})
test('zero-time visual sync and reset do not activate or retain pending timers',()=>{
  const c=new OriginalDebrisClock(20000,2000);c.request();c.step(0)
  assert.equal(c.elapsedMs,0);assert.equal(c.requested,true)
  c.reset();c.step(50000)
  assert.equal(c.waiting,false);assert.equal(c.fadeMs,undefined)
  assert.throws(()=>c.step(NaN),/Invalid/)
})
