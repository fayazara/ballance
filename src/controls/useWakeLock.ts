import {useEffect} from 'react'
/** Tilt play has no screen touches; keep the display awake while the game runs. */
export function useWakeLock(active:boolean) {
  useEffect(()=> {
    if(!active||!navigator.wakeLock)return
    let disposed=false,lock:WakeLockSentinel|undefined
    const acquire=async()=> {
      if(document.hidden||disposed||lock&&!lock.released)return
      try {const next=await navigator.wakeLock.request('screen');if(disposed)await next.release();else lock=next} catch { /* Optional; battery-saving policies may reject it. */ }
    }
    void acquire();document.addEventListener('visibilitychange',acquire)
    return ()=>{disposed=true;document.removeEventListener('visibilitychange',acquire);void lock?.release().catch(()=>{})}
  },[active])
}
