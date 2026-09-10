// Native/WASM joint replays, including every placed passive hinge assembly.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as THREE from 'three'
import { IvpWorld, ivpDescriptor, ivpJointDescriptor } from '../src/game/ivp-bridge.ts'
import type { IvpBodyDescriptor, IvpJointDescriptor } from '../src/game/ivp-bridge.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import hinges from '../src/game/original-hinge-data.json' with { type:'json' }

const directory=resolve(process.argv[2] ?? '.local/ivp-simulation')
const { default:createModule }=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const load=(name:string):OriginalDocument=>JSON.parse(readFileSync(resolve('.local/original',name.toLowerCase()+'.json'),'utf8'))
const box=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].flatMap(z=>[x,y,z])))
const material={mass:3,friction:.7,restitution:.3,linearDamping:0,angularDamping:0,collisionEnabled:false}
const reports:{ name:string;samples:number;maxDifference:number;maxAnchorError:number }[]=[]
async function replay(name:string,hulls:number[][],body:IvpBodyDescriptor,joint:Omit<IvpJointDescriptor,'reference'|'attached'>,gravity:number) {
  const world=new IvpWorld(await createModule(),gravity), commands=[`world ${gravity}`], states:number[][]=[]
  let maxAnchorError=0
  try {
    const packed=hulls.flatMap(h=>[h.length/3,...h]), id=world.compound(hulls,body)
    commands.push(`compound ${hulls.length} ${packed.join(' ')} ${ivpDescriptor(body).join(' ')}`)
    const support={...material,position:joint.anchor,fixed:true}
    const fixed=world.sphere(.1,support)
    commands.push(`ball 0.1 ${ivpDescriptor(support).join(' ')}`)
    const descriptor={...joint,reference:id,attached:fixed}, handle=world.joint(descriptor)
    commands.push(`joint ${{hinge:1,slider:2,ballSocket:3}[joint.kind]} ${id} ${fixed} ${ivpJointDescriptor(descriptor).join(' ')}`)
    const originalRotation=new THREE.Quaternion(...(body.rotation ?? [0,0,0,1]) as [number,number,number,number])
    const localAnchor=new THREE.Vector3(...joint.anchor as [number,number,number]).sub(new THREE.Vector3(...body.position as [number,number,number])).applyQuaternion(originalRotation.clone().invert())
    const push=[.7,1.2,-.3], point=new THREE.Vector3(2,1,3).applyQuaternion(originalRotation).add(new THREE.Vector3(...body.position as [number,number,number])).toArray()
    world.pushAt(id,point,push); commands.push(`push_at ${id} ${[...point,...push].join(' ')}`)
    for(let tick=0;tick<396;++tick) {
      world.step(); commands.push(`step ${1/66}`)
      if(tick%11===0) {
        const state=world.state(id); states.push(state); commands.push(`state ${id}`)
        if(joint.kind!=='slider') {
          const anchor=localAnchor.clone().applyQuaternion(new THREE.Quaternion(...state.slice(3,7) as [number,number,number,number])).add(new THREE.Vector3(...state.slice(0,3) as [number,number,number]))
          maxAnchorError=Math.max(maxAnchorError,anchor.distanceTo(new THREE.Vector3(...joint.anchor as [number,number,number])))
        }
      }
    }
    assert.ok(maxAnchorError<.08,`${name}: drifting anchor ${maxAnchorError}`)
    world.removeJoint(handle); commands.push(`remove_joint ${handle}`)
    assert.throws(()=>world.removeJoint(handle),/joint removal failed/)
    // Release the actual body; no surviving constraint should hold it in place.
    world.push(id,0,4,0); commands.push(`push ${id} 0 4 0`)
    for(let tick=0;tick<66;++tick) { world.step(); commands.push(`step ${1/66}`) }
    states.push(world.state(id)); commands.push(`state ${id}`)
  } finally { world.dispose() }
  const process=spawnSync(resolve(directory,'ivp-simulation-native'),[],{input:commands.join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
  assert.equal(process.status,0,`${name}: native replay ${process.stderr}`)
  const native:number[][]=process.stdout.trim().split('\n').map(line=>JSON.parse(line))
  assert.equal(native.length,states.length)
  const maxDifference=Math.max(...states.flatMap((state,i)=>state.map((value,j)=>Math.abs(value-native[i]![j]!))))
  assert.ok(Number.isFinite(maxDifference) && maxDifference<1e-5,`${name}: native/WASM difference ${maxDifference}`)
  reports.push({name,samples:states.length,maxDifference,maxAnchorError})
}
for(const kind of ['hinge','slider','ballSocket'] as const) {
  for(const limited of kind==='ballSocket' ? [false] : [false,true]) {
    await replay(`${kind}-${limited?'limited':'free'}`,[box],{...material,position:[2,0,0]},
      {kind,anchor:[0,0,0],axis:[0,0,1],...(limited?{limits:[-.3,.4] as [number,number]}:{})},0)
  }
}
let placed=0
for(let level=1;level<=12;++level) {
  const course=load(`level_${String(level).padStart(2,'0')}`)
  for(const parent of course.objects) {
    const kind=Object.keys(hinges).find(k=>parent.name.startsWith(k+'_')) as keyof typeof hinges|undefined
    if(!kind) continue
    const data=hinges[kind], document=load(kind), target=document.objects.find(o=>o.name===data.target)!
    const matrix=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(target.matrix))
    const position=new THREE.Vector3(), rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
    matrix.decompose(position,rotation,scale);rotation.normalize()
    const hulls=data.hulls.map(name=> {
      const mesh=document.meshes.find(m=>m.name===name);assert.ok(mesh,name)
      const points=new Map<string,number[]>()
      for(let i=0;i<mesh.positions.length;i+=3) {const p=mesh.positions.slice(i,i+3);points.set(p.join(' '),p)}
      return [...points.values()].flatMap(p=>p.map((v,i)=>Math.fround(v*scale.getComponent(i))))
    })
    const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(data.hingeFrame))
    const anchor=new THREE.Vector3().setFromMatrixPosition(frame),axis=new THREE.Vector3().setFromMatrixColumn(frame,2).normalize()
    await replay(`${level}:${parent.name}`,hulls,{...data,position:position.toArray(),rotation:rotation.toArray(),collisionEnabled:false},
      {kind:'hinge',anchor:anchor.toArray(),axis:axis.toArray(),...(data.limitsEnabled?{limits:[data.lowerLimit*Math.PI/180,data.upperLimit*Math.PI/180] as [number,number]}:{})},-20)
    ++placed
  }
}
assert.equal(placed,118)
writeFileSync(resolve(directory,'joints-comparison.json'),JSON.stringify(reports,null,2)+'\n')
console.log(JSON.stringify({scenarios:reports.length,placedHinges:placed,samples:reports.reduce((n,r)=>n+r.samples,0),maxDifference:Math.max(...reports.map(r=>r.maxDifference)),maxAnchorError:Math.max(...reports.map(r=>r.maxAnchorError))},null,2))
