// Physicalize every authored resetpoint/material and observe three seconds of native settling.
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



for(let level=1;level<=12;level++) {
 const runtime=await setup(level)
 try {
 const resets=originalIvpResetpoints(runtime.course)
 for(const [index,reset] of resets.entries())for(const kind of ['wood','stone','paper'] as const) {
  const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(reset.matrix)).normalize()
  const start=reset.matrix.slice(12,15)
  let distance=Infinity
  const triangle=new THREE.Triangle(),nearest=new THREE.Vector3(),point=new THREE.Vector3().fromArray(start)
  for(const floor of originalIvpFloors(runtime.course)) {
   if(floor.group==='Ball')continue
   const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...floor.descriptor.position as [number,number,number]),new THREE.Quaternion(...floor.descriptor.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1))
   for(let i=0;i<floor.triangles.length;i+=9){triangle.a.fromArray(floor.triangles,i).applyMatrix4(matrix);triangle.b.fromArray(floor.triangles,i+3).applyMatrix4(matrix);triangle.c.fromArray(floor.triangles,i+6).applyMatrix4(matrix);if(triangle.getArea()<1e-12)continue;triangle.closestPointToPoint(point,nearest);distance=Math.min(distance,point.distanceTo(nearest))}
  }
  if(!Number.isFinite(distance)||distance<2)throw new Error(`Invalid resetpoint clearance: ${level}/${index+1}: ${distance}`)
  runtime.reset(index+1,kind,start,rotation.toArray())
  let minimumY=start[1]!,touched=false
  for(let frame=0;frame<180;frame++){runtime.step(1000/60);minimumY=Math.min(minimumY,runtime.player.pose.position[1]!);touched ||= runtime.grounded}
  console.log(JSON.stringify({distance,level,sector:index+1,kind,start,position:runtime.player.pose.position,minimumY,touched,grounded:runtime.grounded,death:runtime.deathTest.hit}))
 }
 }finally{runtime.dispose()}
}
