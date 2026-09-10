interface Voice {
  name:string;loop:boolean;volume:number;rate:number;offset:number;startedAt:number;paused:boolean
  source?:AudioBufferSourceNode;gain?:GainNode;loading?:Promise<void>
}
/** Short game sounds share decoded samples and one Web Audio context. Music
 * remains streamed; per-frame pitch changes never seek an HTML media decoder. */
export class OriginalSampleAudio {
  private context?:AudioContext
  private buffers=new Map<string,Promise<AudioBuffer|undefined>>()
  private voices=new Map<string,Voice>()
  private disposed=false
  private resumePending?:Promise<void>
  private extension:()=>string
  private failed=new Set<string>()
  constructor(extension:()=>string){this.extension=extension}
  get available(){return typeof AudioContext!=='undefined'}
  unlock() {
    if(this.disposed||!this.available)return
    this.context??=new AudioContext({latencyHint:'interactive'})
    if(this.context.state!=='running'&&!this.resumePending)
      this.resumePending=this.context.resume().catch(()=>{}).finally(()=>{this.resumePending=undefined})
  }
  private buffer(name:string) {
    let pending=this.buffers.get(name)
    if(!pending) {
      const context=this.context!
      pending=fetch(`/original/audio/${name}.${this.extension()}`).then(r=> {
        if(!r.ok)throw new Error(`Audio ${name}: ${r.status}`)
        return r.arrayBuffer()
      }).then(bytes=>context.decodeAudioData(bytes)).catch(()=>{this.failed.add(name);return undefined})
      this.buffers.set(name,pending)
    }
    return pending
  }
  play(name:string,key=name,loop=false,volume=.55,rate=1,restart=false) {
    if(this.disposed||!this.context||this.failed.has(name))return
    if(restart||this.voices.get(key)?.name!==name)this.stop(key)
    let voice=this.voices.get(key)
    if(!voice) {
      voice={name,loop,volume,rate,offset:0,startedAt:0,paused:false};this.voices.set(key,voice)
    }
    if(voice.source&&voice.rate!==rate) {
      voice.offset+=(this.context.currentTime-voice.startedAt)*voice.rate;voice.startedAt=this.context.currentTime
      voice.source.playbackRate.value=rate
    }
    if(voice.gain&&voice.volume!==volume)voice.gain.gain.value=volume
    voice.volume=volume;voice.rate=rate;voice.paused=false
    if(voice.source||voice.loading)return
    const current=voice,context=this.context
    current.loading=this.buffer(name).then(buffer=> {
      if(!buffer||this.disposed||current.paused||this.voices.get(key)!==current)return
      const source=context.createBufferSource(),gain=context.createGain()
      source.buffer=buffer;source.loop=loop;source.playbackRate.value=current.rate;gain.gain.value=current.volume
      source.connect(gain);gain.connect(context.destination)
      current.source=source;current.gain=gain;current.startedAt=context.currentTime
      source.onended=()=> {
        source.disconnect();gain.disconnect()
        if(current.source===source){current.source=undefined;current.gain=undefined;this.voices.delete(key)}
      }
      if(loop)current.offset%=buffer.duration
      else if(current.offset>=buffer.duration){this.stop(key);return}
      source.start(0,current.offset)
    }).finally(()=>{current.loading=undefined})
  }
  pause(key:string) {
    const voice=this.voices.get(key)
    if(!voice||voice.paused)return
    voice.paused=true
    if(voice.source) {
      voice.offset+=(this.context!.currentTime-voice.startedAt)*voice.rate
      const source=voice.source;voice.source=undefined;source.stop();source.disconnect();voice.gain?.disconnect();voice.gain=undefined
    }
  }
  pauseAll(){for(const key of this.voices.keys())this.pause(key)}
  stop(key:string){this.pause(key);this.voices.delete(key)}
  stopPrefix(prefix:string){for(const key of this.voices.keys())if(key.startsWith(prefix))this.stop(key)}
  retainLoops(prefix:string,keys:ReadonlySet<string>) {
    for(const key of this.voices.keys())if(key.startsWith(prefix)&&!keys.has(key))this.stop(key)
  }
  resume(key:string) {
    const v=this.voices.get(key)
    if(v)this.play(v.name,key,v.loop,v.volume,v.rate)
  }
  get stats(){return {buffers:this.buffers.size,voices:this.voices.size,playing:[...this.voices.values()].filter(v=>!!v.source).length,state:this.context?.state}}
  dispose() {
    this.disposed=true;this.pauseAll();this.voices.clear();this.buffers.clear()
    if(this.context)void this.context.close().catch(()=>{})
  }
}
