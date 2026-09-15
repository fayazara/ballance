import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {ControllerActions,controllerName,idleController,readController,selectController,type ControllerAction,type ControllerInput} from './gamepad-input'

type Handlers={onInput:(input:ControllerInput)=>void;onAction:(action:ControllerAction)=>void;onDisconnect:()=>void}
export function useGamepad(handlers:Handlers) {
  const latest=useRef(handlers)
  useLayoutEffect(()=>{latest.current=handlers})
  const [controller,setController]=useState<{name:string;standard:boolean}|null>(null)
  useEffect(()=>{
    if(!navigator.getGamepads)return
    let frame=0,index:number|undefined,identity='',focused=document.hasFocus()&&!document.hidden,prime=false
    const edges=new ControllerActions()
    const clear=()=>{latest.current.onInput(idleController());edges.reset();prime=true}
    const focus=()=>{focused=document.hasFocus()&&!document.hidden;if(!focused)clear()}
    const poll=(now:number)=>{
      let pads:ReturnType<typeof navigator.getGamepads>=[]
      try{pads=navigator.getGamepads()}catch{/* Gamepad access may be blocked by browser policy. */}
      const pad=selectController(pads,index)
      const nextIdentity=pad?`${pad.index}:${pad.id}:${pad.mapping}`:''
      if(nextIdentity!==identity) {
        if(identity){clear();latest.current.onDisconnect()}
        identity=nextIdentity;index=pad?.index
        setController(pad?{name:controllerName(pad),standard:pad.mapping==='standard'}:null)
      }
      if(pad&&focused) {
        const {input,actions}=readController(pad)
        if(prime){edges.reset(actions);prime=false}
        latest.current.onInput(input)
        // Only one discrete UI action per frame, even if several buttons arrive together.
        const action=edges.update(actions,now)[0]
        if(action)latest.current.onAction(action)
      }
      frame=requestAnimationFrame(poll)
    }
    window.addEventListener('blur',focus);window.addEventListener('focus',focus)
    document.addEventListener('visibilitychange',focus)
    frame=requestAnimationFrame(poll)
    return ()=>{
      cancelAnimationFrame(frame);clear()
      window.removeEventListener('blur',focus);window.removeEventListener('focus',focus)
      document.removeEventListener('visibilitychange',focus)
    }
  },[])
  return controller
}
