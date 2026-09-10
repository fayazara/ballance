/** Diagnostic routes: failures identify approaches to investigate, not proven solver defects. */
import {readFileSync,readdirSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as THREE from 'three'
import {OriginalIvpRuntime} from '../src/game/original-ivp-runtime.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
const binary=resolve(process.env.BALLANCE_IVP_BUILD??'.local/ivp-simulation','ivp-simulation.mjs')
const root=resolve('.local/original'),available=existsSync(binary)&&existsSync(resolve(root,'level_01.json'))
const read=(name:string)=>JSON.parse(readFileSync(resolve(root,name+'.json'),'utf8')) as OriginalDocument
async function setup(level=1) {
  const {default:create}=await import(pathToFileURL(binary).href)
  const course=read(`level_${String(level).padStart(2,'0')}`),balls=read('balls')
  const modules=new Map(readdirSync(root).filter(n=>(n.startsWith('p_')||n==='pe_balloon.json')&&n.endsWith('.json')).map(n=>[n.slice(0,-5),read(n.slice(0,-5))]))
  const visuals=new Map(course.objects.filter(o=>/^(P_|PE_Balloon_)/.test(o.name)).map(parent=> {
    const name=[...modules.keys()].find(k=>parent.name.toLowerCase().startsWith(k+'_')),document=name?modules.get(name):undefined
    return [parent.name,new Map((document?.objects??[]).map(o=>[o.name,new THREE.Mesh()]))]
  }))
  return new OriginalIvpRuntime(await create(),course,balls,modules,visuals)
}

function routeDrive(runtime:OriginalIvpRuntime,x:number,z:number) {
  const keys=new Set<'left'|'right'|'forward'|'backward'>()
  if(Math.abs(x)>.2)keys.add(x>0?'right':'left')
  if(Math.abs(z)>.2)keys.add(z>0?'forward':'backward')
  runtime.input(keys,0)
}
function onAuthoredFloor(runtime:OriginalIvpRuntime) {
  const moving=new Set(runtime.parts.map(p=>p.body))
  for(const body of runtime.finish?.parts.values()??[])moving.add(body)
  return runtime.world.contacts(runtime.player.body!).some(c=>c.normal[1]>.3&&!moving.has(c.other)&&runtime.soundIds.has(c.other))
}

if(!available)throw new Error("Original assets and IVP build are required")
const distance=Number(process.argv[2]??8),settle=Number(process.argv[3]??60)
if(!Number.isFinite(distance)||distance<=0||!Number.isInteger(settle)||settle<0||settle>=300)throw new Error("Invalid approach distance or settle frames")
const crossingAxis=process.argv[4]==='z'?2:0
const results:unknown[]=[]
for(const level of [8,9,10,11,12]){
 const runtime=await setup(level)
 try{for(const parent of runtime.course.objects.filter(o=>o.name.startsWith('P_Modul_26_')))for(const sign of [1,-1]){
  const frame=new THREE.Matrix4().fromArray(parent.matrix),origin=new THREE.Vector3().setFromMatrixPosition(frame),axis=new THREE.Vector3().setFromMatrixColumn(frame,crossingAxis).multiplyScalar(sign)
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  runtime.reset(sector,'wood',new THREE.Vector3(crossingAxis===0?-distance*sign:0,4,crossingAxis===2?-distance*sign:0).applyMatrix4(frame).toArray())
  let entrance=false,touched=false,exit=false,minimumY=Infinity
  let firstExit:unknown=null
  const support=()=>runtime.world.contacts(runtime.player.body!).filter(c=>c.normal[1]>.3&&runtime.floorObjects.has(c.other)).map(c=>runtime.floorObjects.get(c.other)!)
  for(let tick=0;tick<300;tick++){
   if(tick<settle)runtime.input(new Set(),0);else routeDrive(runtime,axis.x,axis.z)
   runtime.step(1000/60)
   const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
   if(tick<settle&&onAuthoredFloor(runtime))entrance=true
   touched ||= runtime.world.contacts(runtime.player.body!).some(c=>runtime.parts.some(part=>part.name.startsWith(parent.name+'/')&&part.body===c.other))
   minimumY=Math.min(minimumY,p.y)
   if(p.clone().sub(origin).dot(axis)>8&&onAuthoredFloor(runtime)){
    exit=true
    firstExit ??= {frame:tick+1,position:p.toArray(),heightAboveRoot:p.y-origin.y,minimumHeightAboveRoot:minimumY-origin.y,floors:support()}
   }
  }
  results.push({level,name:parent.name,sign,entrance,touched,exit,firstExit,minimumHeightAboveRoot:minimumY-origin.y,finalFloors:support(),position:runtime.player.pose.position})
 }}finally{runtime.dispose()}
}

console.log(JSON.stringify({conditions:{material:"wood",crossingAxis,fps:60,settleFrames:settle,driveFrames:300-settle,startLocal:crossingAxis===0?[-distance,4,0]:[0,4,-distance],exitDistance:8},results},null,2))
