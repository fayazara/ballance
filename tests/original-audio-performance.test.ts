import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalSampleAudio} from '../src/game/original-sample-audio.ts'
import {OriginalAudio} from '../src/game/original-audio.ts'

test('realtime sounds decode once, reuse a loop across frames, and cancel pending playback on stop',async()=> {
  let fetches=0,decodes=0,starts=0,stops=0
  const sources:{playbackRate:{value:number};offset:number}[]=[]
  class Context {
    state='running';currentTime=0;destination={}
    resume(){this.state='running';return Promise.resolve()}
    close(){this.state='closed';return Promise.resolve()}
    decodeAudioData(){decodes++;return Promise.resolve({duration:10})}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}}}
    createBufferSource(){
      const source={buffer:null,loop:false,playbackRate:{value:1},offset:0,onended:null as (()=>void)|null,
        connect(){},disconnect(){},start(_when:number,offset:number){starts++;source.offset=offset},stop(){stops++;source.onended?.()}}
      sources.push(source);return source
    }
  }
  const oldContext=globalThis.AudioContext,oldFetch=globalThis.fetch
  globalThis.AudioContext=Context as unknown as typeof AudioContext
  globalThis.fetch=async()=>{fetches++;return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)} as Response}
  const flush=()=>new Promise<void>(resolve=>setImmediate(resolve))
  const audio=new OriginalSampleAudio(()=>'ogg')
  try {
    audio.unlock()
    for(let i=0;i<960;i++)audio.play('Roll_Wood_Stone','roll',true,.1,.5+i/10000)
    await flush()
    assert.equal(fetches,1);assert.equal(decodes,1);assert.equal(starts,1)
    for(let i=0;i<960;i++)audio.play('Roll_Wood_Stone','roll',true,.2,1+i/10000)
    assert.equal(starts,1,'changing pitch must not recreate or seek the decoder')
    assert.equal(sources[0]!.playbackRate.value,1.0959)
    audio.pauseAll();audio.pauseAll();assert.equal(stops,1)
    audio.resume('roll');await flush();assert.equal(starts,2);assert.equal(decodes,1)
    audio.play('Hit_Wood_Stone','hit',false,.5,1,true);audio.stop('hit');await flush()
    assert.equal(starts,2,'a late decode must not play after stop')
    audio.dispose();assert.equal(stops,2);assert.equal(audio.stats.playing,0)
  } finally {audio.dispose();globalThis.AudioContext=oldContext;globalThis.fetch=oldFetch}
})

test('streamed music transport avoids duplicate writes and play requests while loading',async()=> {
  let plays=0,volumeWrites=0,pauses=0,seeks=0
  class Audio {
    loop=false;paused=true;ended=false;src='';private gain=1;private time=0
    get volume(){return this.gain}set volume(v:number){volumeWrites++;this.gain=v}
    get currentTime(){return this.time}set currentTime(v:number){seeks++;this.time=v}
    play(){plays++;return new Promise<void>(()=>{})}
    pause(){pauses++;this.paused=true}
    removeAttribute(){}load(){}
  }
  const old=globalThis.Audio;globalThis.Audio=Audio as unknown as typeof globalThis.Audio
  const audio=new OriginalAudio();audio.enabled=audio.unlocked=true;audio.paused=false
  try {
    audio.music.start(0);audio.stepMusic(8)
    const baseline={plays,volumeWrites,seeks}
    for(let i=0;i<960;i++)audio.sync()
    assert.deepEqual({plays,volumeWrites,seeks},baseline)
    audio.enabled=false;for(let i=0;i<960;i++)audio.sync()
    assert.equal(pauses,baseline.plays,'cancel each pending play once, without repeated pause commands')
  } finally {audio.dispose();globalThis.Audio=old}
})
