import {useEffect,useRef,useState} from 'react'

async function offlineWorker() {
  if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('Offline play needs HTTPS in a browser that supports downloads.')
  if(import.meta.env.DEV)throw new Error('Save for flight is available on the published game.')
  await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})
  return (await navigator.serviceWorker.ready).active!
}
export function OfflineDownload() {
  const [status,setStatus]=useState<'idle'|'saving'|'ready'|'error'>('idle'),[message,setMessage]=useState(''),[progress,setProgress]=useState(0)
  const port=useRef<MessagePort|null>(null)
  useEffect(()=> {
    let mounted=true
    if(!import.meta.env.DEV)void offlineWorker().then(worker=> {
      if(!mounted)return
      const channel=new MessageChannel();port.current=channel.port1
      channel.port1.onmessage=e=>{if(mounted&&e.data.type==='READY')setStatus('ready');channel.port1.close()}
      worker.postMessage({type:'STATUS'},[channel.port2])
    }).catch(()=>{})
    return ()=>{mounted=false;port.current?.close()}
  },[])
  const download=async()=> {
    setStatus('saving');setProgress(0);setMessage('Keep this page open until the download finishes.')
    try {
      const worker=await offlineWorker()
      void navigator.storage?.persist?.().catch(()=>false)
      const channel=new MessageChannel();port.current?.close();port.current=channel.port1
      channel.port1.onmessage=event=> {
        const data=event.data
        if(data.type==='PROGRESS')setProgress(Math.floor(data.done/data.total*100))
        if(data.type==='READY'){setStatus('ready');setMessage('');channel.port1.close()}
        if(data.type==='ERROR'){setStatus('error');setMessage(data.message);channel.port1.close()}
      }
      worker.postMessage({type:'SAVE'},[channel.port2])
    } catch(e){setStatus('error');setMessage(e instanceof Error?e.message:'Download unavailable.')}
  }
  return <div className="offline-download"><button className="primary" disabled={status==='saving'||status==='ready'} onClick={()=>void download()}>{status==='ready'?'✓ Ready for offline play':status==='saving'?`Saving for flight… ${progress}%`:status==='error'?'Retry download':'↓ Save for flight'}</button>
    <p role="status">{status==='ready'?'All 12 courses saved on this device. Open this same browser in airplane mode to check before boarding.':message||'Download all courses and sounds for offline play. About 60 MB.'}</p>
    {status==='saving'&&<progress value={progress} max={100} aria-label="Offline download progress"/>}
  </div>
}
