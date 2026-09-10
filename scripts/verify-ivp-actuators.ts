// Recovered spring and continuous-impulse machinery, original coordinates/units.
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { IvpReplay } from './ivp-replay.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import arms from '../src/game/original-arms-data.json' with {type:'json'}
import lift from '../src/game/original-lift-data.json' with {type:'json'}
import sack from '../src/game/original-sack-data.json' with {type:'json'}
const directory=resolve(process.argv[2] ?? '.local/ivp-simulation')
const {default:createModule}=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const load=(name:string):OriginalDocument=>JSON.parse(readFileSync(resolve('.local/original',name.toLowerCase()+'.json'),'utf8'))
const point=(p:number[],m:THREE.Matrix4)=>new THREE.Vector3(...p as [number,number,number]).applyMatrix4(m).toArray()
const reports=[]
for(let level=1;level<=12;++level) {
  for(const parent of load(`level_${String(level).padStart(2,'0')}`).objects) {
    const kind=['P_Modul_17','P_Modul_03','P_Modul_26'].find(k=>parent.name.startsWith(k+'_'));if(!kind) continue
    const doc=load(kind),parentMatrix=new THREE.Matrix4().fromArray(parent.matrix)
    const frame=(f:number[]|string)=> {
      const values=typeof f!=='string'?f:f===arms.hinge.frameName?arms.hinge.frame:doc.objects.find(o=>o.name===f)?.matrix
      assert.ok(values,`Missing recovered frame ${f}`)
      return parentMatrix.clone().multiply(new THREE.Matrix4().fromArray(values))
    }
    const replay=new IvpReplay(await createModule()),bodies=new Map<string,number>()
    let movement=0
    try {
      const fixed=replay.sphere(.1,{position:point([0,0,0],parentMatrix),mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,fixed:true,collisionEnabled:false})
      bodies.set('FixCube Object',fixed)
      // Isolate the lift's spring-driven platform; gate/weight contacts need the
      // separate collision-pair adapter before this is a complete lift test.
      const parts=kind==='P_Modul_17'?[arms.body]:kind==='P_Modul_03'?[lift.parts.find(p=>p.target===lift.slider.target)!]:sack.parts
      for(const data of parts) {
        const matrix=frame(data.target),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3()
        matrix.decompose(position,rotation,scale);rotation.normalize()
        const hulls=data.hulls.map(name=> {
          const mesh=doc.meshes.find(m=>m.name===name)!,unique=new Map<string,number[]>()
          for(let i=0;i<mesh.positions.length;i+=3) {const p=mesh.positions.slice(i,i+3);unique.set(p.join(' '),p)}
          return [...unique.values()].flatMap(p=>p.map((v,i)=>Math.fround(v*scale.getComponent(i))))
        })
        bodies.set(data.target,replay.compound(hulls,{...data,position:position.toArray(),rotation:rotation.toArray(),frozen:data.startFrozen,collisionEnabled:false}))
      }
      let spring:number|undefined,force:number|undefined
      const target=kind==='P_Modul_17'?arms.body.target:kind==='P_Modul_03'?lift.slider.target:sack.wakeTarget
      const moving=bodies.get(target)!,initial=replay.world.state(moving)
      if(kind==='P_Modul_26') {
        for(const j of sack.joints) replay.joint({kind:'ballSocket',reference:bodies.get(j.target)!,attached:bodies.get(j.anchorObject)!,anchor:point(j.position,frame(j.frame))})
        const startForce=(index:number)=> {
          const f=sack.forces[index]!,direction=new THREE.Vector3(...f.direction as [number,number,number]).transformDirection(frame(f.directionFrame)).toArray()
          return replay.force({body:bodies.get(f.target)!,position:f.position,positionSpace:'core',direction,value:f.impulse})
        }
        force=startForce(sack.initialForce);replay.wake(moving)
        for(let tick=0;tick<792;++tick) {
          // Controlled 198-PSI phases test both recovered directions and handle
          // replacement. This does not emulate the script's delayed frame links.
          if(tick && tick%198===0) {replay.removeForce(force);force=startForce((tick/198)%2)}
          replay.step();if(tick%11===0) for(const data of parts) replay.state(bodies.get(data.target)!)
        }
      } else {
        const j=kind==='P_Modul_17'?arms.hinge:lift.slider
        const anchor=kind==='P_Modul_17'?point([0,0,0],frame(arms.hinge.frame)):point([0,0,0],frame(lift.slider.frame1))
        const axis=kind==='P_Modul_17'?new THREE.Vector3().setFromMatrixColumn(frame(arms.hinge.frame),2).normalize().toArray():new THREE.Vector3(...point([0,0,0],frame(lift.slider.frame2)) as [number,number,number]).sub(new THREE.Vector3(...anchor as [number,number,number])).toArray()
        replay.joint({kind:kind==='P_Modul_17'?'hinge':'slider',reference:moving,attached:fixed,anchor,axis})
        assert.equal(j.limitsEnabled,false)
        const s=kind==='P_Modul_17'?arms.spring:lift.spring
        spring=replay.spring({reference:moving,attached:fixed,anchor1:point(s.position1,frame(s.frame1)),anchor2:point(s.position2,frame(s.frame2)),length:s.length,constant:s.constant,axialDamping:s.axialDamping,globalDamping:s.globalDamping})
        replay.wake(moving)
        replay.pushAt(moving,point([3,1,2],frame(target)),[.7,2,-.3])
        for(let tick=0;tick<792;++tick) {replay.step();if(tick%11===0) replay.state(moving)}
      }
      const final=replay.world.state(moving)
      movement=Math.hypot(...final.slice(0,7).map((v,i)=>v-initial[i]!))
      assert.ok(Number.isFinite(movement)&&movement>.00001,`${level}:${parent.name}: machine did not move`)
      if(spring!==undefined) {replay.removeSpring(spring);assert.throws(()=>replay.world.removeSpring(spring),/spring removal failed/)}
      // Remaining force and joint handles must expire as bodies are removed.
      for(const data of parts) replay.remove(bodies.get(data.target)!)
      if(force!==undefined) assert.throws(()=>replay.world.removeForce(force),/force removal failed/)
      replay.step()
    } finally {replay.world.dispose()}
    reports.push({level,name:parent.name,kind,movement,...replay.compare(directory)})
  }
}
assert.equal(reports.filter(r=>r.kind==='P_Modul_17').length,6)
assert.equal(reports.filter(r=>r.kind==='P_Modul_03').length,9)
assert.equal(reports.filter(r=>r.kind==='P_Modul_26').length,18)
writeFileSync(resolve(directory,'actuators-comparison.json'),JSON.stringify(reports,null,2)+'\n')
console.log(JSON.stringify({assemblies:reports.length,samples:reports.reduce((n,r)=>n+r.samples,0),maxDifference:Math.max(...reports.map(r=>r.maxDifference))},null,2))
