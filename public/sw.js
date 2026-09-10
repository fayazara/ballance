/* Version is filled by stage-original-assets.mjs after the complete game pack is staged. */
const VERSION='__OFFLINE_VERSION__';
const CACHE=`ballance-flight-${VERSION}`;
const READY='/__ballance_offline_ready__';
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
let downloading;
async function downloadFile(url) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try {return await fetch(url,{cache:'no-store',signal:controller.signal});} finally {clearTimeout(timer);}
}
self.addEventListener('message',event=> {
  const port=event.ports[0];if(!port)return;
  if(event.data?.type==='STATUS') {
    event.waitUntil((async()=>{const cache=await caches.open(CACHE);const ready=await cache.match(READY);port.postMessage({type:ready?'READY':'EMPTY'});})());return;
  }
  if(event.data?.type!=='SAVE')return;
  if(downloading){port.postMessage({type:'ERROR',message:'A download is already running. Keep that tab open.'});return;}
  downloading=(async()=> {
    const response=await downloadFile('/offline-manifest.json');
    if(!response.ok)throw new Error('Download list unavailable. Reconnect and try again.');
    const manifest=await response.json();
    if(manifest.version!==VERSION)throw new Error('An update is ready. Reload, then save again.');
    const cache=await caches.open(CACHE);await cache.delete(READY);
    let next=0,done=0;
    const total=manifest.files.reduce((sum,file)=>sum+file.size,0);
    const outcomes=await Promise.allSettled(Array.from({length:4},async()=> {
      while(next<manifest.files.length) {
        const file=manifest.files[next++];
        if(!await cache.match(file.url)) {
          const response=await downloadFile(file.url);
          if(!response.ok)throw new Error(`Could not download ${file.url}. Reconnect and retry.`);
          const bytes=await response.clone().arrayBuffer();
          const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
          if(hash!==file.hash)throw new Error('The game changed during download. Reload and retry.');
          await cache.put(file.url,response);
        }
        done+=file.size;port.postMessage({type:'PROGRESS',done,total});
      }
    }));
    const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    await cache.put(READY,new Response(JSON.stringify({version:VERSION,files:manifest.files.length})));
    port.postMessage({type:'READY'});
  })().catch(error=>port.postMessage({type:'ERROR',message:error.name==='QuotaExceededError'?'Not enough storage. Free some space and retry.':error.message||'Download interrupted. Reconnect and retry.'})).finally(()=>{downloading=undefined;});
  event.waitUntil(downloading);
});
async function savedResponse(request) {
  const url=new URL(request.url);
  const key=request.mode==='navigate'?'/':url.pathname;
  const names=[CACHE,...(await caches.keys()).filter(name=>name.startsWith('ballance-flight-')&&name!==CACHE).reverse()];
  for(const name of names) {
    const cache=await caches.open(name);
    if(!await cache.match(READY))continue;
    const response=await cache.match(key);if(!response)continue;
    const range=request.headers.get('range');
    if(!range)return response;
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416});
    const bytes=await response.arrayBuffer(),size=bytes.byteLength;
    const start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
    const end=match[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
    if(start>end||start>=size||!size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
    const headers=new Headers(response.headers);headers.delete('Content-Encoding');headers.set('Content-Range',`bytes ${start}-${end}/${size}`);headers.set('Content-Length',String(end-start+1));headers.set('Accept-Ranges','bytes');
    return new Response(bytes.slice(start,end+1),{status:206,headers});
  }
}
self.addEventListener('fetch',event=> {
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/offline-manifest.json')return;
  event.respondWith((async()=> {
    // A saved build uses a coherent shell and asset pack, including during flaky flight Wi-Fi.
    const saved=await savedResponse(request);if(saved)return saved;
    return fetch(request);
  })());
});
