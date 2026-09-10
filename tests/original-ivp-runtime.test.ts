import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import * as THREE from 'three'
import {OriginalIvpRuntime,ivpRenderPosition} from '../src/game/original-ivp-runtime.ts'
import {originalIvpFloors,originalIvpResetpoints} from '../src/game/original-ivp-level.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
import {OriginalDebris,ORIGINAL_DEBRIS} from '../src/game/original-debris.ts'
import chain from '../src/game/original-chain-data.json' with {type:'json'}
import hinges from '../src/game/original-hinge-data.json' with {type:'json'}
import liftData from '../src/game/original-lift-data.json' with {type:'json'}
import {originalDepthLimit} from '../src/game/original-depth.ts'
import {OriginalUfo} from '../src/game/original-ufo.ts'
import {OriginalEndingCamera} from '../src/game/original-ending-camera.ts'
import {PLAYER_PHYSICS,ORIGINAL_PSI_HZ,ORIGINAL_TIME_FACTOR} from '../src/game/original-physics.ts'
import clockFixtures from './fixtures/original-physics-clock.json' with {type:'json'}
import actuatorClock from '../docs/original-actuator-clock-oracle.json' with {type:'json'}

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

test('native runtime advances IVP by the DLL-filtered frame duration and keeps the clock across sector resets',{skip:!available},async()=> {
  const runtime=await setup()
  try {
    let expectedTime=runtime.world.time
    for(const sample of clockFixtures.cases.slice(20,32)) {
      runtime.step(sample.deltaMs);expectedTime+=sample.physicsSeconds
      assert.ok(Math.abs(runtime.world.time-expectedTime)<1e-10)
      assert.equal(runtime.clock.filteredMs,sample.filteredMs)
    }
    const previous=runtime.clock.filteredMs,time=runtime.world.time
    const reset=originalIvpResetpoints(runtime.course)[1]!
    runtime.reset(2,'wood',reset.matrix.slice(12,15))
    assert.equal(runtime.clock.filteredMs,previous,'sector activation is not a new physics manager')
    assert.equal(runtime.world.time,time)
  } finally {runtime.dispose()}
})

test('native swinging-platform timers consume rendered frames and keep their zero-delay stage links',{skip:!available},async()=> {
  const runtime=await setup(8)
  try {
    const parent=runtime.course.objects.find(o=>o.name==='P_Modul_08_01')!
    const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
    runtime.activate(sector);runtime.capture()
    const actor=runtime.actuators.find(a=>a.name===parent.name)!,transitions:number[][]=[]
    let previous=-2
    for(let frame=0;frame<124;frame++) {
      runtime.step(1000/60)
      if(actor.stage!==previous){transitions.push([frame,actor.stage]);previous=actor.stage}
    }
    // TimerMini counts delta on activation, discards overshoot, and runs the
    // next distinct timer in the same frame through each zero-delay link.
    // Thirty float32 additions of 1000/60 are 499.9998779296875 ms, so the
    // >=500 test first succeeds on addition 31 (then 30 new frames per stage).
    assert.deepEqual(transitions,[[0,-1],[1,0],[31,1],[61,2],[91,3],[121,0]])
    assert.equal(actor.cycles,1)
  } finally {runtime.dispose()}
})

test('native sack and swing force transitions match compiled TimerMini under uneven script frames',{skip:!available},async()=> {
  const runtime=await setup(8)
  try {
    for(const [scheduleIndex,duration,activationFrames] of actuatorClock.cases) {
      const name=duration===500?'P_Modul_08_01':'P_Modul_26_01'
      const parent=runtime.course.objects.find(o=>o.name===name)!
      const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
      runtime.activate(sector);runtime.capture()
      const actor=runtime.actuators.find(a=>a.name===name)!
      // Consume the swing's startup link before the oracle's timer activation.
      if(duration===500){runtime.step(7);assert.equal(actor.stage,-1)}
      const schedule=actuatorClock.schedules[scheduleIndex!]!
      let initialForce:number|undefined
      for(let frame=0;frame<activationFrames!;frame++) {
        runtime.step(schedule[frame%schedule.length]!)
        if(frame===0)initialForce=actor.force
        const expected=duration===500&&frame===activationFrames!-1?1:0
        assert.equal(actor.stage,expected,`${name}, schedule ${scheduleIndex}, frame ${frame}`)
        if(expected===0)assert.equal(actor.force,initialForce,'force remains attached until the source timer and link expire')
      }
      // Sack output traverses a one-frame link; swing output is zero-delay.
      if(duration===1500){runtime.step(0);assert.equal(actor.stage,1,'zero-delta script frames still traverse delayed links')}
      assert.notEqual(actor.force,initialForce,'next stage replaces the native force controller')
    }
  } finally {runtime.dispose()}
})

test('native actuator cycles rearm timers and preserve unpowered swing stages across uneven frames',{skip:!available},async()=> {
  const runtime=await setup(8)
  try {
    for(let scheduleIndex=0;scheduleIndex<actuatorClock.schedules.length;scheduleIndex++)for(const kind of [0,1]) {
      const name=kind?'P_Modul_26_01':'P_Modul_08_01'
      const parent=runtime.course.objects.find(o=>o.name===name)!
      const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
      runtime.activate(sector);runtime.capture()
      if(!kind)runtime.step(7)
      const actor=runtime.actuators.find(a=>a.name===name)!,schedule=actuatorClock.schedules[scheduleIndex]!
      const transitions:number[][]=[]
      for(let frame=0;frame<400;frame++) {
        runtime.step(schedule[frame%schedule.length]!)
        if(frame===0||transitions.at(-1)![3]!==actor.stage)transitions.push([scheduleIndex,kind,frame,actor.stage])
        assert.equal(actor.force!==undefined,Boolean(kind||actor.stage%2===0),'swing stages 1 and 3 must remain unpowered')
      }
      assert.deepEqual(transitions,actuatorClock.cycleTransitions.filter(row=>row[0]===scheduleIndex&&row[1]===kind))
      assert.equal(actor.cycles,transitions.slice(1).filter(row=>row[3]===0).length)
    }
  } finally {runtime.dispose()}
})

test('Level 12 boarding runs the UFO claw, removes the physical ball, carries it away and resets cleanly',{skip:!available},async()=> {
  for(const fps of [60,120])for(const kind of ['wood','stone','paper'] as const) {
  const runtime=await setup(12)
  const document=read('pe_balloon')
  const materials=new Map(document.materials.map(material=>[material.id,new THREE.MeshPhongMaterial()]))
  const parent=runtime.course.objects.find(object=>object.name.startsWith('PE_Balloon_'))!
  const ufo=new OriginalUfo(parent,document,materials)
  const endingCamera=new OriginalEndingCamera(),camera=new THREE.PerspectiveCamera(45,16/9,.75,625)
  try {
    const frame=new THREE.Matrix4().fromArray(parent.matrix),start=new THREE.Vector3(24,3.1,0).applyMatrix4(frame)
    const direction=new THREE.Vector3(-1,0,0).transformDirection(frame),sector=originalIvpResetpoints(runtime.course).length
    runtime.reset(sector,kind,start.toArray())
    const viewTarget=runtime.player.renderPose.position.clone()
    camera.position.copy(viewTarget).add(new THREE.Vector3(13,13,0))
    const originalBody=runtime.player.body!
    runtime.input(new Set(['backward']),Math.atan2(direction.x,-direction.z))
    let started=false,captures=0,captureGap=Infinity,capturedAt=-1,frameIndex=0
    const rows=new Set<number>(),sounds:string[]=[]
    let checkedFlash=false
    const player={get pose(){return runtime.player.pose},capture:()=> {
      captures++;capturedAt=frameIndex
      const ship=new THREE.Vector3().setFromMatrixPosition(ufo.nodes.get('PE_UFO_Body')!.matrixWorld)
      captureGap=ship.distanceTo(new THREE.Vector3().fromArray(runtime.player.pose.position))
      return runtime.capture()
    },moveCaptured:(pose:typeof runtime.player.pose)=>runtime.player.moveCaptured(pose)}
    for(;frameIndex<1600*fps/60;frameIndex++) {
      sounds.push(...ufo.step(1000/fps,player));rows.add(ufo.row)
      endingCamera.step(1000/fps,runtime.player.renderPose.position,camera.position,viewTarget,ufo.stage==='flight')
      runtime.step(1000/fps)
      if(!started&&runtime.finish?.stage==='departing') {started=true;runtime.input(new Set(),0);ufo.start();endingCamera.start()}
      if(captures&&frameIndex>capturedAt) {
        const ship=new THREE.Vector3().setFromMatrixPosition(ufo.nodes.get('PE_UFO_Body')!.matrixWorld)
        if(ufo.stage==='flight')assert.ok(ship.distanceTo(new THREE.Vector3().fromArray(runtime.player.pose.position))<1e-5)
      }
      if(ufo.stage==='flash'&&!checkedFlash) {
        camera.position.copy(endingCamera.position);camera.lookAt(endingCamera.target);camera.updateMatrixWorld(true)
        const flash=ufo.group.children.find(child=>child.name==='PE_UFO_Flash')! as THREE.Mesh
        const center=new THREE.Vector3().setFromMatrixPosition(flash.matrix),screen=center.clone().project(camera)
        assert.ok(Math.abs(screen.x)<.5&&Math.abs(screen.y)<.5&&screen.z<1,'the actual final flash stays in view')
        const normal=new THREE.Vector3().fromBufferAttribute(flash.geometry.getAttribute('normal'),0).transformDirection(flash.matrix)
        assert.ok(Math.abs(normal.dot(camera.position.clone().sub(center).normalize()))>.95,'flash faces the ending camera instead of lying edge-on')
        const material=(flash.material as THREE.MeshPhongMaterial[])[flash.geometry.groups[0]!.materialIndex!]!
        assert.equal(material.blending,THREE.CustomBlending)
        assert.equal(material.blendSrc,THREE.OneFactor);assert.equal(material.blendDst,THREE.OneFactor)
        checkedFlash=true
      }
      if(ufo.stage==='done')break
    }
    assert.ok(started,'ordinary rolling contact must board the final balloon')
    assert.equal(captures,1);assert.ok(captureGap<4,`claw must reach the departing ball: gap ${captureGap}`)
    assert.equal(ufo.stage,'done');assert.equal(ufo.hidePlayer,true)
    assert.ok(checkedFlash)
    assert.equal(runtime.player.body,undefined)
    assert.throws(()=>runtime.world.state(originalBody),/state read failed/)
    assert.deepEqual(sounds,['Misc_UFO_anim'])
    assert.equal([...rows].filter(row=>row>=0&&row<13).length,13)
    assert.ok([...ufo.meshes.values()].every(mesh=>!mesh.visible))
    assert.ok(ufo.group.children.every(mesh=>!mesh.visible))
    runtime.reset(sector,kind,start.toArray());ufo.reset();endingCamera.reset()
    assert.equal(endingCamera.active,false)
    assert.notEqual(runtime.player.body,undefined);assert.equal(ufo.stage,'idle');assert.equal(ufo.hidePlayer,false)
    assert.equal(ufo.grabbed,false);assert.equal(ufo.row,-1)
    for(let i=0;i<120;i++)ufo.step(1000/fps,player)
    assert.equal(captures,1,'reset cancels the old sequence')
  } finally {
    runtime.dispose();for(const material of materials.values())material.dispose()
    ufo.group.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose()})
  }
  }
})

test('playable IVP Level 1 resets each sector, removes old bodies, and synchronizes rendered actors',{skip:!available},async()=> {
  const runtime=await setup()
  try {
    const resets=originalIvpResetpoints(runtime.course)
    assert.equal(resets.length,4)
    for(let sector=1;sector<=resets.length;sector++) {
      const old=runtime.parts.map(p=>p.body),origin=resets[sector-1]!.matrix.slice(12,15)
      runtime.reset(sector,'wood',origin)
      for(const id of old) assert.throws(()=>runtime.world.state(id),/state read failed/)
      const dome=runtime.parts.find(p=>p.name.startsWith('P_Dome_'))
      const domeStart=dome?runtime.world.state(dome.body).slice(0,7):undefined
      for(let i=0;i<264;i++)runtime.step()
      runtime.syncVisuals()
      assert.ok(runtime.grounded,`sector ${sector} reset must land on the imported floor`)
      assert.ok(Math.abs(runtime.player.pose.position[1]!-origin[1]!)<4)
      for(const part of runtime.parts) {
        assert.ok(part.mesh,`${part.name} has a render binding`)
        assert.ok(part.mesh.visible)
        assert.ok(part.mesh.position.distanceTo(ivpRenderPosition(runtime.world.state(part.body)))<1e-9)
      }
      if(dome) assert.deepEqual(runtime.world.state(dome.body).slice(0,7),domeStart,'steel dome remains fixed')
    }
    runtime.capture()
    runtime.input(new Set(['forward']),0)
    for(let i=0;i<66;i++)runtime.step()
    assert.equal(runtime.player.body,undefined,'transformer capture removes the physical player')
    runtime.material('paper')
    assert.equal(runtime.player.material,'paper')
    assert.deepEqual(runtime.world.state(runtime.player.body!).slice(7,13),[0,0,0,0,0,0],'input cannot leak through a captured material swap')
  } finally {runtime.dispose()}
  runtime.dispose()
})

test('connected IVP course assemblies survive every sector in all twelve levels',{skip:!available},async()=> {
  for(let level=1;level<=12;level++) {
    const runtime=await setup(level)
    try {
      for(const [index,reset] of originalIvpResetpoints(runtime.course).entries()) {
        runtime.reset(index+1,'wood',reset.matrix.slice(12,15))
        for(let i=0;i<264;i++)runtime.step()
        runtime.syncVisuals()
        assert.ok(runtime.grounded,`${level}/${index+1}: reset platform`)
        for(const part of runtime.parts) {
          assert.ok(runtime.world.state(part.body).every(Number.isFinite),`${level}/${part.name}`)
          assert.ok(part.mesh?.visible,`${level}/${part.name}: bound visible actor`)
          assert.ok(part.mesh.position.distanceTo(ivpRenderPosition(runtime.world.state(part.body)))<1e-9)
        }
      }
    } finally {runtime.dispose()}
  }
})

test('playable Level 2 airflow lifts paper, supports heavier balls and detaches through material swaps',{skip:!available},async()=> {
  const runtime=await setup(2)
  try {
    const fan=runtime.fans[0]!
    for(const kind of ['paper','wood','stone'] as const) {
      runtime.reset(fan.sector,kind,fan.origin.clone().add(new THREE.Vector3(0,2.2,0)).toArray())
      for(let tick=0;tick<792;tick++)runtime.step()
      const height=runtime.player.pose.position[1]!-fan.origin.y
      if(kind==='paper')assert.ok(height>15&&height<23,`paper hover height ${height}`)
      else assert.ok(height>1&&height<3,`${kind} should stay grounded: ${height}`)
    }
    runtime.reset(fan.sector,'paper',fan.column.center.toArray())
    runtime.step();runtime.step()
    assert.ok(fan.active)
    runtime.capture()
    assert.equal(fan.active,false,'capture removes airflow before deleting the player body')
    runtime.material('wood');runtime.step();runtime.step()
    runtime.reset(fan.sector,'stone',fan.origin.clone().add(new THREE.Vector3(0,2.2,0)).toArray())
    runtime.step()
    runtime.activate(fan.sector+1)
    assert.equal(fan.active,false,'sector changes release persistent airflow')
  } finally {runtime.dispose()}
})

test('all chain placements release for stone, retain other materials, and restore removed handles on reset',{skip:!available},async()=> {
  let placements=0
  const part=read('p_modul_29').objects.find(o=>o.name===chain.release.object)!
  for(const level of [2,3,4,6,7,8,9,10,11]){
    const runtime=await setup(level)
    try {
      for(const parent of runtime.course.objects.filter(o=>o.name.startsWith('P_Modul_29_'))){
        const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
        const start=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(part.matrix))).add(new THREE.Vector3(0,2.5,0))
        const nearby=runtime.course.objects.filter(o=>o.name.startsWith('P_Modul_29_')&&runtime.course.groups.find(g=>g.name===`Sector_${String(sector).padStart(2,'0')}`)?.members.includes(o.id)).filter(o=>new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(o.matrix).multiply(new THREE.Matrix4().fromArray(part.matrix))).distanceTo(start)<chain.release.distance).length
        let previous:number|undefined
        for(const material of ['wood','stone','paper','stone'] as const) {
          runtime.reset(sector,material,start.toArray())
          if(previous!==undefined)assert.throws(()=>runtime.world.state(previous!),/state read failed/,'reset destroys the previous bridge bodies')
          previous=runtime.parts.find(p=>p.name===parent.name+'/'+chain.release.object)!.body
          const sounds:string[]=[]
          sounds.push(...runtime.step())
          assert.equal(sounds.filter(s=>s===chain.sound).length,material==='stone'?nearby:0,'first frame checks the authored overlapping ranges')
          for(let i=1;i<132;i++)sounds.push(...runtime.step())
          const tears=sounds.filter(s=>s===chain.sound).length
          assert.equal(tears,material==='stone'?(level===6?2:1):0,`${level}/${parent.name}/${material}: release sequence`)
        }
        placements++
      }
    } finally {runtime.dispose()}
  }
  assert.equal(placements,17)
})

test('stone landing on the real Level 2 seesaw moves its native hinge and rendered mesh',{skip:!available},async()=> {
  const runtime=await setup(2)
  try {
    const parent=runtime.course.objects.find(o=>o.name.startsWith('P_Modul_30_'))!
    const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
    const target=read('p_modul_30').objects.find(o=>o.name===hinges.P_Modul_30.target)!
    const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(target.matrix))
    runtime.reset(sector,'stone',new THREE.Vector3(-5,1,0).applyMatrix4(frame).toArray())
    const part=runtime.parts.find(p=>p.name===parent.name+'/'+target.name)!
    const initial=new THREE.Quaternion(...runtime.world.state(part.body).slice(3,7) as [number,number,number,number])
    let contacted=false,maxAngle=0
    for(let i=0;i<264;i++) {
      runtime.step()
      contacted ||= runtime.world.contacts(runtime.player.body!).some(c=>c.other===part.body)
      maxAngle=Math.max(maxAngle,initial.angleTo(new THREE.Quaternion(...runtime.world.state(part.body).slice(3,7) as [number,number,number,number])))
    }
    runtime.syncVisuals()
    assert.ok(contacted,'the imported player must actually contact the seesaw')
    assert.ok(maxAngle>.1,`seesaw must pivot under the load: ${maxAngle}`)
    assert.ok(part.mesh!.quaternion.angleTo(new THREE.Quaternion())>.01,'rendered actor follows the hinge')
  } finally {runtime.dispose()}
})

test('all sack and swing controllers cycle in their real course sectors and reset without stale forces',{skip:!available},async()=> {
  let checked=0,expected=0
  for(let level=8;level<=12;level++) {
    const runtime=await setup(level)
    expected+=runtime.course.objects.filter(o=>/^P_Modul_(08|26)_/.test(o.name)).length
    try {
      for(const [index,reset] of originalIvpResetpoints(runtime.course).entries()) {
        runtime.reset(index+1,'wood',reset.matrix.slice(12,15))
        if(!runtime.actuators.length)continue
        const initial=new Map(runtime.parts.map(p=>[p.body,runtime.world.state(p.body)]))
        for(let tick=0;tick<530;tick++)runtime.step()
        for(const actuator of runtime.actuators) {
          assert.ok(actuator.cycles>=1,`${level}/${actuator.name} completes its drive sequence`)
          const part=runtime.parts.find(p=>p.name.startsWith(actuator.name+'/')&&/Sack|Schaukel/.test(p.name))!
          const state=runtime.world.state(part.body),before=initial.get(part.body)!
          assert.ok(Math.hypot(...state.slice(0,7).map((v,i)=>v-before[i]!))>.01,`${level}/${actuator.name} physically moves`)
          checked++
        }
        const oldForces=runtime.actuators.flatMap(a=>a.force===undefined?[]:[a.force])
        runtime.reset(index+1,'wood',reset.matrix.slice(12,15))
        for(const force of oldForces)assert.throws(()=>runtime.world.removeForce(force),/force removal failed/)
        assert.ok(runtime.actuators.every(a=>a.stage===-1&&a.cycles===0))
      }
    } finally {runtime.dispose()}
  }
  assert.equal(checked,expected,'covers every original sack and swinging platform')
})

test('fallen loose props and lift weights leave IVP and their visual state is restored on reset',{skip:!available},async()=> {
  for(const level of [1,7]) {
    const runtime=await setup(level)
    try {
      assert.equal(runtime.depthLimit,originalDepthLimit(runtime.course)*4)
      const parent=runtime.course.objects.find(o=>o.name.startsWith(level===1?'P_Box_':'P_Modul_03_'))!
      const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
      const reset=originalIvpResetpoints(runtime.course)[sector-1]!
      runtime.reset(sector,'wood',reset.matrix.slice(12,15))
      if(level===7) {
        const weights=runtime.parts.filter(p=>p.name.startsWith(parent.name+'/')&&!p.name.endsWith('/'+liftData.wakeTarget))
        assert.equal(weights.length,8)
        assert.ok(weights.every(p=>!p.removeOnFall),'lift weights are not registered before proximity wake')
        const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(liftData.wakeFrame)))
        runtime.reset(sector,'wood',origin.toArray())
        for(let frame=0;frame<70;frame++)runtime.step()
        assert.equal(runtime.parts.filter(p=>p.name.startsWith(parent.name+'/')&&p.removeOnFall).length,8)
        runtime.reset(sector,'wood',reset.matrix.slice(12,15))
      }
      const part=runtime.parts.find(p=>p.name.startsWith(parent.name+'/')&&p.removeOnFall)!
      assert.ok(part,'the source depth group must register this loose part')
      const origin=runtime.world.state(part.body).slice(0,3)
      runtime.world.wake(part.body);runtime.world.push(part.body,1000,0,0)
      for(let tick=0;tick<2640&&runtime.parts.includes(part);tick++)runtime.step()
      assert.equal(runtime.parts.includes(part),false,`${part.name} is removed after falling below the course limit`)
      assert.throws(()=>runtime.world.state(part.body),/state read failed/)
      assert.equal(part.mesh!.visible,false)
      assert.deepEqual(part.mesh!.position.toArray(),[0,0,0])
      runtime.reset(sector,'wood',reset.matrix.slice(12,15));runtime.syncVisuals()
      const restored=runtime.parts.find(p=>p.name===part.name)!
      assert.ok(restored.removeOnFall,'global depth membership survives sector reset')
      assert.ok(restored.mesh!.visible)
      assert.deepEqual(runtime.world.state(restored.body).slice(0,3),origin)
    } finally {runtime.dispose()}
  }
})

test('all nine authored lifts register falling weights on proximity wake and retain membership across resets',{skip:!available},async()=> {
  let checked=0
  for(let level=1;level<=12;level++) {
    const course=read(`level_${String(level).padStart(2,'0')}`)
    for(const parent of course.objects.filter(o=>o.name.startsWith('P_Modul_03_'))) {
      const runtime=await setup(level)
      try {
        const sector=Number(course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
        const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(liftData.wakeFrame)))
        const far=origin.clone().add(new THREE.Vector3(1000,1000,1000)).toArray()
        runtime.reset(sector,'wood',far)
        const parts=()=>runtime.parts.filter(p=>p.name.startsWith(parent.name+'/'))
        for(let frame=0;frame<70;frame++)runtime.step(1000/60)
        assert.equal(parts().length,9)
        assert.ok(parts().every(p=>!p.removeOnFall),`Level ${level}/${parent.name}: distant player cannot register lift weights`)
        runtime.capture();runtime.player.moveCaptured({position:origin.toArray(),rotation:[0,0,0,1]})
        for(let frame=0;frame<70;frame++)runtime.step(0)
        assert.equal(parts().filter(p=>p.removeOnFall).length,8,`Level ${level}/${parent.name}: script proximity registers exactly the eight falling weights`)
        assert.equal(parts().find(p=>p.name.endsWith('/'+liftData.wakeTarget))!.removeOnFall,undefined)
        const oldHandles=parts().map(p=>p.body)
        runtime.reset(sector,'wood',far)
        assert.equal(parts().filter(p=>p.removeOnFall).length,8,'global membership survives physical body replacement')
        for(const body of oldHandles)assert.throws(()=>runtime.world.state(body),/state read failed/)
        checked++
      } finally {runtime.dispose()}
    }
  }
  assert.equal(checked,9)
})

test('native depth cleanup observes a falling prop on the script frame after physics crosses the cutoff',{skip:!available},async()=> {
  const runtime=await setup(1)
  try {
    const part=runtime.parts.find(p=>p.removeOnFall)!
    assert.ok(part)
    runtime.world.wake(part.body);runtime.world.push(part.body,1000,0,0)
    let crossed=false
    for(let frame=0;frame<2640;frame++) {
      runtime.step(1000/132)
      assert.ok(runtime.parts.includes(part),'cleanup must not observe the new PostProcess pose in the same script frame')
      if(runtime.world.state(part.body)[1]!<runtime.depthLimit){crossed=true;break}
    }
    assert.ok(crossed,'the prop falls naturally below the cutoff')
    runtime.step(0)
    assert.equal(runtime.parts.includes(part),false,'the next script frame removes it even with zero elapsed time')
    assert.throws(()=>runtime.world.state(part.body),/state read failed/)
  } finally {runtime.dispose()}
})

test('every transformer is supported by authored floor collision without a fabricated machine collider',{skip:!available},async()=> {
  for(let level=1;level<=12;level++) {
    const runtime=await setup(level)
    try {
      for(const pad of runtime.course.objects.filter(o=>/^P_Trafo_/.test(o.name))) {
        const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(pad.id))!.name.slice(-2))
        const center=new THREE.Vector3(0,3,0).applyMatrix4(new THREE.Matrix4().fromArray(pad.matrix))
        const material=pad.name.includes('Paper')?'paper':pad.name.includes('Stone')?'stone':'wood'
        runtime.reset(sector,material,center.toArray())
        let supported=false
        // Tilted machines intentionally release onto slopes: the ball may roll
        // off later, so observe the initial contact rather than a stationary pose.
        for(let tick=0;tick<132;tick++) {
          runtime.step()
          if(runtime.grounded&&new THREE.Vector3(...runtime.player.pose.position as [number,number,number]).distanceTo(center)<4)supported=true
        }
        assert.ok(supported,`${level}/${pad.name} requires authored support near its release position`)
      }
    } finally {runtime.dispose()}
  }
})

test('real Level 1 gates respond to player contact and preserve material differences',{skip:!available},async()=> {
  const runtime=await setup(),travel=new Map<string,number>()
  try {
    const parent=runtime.course.objects.find(o=>o.name==='P_Modul_01_01')!
    const pusher=read('p_modul_01').objects.find(o=>o.name==='P_Modul_01_Pusher')!
    const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(pusher.matrix))
    const origin=new THREE.Vector3().setFromMatrixPosition(frame)
    const axis=new THREE.Vector3(1,0,0).transformDirection(frame)
    // Actual target center plus one ball diameter of approach, like the browser inspector.
    const start=new THREE.Vector3(-7.758,1.09,0).applyMatrix4(frame).addScaledVector(axis,-4)
    const yaw=Math.atan2(axis.x,-axis.z)
    for(const kind of ['paper','wood','stone'] as const) {
      runtime.reset(3,kind,start.toArray())
      const gate=runtime.parts.find(p=>p.name==='P_Modul_01_01/P_Modul_01_Pusher')!
      runtime.input(new Set(['backward']),yaw)
      const impacts=new Set<string>(),rolls=new Set<string>()
      for(let i=0;i<660;i++) {runtime.step();for(const sound of runtime.sound.frame.impacts)impacts.add(sound.name);for(const sound of runtime.sound.frame.rolls)rolls.add(sound.name)}
      if(kind!=='paper')assert.ok(impacts.has(`Hit_${kind==='wood'?'Wood':'Stone'}_Wood`),`${kind} impact uses the actual wooden gate tag: ${[...impacts]}`)
      assert.ok(rolls.size>0,`${kind} has floor rolling contacts`)
      travel.set(kind,new THREE.Vector3(...runtime.world.state(gate.body).slice(0,3) as [number,number,number]).sub(origin).dot(axis))
      assert.ok(runtime.grounded,`${kind} remains on the approach platform`)
    }
    assert.ok(travel.get('paper')!<.1,'paper cannot shove the gate open')
    assert.ok(travel.get('wood')!>1,'wood transfers enough momentum to move the real gate')
    assert.ok(travel.get('stone')!>4.8&&travel.get('stone')!<5.2,'stone reaches the authored channel stop')
    assert.ok(travel.get('stone')!>travel.get('wood')!,'material differences survive the browser runtime adapter')
  } finally {runtime.dispose()}
})

test('IVP transformer fragments move, replace their material pool and release bodies and wind on expiry',{skip:!available},async()=> {
  const runtime=await setup(),document=read('balls'),material=new THREE.MeshPhongMaterial()
  const debris=new OriginalDebris(document,new Map(document.materials.map(m=>[m.id,material])))
  try {
    const position=new THREE.Vector3(13.5,8,38)
    for(const kind of ['wood','stone','paper'] as const)debris.spawnIvp(runtime.world,kind,position,()=>.5)
    assert.equal(debris.nativeFragments.length,51)
    assert.equal(debris.fragments.length,0,'no fragments may remain in the dormant Rapier simulation')
    const initial=new Map(debris.nativeFragments.map(f=>[f.body,f.mesh.position.clone()]))
    for(let i=0;i<66;i++){runtime.step();debris.stepIvp(1/132)}
    for(const f of debris.nativeFragments) {
      assert.ok(f.mesh.position.distanceTo(initial.get(f.body)!)>.01,`${f.mesh.name} must visibly move`)
      assert.ok(f.mesh.position.distanceTo(ivpRenderPosition(runtime.world.state(f.body)))<1e-9)
    }
    const oldPaper=debris.nativeFragments.filter(f=>f.kind==='paper').map(f=>f.body)
    debris.spawnIvp(runtime.world,'paper',position,()=>.5)
    assert.equal(debris.nativeFragments.length,51,'repeated transformations reuse a bounded material pool')
    for(const body of oldPaper)assert.throws(()=>runtime.world.state(body),/state read failed/)
    const bodies=debris.nativeFragments.map(f=>f.body)
    const lifetime=Math.max(...Object.values(ORIGINAL_DEBRIS.lifecycle).map(l=>(l.waitMs+l.fadeMs)/1000))
    debris.stepIvp(lifetime+1)
    assert.equal(debris.nativeFragments.length,0)
    assert.equal(debris.group.children.length,0)
    for(const body of bodies)assert.throws(()=>runtime.world.state(body),/state read failed/)
    runtime.step()
  } finally {debris.dispose();material.dispose();runtime.dispose()}
})

test('held respawn positions the captured player without allocating a transient physics body',{skip:!available},async()=> {
  const runtime=await setup()
  try {
    const reset=originalIvpResetpoints(runtime.course)[0]!,position=reset.matrix.slice(12,15)
    const sphere=runtime.world.sphere.bind(runtime.world),convex=runtime.world.convex.bind(runtime.world)
    let creations=0
    runtime.world.sphere=(...args)=>{creations++;return sphere(...args)}
    runtime.world.convex=(...args)=>{creations++;return convex(...args)}
    for(const kind of ['wood','stone','paper'] as const) {
      const old=runtime.player.body!
      runtime.input(new Set(['right']),0)
      runtime.reset(1,kind,position,[0,0,0,1],false,false)
      assert.equal(runtime.player.body,undefined)
      assert.equal(runtime.player.material,kind)
      assert.deepEqual(runtime.player.pose.position,position)
      assert.throws(()=>runtime.world.state(old),/state read failed/)
      assert.deepEqual(runtime.activeDriveKeys,[])
      assert.equal(creations,0,'positioning must not create a body only to destroy it')
      for(let frame=0;frame<180;frame++)runtime.step(1000/60)
      assert.deepEqual(runtime.player.pose.position,position,'formation has no gravity or contact response')
      runtime.material(kind)
      assert.equal(creations,1,'the physicalization event creates exactly one replacement')
      assert.deepEqual(runtime.world.state(runtime.player.body!).slice(7,13),[0,0,0,0,0,0])
      creations=0
    }
  } finally {runtime.dispose()}
})

test('all 63 authored resetpoints support every ball material without entering a death volume',{skip:!available},async()=> {
  let points=0
  for(let level=1;level<=12;level++) {
    const runtime=await setup(level)
    try {
      for(const [index,reset] of originalIvpResetpoints(runtime.course).entries()) {
        points++
        const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(reset.matrix)).normalize()
        for(const kind of ['wood','stone','paper'] as const) {
          runtime.reset(index+1,kind,reset.matrix.slice(12,15),rotation.toArray())
          const body=runtime.player.body!
          for(let frame=0;frame<180;frame++) {
            runtime.step(1000/60)
            assert.equal(runtime.deathTest.hit,undefined,`Level ${level}, sector ${index+1}, ${kind}: no death trigger during settling`)
          }
          assert.equal(runtime.player.body,body)
          assert.ok(runtime.grounded,`Level ${level}, sector ${index+1}, ${kind}: settled on authored support`)
        }
      }
    } finally {runtime.dispose()}
  }
  assert.equal(points,63)
})

test('all twelve native endings have the original frozen assembly and reset removes its controllers',{skip:!available},async()=> {
  for(let level=1;level<=12;level++) {
    const runtime=await setup(level)
    try {
      assert.equal(runtime.finish,undefined,'ending activates as the final checkpoint, not at course start')
      runtime.activate(originalIvpResetpoints(runtime.course).length)
      const finish=runtime.finish!
      assert.equal(finish.parts.size,18)
      assert.equal(finish.joints.size,19)
      assert.equal(finish.stage,'dormant')
      assert.equal(finish.forces.length,0)
      const origin=finish.position.clone(),old=[...finish.parts.values()]
      for(let i=0;i<12;i++){finish.step(origin.clone().add(new THREE.Vector3(10,0,0)));runtime.world.step()}
      assert.equal(finish.stage,'ready')
      assert.equal(finish.forces.length,8)
      for(const body of finish.parts.values())assert.ok(runtime.world.state(body).every(Number.isFinite))
      for(let i=0;i<12;i++){finish.step(finish.position);runtime.world.step()}
      assert.equal(finish.stage,'departing')
      assert.equal(finish.joints.size,18,'only the platform/first-plate hinge releases')
      assert.equal(finish.forces.length,9)
      const oldForces=[...finish.forces]
      finish.reset()
      assert.equal(finish.stage,'dormant');assert.equal(finish.forces.length,0)
      assert.ok(finish.position.distanceTo(origin)<1e-8)
      for(const body of old)assert.throws(()=>runtime.world.state(body),/state read failed/)
      for(const force of oldForces)assert.throws(()=>runtime.world.removeForce(force),/force removal failed/)
      const resetBodies=[...finish.parts.values()]
      runtime.activate(1)
      assert.equal(runtime.finish,undefined)
      for(const body of resetBodies)assert.throws(()=>runtime.world.state(body),/state read failed/)
    } finally {runtime.dispose()}
  }
})

test('wood rolls over the Level 1 ending bridge, boards, and rides the departing balloon',{skip:!available},async()=> {
  const runtime=await setup()
  try {
    const parent=runtime.course.objects.find(o=>o.name.startsWith('PE_Balloon_'))!
    const frame=new THREE.Matrix4().fromArray(parent.matrix)
    const start=new THREE.Vector3(24,3.1,0).applyMatrix4(frame)
    const direction=new THREE.Vector3(-1,0,0).transformDirection(frame)
    runtime.reset(originalIvpResetpoints(runtime.course).length,'wood',start.toArray())
    const finish=runtime.finish!,origin=finish.position.clone()
    runtime.input(new Set(['backward']),Math.atan2(direction.x,-direction.z))
    let boardedAt=-1,groundedTicks=0,boardingHeight=0
    for(let i=0;i<1320;i++) {
      runtime.step()
      if(finish.stage==='departing'&&boardedAt<0) {boardedAt=i;boardingHeight=finish.position.y;runtime.input(new Set(),0)}
      if(boardedAt>=0&&runtime.grounded)groundedTicks++
    }
    assert.ok(boardedAt>0&&boardedAt<528,`boarding tick ${boardedAt}`)
    assert.ok(groundedTicks>650,`player remains on the departing platform: ${groundedTicks}`)
    assert.ok(finish.position.distanceTo(origin)>15,'departure force carries the assembly away')
    assert.ok(finish.position.y>boardingHeight+2,'spring/balloon assembly rises after bridge release')
    assert.ok(new THREE.Vector3(...runtime.player.pose.position as [number,number,number]).distanceTo(finish.position)<2)
  } finally {runtime.dispose()}
})

test('stone boards Levels 5 through 7 endings with a supported run-up and sufficient bridge traversal time',{skip:!available},async()=> {
  for(const fps of [60,120])for(const level of [5,6,7]) {
    const runtime=await setup(level)
    try {
      const parent=runtime.course.objects.find(o=>o.name.startsWith('PE_Balloon_'))!
      const start=new THREE.Vector3(24,3.1,0).applyMatrix4(new THREE.Matrix4().fromArray(parent.matrix))
      runtime.reset(originalIvpResetpoints(runtime.course).length,'stone',start.toArray())
      const body=runtime.player.body!,finish=runtime.finish!
      let boarded=-1,touched=false,approach=false
      for(let frame=0;frame<20*fps;frame++) {
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number]),v=runtime.world.state(body).slice(7,10),error=finish.position.sub(p)
        const keys=new Set<'left'|'right'|'forward'|'backward'>()
        if(boarded<0) {
          const x=error.x*1.2-v[0]!*.9,z=error.z*1.2-v[2]!*.9
          if(Math.abs(x)>.25)keys.add(x>0?'right':'left')
          if(Math.abs(z)>.25)keys.add(z>0?'forward':'backward')
        }
        runtime.input(keys,0);runtime.step(1000/fps)
        const contacts=runtime.world.contacts(body)
        approach ||= contacts.some(c=>c.normal[1]>.3&&runtime.floorObjects.has(c.other))
        touched ||= contacts.some(c=>[...finish.parts.values()].includes(c.other))
        if(finish.stage==='departing'&&boarded<0)boarded=frame
      }
      assert.equal(runtime.player.body,body,'one continuous physical player, no intermediate restaging')
      assert.ok(approach&&touched,`Level ${level}: real approach floor and bridge contacts`)
      assert.ok(boarded>0&&boarded<20*fps,`Level ${level}: boarding frame ${boarded}`)
      assert.ok(runtime.grounded)
      assert.ok(new THREE.Vector3(...runtime.player.pose.position as [number,number,number]).distanceTo(finish.position)<2)
    } finally {runtime.dispose()}
  }
})

test('native Level 1 passage stays blocked when closed and opens through two wooden-ball pushes per gate',{skip:!available},async()=> {
  for(const open of [false,true]) {
    const runtime=await setup()
    try {
      runtime.activate(3)
      const module=read('p_modul_01'),object=module.objects.find(o=>o.name==='P_Modul_01_Pusher')!
      const gates=runtime.course.objects.filter(o=>o.name.startsWith('P_Modul_01_')).map(parent=> {
        const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
        const axis=new THREE.Vector3(1,0,0).transformDirection(frame)
        return {name:parent.name,axis,origin:new THREE.Vector3().setFromMatrixPosition(frame),target:new THREE.Vector3(-7.758,1.09,0).applyMatrix4(frame),passage:new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix)).addScaledVector(axis,2)}
      })
      // Only fixture placement uses triangle intersection. All motion/collision
      // after placement comes from the actual native course and player drive.
      const triangles=originalIvpFloors(runtime.course).flatMap(floor=> {
        const frame=new THREE.Matrix4().compose(new THREE.Vector3(...floor.descriptor.position as [number,number,number]),new THREE.Quaternion(...floor.descriptor.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1))
        const faces:THREE.Vector3[][]=[]
        for(let i=0;i<floor.triangles.length;i+=9)faces.push([0,3,6].map(j=>new THREE.Vector3().fromArray(floor.triangles,i+j).applyMatrix4(frame)))
        return faces
      })
      const place=(point:THREE.Vector3,height:number)=> {
        const ray=new THREE.Ray(point.clone().add(new THREE.Vector3(0,height,0)),new THREE.Vector3(0,-1,0))
        const hits=triangles.map(t=>ray.intersectTriangle(t[0]!,t[1]!,t[2]!,false,new THREE.Vector3())).filter((p):p is THREE.Vector3=>p!==null&&p.distanceTo(ray.origin)<40).sort((a,b)=>b.y-a.y)
        assert.ok(hits[0],'staged approach must have an authored floor')
        const position=point.clone();position.y=hits[0].y+2.04
        runtime.capture();runtime.player.moveCaptured({position:position.toArray(),rotation:[0,0,0,1]});runtime.material('wood')
      }
      const travel=(gate:typeof gates[number])=>new THREE.Vector3().fromArray(runtime.world.state(runtime.parts.find(p=>p.name===gate.name+'/P_Modul_01_Pusher')!.body)).sub(gate.origin).dot(gate.axis)
      const drive=(direction:THREE.Vector3)=>runtime.input(new Set(['backward']),Math.atan2(direction.x,-direction.z))
      if(open)for(const gate of gates) {
        for(let push=0;push<2;push++) {
          place(gate.target.clone().addScaledVector(gate.axis,travel(gate)-10),6)
          drive(gate.axis);for(let tick=0;tick<396;tick++)runtime.step()
          runtime.input(new Set(),0)
        }
        assert.ok(travel(gate)>4.8&&travel(gate)<5.2,`${gate.name} reaches its physical channel stop: ${travel(gate)}`)
      }
      const first=gates[0]!,last=gates[1]!,across=new THREE.Vector3(first.axis.z,0,-first.axis.x)
      place(first.passage.clone().addScaledVector(across,-8),12);drive(across)
      let crossed=false
      for(let tick=0;tick<396;tick++) {
        runtime.step()
        const position=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        if(position.clone().sub(last.passage).dot(across)>4&&position.y>first.passage.y-4) {crossed=true;break}
      }
      assert.equal(crossed,open,'the route opens only after physical gate displacement')
      if(open)assert.ok(runtime.grounded,'ball remains on the exit path')
    } finally {runtime.dispose()}
  }
})

test('native paper ball flies from the Level 2 starting fan into the raised fan airflow',{skip:!available},async()=> {
  for(const hz of [60,132]) {
  const runtime=await setup(2)
  try {
    const parents=runtime.course.objects.filter(o=>o.name.startsWith('P_Modul_18_'))
    const first=runtime.fans[parents.findIndex(o=>o.name==='P_Modul_18_01')]!,upper=runtime.fans[parents.findIndex(o=>o.name==='P_Modul_18_12')]!
    runtime.reset(first.sector,'paper',first.origin.clone().add(new THREE.Vector3(0,2.2,0)).toArray())
    let enteredUpper=false,depart=false
    for(let tick=0;tick<8*hz;tick++) {
      // Begin the transfer on the rising part of the hover cycle, once the
      // paper ball clears the upper grille. A fixed one-second wait can catch
      // its descending phase after the original clock smoothing is applied.
      depart ||= runtime.player.pose.position[1]!>upper.origin.y+2
      if(depart) {
        const p=runtime.player.pose.position,v=runtime.world.state(runtime.player.body!).slice(7,10)
        const x=(upper.origin.x-p[0]!)*2-v[0]!*.4,z=(upper.origin.z-p[2]!)*2-v[2]!*.4
        const keys=new Set<'left'|'right'|'forward'|'backward'>()
        // A fixture driver presses/releases the same discrete keys as the
        // player. It never teleports the ball or applies extra flight forces.
        if(Math.abs(x)>.3)keys.add(x>0?'right':'left')
        if(Math.abs(z)>.3)keys.add(z>0?'forward':'backward')
        runtime.input(keys,0)
      }
      runtime.step(1000/hz);enteredUpper ||= upper.active
    }
    const p=runtime.player.pose.position
    assert.ok(enteredUpper,'the actual upper fan controller must engage')
    assert.ok(Math.hypot(p[0]!-upper.origin.x,p[2]!-upper.origin.z)<1.2,`missed the upper fan: ${p}`)
    assert.ok(p[1]!>upper.origin.y+14&&p[1]!<upper.origin.y+24,`upper fan hover height: ${p[1]!-upper.origin.y}`)
    assert.equal(first.active,false,'the first fan releases its player controller after departure')
  } finally {runtime.dispose()}
  }
})

test('native Level 7 lift can be boarded, unloaded by the wooden ball, and ridden to its upper exit',{skip:!available},async()=> {
  // Negative control takes the same entrance but leaves six wall weights aboard.
  // No obstacle is moved, disabled, or removed by this fixture in either run.
  for(const clearWalls of [false,true]) {
    const runtime=await setup(7)
    try {
      const parent=runtime.course.objects.find(o=>o.name==='P_Modul_03_01')!
      const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
      runtime.activate(sector)
      const part=(suffix:string)=>runtime.parts.find(p=>p.name===parent.name+'/P_Modul_03_'+suffix)
      const origin=new THREE.Vector3().fromArray(runtime.world.state(part('Floor')!.body))
      const inward=origin.clone().sub(new THREE.Vector3().fromArray(runtime.world.state(part('Gate')!.body)))
      inward.y=0;inward.normalize()
      // The entrance is paired rails, so a vertical center ray would miss them.
      // Drop the ball onto the actual rails and require native contact support.
      const start=origin.clone().addScaledVector(inward,-12).add(new THREE.Vector3(0,3,0))
      runtime.reset(sector,'wood',start.toArray())
      for(let tick=0;tick<66;tick++)runtime.step()
      assert.ok(runtime.grounded,'staged entrance settles on the original rails')
      const platform=part('Floor')!.body
      const drive=(x:number,z:number)=> {
        const keys=new Set<'left'|'right'|'forward'|'backward'>()
        if(Math.abs(x)>.2)keys.add(x>0?'right':'left')
        if(Math.abs(z)>.2)keys.add(z>0?'forward':'backward')
        runtime.input(keys,0)
      }
      const center=()=> {
        const p=runtime.player.pose.position,v=runtime.world.state(runtime.player.body!).slice(7,10)
        drive((origin.x-p[0]!)*2-v[0]!*.9,(origin.z-p[2]!)*2-v[2]!*.9)
      }
      const onPlatform=()=>runtime.world.contacts(runtime.player.body!).some(c=>c.other===platform&&c.normal[1]>.3)
      let boarded=-1,contactedWall=false,loadedHeight=0
      for(let tick=0;tick<2640;tick++) {
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        if(boarded<0&&p.clone().sub(origin).dot(inward)>-2) {
          boarded=tick;loadedHeight=runtime.world.state(platform)[1]!
        }
        if(boarded<0||tick<boarded+66)drive(inward.x,inward.z)
        else center()
        runtime.step()
        for(const c of runtime.world.contacts(runtime.player.body!)) {
          if(runtime.parts.some(w=>w.body===c.other&&w.name.includes('Wall')))contactedWall=true
        }
      }
      assert.ok(boarded>=0,'wood passes through the open doorway')
      assert.ok(contactedWall,'native contact transfers force into a wall weight')
      assert.equal(part('Wall04'),undefined,'first pushed wall falls below the source cleanup limit')
      assert.ok(onPlatform(),'counter-steering leaves the ball supported by the lift')
      assert.ok(runtime.world.state(platform)[1]!>loadedHeight+1,'losing the first weight raises the loaded lift')
      if(clearWalls)for(const suffix of ['Wall03','Wall02','Wall01','Wall07','Wall06','Wall05']) {
        const wall=part(suffix)!,initialPosition=new THREE.Vector3().fromArray(runtime.world.state(wall.body))
        const direction=initialPosition.clone().sub(origin);direction.y=0;direction.normalize()
        const before=runtime.world.state(platform)[1]!
        let displaced=false
        for(let tick=0;tick<160;tick++) {
          drive(direction.x,direction.z);runtime.step()
          if(new THREE.Vector3().fromArray(runtime.world.state(wall.body)).sub(initialPosition).dot(direction)>1.5) {displaced=true;break}
        }
        assert.ok(displaced,`${suffix} moves through ordinary wooden-ball input`)
        for(let tick=0;tick<792;tick++){center();runtime.step()}
        assert.equal(part(suffix),undefined,`${suffix} physically falls off and is cleaned up`)
        assert.ok(onPlatform(),`player stays aboard after pushing ${suffix}`)
        assert.ok(runtime.world.state(platform)[1]!>before+2,`${suffix} unloading raises the spring platform`)
      }
      // The doorway weight stays aboard; seven fallen walls are sufficient.
      assert.ok(part('Gate'),'the gate was not removed to fake an unloaded lift')
      let crossed=false
      for(let tick=0;tick<396;tick++) {
        drive(inward.x,inward.z);runtime.step()
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        if(p.clone().sub(origin).dot(inward)>20&&p.y>origin.y+17&&runtime.grounded&&!onPlatform()) {crossed=true;break}
      }
      assert.equal(crossed,clearWalls,'the upper route is reachable only after unloading the lift')
      if(clearWalls) {
        const expired=runtime.parts.map(p=>p.body)
        runtime.reset(sector,'wood',start.toArray())
        for(const handle of expired)assert.throws(()=>runtime.world.state(handle),/state read failed/)
        assert.equal(runtime.parts.filter(p=>p.name.startsWith(parent.name+'/')).length,9,'reset restores every lift piece')
        assert.ok(new THREE.Vector3().fromArray(runtime.world.state(part('Floor')!.body)).distanceTo(origin)<1e-7)
      }
    } finally {runtime.dispose()}
  }
})

// Route fixtures issue the same independent directional keys as the game. They
// inspect poses to decide when to brake; they never prescribe physics poses after
// the single entrance placement or modify an obstacle's force/velocity/collider.
function routeDrive(runtime:OriginalIvpRuntime,x:number,z:number) {
  const keys=new Set<'left'|'right'|'forward'|'backward'>()
  if(Math.abs(x)>.2)keys.add(x>0?'right':'left')
  if(Math.abs(z)>.2)keys.add(z>0?'forward':'backward')
  runtime.input(keys,0)
}
function routeBrake(runtime:OriginalIvpRuntime,target:THREE.Vector3) {
  const p=runtime.player.pose.position,v=runtime.world.state(runtime.player.body!).slice(7,10)
  // Release the keys once the landing is centered and slow; continuing to
  // alternate discrete force controllers at 60 Hz needlessly rocks the ball.
  if(Math.hypot(target.x-p[0]!,target.z-p[2]!)<.35&&Math.hypot(v[0]!,v[2]!)<.5){routeDrive(runtime,0,0);return}
  routeDrive(runtime,(target.x-p[0]!)*2-v[0]!*.8,(target.z-p[2]!)*2-v[2]!*.8)
}
function swingRoute(runtime:OriginalIvpRuntime,name:string,reverse=false) {
  const parent=runtime.course.objects.find(o=>o.name===name)!,module=read('p_modul_08')
  const frame=(target:string)=>new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(module.objects.find(o=>o.name===target)!.matrix))
  const origin=new THREE.Vector3().setFromMatrixPosition(frame('P_Modul_08_Schaukel'))
  const axis=new THREE.Vector3(0,0,reverse?-1:1).transformDirection(frame('P_Modul_08_Fix'));axis.y=0;axis.normalize()
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  return {name,sector,origin,axis,body:()=>runtime.parts.find(p=>p.name===name+'/P_Modul_08_Schaukel')!.body}
}
function stageSwingRoute(runtime:OriginalIvpRuntime,route:ReturnType<typeof swingRoute>,phase:number,distance:number,material:'wood'|'paper') {
  runtime.activate(route.sector);runtime.capture()
  const start=route.origin.clone().addScaledVector(route.axis,-distance)
  const ray=new THREE.Ray(start.clone().add(new THREE.Vector3(0,8,0)),new THREE.Vector3(0,-1,0))
  let highest=-Infinity
  for(const floor of originalIvpFloors(runtime.course).filter(f=>f.group==='Floor')) {
    const frame=new THREE.Matrix4().compose(new THREE.Vector3(...floor.descriptor.position as [number,number,number]),new THREE.Quaternion(...floor.descriptor.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1))
    for(let i=0;i<floor.triangles.length;i+=9) {
      const points=[0,3,6].map(j=>new THREE.Vector3().fromArray(floor.triangles,i+j).applyMatrix4(frame))
      const hit=ray.intersectTriangle(points[0]!,points[1]!,points[2]!,false,new THREE.Vector3())
      if(hit)highest=Math.max(highest,hit.y)
    }
  }
  // Rail entrances need a sphere's lateral support, which a center ray misses.
  // Drop above those rails, then require real native support before driving.
  start.y=Number.isFinite(highest)?highest+2.04:route.origin.y+4
  for(let tick=0;tick<Math.round(phase*60);tick++)runtime.step(1000/60)
  runtime.player.moveCaptured({position:start.toArray(),rotation:[0,0,0,1]});runtime.material(material)
  for(let tick=0;tick<15;tick++)runtime.step(1000/60)
  assert.ok(runtime.grounded,`${route.name}: native support at the staged entrance`)
}
function onAuthoredFloor(runtime:OriginalIvpRuntime) {
  const moving=new Set(runtime.parts.map(p=>p.body))
  for(const body of runtime.finish?.parts.values()??[])moving.add(body)
  return runtime.world.contacts(runtime.player.body!).some(c=>c.normal[1]>.3&&!moving.has(c.other)&&runtime.soundIds.has(c.other))
}

test('native moving platforms in Levels 8–10 support forward crossings and reject mistimed departures',{skip:!available},async()=> {
  // Forward direction follows the actual course: south in Level 8, east on
  // Level 9 and Level 10's first crossing, west on Level 10's second crossing.
  const cases=[
    {level:8,name:'P_Modul_08_01',reverse:true,distance:8,phase:.2,miss:1},
    {level:9,name:'P_Modul_08_01',reverse:false,distance:8,phase:3.5,miss:0},
    {level:10,name:'P_Modul_08_01',reverse:false,distance:12,phase:1,miss:0},
    {level:10,name:'P_Modul_08_02',reverse:false,distance:12,phase:1,miss:0},
  ]
  for(const fixture of cases)for(const timed of [false,true]) {
    const runtime=await setup(fixture.level)
    try {
      const route=swingRoute(runtime,fixture.name,fixture.reverse)
      stageSwingRoute(runtime,route,timed?fixture.phase:fixture.miss,fixture.distance,'wood')
      const target=route.origin.clone().addScaledVector(route.axis,12)
      let touched=false,crossed=false
      for(let tick=0;tick<600;tick++) {
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        if(!crossed)routeDrive(runtime,route.axis.x,route.axis.z)
        else routeBrake(runtime,target)
        runtime.step(1000/60)
        if(runtime.world.contacts(runtime.player.body!).some(c=>c.other===route.body()))touched=true
        if(p.clone().sub(route.origin).dot(route.axis)>8&&p.y>route.origin.y)crossed=true
        if(p.y<route.origin.y-50)break
      }
      assert.equal(crossed,timed,`${fixture.level}/${fixture.name}: boarding phase changes the route outcome`)
      if(timed) {
        assert.ok(touched,'crossing must actually contact the moving deck')
        assert.ok(onAuthoredFloor(runtime),'player lands on the original exit floor, not on a prop or deck')
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.5,'counter-steering stops at the exit')
        // The second Level 10 exit rests on sloped rail faces. It needs active
        // balance, not an artificially sleeping ball. Bound residual speed by
        // one frame of the real discrete wooden-ball drive at this frame rate.
        const oneFrameDrive=PLAYER_PHYSICS.wood.driveImpulse/PLAYER_PHYSICS.wood.mass*Math.ceil(ORIGINAL_PSI_HZ*ORIGINAL_TIME_FACTOR/60)
        assert.ok(Math.hypot(...runtime.world.state(runtime.player.body!).slice(7,10))<oneFrameDrive,'landing stays within one frame of drive response')
      }
    } finally {runtime.dispose()}
  }
})

test('native Level 11 paper crosses both rising platforms using the intervening fan without restaging',{skip:!available},async()=> {
  for(const material of ['wood','paper'] as const) {
    const runtime=await setup(11)
    try {
      const lower=swingRoute(runtime,'P_Modul_08_01'),upper=swingRoute(runtime,'P_Modul_08_02',true)
      stageSwingRoute(runtime,lower,1,12,material)
      const fanFrame=runtime.course.objects.find(o=>o.name==='P_Modul_18_09')!.matrix
      const middle=new THREE.Vector3().fromArray(fanFrame,12)
      const fan=runtime.fans.find(f=>f.origin.distanceTo(middle)<.001)!
      assert.ok(fan,'the middle landing contains the original fan')
      let touchedLower=false,crossedLower=false,airflow=false
      for(let tick=0;tick<600;tick++) {
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        if(!crossedLower)routeDrive(runtime,lower.axis.x,lower.axis.z)
        else routeBrake(runtime,middle)
        runtime.step(1000/60)
        airflow ||= fan.active
        touchedLower ||= runtime.world.contacts(runtime.player.body!).some(c=>c.other===lower.body())
        if(p.clone().sub(lower.origin).dot(lower.axis)>8&&p.y>lower.origin.y)crossedLower=true
        if(p.y<lower.origin.y-50)break
      }
      if(material==='paper') {
        assert.ok(touchedLower&&crossedLower,'paper crosses the lower swinging deck')
        assert.ok(airflow,'paper enters the real middle fan controller')
        assert.ok(runtime.player.pose.position[1]!>middle.y+15,'fan raises paper toward the upper crossing')
      } else assert.equal(airflow,false,'wood cannot use the paper-only lift controller')
      const target=upper.origin.clone().addScaledVector(upper.axis,12)
      let touchedUpper=false,crossedUpper=false
      for(let tick=0;tick<600;tick++) {
        const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
        if(!crossedUpper)routeDrive(runtime,upper.axis.x,upper.axis.z)
        else routeBrake(runtime,target)
        runtime.step(1000/60)
        touchedUpper ||= runtime.world.contacts(runtime.player.body!).some(c=>c.other===upper.body())
        if(p.clone().sub(upper.origin).dot(upper.axis)>8&&p.y>upper.origin.y)crossedUpper=true
        if(p.y<upper.origin.y-50)break
      }
      assert.equal(crossedUpper,material==='paper','the same route driver only completes the air-assisted sequence with paper')
      if(material==='paper') {
        assert.ok(touchedUpper,'paper lands on the upper moving deck before its exit')
        assert.ok(onAuthoredFloor(runtime),'paper finishes on the static upper path')
        assert.ok(Math.hypot(runtime.player.pose.position[0]!-target.x,runtime.player.pose.position[2]!-target.z)<.5)
        assert.ok(Math.hypot(...runtime.world.state(runtime.player.body!).slice(7,10))<.15)
      }
    } finally {runtime.dispose()}
  }
})

test('native camera-relative input keeps held force directions until release, including a turn completion',{skip:!available},async()=> {
  const runtime=await setup()
  try {
    // Stage in free air so floors cannot mask a direction error.
    runtime.reset(1,'wood',[0,1000,0])
    const frame=new THREE.Matrix4(),rotated=new THREE.Matrix4().makeRotationY(Math.PI/2)
    runtime.input(new Set(['forward']),frame.elements)
    for(let i=0;i<30;i++)runtime.step(1000/60)
    let velocity=runtime.world.state(runtime.player.body!).slice(7,10)
    assert.ok(velocity[2]!>2);assert.ok(Math.abs(velocity[0]!)<1e-6)
    runtime.input(new Set(['forward']),rotated.elements)
    for(let i=0;i<30;i++)runtime.step(1000/60)
    velocity=runtime.world.state(runtime.player.body!).slice(7,10)
    assert.ok(velocity[2]!>4,'existing key controller still pushes along its captured axis')
    assert.ok(Math.abs(velocity[0]!)<1e-6,'turning the camera cannot retarget an existing force')
    runtime.input(new Set(),rotated.elements)
    runtime.input(new Set(['forward']),rotated.elements)
    for(let i=0;i<30;i++)runtime.step(1000/60)
    velocity=runtime.world.state(runtime.player.body!).slice(7,10)
    assert.ok(velocity[0]!>2,'new press uses the committed reference')
    assert.ok(velocity[2]!>1,'old physical momentum survives releasing its drive force')
  } finally {runtime.dispose()}
})

test('native respawn passes each authored checkpoint orientation into the convex paper body',{skip:!available},async()=> {
  const runtime=await setup()
  try {
    let count=0
    for(let level=1;level<=12;level++)for(const reset of originalIvpResetpoints(read(`level_${String(level).padStart(2,'0')}`))) {
      const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(reset.matrix)).normalize()
      const old=runtime.player.body!
      runtime.reset(1,'paper',reset.matrix.slice(12,15),rotation.toArray())
      assert.throws(()=>runtime.world.state(old),/state read failed/)
      assert.ok(new THREE.Quaternion().fromArray(runtime.player.pose.rotation).angleTo(rotation)<1e-6)
      assert.ok(new THREE.Vector3().fromArray(runtime.player.pose.position).distanceTo(new THREE.Vector3().fromArray(reset.matrix,12))<1e-8)
      assert.deepEqual(runtime.world.state(runtime.player.body!).slice(7,13),[0,0,0,0,0,0])
      count++
    }
    assert.equal(count,63)
  } finally {runtime.dispose()}
})

test('all six native arm passages distinguish materials and follow their authored exits',{skip:!available},async()=> {
let checked=0
const reference=read('level_09').objects.find(o=>o.name==='P_Modul_17_01')!,mod=read('p_modul_17'),refFrame=new THREE.Matrix4().fromArray(reference.matrix).multiply(new THREE.Matrix4().fromArray(mod.objects.find(o=>o.name==='Modul17_Dreharme')!.matrix)),inverseRotation=new THREE.Quaternion().setFromRotationMatrix(refFrame).invert()

for(const level of [3,7,9])for(const instance of read(`level_${String(level).padStart(2,'0')}`).objects.filter(o=>o.name.startsWith('P_Modul_17_')))for(const material of ['wood','stone','paper'] as const){
 const lever=level===3?10:level===7?12:-10
 const approach=new THREE.Vector3(lever,40,level===7?5:6).applyQuaternion(inverseRotation),exit=new THREE.Vector3(lever,40,level===7?-4:-8).applyQuaternion(inverseRotation)
 const runtime=await setup(level)
 try {
  const parent=instance,module=read('p_modul_17')
  const frame=new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(module.objects.find(o=>o.name==='Modul17_Dreharme')!.matrix))
  const origin=new THREE.Vector3().setFromMatrixPosition(frame),rotation=new THREE.Quaternion().setFromRotationMatrix(frame),start=approach.clone().applyQuaternion(rotation).add(origin),target=exit.clone().applyQuaternion(rotation).add(origin),axis=target.clone().sub(start).normalize()
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  const ray=new THREE.Ray(start,new THREE.Vector3(0,-1,0));let highest=-Infinity
  for(const floor of originalIvpFloors(runtime.course)){
   const f=new THREE.Matrix4().compose(new THREE.Vector3(...floor.descriptor.position as [number,number,number]),new THREE.Quaternion(...floor.descriptor.rotation as [number,number,number,number]),new THREE.Vector3(1,1,1))
   for(let i=0;i<floor.triangles.length;i+=9){const p=[0,3,6].map(j=>new THREE.Vector3().fromArray(floor.triangles,i+j).applyMatrix4(f));const hit=ray.intersectTriangle(p[0]!,p[1]!,p[2]!,false,new THREE.Vector3());if(hit)highest=Math.max(highest,hit.y)}
  }
  start.y=Number.isFinite(highest)?highest+2.04:origin.y+2.04
  runtime.reset(sector,material,start.toArray())
  const arm=runtime.parts.find(p=>p.name===parent.name+'/Modul17_Dreharme')!,q0=new THREE.Quaternion().fromArray(runtime.world.state(arm.body),3)
  runtime.input(new Set(),0)
  for(let tick=0;tick<120&&(tick<16||!runtime.grounded);tick++)runtime.step(1000/60)
  const entrance=runtime.grounded
  let touched=false,peak=0,passed=false
  for(let tick=0;tick<720;tick++){
   const p=runtime.player.pose.position,v=runtime.world.state(runtime.player.body!).slice(7,10),keys=new Set<'left'|'right'|'forward'|'backward'>()
   {const x=(target.x-p[0]!)*2-v[0]!*.9,z=(target.z-p[2]!)*2-v[2]!*.9;if(Math.abs(x)>.2)keys.add(x>0?'right':'left');if(Math.abs(z)>.2)keys.add(z>0?'forward':'backward')}
   runtime.input(keys,0);runtime.step(1000/60)
   if(runtime.world.contacts(runtime.player.body!).some(c=>c.other===arm.body))touched=true
   peak=Math.max(peak,new THREE.Quaternion().fromArray(runtime.world.state(arm.body),3).angleTo(q0))
   if(new THREE.Vector3(...p as [number,number,number]).sub(origin).dot(axis)>(level===7?3:6)&&runtime.grounded)passed=true
  }
  const context=`Level ${level}/${instance.name}/${material}`
  assert.ok(entrance,context+': approach must have native support')
  assert.equal(runtime.deathTest.hit,undefined,context+': passage must not intersect a death volume')
  assert.ok(touched,context+': must contact the actual rotating arm')
  assert.ok(peak>.03,context+': contact must deflect the arm')
  assert.ok(onAuthoredFloor(runtime),context+': ends on the static course')
  assert.equal(passed,material!=='paper',context+': material-dependent passage')
  if(material!=='paper') {
    const position=new THREE.Vector3().fromArray(runtime.player.pose.position);position.y=target.y
    assert.ok(position.distanceTo(target)<.3,context+': reaches the actual exit')
    assert.ok(new THREE.Vector3().fromArray(runtime.world.state(runtime.player.body!),7).length()<.3,context+': stops on the exit')
    // Level 7 turns along the platform before joining the narrow outgoing path.
    // The ball remains physical throughout; no reset or staging between waypoints.
    if(level===7)for(const [x,z] of [[19,-4],[19,-20]]) {
      target.copy(new THREE.Vector3(x!,40,z!).applyQuaternion(inverseRotation).applyQuaternion(rotation).add(origin))
      for(let tick=0;tick<600;tick++) {
        const p=runtime.player.pose.position,v=runtime.world.state(runtime.player.body!).slice(7,10),keys=new Set<'left'|'right'|'forward'|'backward'>()
        const dx=(target.x-p[0]!)*2-v[0]!*.9,dz=(target.z-p[2]!)*2-v[2]!*.9
        if(Math.abs(dx)>.2)keys.add(dx>0?'right':'left')
        if(Math.abs(dz)>.2)keys.add(dz>0?'forward':'backward')
        runtime.input(keys,0);runtime.step(1000/60)
        const settled=runtime.player.pose.position,velocity=runtime.world.state(runtime.player.body!).slice(7,10)
        if(Math.hypot(target.x-settled[0]!,target.z-settled[2]!)<.2&&Math.hypot(...velocity)<.1)break
      }
      runtime.input(new Set(),0)
      for(let tick=0;tick<120;tick++)runtime.step(1000/60)
      assert.equal(runtime.deathTest.hit,undefined,context+': turn must not intersect a death volume')
      assert.ok(onAuthoredFloor(runtime),context+': retains support after the turn')
      const position=new THREE.Vector3().fromArray(runtime.player.pose.position);position.y=target.y
      assert.ok(position.distanceTo(target)<.3,context+': reaches the outgoing path '+position.distanceTo(target))
      assert.ok(new THREE.Vector3().fromArray(runtime.world.state(runtime.player.body!),7).length()<.3,context+': stops on the outgoing path '+new THREE.Vector3().fromArray(runtime.world.state(runtime.player.body!),7).length())
    }
  }
  checked++

 }finally{runtime.dispose()}
}

assert.equal(checked,18,'six placed arms, each with all three materials')
})

test('native falls enter authored death boxes before the former checkpoint cutoff and reset safely',{skip:!available},async()=> {
  const runtime=await setup(1)
  try {
    const volume=runtime.deathTest.volumes[0]!,reset=originalIvpResetpoints(runtime.course)[0]!
    const axes=volume.box.rotation.elements,half=volume.box.halfSize
    const top=volume.box.center.y+Math.abs(axes[1]!)*half.x+Math.abs(axes[4]!)*half.y+Math.abs(axes[7]!)*half.z
    for(const material of ['wood','stone','paper'] as const) {
      runtime.reset(1,material,[volume.box.center.x,top+8,volume.box.center.z])
      assert.equal(runtime.deathTest.hit,undefined)
      for(let frame=0;frame<180&&!runtime.deathTest.hit;frame++)runtime.step(1000/60)
      assert.equal(runtime.deathTest.hit,volume.name,`${material}: natural falling contact with the original volume`)
      assert.ok(runtime.player.pose.position[1]!>reset.matrix[13]!-88,'the old checkpoint-minus-22-web-units test would still be alive here')
      runtime.reset(1,material,reset.matrix.slice(12,15))
      for(let frame=0;frame<120;frame++)runtime.step(1000/60)
      assert.equal(runtime.deathTest.hit,undefined,`${material}: respawn clears and rearms the volume poller`)
      assert.ok(runtime.grounded)
    }
  } finally {runtime.dispose()}
})

test('material reuse fades native paper debris before the next explosion while retaining its new lifetime clock',{skip:!available},async()=>{
  const runtime=await setup(),document=read('balls'),material=new THREE.MeshPhongMaterial()
  const debris=new OriginalDebris(document,new Map(document.materials.map(m=>[m.id,material])))
  try {
    debris.requestTransformation('paper')
    for(let i=0;i<150;i++)debris.stepIvp(1/60)
    debris.spawnIvp(runtime.world,'paper',new THREE.Vector3(13.5,8,38),()=>.5)
    const clock=debris.clocks.get('paper')!
    assert.ok(clock.elapsedMs>2400,'lifetime started before the explosion')
    assert.equal(debris.nativeFragments.filter(f=>f.wind!==undefined).length,18)
    const old=debris.nativeFragments.map(f=>f.body)
    debris.requestTransformation('paper');debris.stepIvp(1/60)
    assert.ok(debris.nativeFragments.every(f=>f.wind===undefined),'fade entry shuts down every paper wind controller')
    assert.equal(debris.nativeFragments.length,18,'fade does not remove physical bodies immediately')
    for(let i=0;i<130;i++){runtime.step();debris.stepIvp(1/60)}
    assert.equal(debris.nativeFragments.length,0)
    for(const body of old)assert.throws(()=>runtime.world.state(body),/state read failed/)
    assert.equal(clock.waiting,true)
    debris.spawnIvp(runtime.world,'paper',new THREE.Vector3(13.5,8,38),()=>.5)
    assert.equal(debris.nativeFragments.length,18)
    assert.ok(clock.elapsedMs>2000,'new explosion must not reset the material clock')
  } finally {debris.dispose();material.dispose();runtime.dispose()}
})

test('Level 2 chain route supports wood and paper but tears under a stone approach at 60 and 120 FPS',{skip:!available},async()=>{
  const runtime=await setup(2)
  try{
    const parent=runtime.course.objects.find(o=>o.name.startsWith('P_Modul_29_'))!
    const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
    const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
    for(const fps of [60,120])for(const material of ['wood','stone','paper'] as const){
      runtime.reset(sector,material,origin.clone().add(new THREE.Vector3(-12,3,.21)).toArray())
      let touched=false,supportedExit=false,supportedEntrance=false
      const sounds:string[]=[]
      for(let tick=0;tick<fps*4;tick++){
        runtime.input(new Set(tick<fps?[]:['right']),0)
        sounds.push(...runtime.step(1000/fps))
        const p=runtime.player.pose.position
        const contacts=runtime.world.contacts(runtime.player.body!)
        touched ||= contacts.some(c=>runtime.parts.some(part=>part.name.startsWith(parent.name+'/')&&part.body===c.other))
        if(tick<fps&&onAuthoredFloor(runtime))supportedEntrance=true
        if(p[0]!>origin.x+12&&p[1]!>origin.y&&onAuthoredFloor(runtime))supportedExit=true
      }
      const context=`${fps} FPS ${material}`
      assert.ok(supportedEntrance,context+': initial placement must settle on the real approach')
      assert.ok(touched,context+': player must contact a bridge plank')
      assert.equal(supportedExit,material!=='stone',context+': material changes the traversable route')
      assert.equal(sounds.filter(s=>s===chain.sound).length,material==='stone'?1:0,context+': source release event')
      if(material==='stone')assert.ok(runtime.player.pose.position[1]!<origin.y-15,'stone falls after tearing the endpoint')
    }
  }finally{runtime.dispose()}
})

test('Level 4 chain crosses onto the short exit floor before its authored end wall',{skip:!available},async()=>{
 const runtime=await setup(4)
 try{
  const parent=runtime.course.objects.find(o=>o.name==='P_Modul_29_02')!,frame=new THREE.Matrix4().fromArray(parent.matrix),inverse=frame.clone().invert()
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  const axis=new THREE.Vector3().setFromMatrixColumn(frame,0)
  runtime.reset(sector,'wood',new THREE.Vector3(-8,3,.21).applyMatrix4(frame).toArray())
  let touched=false,landed=false,wall=false
  for(let tick=0;tick<180;tick++){
   if(tick<12)runtime.input(new Set(),0);else routeDrive(runtime,axis.x,axis.z)
   runtime.step(1000/60)
   const local=new THREE.Vector3(...runtime.player.pose.position as [number,number,number]).applyMatrix4(inverse)
   const contacts=runtime.world.contacts(runtime.player.body!)
   touched ||= contacts.some(c=>runtime.parts.some(p=>p.name.startsWith(parent.name+'/')&&p.body===c.other))
   landed ||= local.x>9&&onAuthoredFloor(runtime)
   wall ||= local.x>11&&contacts.some(c=>!runtime.parts.some(p=>p.body===c.other)&&new THREE.Vector3(...c.normal).dot(axis)<-.9)
  }
  assert.ok(touched);assert.ok(landed);assert.ok(wall)
  const local=new THREE.Vector3(...runtime.player.pose.position as [number,number,number]).applyMatrix4(inverse)
  assert.ok(local.x>11&&local.x<12,'real wall blocks the former probe target')
  assert.ok(onAuthoredFloor(runtime),'ball remains supported at the wall')
 }finally{runtime.dispose()}
})

test('tilted Level 10 chain requires lateral balance while crossing',{skip:!available},async()=>{
 const runtime=await setup(10)
 try{
  const parent=runtime.course.objects.find(o=>o.name==='P_Modul_29_01')!,frame=new THREE.Matrix4().fromArray(parent.matrix),inverse=frame.clone().invert()
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  const axis=new THREE.Vector3().setFromMatrixColumn(frame,0),side=new THREE.Vector3().setFromMatrixColumn(frame,2)
  for(const balance of [false,true]){
   runtime.reset(sector,'wood',new THREE.Vector3(-8,3,.21).applyMatrix4(frame).toArray())
   let touched=false,landed=false
   for(let tick=0;tick<120;tick++){
    const local=new THREE.Vector3(...runtime.player.pose.position as [number,number,number]).applyMatrix4(inverse)
    const velocity=new THREE.Vector3(...runtime.world.state(runtime.player.body!).slice(7,10) as [number,number,number]).dot(side)
    const correction=balance?(.21-local.z)*2-velocity*.5:0
    if(tick<12)runtime.input(new Set(),0)
    else routeDrive(runtime,axis.x+(Math.abs(correction)>.3?Math.sign(correction)*side.x:0),axis.z)
    runtime.step(1000/60)
    touched ||= runtime.world.contacts(runtime.player.body!).some(c=>runtime.parts.some(p=>p.name.startsWith(parent.name+'/')&&p.body===c.other))
    landed ||= local.x>12&&onAuthoredFloor(runtime)
   }
   assert.equal(landed,balance,'ordinary lateral key inputs prevent sliding off the banked bridge')
   if(balance){assert.ok(touched);assert.ok(onAuthoredFloor(runtime))}
  }
 }finally{runtime.dispose()}
})

test('all player materials pass the first Level 8 sack with its native oscillator active',{skip:!available},async()=>{
 const runtime=await setup(8)
 try{
  const parent=runtime.course.objects.find(o=>o.name==='P_Modul_26_01')!
  const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  for(const fps of [60,120])for(const material of ['paper','wood','stone'] as const){
   runtime.reset(sector,material,origin.clone().add(new THREE.Vector3(-8,4,0)).toArray())
   const sack=runtime.parts.find(p=>p.name===parent.name+'/P_Modul_26_Sack')!
   const rope=runtime.parts.find(p=>p.name===parent.name+'/P_Modul_26_Rope')!
   const initial=runtime.world.state(sack.body).slice(0,7)
   let touched=false,entrance=false,exit=false
   for(let tick=0;tick<fps*5;tick++){
    runtime.input(new Set(tick<fps?[]:['right']),0);runtime.step(1000/fps)
    const contacts=runtime.world.contacts(runtime.player.body!)
    touched ||= contacts.some(c=>c.other===sack.body)
    assert.ok(!contacts.some(c=>c.other===rope.body),'massive rope is collision-disabled in the source')
    entrance ||= tick<fps&&onAuthoredFloor(runtime)
    exit ||= runtime.player.pose.position[0]!>origin.x+8&&onAuthoredFloor(runtime)
   }
   const context=`${fps} FPS ${material}`
   assert.ok(entrance,context+': settle on the actual paired rails')
   assert.ok(touched,context+': contact the moving sack')
   assert.ok(exit,context+': reach supporting course floor past the sack')
   const old=sack.body
   runtime.reset(sector,material,origin.clone().add(new THREE.Vector3(-8,4,0)).toArray())
   assert.throws(()=>runtime.world.state(old),/state read failed/)
   const restored=runtime.parts.find(p=>p.name===sack.name)!
   assert.deepEqual(runtime.world.state(restored.body).slice(0,7),initial,'sector reset restores the authored sack pose')
  }
 }finally{runtime.dispose()}
})

test('Level 8 three-sack corridor supports wood and paper at both frame rates with timed departures',{skip:!available},async()=>{
 const runtime=await setup(8)
 try{
  const parent=runtime.course.objects.find(o=>o.name==='P_Modul_26_01')!
  const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  const target=new THREE.Vector3(622,0,origin.z)
  const last=runtime.course.objects.find(o=>o.name==='P_Modul_26_03')!
  const cases:[number,'wood'|'paper',number][]=[[60,'wood',1],[60,'paper',1],[120,'wood',1],[120,'paper',.5]]
  // Reproduce the unsuccessful one-second paper departure instead of the verified half-second phase.
  if(process.env.BALLANCE_SACK_PROBE_ALL==='1')cases[3]=[120,'paper',1]
  for(const [fps,material,departure] of cases){
   runtime.reset(sector,material,origin.clone().add(new THREE.Vector3(-8,4,0)).toArray())
   const touched=new Set<string>()
   let entrance=false,minimumY=Infinity
   for(let tick=0;tick<fps*10;tick++){
    if(tick<fps*departure)runtime.input(new Set(),0);else routeBrake(runtime,target)
    runtime.step(1000/fps)
    entrance ||= tick<fps*departure&&onAuthoredFloor(runtime)
    minimumY=Math.min(minimumY,runtime.player.pose.position[1]!)
    for(const contact of runtime.world.contacts(runtime.player.body!)){
     const part=runtime.parts.find(p=>p.body===contact.other&&p.name.endsWith('/P_Modul_26_Sack'))
     if(part)touched.add(part.name)
    }
   }
   const context=`${fps} FPS ${material}`,p=runtime.player.pose.position
   assert.ok(entrance,context+': actual entrance support')
   assert.ok(touched.has(parent.name+'/P_Modul_26_Sack')&&touched.size>=2,context+': passage interacts with multiple swinging sacks')
   assert.ok(p[0]!>last.matrix[12]!+10,context+': pass the final sack')
   assert.ok(onAuthoredFloor(runtime),context+': stop on authored exit floor '+JSON.stringify({p,v:runtime.world.state(runtime.player.body!).slice(7,10)}))
   assert.ok(Math.hypot(p[0]!-target.x,p[2]!-target.z)<1,context+': stop near the exit target')
   const brakingStep=PLAYER_PHYSICS[material].driveImpulse/PLAYER_PHYSICS[material].mass*Math.ceil(ORIGINAL_PSI_HZ*ORIGINAL_TIME_FACTOR/fps)
   assert.ok(Math.hypot(...runtime.world.state(runtime.player.body!).slice(7,10))<brakingStep,context+': residual speed stays below one frame of normal drive')
   assert.ok(minimumY>origin.y-6,context+': no fall and later re-entry')
  }
 }finally{runtime.dispose()}
})

test('stone direct approach stalls on the Level 8 uphill rails rather than an immovable sack',{skip:!available},async()=>{
 const runtime=await setup(8)
 try{
  const parent=runtime.course.objects.find(o=>o.name==='P_Modul_26_01')!
  const origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
  const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
  runtime.reset(sector,'stone',origin.clone().add(new THREE.Vector3(-8,4,0)).toArray())
  for(let tick=0;tick<600;tick++){
   if(tick<60)runtime.input(new Set(),0);else routeBrake(runtime,new THREE.Vector3(622,0,origin.z))
   runtime.step(1000/60)
  }
  const contacts=runtime.world.contacts(runtime.player.body!)
  assert.ok(onAuthoredFloor(runtime),'stalled stone is supported by the imported rails')
  assert.ok(contacts.every(c=>!runtime.parts.some(p=>p.body===c.other)),'no sack or other moving prop blocks the ball at the measured endpoint')
  const uphill=contacts.filter(c=>c.normal[1]>.3&&c.normal[0]<-.1)
  assert.ok(uphill.length>=2,'paired rail faces supply the supporting contacts')
  const driveAcceleration=PLAYER_PHYSICS.stone.driveImpulse*ORIGINAL_PSI_HZ/PLAYER_PHYSICS.stone.mass
  for(const contact of uphill){
   const grade=-contact.normal[0]/contact.normal[1]
   assert.ok(20*grade>driveAcceleration,'source gravity on this grade exceeds available horizontal drive')
  }
  assert.ok(runtime.player.pose.position[0]!<608,'this direct input sequence has not passed the last sack')
 }finally{runtime.dispose()}
})

test('lateral steering recovers the Level 9 and 10 sack passages onto their exit floors',{skip:!available},async()=>{
 for(const [level,name,sign] of [[9,'P_Modul_26_01',-1],[10,'P_Modul_26_02',1],[10,'P_Modul_26_02',-1]] as const){
  const runtime=await setup(level)
  try{
   const parent=runtime.course.objects.find(o=>o.name===name)!,frame=new THREE.Matrix4().fromArray(parent.matrix)
   const origin=new THREE.Vector3().setFromMatrixPosition(frame),axis=new THREE.Vector3().setFromMatrixColumn(frame,0).multiplyScalar(sign)
   const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
   runtime.reset(sector,'wood',new THREE.Vector3(-8*sign,4,0).applyMatrix4(frame).toArray())
   const sack=runtime.parts.find(p=>p.name===name+'/P_Modul_26_Sack')!,target=origin.clone().addScaledVector(axis,12)
   let touched=false,entrance=false
   for(let tick=0;tick<300;tick++){
    if(tick<60)runtime.input(new Set(),0);else routeBrake(runtime,target)
    runtime.step(1000/60)
    touched ||= runtime.world.contacts(runtime.player.body!).some(c=>c.other===sack.body)
    entrance ||= tick<60&&onAuthoredFloor(runtime)
   }
   const position=new THREE.Vector3(...runtime.player.pose.position as [number,number,number])
   assert.ok(entrance&&touched,`${level}/${name}: real approach and sack contact`)
   assert.ok(onAuthoredFloor(runtime),`${level}/${name}: supporting exit floor`)
   assert.ok(position.clone().sub(origin).dot(axis)>10,'ball is beyond the swinging sack')
   assert.ok(Math.hypot(position.x-target.x,position.z-target.z)<1,'braking stays near the exit target')
  }finally{runtime.dispose()}
 }
})

test('Level 9 turning and Level 11 diagonal sack paths retain floor support',{skip:!available},async()=>{
for(const [level,name,start,points] of [[9,'P_Modul_26_03',[0,4,-8],[[0,0,3],[10,0,5]]],[11,'P_Modul_26_03',[-8,4,2],[[0,0,0],[10,0,-4]]]] as const){
const runtime=await setup(level)
try{
 const parent=runtime.course.objects.find(o=>o.name===name)!,origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
 const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
 runtime.reset(sector,'wood',origin.clone().add(new THREE.Vector3(...start)).toArray())
 const sack=runtime.parts.find(p=>p.name===name+'/P_Modul_26_Sack')!;let stage=0,touched=false,entrance=false
 for(let tick=0;tick<600;tick++){
 const p=new THREE.Vector3(...runtime.player.pose.position as [number,number,number]),target=origin.clone().add(new THREE.Vector3(...points[stage]!))
 if(tick<60)runtime.input(new Set(),0);else routeBrake(runtime,target)
 runtime.step(1000/60)
 if(Math.hypot(p.x-target.x,p.z-target.z)<1&&stage<points.length-1)stage++
 touched ||= runtime.world.contacts(runtime.player.body!).some(c=>c.other===sack.body)
 entrance ||= tick<60&&onAuthoredFloor(runtime)
 }
 assert.equal(stage,1,'follow both authored route legs')
 assert.ok(touched&&entrance,'real approach support and sack contact')
 assert.ok(onAuthoredFloor(runtime),`${level}: supported destination`)
 const p=runtime.player.pose.position,target=origin.clone().add(new THREE.Vector3(...points[1]))
 assert.ok(Math.hypot(p[0]!-target.x,p[2]!-target.z)<1,'stop near the route destination')
}finally{runtime.dispose()}}

})

test('all four Level 12 sacks permit timed crossings onto the upper exit in both directions',{skip:!available},async()=>{
 for(const name of ['P_Modul_26_01','P_Modul_26_02','P_Modul_26_03','P_Modul_26_04'])for(const sign of [1,-1])for(const departure of [.5,1]){
  const runtime=await setup(12)
  try{
   const parent=runtime.course.objects.find(o=>o.name===name)!,origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
   const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
   runtime.reset(sector,'wood',origin.clone().add(new THREE.Vector3(0,4,-8*sign)).toArray())
   const sack=runtime.parts.find(p=>p.name===parent.name+'/P_Modul_26_Sack')!,target=origin.clone().add(new THREE.Vector3(0,0,8*sign))
   let touched=false,entrance=false,minimumY=Infinity
   for(let tick=0;tick<600;tick++){
    if(tick<departure*60)runtime.input(new Set(),0);else routeBrake(runtime,target)
    runtime.step(1000/60)
    touched ||= runtime.world.contacts(runtime.player.body!).some(c=>c.other===sack.body)
    entrance ||= tick<departure*60&&onAuthoredFloor(runtime)
    minimumY=Math.min(minimumY,runtime.player.pose.position[1]!)
   }
   const p=runtime.player.pose.position
   assert.ok(touched&&entrance,'the approach is supported and contacts the actual sack')
   const upperExit=onAuthoredFloor(runtime)&&p[1]!>origin.y-2&&Math.hypot(p[0]!-target.x,p[2]!-target.z)<1
   assert.equal(upperExit,departure===.5,'departure phase changes whether the upper route is reached')
   if(upperExit)assert.ok(minimumY>origin.y-3,'successful crossing never falls to the lower floor')
  }finally{runtime.dispose()}
 }
})

test('Level 12 four-sack corridor is traversable continuously by braking at each upper junction',{skip:!available},async()=>{
 for(const fps of [60,120])for(const junctionStops of [false,true]){
  const runtime=await setup(12)
  try{
   const parent=runtime.course.objects.find(o=>o.name==='P_Modul_26_01')!,origin=new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(parent.matrix))
   const sector=Number(runtime.course.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))!.name.slice(-2))
   runtime.reset(sector,'wood',origin.clone().add(new THREE.Vector3(0,4,8)).toArray())
   const handle=runtime.player.body!,touched=new Set<string>(),targets=[113.771,97.811,81.787,65.787]
   let stage=junctionStops?0:3,minimumY=Infinity
   for(let tick=0;tick<fps*40;tick++){
    if(tick<fps*.5)runtime.input(new Set(),0);else routeBrake(runtime,new THREE.Vector3(origin.x,0,targets[stage]!))
    runtime.step(1000/fps)
    assert.equal(runtime.player.body,handle,'no respawn or restaging between sacks')
    const p=runtime.player.pose.position,v=runtime.world.state(handle).slice(7,10)
    minimumY=Math.min(minimumY,p[1]!)
    if(stage<3&&Math.hypot(p[0]!-origin.x,p[2]!-targets[stage]!)<.6&&Math.hypot(...v)<.5&&onAuthoredFloor(runtime))stage++
    for(const c of runtime.world.contacts(handle)){
     const part=runtime.parts.find(p=>p.body===c.other&&p.name.endsWith('/P_Modul_26_Sack'))
     if(part)touched.add(part.name)
    }
   }
   const p=runtime.player.pose.position
   const safeExit=stage===3&&onAuthoredFloor(runtime)&&p[1]!>origin.y-2&&Math.hypot(p[0]!-origin.x,p[2]!-targets[3]!)<1
   assert.equal(safeExit,junctionStops,'braking at the junctions changes the route outcome')
   if(junctionStops){
    assert.ok(minimumY>origin.y-3,'continuous upper-route traversal never drops to lower rails')
    assert.ok(touched.has(parent.name+'/P_Modul_26_Sack'),'the route contacts the first sack and may avoid later swings')
    if(fps===60)assert.ok(touched.size>=2,'the 60 FPS fixture also contacts a subsequent sack')
    assert.ok(Math.hypot(...runtime.world.state(handle).slice(7,10))<.5,'supported final stop')
   }
  }finally{runtime.dispose()}
 }
})
