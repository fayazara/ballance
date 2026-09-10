import {test} from 'node:test'
import assert from 'node:assert/strict'
import {OriginalMusic} from '../src/game/original-music.ts'
import data from '../src/game/original-music-data.json' with {type:'json'}

test('all twelve courses use the authored theme set and all three recordings',()=> {
  assert.deepEqual(data.levelThemes,[1,5,2,3,1,5,4,2,3,1,3,4])
  for(let level=0;level<12;level++)for(let variant=0;variant<3;variant++) {
    const music=new OriginalMusic(()=>(variant+.1)/3);music.start(level);music.step(7)
    assert.ok(music.voices.has(`Music_Theme_${data.levelThemes[level]}_${variant+1}`))
    assert.ok([...music.voices.values()].every(v=>!v.loop))
  }
})

test('ambient and theme have independent startup delays and wait after playback ends',()=> {
  const music=new OriginalMusic(()=>.5);music.start(0)
  music.step(6.99);assert.equal(music.voices.size,0)
  music.step(.01);assert.ok(music.voices.has('Music_Theme_1_2'))
  music.step(.5);assert.ok(music.voices.has('Music_Atmo_2'))
  const voice=music.voices.get('Music_Theme_1_2')!
  music.ended(voice.name,voice.serial);music.step(24.99)
  assert.equal(music.voices.has(voice.name),false)
  music.step(.01);assert.ok(music.voices.has(voice.name))
  assert.ok(music.voices.has('Music_Atmo_2'),'theme gaps do not restart ambient audio')
})

test('last checkpoint cancels pending and active themes while ambient continues',()=> {
  for(const seconds of [1,8]) {
    const music=new OriginalMusic(()=>.1);music.start(0);music.step(seconds);music.lastCheckpoint();music.step(60)
    assert.equal([...music.voices.keys()].some(n=>n.startsWith('Music_Theme_')),false)
    assert.ok([...music.voices.keys()].some(n=>n.startsWith('Music_Atmo_')))
  }
})

test('checkpoint approach and exit use the recovered fades; finish chooses the final-level recording',()=> {
  for(const level of [0,11]) {
    const music=new OriginalMusic(()=>.5);music.start(level);music.step(1);music.lastCheckpoint()
    music.step(5);assert.equal(music.voices.get('Music_EndCheckpoint')?.gain,.5)
    music.approach(true);music.step(6.5);assert.equal(music.voices.get('Music_EndCheckpoint')?.gain,.5)
    music.approach(false);music.step(.75);assert.equal(music.voices.get('Music_EndCheckpoint')?.gain,.25)
    music.step(.75);assert.equal(music.voices.has('Music_EndCheckpoint'),false)
    music.finish();const name=level===11?'Music_LastFinal':'Music_Final'
    assert.equal(music.voices.get(name)?.loop,false)
    music.step(.4);assert.equal(music.voices.has('Music_EndCheckpoint'),false)
    assert.ok(music.voices.has(name))
  }
})

test('level replacement clears the old music and ignores stale ended events',()=> {
  const music=new OriginalMusic(()=>.5);music.start(0);music.step(8)
  const old=music.voices.get('Music_Theme_1_2')!
  music.start(0);music.step(8);music.ended(old.name,old.serial)
  assert.ok(music.voices.has(old.name))
  music.clear();music.step(100);assert.equal(music.voices.size,0)
})

test('audio transport resumes music without rewinding, advances ended tracks, and stops old-level voices',async()=> {
  const {OriginalAudio}=await import('../src/game/original-audio.ts')
  class FakeAudio {
    loop=false;volume=1;paused=true;currentTime=0;ended=false;src:string
    constructor(src:string){this.src=src}
    play(){this.paused=false;return Promise.resolve()}
    pause(){this.paused=true}
    removeAttribute(){this.src=''}
    load(){}
  }
  const previous=globalThis.Audio;globalThis.Audio=FakeAudio as unknown as typeof Audio
  const audio=new OriginalAudio();audio.enabled=audio.unlocked=true;audio.paused=false
  try {
    audio.music.start(1);audio.stepMusic(8)
    const name=[...audio.tracks.keys()].find(n=>n.startsWith('Music_Theme_5_'))!
    assert.ok(name)
    const voice=audio.tracks.get(name)!
    assert.equal(voice.loop,false);assert.equal(voice.paused,false)
    voice.currentTime=3;audio.paused=true;audio.sync();audio.stepMusic(60)
    assert.equal(voice.paused,true);assert.equal(voice.currentTime,3)
    audio.paused=false;audio.sync();assert.equal(voice.paused,false);assert.equal(voice.currentTime,3)
    ;(voice as unknown as FakeAudio).ended=true
    audio.stepMusic(.01)
    assert.equal(voice.paused,true)
    audio.music.start(2);audio.sync();assert.equal(voice.paused,true)
    audio.stepMusic(8)
    assert.ok([...audio.tracks].some(([n,a])=>n.startsWith('Music_Theme_2_')&&!a.paused))
    audio.enabled=false;audio.sync();assert.ok([...audio.tracks.values()].every(a=>a.paused))
  } finally {audio.dispose();globalThis.Audio=previous}
})
