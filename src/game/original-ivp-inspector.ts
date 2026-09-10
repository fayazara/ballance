import * as THREE from 'three'
import type {OriginalEngine} from './original-engine.ts'
import type {Material} from './levels.ts'
import {OriginalCheckpoint} from './original-checkpoint.ts'
import {installPerformanceInspector} from './original-performance-inspector'

/** Explicit development UI for observing the real native game path. */
export function inspectOriginal(engine:OriginalEngine) {
  const style=document.createElement('style');style.textContent='.original-menu { visibility:hidden }';document.head.append(style)
  const panel=document.createElement('aside'),output=document.createElement('output')
  const reveal=document.createElement('button');reveal.textContent='Show test panel';reveal.hidden=true
  reveal.style.cssText='position:fixed;left:20px;top:85px;z-index:40;padding:8px'
  reveal.onclick=()=>{panel.hidden=false;reveal.hidden=true}
  panel.setAttribute('aria-label','IVP game test controls')
  panel.style.cssText='position:fixed;left:20px;top:85px;z-index:40;background:#fffe;padding:12px;color:#222;font:12px monospace;max-width:430px;max-height:65vh;overflow:auto'
  output.style.cssText='display:block;white-space:pre-wrap';panel.append(output)
  const update=()=> {
    const runtime=engine.native
    output.textContent=JSON.stringify({backend:'IVP',phase:engine.state.phase,level:engine.state.level+1,sector:engine.state.checkpoint+1,material:engine.state.material,
      points:{time:engine.state.time,pickups:engine.pickups.filter(p=>p.visual?.point&&p.taken).map(p=>({name:p.object.name,stage:p.visual!.point!.stage,remaining:p.visual!.point!.remaining}))},
      transformation:{active:engine.transformation.active,age:engine.transformation.age},fragments:engine.debris?.nativeFragments.length,fans:runtime?.fans.filter(f=>f.running).map(f=>({sector:f.sector,active:f.active,origin:f.origin.toArray()})),
      actuators:runtime?.actuators,death:{hit:runtime?.deathTest.hit,volumes:runtime?.deathTest.volumes.length,
        stage:engine.respawnSequence.stage,physicalized:runtime?.player.body!==undefined,visible:engine.ball.visible,flash:engine.respawnSequence.flash},
      checkpoint:{armed:engine.checkpointTrigger?.armed,center:engine.checkpointTrigger?.center.toArray(),
        flames:engine.checkpointScripts.map(s=>({center:s.armed,sides:s.smallFlames,reached:s.reached}))},
      ending:{stage:runtime?.finish?.stage,age:engine.endingAge,position:runtime?.finish?.position.toArray(),parts:runtime?.finish?.parts.size,forces:runtime?.finish?.forces.length},
      ufo:{stage:engine.ufo?.stage,row:engine.ufo?.row,grabbed:engine.ufo?.grabbed,hidePlayer:engine.ufo?.hidePlayer},
      contactSound:runtime?.sound.frame,
      sampleAudio:engine.audio.samples.stats,
      audio:[...engine.audio.tracks].filter(([name])=>name.startsWith('Roll_')||name.startsWith('Hit:')||name.startsWith('Music_')).map(([name,a])=>({name,paused:a.paused,ready:a.readyState,time:a.currentTime,loop:a.loop,error:a.error?.message,gain:a.volume,pitch:a.playbackRate})),
      originalTime:runtime?.world.time,player:runtime?.player.pose,renderedPosition:engine.ball.position.toArray(),velocity:runtime?.player.body===undefined?null:runtime.world.state(runtime.player.body).slice(7,10),
      filteredFrameMs:runtime?.clock.filteredMs,
      camera:{position:engine.camera.position.toArray(),target:engine.gameCamera.target.toArray(),inputYaw:engine.gameCamera.inputYaw,turning:engine.gameCamera.turning,fov:engine.camera.fov},
      grounded:runtime?.grounded,bodyCount:runtime?.parts.length,parts:runtime?.parts.filter(p=>p.name.includes('Pusher')||p.name.includes('P_Box_03')).map(p=>({name:p.name,position:runtime.world.state(p.body).slice(0,3),renderedPosition:p.mesh?.position.toArray()}))},null,2)
  }
  const button=(label:string,action:()=>void)=> {const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:6px;margin:3px';b.onclick=()=>{action();update()};panel.append(b)}
  button('Hide test panel',()=>{panel.hidden=true;reveal.hidden=false})
  const run=(seconds:number,stop?:()=>boolean,beforeStep?:()=>void)=> {
    if(!engine.endingCamera.active&&Math.abs(engine.yaw-engine.gameCamera.inputYaw)>1e-6)engine.gameCamera.inspectAt(engine.native!.player.renderPose.position,engine.yaw)
    engine.state.phase='playing';engine.audio.paused=false;engine.audio.sync()
    for(let i=0;i<Math.round(seconds*60)&&engine.state.phase==='playing';++i) {beforeStep?.();engine.stepEndingVisuals(1/60);engine.step(1/60);if(stop?.())break}
    if(engine.state.phase==='playing')engine.state.phase='paused'
    engine.audio.paused=true;engine.audio.sync();engine.syncNativePlayer();engine.native?.syncVisuals();engine.follow.copy(engine.body!.translation());engine.emit()
  }
  const place=(point:THREE.Vector3,sector:number,kind:Material)=> {
    engine.endingAge=undefined
    engine.ufo?.reset()
    engine.endingCamera.reset()
    engine.cancelTransformation();engine.keys.clear();engine.touch.x=engine.touch.z=0
    engine.state.checkpoint=sector-1;engine.checkpointMaterial=kind
    const checkpoint=engine.checkpoints[engine.state.checkpoint]
    engine.checkpointTrigger=checkpoint?new OriginalCheckpoint(checkpoint.object):undefined
    if(engine.checkpointTrigger)engine.checkpointScripts[engine.state.checkpoint]=engine.checkpointTrigger
    engine.native!.reset(sector,kind,[point.x*4,point.y*4,-point.z*4])
    engine.syncNativePlayer();engine.transform(kind,false);engine.follow.copy(point);engine.gameCamera.inspectAt(point,engine.yaw);run(0)
  }
  button('Run IVP 2 seconds',()=>run(2))
  button('Run IVP 0.1 seconds',()=>run(.1))
  button('Play IVP',()=>{engine.state.phase='playing';engine.audio.paused=false;engine.audio.sync();engine.emit()})
  button('Pause IVP',()=>{engine.state.phase='paused';engine.audio.paused=true;engine.audio.sync();engine.emit()})
  button('Reset IVP',()=>{engine.state.checkpoint=0;engine.respawn();run(0)})
  button('Respawn at checkpoint',()=>{engine.respawn();run(0)})
  button('Fall into death volume',()=> {
    const volume=engine.native?.deathTest.volumes[0];if(!volume)return
    const box=volume.box,axes=box.rotation.elements,half=box.halfSize
    const top=box.center.y+Math.abs(axes[1]!)*half.x+Math.abs(axes[4]!)*half.y+Math.abs(axes[7]!)*half.z
    place(new THREE.Vector3(box.center.x*.25,(top+8)*.25,-box.center.z*.25),1,engine.state.material)
    run(2)
  })
  for(const direction of ['left','right'] as const)button(`Turn camera ${direction}`,()=> {
    engine.state.phase='playing';engine.turnCamera(direction);run(.3)
  })
  button('Raise camera 2 seconds',()=>{engine.touch.brake=true;run(2);engine.touch.brake=false})
  for(const kind of ['wood','paper','stone'] as const) button(kind,()=>engine.transform(kind,false))
  for(let i=0;i<2;++i) button(`Visit gate ${i+1}`,()=> {
    const gate=engine.pushers[i];if(!gate) return
    place(gate.target.clone().addScaledVector(gate.axis,-1),gate.sector,'wood')
    engine.yaw=engine.targetYaw=Math.atan2(gate.axis.x,gate.axis.z)
  })
  button('Push gate 2 seconds',()=>{engine.touch.z=1;run(2);engine.touch.z=0})
  const relocate=(point:THREE.Vector3)=> {
    engine.cancelTransformation();engine.keys.clear();engine.touch.x=engine.touch.z=0
    const native=engine.native!;native.capture()
    native.player.moveCaptured({position:[point.x*4,point.y*4,-point.z*4],rotation:[0,0,0,1]})
    native.material('wood');engine.syncNativePlayer();engine.transform('wood',false);engine.follow.copy(point);engine.gameCamera.inspectAt(point,engine.yaw);run(0)
  }
  button('Open both Level 1 gates',()=> {
    if(engine.state.level!==0||engine.pushers.length<2)return
    const first=engine.pushers[0]!
    place(first.target.clone().addScaledVector(first.axis,-2.5),first.sector,'wood')
    for(const gate of engine.pushers.slice(0,2))for(let push=0;push<2;push++) {
      const part=engine.native!.parts.find(p=>p.name===gate.name+'/P_Modul_01_Pusher')!
      const state=engine.native!.world.state(part.body)
      const travel=new THREE.Vector3(state[0]!*.25,state[1]!*.25,-state[2]!*.25).sub(gate.origin).dot(gate.axis)
      relocate(gate.target.clone().addScaledVector(gate.axis,travel-2.5))
      engine.yaw=engine.targetYaw=Math.atan2(gate.axis.x,gate.axis.z)
      engine.touch.z=1;run(3);engine.touch.z=0
    }
  })
  button('Cross Level 1 gate passage',()=> {
    if(engine.state.level!==0||engine.pushers.length<2)return
    const [first,last]=engine.pushers,across=new THREE.Vector3(-first!.axis.z,0,first!.axis.x)
    const point=first!.passage.clone().addScaledVector(across,-2).add(new THREE.Vector3(0,.51,0))
    if(engine.state.checkpoint+1!==first!.sector)place(point,first!.sector,'wood')
    else relocate(point)
    engine.yaw=engine.targetYaw=Math.atan2(across.x,across.z)
    engine.touch.z=1;run(3,()=>new THREE.Vector3().copy(engine.body!.translation()).sub(last!.passage).dot(across)>1&&engine.body!.translation().y>first!.passage.y-1);engine.touch.z=0
  })
  button('Visit crate',()=> {
    const box=engine.sectorObjects.find(o=>o.kind==='P_Box');if(!box) return
    place(box.origin.clone().add(new THREE.Vector3(-1.4,.3,0)),box.sector,'wood');engine.yaw=engine.targetYaw=Math.PI/2
  })
  button('Visit point pickup',()=> {
    const pickup=engine.pickups.find(p=>p.object.name.includes('Point')&&!p.taken);if(!pickup)return
    place(pickup.position.clone().add(new THREE.Vector3(0,.15,2)),pickup.sector,'wood')
    engine.state.phase='playing';engine.audio.paused=false;engine.audio.sync();engine.emit()
  })
  button('Activate point pickup',()=> {
    const pickup=engine.pickups.find(p=>p.visual?.point&&!p.taken);if(!pickup)return
    place(pickup.position.clone(),pickup.sector,'wood')
    engine.state.phase='playing';engine.audio.paused=false;engine.audio.sync();engine.emit()
  })
  button('Visit transformer',()=> {
    const pad=engine.pads.find(p=>/Stone/.test(p.object.name));if(!pad)return
    place(pad.position.clone().add(new THREE.Vector3(.3,.75,0)),pad.sector,'wood')
    engine.padCooldown=0
  })
  for(const [label,height] of [['Above checkpoint',8],['Enter checkpoint',2]] as const)button(label,()=> {
    const checkpoint=engine.checkpointTrigger;if(!checkpoint)return
    const point=checkpoint.center.clone().add(new THREE.Vector3(0,height,0)).multiply(new THREE.Vector3(.25,.25,-.25))
    place(point,engine.state.checkpoint+1,engine.state.material)
    run(1/60)
  })
  for(let level=1;level<=12;level++)button(`Load Level ${level}`,()=>{void engine.load(level-1).then(update).catch(error=>{output.textContent=String(error)})})
  for(const kind of ['swing','sack'] as const)button(`Visit ${kind}`,()=> {
    const item=kind==='swing'?engine.swings[0]:engine.sacks[0];if(!item)return
    const point=kind==='swing'?engine.swings[0]!.origin:engine.sacks[0]!.sack.origin
    place(point.clone().add(new THREE.Vector3(0,1.5,0)),item.sector,'wood')
  })
  button('Visit fan with paper',()=> {
    const fan=engine.native?.fans[0];if(!fan)return
    place(new THREE.Vector3(fan.origin.x*.25,(fan.origin.y+2.2)*.25,-fan.origin.z*.25),fan.sector,'paper')
  })
  button('Fly to Level 2 upper fan',()=> {
    if(engine.state.level!==1)return
    const index=engine.fans.findIndex(f=>f.name==='P_Modul_18_01'),targetIndex=engine.fans.findIndex(f=>f.name==='P_Modul_18_12')
    const first=engine.native!.fans[index],upper=engine.native!.fans[targetIndex];if(!first||!upper)return
    place(new THREE.Vector3(first.origin.x*.25,(first.origin.y+2.2)*.25,-first.origin.z*.25),first.sector,'paper')
    engine.yaw=engine.targetYaw=0;run(2,()=>engine.native!.player.pose.position[1]!>upper.origin.y+2)
    run(6,undefined,()=> {
      const native=engine.native!,p=native.player.pose.position,v=native.world.state(native.player.body!).slice(7,10)
      const x=(upper.origin.x-p[0]!)*2-v[0]!*.4,z=(upper.origin.z-p[2]!)*2-v[2]!*.4
      engine.keys.clear()
      if(Math.abs(x)>.3)engine.keys.add(x>0?'d':'a')
      if(Math.abs(z)>.3)engine.keys.add(z>0?'w':'s')
    })
    engine.keys.clear();engine.native!.input(new Set(),0)
  })
  button('Visit ending bridge',()=> {
    const parent=engine.finish?.object;if(!parent)return
    const frame=new THREE.Matrix4().fromArray(parent.matrix)
    const point=new THREE.Vector3(24,1.1,0).applyMatrix4(frame),direction=new THREE.Vector3(-1,0,0).transformDirection(frame)
    point.multiplyScalar(.25);point.z*=-1
    place(point,engine.resets.length,'wood')
    engine.yaw=engine.targetYaw=Math.atan2(direction.x,-direction.z)
  })
  button('Roll onto balloon',()=> {engine.touch.z=1;run(3);engine.touch.z=0})
  const endingFrames=(frames:number,stop?:()=>boolean)=> {
    if(engine.endingAge===undefined)return
    engine.state.phase='playing'
    for(let frame=0;frame<frames&&engine.state.phase==='playing';frame++) {
      engine.stepEndingVisuals(1/60);engine.step(1/60)
      if(stop?.())break
    }
    run(0)
  }
  button('Advance UFO 0.1 seconds',()=>endingFrames(6))
  button('Advance UFO to grab',()=>endingFrames(1500,()=>!!engine.ufo?.grabbed))
  button('Advance UFO to flash',()=>endingFrames(1500,()=>engine.ufo?.stage==='flash'))
  button('Next checkpoint',()=>{if(engine.state.checkpoint<engine.resets.length-1){engine.state.checkpoint++;engine.respawn();run(0)}})
  document.body.append(panel,reveal)
  const stopPerformance=installPerformanceInspector(engine,panel)
  const timer=setInterval(update,250)
  return ()=>{stopPerformance();clearInterval(timer);panel.remove();reveal.remove();style.remove()}
}
