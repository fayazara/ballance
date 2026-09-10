import type {OriginalEngine} from './original-engine'

/** Development-only frame measurement, operated through the visible inspector. */
export function installPerformanceInspector(engine:OriginalEngine,panel:HTMLElement) {
  const output=document.createElement('output');output.setAttribute('aria-label','Frame performance results')
  output.style.cssText='display:block;white-space:pre-wrap'
  let cancel:()=>void=()=>{}
  for(const enabled of [false,true]) {
    const button=document.createElement('button');button.textContent=`Measure sound ${enabled?'on':'off'}`
    button.onclick=()=> {
      cancel();engine.audio.enabled=enabled;engine.audio.unlock();engine.state.phase='playing';engine.audio.paused=false;engine.audio.sync()
      const counts:Record<string,number>={},restore:(()=>void)[]=[]
      const prototype=HTMLMediaElement.prototype
      for(const name of ['currentTime','playbackRate','volume','preservesPitch']) {
        const desc=Object.getOwnPropertyDescriptor(prototype,name)
        if(!desc?.set||!desc.configurable)continue
        Object.defineProperty(prototype,name,{...desc,set(value){counts[name]=(counts[name]??0)+1;desc.set!.call(this,value)}})
        restore.push(()=>Object.defineProperty(prototype,name,desc))
      }
      for(const name of ['play','pause'] as const) {
        const original=prototype[name]
        const descriptor=Object.getOwnPropertyDescriptor(prototype,name)!
        // Keep native media semantics; only count operations for the A/B sample.
        Object.defineProperty(prototype,name,{...Object.getOwnPropertyDescriptor(prototype,name),value:function(this:HTMLMediaElement){counts[name]=(counts[name]??0)+1;return original.call(this)}})
        restore.push(()=>{Object.defineProperty(prototype,name,descriptor)})
      }
      const frames:number[]=[];let last=0,start=0,id=0
      const stop=()=>{cancelAnimationFrame(id);for(const f of restore)f();restore.length=0}
      cancel=stop;output.textContent=`Measuring sound ${enabled?'on':'off'} for 8 seconds…`
      const frame=(now:number)=> {
        start ||= now
        if(last)frames.push(now-last)
        last=now
        if(now-start<8000){id=requestAnimationFrame(frame);return}
        stop();frames.sort((a,b)=>a-b)
        const total=frames.reduce((a,b)=>a+b,0)
        output.textContent=JSON.stringify({sound:enabled,frames:frames.length,fps:1000*frames.length/total,
          p50Ms:frames[Math.floor(frames.length*.5)],p95Ms:frames[Math.floor(frames.length*.95)],
          over33ms:frames.filter(t=>t>33.4).length,mediaOperations:counts,
          drawCalls:engine.renderer.info.render.calls,triangles:engine.renderer.info.render.triangles,
          drawingBuffer:[engine.renderer.domElement.width,engine.renderer.domElement.height]},null,2)
      }
      id=requestAnimationFrame(frame)
    }
    panel.append(button)
  }
  panel.append(output)
  return ()=>cancel()
}
