import {createPortal} from 'react-dom'
import {useEffect,useRef,useState} from 'react'

async function offlineWorker() {
  if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('Offline play needs HTTPS in a browser that supports downloads.')
  if(import.meta.env.DEV)throw new Error('Offline download is available on the published game.')
  const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})
  await registration.update().catch(()=>{})
  const next=registration.installing??registration.waiting
  if(next&&next.state!=='activated')await new Promise<void>((resolve,reject)=> {
    const timer=setTimeout(()=>{next.removeEventListener('statechange',changed);reject(new Error('Update timed out. Reconnect and retry.'))},15000)
    const changed=()=>{if(next.state==='activated'||next.state==='redundant'){clearTimeout(timer);next.removeEventListener('statechange',changed);resolve()}}
    next.addEventListener('statechange',changed);changed()
  })
  return (await navigator.serviceWorker.ready).active!
}
export function OfflineDownload({host}:{host:HTMLElement|null}) {
  const [status,setStatus]=useState<'idle'|'saving'|'ready'|'error'|'deleting'>('idle'),[message,setMessage]=useState(''),[progress,setProgress]=useState(0)
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
  const download=async(refresh=false)=> {
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
      worker.postMessage({type:'SAVE',refresh},[channel.port2])
    } catch(e){setStatus('error');setMessage(e instanceof Error?e.message:'Download unavailable.')}
  }
  const remove=async()=> {
    setStatus('deleting');setMessage('Deleting the offline download…')
    try {
      const worker=await offlineWorker(),channel=new MessageChannel()
      port.current?.close();port.current=channel.port1
      channel.port1.onmessage=event=> {
        if(event.data.type==='DELETED'){setStatus('idle');setMessage('Offline download deleted. Scores and settings are kept.')}
        else {setStatus('error');setMessage(event.data.message||'Could not delete the download.')}
        channel.port1.close()
      }
      worker.postMessage({type:'DELETE'},[channel.port2])
    }catch(e){setStatus('error');setMessage(e instanceof Error?e.message:'Could not delete the download.')}
  }
  const working=status==='saving'||status==='deleting'
  return host?createPortal(<div className="offline-download"><button className="original-button" disabled={working||status==='ready'} onClick={()=>void download()}>{status==='ready'?'✓ Ready for offline play':status==='saving'?`Downloading… ${progress}%`:status==='error'?'Retry download':'Download offline'}</button>
    <div className="offline-management">
      <button className="original-button compact" disabled={working} onClick={()=>void download(true)}>Update offline download</button>
      <button className="original-button compact" disabled={working} onClick={()=>void remove()}>Delete offline download</button>
    </div>
    <p role="status">{status==='ready'?'All 12 courses saved on this device. Reopen this address in the same browser to play without internet. Browser storage must be retained.':message||'Download all courses and sounds for offline play. About 60 MB.'}</p>
    {status==='saving'&&<progress value={progress} max={100} aria-label="Offline download progress"/>}
  </div>,host):null
}
