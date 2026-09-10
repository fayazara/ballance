import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalIvpContact} from '../src/game/original-ivp-contact.ts'
import type {IvpCollisionEvent} from '../src/game/ivp-bridge.ts'
const event=(kind:'contactStart'|'contactEnd',time:number,contact:number,other=2):IvpCollisionEvent=>({kind,time,contact,bodies:[1,other]})
test('original continuous contacts count friction points and use strict delayed transitions',()=> {
  const tracker=new OriginalIvpContact(1,2,.1,.2)
  assert.deepEqual(tracker.consume([event('contactStart',0,1),event('contactStart',.05,2)],()=>1),[])
  assert.deepEqual(tracker.process(.1),[])
  assert.deepEqual(tracker.process(.101),[{group:1,active:true}])
  tracker.consume([event('contactEnd',.2,1)],()=>1)
  assert.deepEqual(tracker.process(1),[],'a remaining contact point keeps the group active')
  tracker.consume([event('contactEnd',1,2)],()=>1)
  assert.deepEqual(tracker.process(1.19),[])
  assert.deepEqual(tracker.process(1.201),[{group:1,active:false}])
})
test('brief original contacts retain their pending start for re-entry until twice the start delay',()=> {
  const tracker=new OriginalIvpContact(1,1,.1,.1)
  tracker.consume([event('contactStart',0,1),event('contactEnd',.02,1)],()=>1)
  assert.deepEqual(tracker.process(.11),[])
  assert.deepEqual(tracker.consume([event('contactStart',.15,2)],()=>1),[{group:1,active:true}])
  const expired=new OriginalIvpContact(1,1,.1,.1)
  expired.consume([event('contactStart',0,1),event('contactEnd',.02,1)],()=>1)
  expired.process(.201)
  assert.deepEqual(expired.consume([event('contactStart',.21,2)],()=>1),[])
  assert.deepEqual(expired.process(.311),[{group:1,active:true}])
})
test('contact re-entry cancels pending off, ignores untagged bodies, and stop emits active ends once',()=> {
  const tracker=new OriginalIvpContact(1,2,.1,.1)
  tracker.consume([event('contactStart',0,1),event('contactStart',0,2,3),event('contactStart',0,3,4)],body=>body===4?0:body-1)
  assert.deepEqual(tracker.process(.11),[{group:2,active:true},{group:1,active:true}])
  tracker.consume([event('contactEnd',.2,1)],()=>0)
  assert.deepEqual(tracker.consume([event('contactStart',.25,4)],()=>1),[])
  assert.deepEqual(tracker.process(.4),[])
  assert.deepEqual(tracker.stop(),[{group:1,active:false},{group:2,active:false}])
  assert.deepEqual(tracker.stop(),[])
  assert.deepEqual(tracker.consume([event('contactStart',1,9)],()=>1),[])
})
test('continuous-contact output order follows pending records rather than numeric groups',()=> {
  const tracker=new OriginalIvpContact(1,2,.1,.1)
  tracker.consume([event('contactStart',0,1,3),event('contactStart',.01,2,2)],body=>body-1)
  assert.deepEqual(tracker.process(.12),[{group:1,active:true},{group:2,active:true}])
})
