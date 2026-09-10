// Connected native/WASM machinery: all original nine-plank chain bridges.
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import * as THREE from 'three'
import { IvpWorld,ivpDescriptor,ivpJointDescriptor } from '../src/game/ivp-bridge.ts'
import type { IvpBodyDescriptor,IvpJointDescriptor } from '../src/game/ivp-bridge.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import source from '../src/game/original-chain-data.json' with {type:'json'}

const directory=resolve(process.argv[2] ?? '.local/ivp-simulation')
const {default:createModule}=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const load=(name:string):OriginalDocument=>JSON.parse(readFileSync(resolve('.local/original',name+'.json'),'utf8'))
const document=load('p_modul_29'),reports=[]
for(let level=1;level<=12;++level) {
  for(const parent of load(`level_${String(level).padStart(2,'0')}`).objects.filter(o=>o.name.startsWith('P_Modul_29_'))) {
    const world=new IvpWorld(await createModule()),commands=['world -20'],states:number[][]=[]
    const bodies=new Map<string,{id:number;position:THREE.Vector3;rotation:THREE.Quaternion}>()
    let maxAnchorError=0,releaseDrop=0
    try {
      const parentMatrix=new THREE.Matrix4().fromArray(parent.matrix)
      const support:IvpBodyDescriptor={position:new THREE.Vector3().setFromMatrixPosition(parentMatrix).toArray(),mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,fixed:true,collisionEnabled:false}
      const fixed=world.sphere(.1,support);commands.push(`ball .1 ${ivpDescriptor(support).join(' ')}`)
      bodies.set('FixCube Object',{id:fixed,position:new THREE.Vector3(...support.position as [number,number,number]),rotation:new THREE.Quaternion()})
      for(const part of source.parts) {
        const object=document.objects.find(o=>o.name===part.target)!
        const matrix=parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(object.matrix))
        const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
        matrix.decompose(position,rotation,scale);rotation.normalize()
        const hulls=part.hulls.map(name=> {
          const mesh=document.meshes.find(m=>m.name===name)!,unique=new Map<string,number[]>()
          for(let i=0;i<mesh.positions.length;i+=3) {const p=mesh.positions.slice(i,i+3);unique.set(p.join(' '),p)}
          return [...unique.values()].flatMap(p=>p.map((v,i)=>Math.fround(v*scale.getComponent(i))))
        })
        const body={...part,position:position.toArray(),rotation:rotation.toArray(),collisionEnabled:true,frozen:part.startFrozen}
        const id=world.compound(hulls,body),packed=hulls.flatMap(h=>[h.length/3,...h])
        commands.push(`compoundg ${part.collisionGroup} ${hulls.length} ${packed.join(' ')} ${ivpDescriptor(body).join(' ')}`)
        bodies.set(part.target,{id,position,rotation})
      }
      const connections=source.joints.map(joint=> {
        const frame=parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(joint.hingeFrame))
        const pivot=new THREE.Vector3().setFromMatrixPosition(frame),axis=new THREE.Vector3().setFromMatrixColumn(frame,2).normalize()
        const a=bodies.get(joint.target)!,b=bodies.get(joint.anchorObject)!
        const descriptor:IvpJointDescriptor={kind:'hinge',reference:a.id,attached:b.id,anchor:pivot.toArray(),axis:axis.toArray()}
        assert.equal(joint.limitsEnabled,false)
        const id=world.joint(descriptor);commands.push(`joint 1 ${a.id} ${b.id} ${ivpJointDescriptor(descriptor).join(' ')}`)
        return {id,index:joint.index,a,b,anchorA:pivot.clone().sub(a.position).applyQuaternion(a.rotation.clone().invert()),anchorB:pivot.clone().sub(b.position).applyQuaternion(b.rotation.clone().invert()),live:true}
      })
      const moving=[...bodies.entries()].filter(([name])=>name!=='FixCube Object').map(([,body])=>body)
      const wake=bodies.get(source.wakeTarget)!.id
      world.wake(wake);commands.push(`wake ${wake}`)
      const release=connections.find(c=>c.index===source.releaseHinge)!
      let startY=0
      for(let tick=0;tick<528;++tick) {
        if(tick===264) {
          startY=world.state(release.a.id)[1]!
          world.removeJoint(release.id);commands.push(`remove_joint ${release.id}`);release.live=false
        }
        world.step();commands.push(`step ${1/66}`)
        if(tick%11===0) {
          const current=new Map<number,number[]>()
          for(const body of moving) {const state=world.state(body.id);states.push(state);current.set(body.id,state);commands.push(`state ${body.id}`)}
          current.set(fixed,world.state(fixed))
          const anchor=(id:number,local:THREE.Vector3)=> {
            const state=current.get(id)!
            return local.clone().applyQuaternion(new THREE.Quaternion(...state.slice(3,7) as [number,number,number,number])).add(new THREE.Vector3(...state.slice(0,3) as [number,number,number]))
          }
          for(const c of connections.filter(c=>c.live)) maxAnchorError=Math.max(maxAnchorError,anchor(c.a.id,c.anchorA).distanceTo(anchor(c.b.id,c.anchorB)))
        }
      }
      releaseDrop=startY-world.state(release.a.id)[1]!
      // This multi-body reference develops ~0.38 original units of transient
      // anchor separation. Keep that measured result visible; do not retune the
      // original constraint defaults to force an invented tighter tolerance.
      assert.ok(Number.isFinite(maxAnchorError),`${parent.name}: invalid chain anchors`)
      assert.ok(releaseDrop>1,`${parent.name}: released endpoint did not drop (${releaseDrop})`)
      // Reset destruction can start with any plank, invalidating only its joints.
      for(const body of moving) {world.remove(body.id);commands.push(`remove ${body.id}`)}
      for(const c of connections) assert.throws(()=>world.removeJoint(c.id),/joint removal failed/)
      world.step();commands.push(`step ${1/66}`)
    } finally {world.dispose()}
    const native=spawnSync(resolve(directory,'ivp-simulation-native'),[],{input:commands.join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024})
    assert.equal(native.status,0,native.stderr)
    const expected:number[][]=native.stdout.trim().split('\n').map(line=>JSON.parse(line))
    assert.equal(expected.length,states.length)
    const maxDifference=Math.max(...states.flatMap((state,i)=>state.map((v,j)=>Math.abs(v-expected[i]![j]!))))
    assert.ok(Number.isFinite(maxDifference)&&maxDifference<1e-5,`${level}:${parent.name}: native/WASM difference ${maxDifference}`)
    reports.push({level,name:parent.name,samples:states.length,maxDifference,maxAnchorError,releaseDrop})
  }
}
assert.equal(reports.length,17)
writeFileSync(resolve(directory,'chains-comparison.json'),JSON.stringify(reports,null,2)+'\n')
console.log(JSON.stringify({bridges:reports.length,bodies:reports.length*source.parts.length,joints:reports.length*source.joints.length,samples:reports.reduce((n,r)=>n+r.samples,0),maxDifference:Math.max(...reports.map(r=>r.maxDifference)),maxAnchorError:Math.max(...reports.map(r=>r.maxAnchorError)),minimumReleaseDrop:Math.min(...reports.map(r=>r.releaseDrop))},null,2))
