import data from './original-music-data.json' with {type:'json'}

interface Voice {name:string;loop:boolean;gain:number;serial:number;fade?:{from:number;to:number;age:number;duration:number}}
interface Sequence {names:string[];maximumDelay:number;wait:number;voice?:string;stopped:boolean}
/** Sound.nmo's independent ambient/theme sequences. Times are real script seconds. */
export class OriginalMusic {
  readonly voices=new Map<string,Voice>()
  private sequences:Sequence[]=[]
  private serial=0
  private age=0
  private checkpoint=false
  private finished=false
  private level=0
  private random:()=>number
  constructor(random:()=>number=Math.random) {this.random=random}
  start(level:number) {
    const theme=data.levelThemes[level]
    if(theme===undefined)throw new RangeError(`Unknown original level ${level}`)
    this.clear();this.level=level
    this.sequences=[
      {names:data.ambient,maximumDelay:data.ambientDelayMs[1]!/1000,wait:this.random()*data.ambientDelayMs[1]!/1000,stopped:false},
      {names:data.themeSuffixes.map(s=>`Music_Theme_${theme}${s}`),maximumDelay:data.themeDelayMs[1]!/1000,wait:data.themeStartDelayMs/1000,stopped:false},
    ]
  }
  clear() {this.voices.clear();this.sequences=[];this.age=0;this.checkpoint=false;this.finished=false}
  get masterGain() {return Math.min(1,this.age/(data.musicFadeMs/1000))}
  private play(name:string,loop=false,gain=1) {
    this.voices.set(name,{name,loop,gain,serial:++this.serial})
  }
  private fade(name:string,to:number,ms:number) {
    const voice=this.voices.get(name)
    if(voice)voice.fade={from:voice.gain,to,age:0,duration:ms/1000}
  }
  lastCheckpoint() {
    if(this.checkpoint)return
    this.checkpoint=true
    const themes=this.sequences[1]
    if(themes) {themes.stopped=true;if(themes.voice)this.voices.delete(themes.voice)}
    // LastStage initially plays then stops with a ten-second fade. Its first
    // outside-range event is swallowed by the graph's Init/Fix guard.
    this.play('Music_EndCheckpoint',true)
    this.fade('Music_EndCheckpoint',0,data.checkpointStart[1]!)
  }
  approach(inside:boolean) {
    if(!this.checkpoint||this.finished)return
    const name='Music_EndCheckpoint'
    if(inside) {this.play(name,true,0);this.fade(name,1,data.checkpointApproach[0]!)}
    else this.fade(name,0,data.checkpointApproach[1]!)
  }
  finish() {
    if(this.finished)return
    this.lastCheckpoint();this.finished=true
    this.play('Music_EndCheckpoint',true)
    this.fade('Music_EndCheckpoint',0,data.checkpointFinish[1]!)
    this.play(this.level===data.levelThemes.length-1?'Music_LastFinal':'Music_Final')
  }
  ended(name:string,serial:number) {
    if(this.voices.get(name)?.serial!==serial)return
    this.voices.delete(name)
    for(const sequence of this.sequences)if(sequence.voice===name) {
      sequence.voice=undefined;sequence.wait=this.random()*sequence.maximumDelay
    }
  }
  step(dt:number) {
    this.age+=dt
    for(const [name,voice] of this.voices)if(voice.fade) {
      const fade=voice.fade;fade.age+=dt
      const fraction=Math.min(1,fade.age/fade.duration)
      voice.gain=fade.from+(fade.to-fade.from)*fraction
      if(fraction===1) {voice.fade=undefined;if(fade.to===0)this.voices.delete(name)}
    }
    for(const sequence of this.sequences) {
      if(sequence.stopped||sequence.voice)continue
      sequence.wait-=dt
      if(sequence.wait>1e-9)continue
      const index=Math.min(sequence.names.length-1,Math.floor(this.random()*sequence.names.length))
      sequence.voice=sequence.names[index]!
      this.play(sequence.voice)
    }
  }
}
