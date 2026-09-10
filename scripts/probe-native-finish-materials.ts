// Staged native ending approaches; does not run the UFO or complete a course.
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as THREE from 'three'
import {OriginalIvpRuntime} from '../src/game/original-ivp-runtime.ts'
import {originalIvpResetpoints,originalIvpFloors} from '../src/game/original-ivp-level.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
const binary=resolve(process.env.BALLANCE_IVP_BUILD??'.local/ivp-simulation','ivp-simulation.mjs')
const root=resolve('.local/original')
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


const durationSeconds=Number(process.argv[2]??15),level5StoneStart=Number(process.argv[3]??24),fps=Number(process.argv[4]??60)
if(!Number.isFinite(durationSeconds)||durationSeconds<=0||!Number.isFinite(level5StoneStart)||!Number.isFinite(fps)||fps<=0)throw new Error('Expected positive duration seconds, finite Level 5 stone start distance, and positive script FPS')
for(let level=1;level<=12;level++)for(const material of ['wood','stone','paper'] as const) {
 const runtime=await setup(level)
 try {
 const parent=runtime.course.objects.find(o=>o.name.startsWith('PE_Balloon_'))!,frame=new THREE.Matrix4().fromArray(parent.matrix)
 const startDistance=level===5&&material==='stone'?level5StoneStart:24
 const start=new THREE.Vector3(startDistance,3.1,0).applyMatrix4(frame)
 let floorDistance=Infinity
 const triangle=new THREE.Triangle(),nearest=new THREE.Vector3()
 for(const floor of originalIvpFloors(runtime.course)) {
  if(floor.group==='Ball')continue
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...floor.descriptor.position as [number,number,number]),new THREE.Quaternion(...floor.descriptor.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1))
  for(let i=0;i<floor.triangles.length;i+=9) {
   triangle.a.fromArray(floor.triangles,i).applyMatrix4(matrix);triangle.b.fromArray(floor.triangles,i+3).applyMatrix4(matrix);triangle.c.fromArray(floor.triangles,i+6).applyMatrix4(matrix)
   if(triangle.getArea()<1e-12)continue
   triangle.closestPointToPoint(start,nearest);floorDistance=Math.min(floorDistance,start.distanceTo(nearest))
  }
 }
 if(!Number.isFinite(floorDistance)||material!=='paper'&&floorDistance<2)throw new Error(`Invalid sphere fixture: Level ${level}, clearance ${floorDistance}`)
 runtime.reset(originalIvpResetpoints(runtime.course).length,material,start.toArray())
 let boarded=-1,touched=false
 for(let i=0;i<durationSeconds*fps;i++) {
  const target=runtime.finish!.position,p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number]),v=runtime.world.state(runtime.player.body!).slice(7,10)
  const error=target.clone().sub(p),keys=new Set<'left'|'right'|'forward'|'backward'>()
  if(boarded<0) {const x=error.x*1.2-v[0]!*.9,z=error.z*1.2-v[2]!*.9;if(Math.abs(x)>.25)keys.add(x>0?'right':'left');if(Math.abs(z)>.25)keys.add(z>0?'forward':'backward')}
  runtime.input(keys,0);runtime.step(1000/fps)
  if(runtime.finish!.stage==='departing'&&boarded<0)boarded=i
  if(runtime.world.contacts(runtime.player.body!).some(c=>[...runtime.finish!.parts.values()].includes(c.other)))touched=true
 }
 console.log(JSON.stringify({level,material,durationSeconds,fps,startDistance,startHeight:3.1,floorDistance,boarded,touched,position:runtime.player.pose.position,finish:runtime.finish!.position.toArray(),grounded:runtime.grounded}))
 }finally{runtime.dispose()}
}
