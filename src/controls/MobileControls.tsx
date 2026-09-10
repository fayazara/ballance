import {useCallback,useEffect,useRef,useState} from 'react'
import {screenTilt,tiltAxes,floatingPad} from './mobile-input'
import type {Axes} from './mobile-input'

type OrientationPermission=typeof DeviceOrientationEvent&{requestPermission?:()=>Promise<string>}
export function MobileControls({onInput,onView,onRotate,active,original,sensitivity}:{onInput:(value:Axes)=>void;onView:(held:boolean)=>void;onRotate:(delta:number)=>void;active:boolean;original:boolean;sensitivity:number}) {
  const [mode,setMode]=useState<'dpad'|'gyro'>('dpad'),[status,setStatus]=useState(''),[requesting,setRequesting]=useState(false)
  const [calibrated,setCalibrated]=useState(false),[axes,setAxes]=useState<Axes>({x:0,z:0})
  const pointer=useRef<{id:number;x:number;y:number}|null>(null)
  const [stick,setStick]=useState<{x:number;y:number;dx:number;dy:number}|null>(null)
  const neutral=useRef<Axes|null>(null),sample=useRef<Axes|null>(null)
  const live=useRef({active,mode,sensitivity})
  useEffect(()=>{live.current={active,mode,sensitivity}},[active,mode,sensitivity])
  const epoch=useRef({value:0})
  const releaseStick=useCallback(()=>{pointer.current=null;setStick(null);onInput({x:0,z:0})},[onInput])
  const clear=useCallback(()=>{releaseStick();onView(false)},[releaseStick,onView])
  // Pausing externally must cancel the captured gesture before resuming.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(()=>{if(!active)clear()},[active,clear])
  useEffect(()=> {
    const cancellation=epoch.current
    const reset=()=>{clear();neutral.current=null;sample.current=null;setCalibrated(false)}
    const visibility=()=>{if(document.hidden)reset()}
    window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility)
    window.addEventListener('orientationchange',reset);screen.orientation?.addEventListener('change',reset)
    return ()=>{cancellation.value++;clear();window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('orientationchange',reset);screen.orientation?.removeEventListener('change',reset)}
  },[clear])
  useEffect(()=> {
    if(mode!=='gyro')return
    let seen=false,last=0,filtered={x:0,z:0}
    const event=(e:DeviceOrientationEvent)=> {
      if(e.beta===null||e.gamma===null||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return
      seen=true
      const angle=screen.orientation?.angle??(window as Window&{orientation?:number}).orientation??0
      const value=screenTilt(e.beta,e.gamma,angle);sample.current=value
      if(!neutral.current){neutral.current=value;setCalibrated(true);setStatus('')}
      if(!live.current.active)return
      const target=tiltAxes(value,neutral.current,live.current.sensitivity)
      const dt=last?Math.min((e.timeStamp-last)/1000,.1):.016;last=e.timeStamp
      const mix=1-Math.exp(-dt*18)
      filtered={x:filtered.x+(target.x-filtered.x)*mix,z:filtered.z+(target.z-filtered.z)*mix}
      // Return fully to neutral so the native held-key path cannot drift on tiny residuals.
      const next={x:Math.abs(filtered.x)<.02?0:filtered.x,z:Math.abs(filtered.z)<.02?0:filtered.z}
      onInput(next);setAxes(next)
    }
    window.addEventListener('deviceorientation',event)
    const timeout=window.setTimeout(()=>{if(!seen){setMode('dpad');setStatus('No motion sensor detected. D-pad is ready.')}},4000)
    return ()=>{window.clearTimeout(timeout);window.removeEventListener('deviceorientation',event);clear()}
  },[mode,clear,onInput])
  const gyro=async()=> {
    const token=++epoch.current.value;clear();setRequesting(true);setStatus('')
    try {
      if(!window.isSecureContext||typeof DeviceOrientationEvent==='undefined')throw new Error('Tilt needs a phone browser over HTTPS. Use the D-pad here.')
      const permission=(DeviceOrientationEvent as OrientationPermission).requestPermission
      if(permission&&await permission.call(DeviceOrientationEvent)!=='granted')throw new Error('Motion access was denied. D-pad is ready; allow Motion & Orientation in your browser to use tilt.')
      if(epoch.current.value!==token)return
      neutral.current=null;sample.current=null;setCalibrated(false);setMode('gyro');setStatus('Hold your phone comfortably…')
    } catch(e) {if(epoch.current.value===token){setMode('dpad');setStatus(e instanceof Error?e.message:'Motion unavailable. D-pad is ready.')}}
    finally {if(epoch.current.value===token)setRequesting(false)}
  }
  const rotate=(delta:number)=>{if(active)onRotate(delta)}
  const update=(value:Axes)=>{if(active){onInput(value);setAxes(value)}}
  const calibrate=()=>{clear();neutral.current=sample.current;setCalibrated(!!sample.current);setStatus(sample.current?'Calibrated':'Waiting for motion…')}
  return <div className={`mobile-controls ${!active?'controls-inactive':''}`} aria-label="Phone controls">
    {mode==='dpad'&&<div className="steering-surface" role="group" aria-label="Touch anywhere and drag to roll" onContextMenu={e=>e.preventDefault()}
      onPointerDown={e=>{
        if(!active||pointer.current||e.button!==0)return
        e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
        pointer.current={id:e.pointerId,x:e.clientX,y:e.clientY}
        setStick({x:e.clientX,y:e.clientY,dx:0,dy:0});update({x:0,z:0})
      }}
      onPointerMove={e=>{
        const start=pointer.current;if(!start||start.id!==e.pointerId)return
        const value=floatingPad(e.clientX-start.x,e.clientY-start.y)
        setStick({x:start.x,y:start.y,dx:value.dx,dy:value.dy});update(value.axes)
      }}
      onPointerUp={e=>{if(pointer.current?.id===e.pointerId)releaseStick()}}
      onPointerCancel={e=>{if(pointer.current?.id===e.pointerId)releaseStick()}}
      onLostPointerCapture={e=>{if(pointer.current?.id===e.pointerId)releaseStick()}}>
      {stick&&<div className="floating-dpad" aria-hidden="true" style={{left:stick.x,top:stick.y}}><i style={{transform:`translate(${stick.dx}px,${stick.dy}px)`}}/></div>}
    </div>}
    <div className="mobile-steering">
      <div className="control-choice" role="group" aria-label="Steering mode">
        <button aria-pressed={mode==='dpad'} onClick={()=>{epoch.current.value++;setRequesting(false);clear();setAxes({x:0,z:0});setMode('dpad');setStatus('')}}>D-pad</button>
        <button aria-pressed={mode==='gyro'} disabled={requesting} onClick={()=>void gyro()}>{requesting?'Allow motion…':'Gyroscope'}</button>
      </div>
      {status&&<p className="motion-status" role="status">{status}</p>}
      {mode==='gyro'&&<div className="tilt-control"><div className="tilt-indicator" aria-label={calibrated?'Tilt calibrated':'Waiting for sensor'}><i style={{transform:`translate(${axes.x*28}px,${axes.z*28}px)`}}/></div><button onClick={calibrate}>Calibrate</button></div>}
    </div>
    <div className="mobile-actions"><div className="camera-turns"><button aria-label="Rotate camera left" onClick={()=>rotate(Math.PI/2)}>↶</button><button aria-label="Rotate camera right" onClick={()=>rotate(-Math.PI/2)}>↷</button></div>
      <button className="phone-view" aria-label={original?'Hold to raise camera':'Hold to brake'} onPointerDown={e=>{if(!active)return;e.currentTarget.setPointerCapture(e.pointerId);onView(true)}} onPointerUp={()=>{onView(false)}} onPointerCancel={()=>{onView(false)}} onLostPointerCapture={()=>{onView(false)}}>{original?'VIEW':'BRAKE'}</button>
    </div>
  </div>
}
