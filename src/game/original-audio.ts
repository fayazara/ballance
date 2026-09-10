import type { Material } from './levels'
import {OriginalMusic} from './original-music.ts'
import type {OriginalSoundFrame} from './original-ivp-sound'
import {OriginalSampleAudio} from './original-sample-audio.ts'
export class OriginalAudio {
  enabled = false; unlocked = false; paused = true
  volume=1
  tracks = new Map<string, HTMLAudioElement>()
  readonly music=new OriginalMusic()
  private musicSerials=new Map<string,number>()
  private audioExtension?:'ogg'|'m4a'
  private impactSlots=new Map<number,number>()
  readonly samples=new OriginalSampleAudio(()=>this.extension())
  private playPending=new WeakMap<HTMLAudioElement,object>()
  private extension() {
    if(!this.audioExtension){const a=new Audio();this.audioExtension=a.canPlayType&&!a.canPlayType('audio/ogg; codecs="vorbis"')?'m4a':'ogg'}
    return this.audioExtension
  }
  private play(a:HTMLAudioElement) {
    if(!a.paused||this.playPending.has(a))return
    const request={};this.playPending.set(a,request)
    void a.play().catch(()=>{}).finally(()=>{if(this.playPending.get(a)===request)this.playPending.delete(a)})
  }
  private pause(a:HTMLAudioElement) {
    if(!a.paused||this.playPending.has(a))a.pause()
    this.playPending.delete(a)
  }
  get(name: string, loop = false, key = name) {
    if (!this.tracks.has(key)) { const a = new Audio();a.src=`/original/audio/${name}.${this.extension()}`; a.loop = loop; a.volume = loop ? 0.18 : 0.55; this.tracks.set(key, a) }
    return this.tracks.get(key)!
  }
  unlock() { this.unlocked = true; this.samples.unlock();this.sync() }
  sync() {
    if(!this.enabled||this.paused)this.samples.pauseAll()
    for (const a of this.tracks.values()) if (!this.enabled || this.paused) this.pause(a)
    this.syncMusic()
  }
  stepMusic(dt:number) {
    if(this.paused)return
    for(const voice of this.music.voices.values()) {
      const audio=this.tracks.get(voice.name)
      if(audio?.ended&&this.musicSerials.get(voice.name)===voice.serial)this.music.ended(voice.name,voice.serial)
    }
    this.music.step(dt);this.syncMusic()
  }
  private syncMusic() {
    for(const name of this.musicSerials.keys())if(!this.music.voices.has(name)) {
      this.stop(name);this.musicSerials.delete(name)
    }
    for(const voice of this.music.voices.values()) {
      const a=this.get(voice.name,voice.loop)
      if(this.musicSerials.get(voice.name)!==voice.serial) {a.currentTime=0;this.musicSerials.set(voice.name,voice.serial)}
      if(a.loop!==voice.loop)a.loop=voice.loop
      const gain=voice.gain*this.music.masterGain*this.volume
      if(a.volume!==gain)a.volume=gain
      if(this.enabled&&this.unlocked&&!this.paused)this.play(a)
      else this.pause(a)
    }
  }
  effect(name: string) { if (this.enabled && this.unlocked) {
    if(this.samples.available){this.samples.play(name,name,false,.55,1,true);return}
    const a = this.get(name); a.currentTime = 0; this.play(a)
  } }
  stop(name: string) { this.samples.stop(name);const a = this.tracks.get(name); if (a) { this.pause(a); if(a.currentTime!==0)a.currentTime = 0 } }
  resumeEffect(name: string) { if(this.enabled&&this.unlocked&&!this.paused)this.samples.resume(name);const a = this.tracks.get(name); if (a && !a.ended && this.enabled && this.unlocked && !this.paused)this.play(a) }
  stopFans() { this.samples.stopPrefix('Fan:');for (const key of this.tracks.keys()) if (key.startsWith('Fan:')) this.stop(key) }
  fan(name: string, gain: number) {
    const key = `Fan:${name}`
    if(this.samples.available) {
      if(gain<=0){this.samples.stop(key);return}
      if(!this.enabled||!this.unlocked||this.paused){this.samples.pause(key);return}
      this.samples.play('Misc_Ventilator',key,true,Math.min(1,gain));return
    }
    if (gain <= 0) { this.stop(key); return }
    const a = this.get('Misc_Ventilator', true, key)
    if (!this.enabled || !this.unlocked || this.paused) { a.pause(); return }
    a.volume = Math.min(1, gain)
    if (a.paused) void a.play().catch(() => {})
  }
  roll(material: Material, speed: number, grounded: boolean, surface: 'Stone' | 'Wood' | 'Metal' = 'Stone') {
    const name = material === 'paper' ? 'Roll_Paper' : `Roll_${material === 'wood' ? 'Wood' : 'Stone'}_${surface}`
    if(this.samples.available) {
      this.contacts({rolls:grounded&&speed>=.15?[{name,gain:Math.min(speed/9,.28),pitch:.8+Math.min(speed/12,.6)}]:[],impacts:[]});return
    }
    for (const [key, a] of this.tracks) if (key.startsWith('Roll_') && key !== name) a.pause()
    const a = this.get(name, true)
    if (!this.enabled || !this.unlocked || this.paused || !grounded || speed < .15) { a.pause(); return }
    a.volume = Math.min(speed / 9, .28); a.playbackRate = .8 + Math.min(speed / 12, .6); if (a.paused) void a.play().catch(() => {})
  }
  contacts(frame:OriginalSoundFrame) {
    const running=this.enabled&&this.unlocked&&!this.paused
    const names=new Set(frame.rolls.map(s=>s.name))
    if(this.samples.available) {
      this.samples.retainLoops('Roll_',names)
      for(const roll of frame.rolls) {
        if(running)this.samples.play(roll.name,roll.name,true,roll.gain,Math.min(16,Math.max(.0625,roll.pitch)))
        else this.samples.pause(roll.name)
      }
      if(running)for(const impact of frame.impacts) {
        const slot=this.impactSlots.get(impact.group)??0;this.impactSlots.set(impact.group,1-slot)
        this.samples.play(impact.name,`Hit:${impact.group}:${slot}`,false,impact.gain,1,true)
      }
      return
    }
    for(const [key,a] of this.tracks)if(key.startsWith('Roll_')&&(!running||!names.has(key))) {if(!a.paused)a.pause();if(!names.has(key)&&a.currentTime!==0)a.currentTime=0}
    for(const roll of frame.rolls) {
      const a=this.get(roll.name,true)
      if(a.volume!==roll.gain)a.volume=roll.gain
      const rate=Math.min(16,Math.max(.0625,roll.pitch));if(a.playbackRate!==rate)a.playbackRate=rate
      if(a.preservesPitch)a.preservesPitch=false
      if(running)this.play(a)
    }
    if(!running)return
    for(const impact of frame.impacts) {
      const slot=this.impactSlots.get(impact.group)??0
      this.impactSlots.set(impact.group,1-slot)
      const a=this.get(impact.name,false,`Hit:${impact.group}:${impact.name}:${slot}`)
      a.volume=impact.gain;a.currentTime=0;void a.play().catch(()=>{})
    }
  }
  dispose() { this.samples.dispose();for (const a of this.tracks.values()) { a.pause(); a.removeAttribute('src'); a.load() } this.tracks.clear() }
}
