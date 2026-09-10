import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {createHash,webcrypto} from 'node:crypto'
function harness() {
  const listeners=new Map<string,(e:any)=>void>(),stores=new Map<string,Map<string,Response>>()
  const payloads=new Map([['/','<html>Ballance</html>'],['/original/level_12.json','{"level":12}'],['/original/audio/roll.m4a','0123456789']])
  const files=[...payloads].map(([url,body])=>({url,size:body.length,hash:createHash('sha256').update(body).digest('hex')}))
  const offline={value:false},messages:any[]=[]
  const context=vm.createContext({Response,Headers,URL,AbortController,setTimeout,clearTimeout,crypto:webcrypto,console,
    self:{location:{origin:'https://game.test'},skipWaiting:async()=>{},clients:{claim:async()=>{}},addEventListener:(name:string,fn:(e:any)=>void)=>listeners.set(name,fn)},
    caches:{keys:async()=>[...stores.keys()],open:async(name:string)=> {
      if(!stores.has(name))stores.set(name,new Map())
      const cache=stores.get(name)!
      return {match:async(key:string)=>cache.get(key)?.clone(),put:async(key:string,response:Response)=>{cache.set(key,response.clone())},delete:async(key:string)=>cache.delete(key)}
    }},
    fetch:async(input:string|{url:string})=> {
      if(offline.value)throw new Error('Network disconnected')
      const path=typeof input==='string'?input:new URL(input.url).pathname
      if(path==='/offline-manifest.json')return Response.json({version:'test',files})
      const body=payloads.get(path);return new Response(body??'Missing',{status:body?200:404})
    }
  })
  vm.runInContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8').replace('__OFFLINE_VERSION__','test'),context)
  const message=async(type:string)=>{let work:Promise<unknown>|undefined;listeners.get('message')!({data:{type},ports:[{postMessage:(m:any)=>messages.push(m)}],waitUntil:(p:Promise<unknown>)=>{work=p}});await work;return messages.at(-1)}
  const request=async(path:string,range?:string,navigation=false)=> {
    let result:Promise<Response>|undefined
    listeners.get('fetch')!({request:{url:`https://game.test${path}`,method:'GET',mode:navigation?'navigate':'cors',headers:new Headers(range?{range}:{})},respondWith:(p:Promise<Response>)=>{result=p}})
    return await result!
  }
  return {message,request,offline,payloads,stores,messages}
}
test('download verifies the complete pack before ready, then serves a cold navigation and level offline',async()=> {
  const h=harness();assert.equal((await h.message('STATUS')).type,'EMPTY')
  assert.equal((await h.message('SAVE')).type,'READY')
  assert.equal((await h.message('STATUS')).type,'READY')
  h.offline.value=true
  assert.equal(await (await h.request('/?flight',undefined,true)).text(),'<html>Ballance</html>')
  assert.equal(await (await h.request('/original/level_12.json')).text(),'{"level":12}')
})
test('offline audio answers Safari byte ranges, suffix ranges and unsatisfiable ranges',async()=> {
  const h=harness();await h.message('SAVE');h.offline.value=true
  const response=await h.request('/original/audio/roll.m4a','bytes=2-5')
  assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 2-5/10');assert.equal(await response.text(),'2345')
  assert.equal(await (await h.request('/original/audio/roll.m4a','bytes=-3')).text(),'789')
  assert.equal((await h.request('/original/audio/roll.m4a','bytes=99-')).status,416)
})
test('a failed or changed download cannot claim offline readiness and is retryable',async()=> {
  const h=harness();h.payloads.set('/original/level_12.json','changed')
  assert.equal((await h.message('SAVE')).type,'ERROR')
  assert.equal((await h.message('STATUS')).type,'EMPTY')
  h.payloads.set('/original/level_12.json','{"level":12}')
  assert.equal((await h.message('SAVE')).type,'READY')
})
