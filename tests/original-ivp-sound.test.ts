import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalIvpSound,originalModuleSoundIds} from '../src/game/original-ivp-sound.ts'
import type {IvpCollisionEvent} from '../src/game/ivp-bridge.ts'
import data from '../src/game/original-audio-data.json' with {type:'json'}

const contact=(kind:'contactStart'|'contactEnd',time:number,id=1,other=2):IvpCollisionEvent=>({kind,time,contact:id,bodies:[1,other]})
const impact=(time:number,speed:number,other=2):IvpCollisionEvent=>({kind:'impact',time,contact:1,bodies:[1,other],relativeVelocity:[speed,0,0]})

test('original sound tags distinguish hit-only objects, rolling mechanisms and the steel dome',()=> {
  assert.deepEqual(originalModuleSoundIds('P_Box','P_Box_MF'),{hit:2})
  assert.deepEqual(originalModuleSoundIds('P_Dome','P_Dome_MF'),{hit:4})
  assert.deepEqual(originalModuleSoundIds('P_Modul_08','P_Modul_08_Schaukel'),{hit:2,roll:2})
  assert.deepEqual(originalModuleSoundIds('PE_Balloon','PE_Balloon_Platform'),{hit:2})
  assert.deepEqual(originalModuleSoundIds('P_Modul_26','P_Modul_26_Sack'),{})
  assert.equal(data.materials.stone.HitDome,'Hit_Stone_Kuppel')
})

test('native rolling follows delayed contacts and uses three-dimensional script-frame speed',()=> {
  const sound=new OriginalIvpSound(),ids=new Map([[2,{roll:2}]])
  sound.bind(1,'wood',[0,0,0])
  sound.step(1,'wood',[0,0,0],[contact('contactStart',2)],2,.1,ids)
  assert.deepEqual(sound.frame.rolls,[])
  sound.step(1,'wood',[0,1,0],[],2.31,.1,ids)
  assert.equal(sound.frame.rolls[0]?.name,'Roll_Wood_Wood')
  assert.ok(Math.abs(sound.frame.rolls[0]!.gain-.5)<1e-7)
  assert.ok(Math.abs(sound.frame.rolls[0]!.pitch-.6)<1e-7)
  sound.step(1,'wood',[0,1,0],[contact('contactEnd',2.4)],2.4,.1,ids)
  assert.equal(sound.frame.rolls.length,1,'short loss of floor contact retains the loop')
  sound.step(1,'wood',[0,1,0],[],2.71,.1,ids)
  assert.deepEqual(sound.frame.rolls,[])
})

test('paper obeys the shared Wave Player stop command while wood keeps independent surface loops',()=> {
  const ids=new Map([[2,{roll:1}],[3,{roll:2}]])
  for(const material of ['paper','wood'] as const) {
    const sound=new OriginalIvpSound();sound.bind(1,material,[0,0,0])
    sound.step(1,material,[0,0,0],[contact('contactStart',2,1,2),contact('contactStart',2,2,3)],2,.1,ids)
    sound.step(1,material,[1,0,0],[],2.31,.1,ids)
    assert.equal(sound.frame.rolls.length,material==='paper'?1:2)
    sound.step(1,material,[2,0,0],[contact('contactEnd',2.4,1,2)],2.4,.1,ids)
    sound.step(1,material,[3,0,0],[],2.71,.1,ids)
    assert.deepEqual(sound.frame.rolls.map(r=>r.name),material==='paper'?[]:['Roll_Wood_Wood'])
  }
})

test('impact thresholds, initial cooldown, independent IDs and normalized volume match source callbacks',()=> {
  const sound=new OriginalIvpSound(),ids=new Map([[2,{hit:1}],[3,{hit:3}],[4,{hit:4}]])
  sound.bind(1,'stone',[0,0,0])
  const step=(time:number,events:IvpCollisionEvent[])=>sound.step(1,'stone',[0,0,0],events,time,.01,ids)
  step(.5,[impact(.5,30)]);assert.deepEqual(sound.frame.impacts,[])
  step(1,[impact(1,2)]);assert.deepEqual(sound.frame.impacts,[],'minimum is strict')
  step(1.1,[impact(1.1,15),impact(1.1,100)]);
  assert.deepEqual(sound.frame.impacts,[{name:'Hit_Stone_Stone',gain:.5,group:1}])
  step(1.9,[impact(1.9,30),impact(1.9,14,3),impact(1.9,15,4)])
  assert.deepEqual(sound.frame.impacts,[{name:'Hit_Stone_Kuppel',gain:1,group:4}])
  step(2,[impact(2,14,3)])
  assert.deepEqual(sound.frame.impacts,[{name:'Hit_Stone_Metal',gain:1,group:3}])
  step(2.11,[impact(2.11,30)])
  assert.equal(sound.frame.impacts[0]?.name,'Hit_Stone_Stone')
})

test('capture and material replacement discard old contacts and queued impact sounds',()=> {
  const sound=new OriginalIvpSound(),ids=new Map([[2,{roll:1,hit:1}]])
  sound.bind(1,'wood',[0,0,0])
  sound.step(1,'wood',[0,0,0],[contact('contactStart',2)],2,.1,ids)
  sound.step(1,'wood',[1,0,0],[impact(2.4,30)],2.4,.1,ids)
  assert.equal(sound.frame.rolls.length,1);assert.equal(sound.frame.impacts.length,1)
  sound.bind(undefined,'wood',[1,0,0]);assert.deepEqual(sound.frame,{rolls:[],impacts:[]})
  sound.bind(9,'paper',[1000,0,0])
  sound.step(9,'paper',[1000,0,0],[contact('contactEnd',2.5),impact(2.5,30)],2.5,.1,ids)
  assert.deepEqual(sound.frame,{rolls:[],impacts:[]})
})

test('browser audio keeps simultaneous rolling tracks and two impact instances, and pauses cleanly',async()=> {
  const {OriginalAudio}=await import('../src/game/original-audio.ts')
  class FakeAudio {
    src:string;loop=false;volume=1;playbackRate=1;preservesPitch=true;paused=true;currentTime=0;ended=false
    constructor(src:string){this.src=src}
    play(){this.paused=false;return Promise.resolve()}
    pause(){this.paused=true}
    removeAttribute(){this.src=''}
    load(){}
  }
  const previous=globalThis.Audio
  globalThis.Audio=FakeAudio as unknown as typeof Audio
  const audio=new OriginalAudio();audio.enabled=audio.unlocked=true;audio.paused=false
  try {
    const frame={rolls:[{name:'Roll_Wood_Stone',gain:.4,pitch:.8},{name:'Roll_Wood_Wood',gain:.3,pitch:.7}],impacts:[{name:'Hit_Wood_Wood',gain:.6,group:2},{name:'Hit_Wood_Wood',gain:.8,group:2}]}
    audio.contacts(frame)
    assert.equal(audio.tracks.size,4)
    assert.equal([...audio.tracks.values()].filter(a=>!a.paused).length,4)
    assert.equal(audio.tracks.get('Roll_Wood_Wood')!.preservesPitch,false)
    assert.equal(audio.tracks.get('Roll_Wood_Wood')!.playbackRate,.7)
    assert.equal(audio.tracks.get('Hit:2:Hit_Wood_Wood:1')!.volume,.8)
    audio.tracks.get('Roll_Wood_Stone')!.currentTime=2
    audio.contacts({rolls:frame.rolls.slice(1),impacts:[]})
    assert.equal(audio.tracks.get('Roll_Wood_Stone')!.paused,true)
    assert.equal(audio.tracks.get('Roll_Wood_Stone')!.currentTime,0)
    audio.paused=true;audio.sync()
    assert.ok([...audio.tracks.values()].every(a=>a.paused))
  } finally {audio.dispose();globalThis.Audio=previous}
})
