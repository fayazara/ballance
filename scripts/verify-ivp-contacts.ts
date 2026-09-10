// Compare native friction lifecycles, impacts and queried contact pressure.
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawnSync} from 'node:child_process'
import {IvpWorld,ivpDescriptor} from '../src/game/ivp-bridge.ts'
import {PLAYER_PHYSICS,FLOOR_PHYSICS,CRATE_PHYSICS} from '../src/game/original-physics.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
const directory=resolve(process.argv[2] ?? '.local/ivp-simulation')
const {default:createModule}=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const doc:OriginalDocument=JSON.parse(readFileSync('.local/original/balls.json','utf8'))
const paper=doc.meshes.find(m=>m.id===doc.objects.find(o=>o.name==='Ball_Paper')!.mesh)!.positions.map(Math.fround)
const box=(x:number,y:number,z:number)=>[-x,x].flatMap(a=>[-y,y].flatMap(b=>[-z,z].flatMap(c=>[a,b,c])))
const reports=[]
for(const material of ['wood','stone','paper'] as const) {
  const w=new IvpWorld(await createModule()),commands=['world -20'],observations:number[][][]=[],counts={start:0,end:0,impact:0}
  try {
    const floor={position:[0,-1,0],mass:1,...FLOOR_PHYSICS,linearDamping:0,angularDamping:0,fixed:true},vertices=box(30,1,12)
    const floorId=w.convex(vertices,floor);commands.push(`hull 8 ${vertices.join(' ')} ${ivpDescriptor(floor).join(' ')}`)
    const player={position:[-8,7,0],...PLAYER_PHYSICS[material]},ball=material==='paper'?w.convex(paper,player):w.sphere(2,player)
    commands.push(material==='paper'?`hull ${paper.length/3} ${paper.join(' ')} ${ivpDescriptor(player).join(' ')}`:`ball 2 ${ivpDescriptor(player).join(' ')}`)
    const crate={position:[0,2.1,0],...CRATE_PHYSICS},cube=box(2,2,2)
    w.convex(cube,crate);commands.push(`hull 8 ${cube.join(' ')} ${ivpDescriptor(crate).join(' ')}`)
    for(let tick=0;tick<660;++tick) {
      if(tick>=132 && tick<396) {const value=PLAYER_PHYSICS[material].driveImpulse;w.push(ball,value,0,0);commands.push(`push ${ball} ${value} 0 0`)}
      if(tick===528) {w.remove(floorId);commands.push(`remove ${floorId}`);w.wake(ball);commands.push(`wake ${ball}`)}
      w.step();commands.push(`step ${1/66}`)
      const events=w.drainEvents().map(event=> {
        const type={contactStart:1,contactEnd:2,impact:3}[event.kind]
        ++counts[event.kind==='contactStart'?'start':event.kind==='contactEnd'?'end':'impact']
        return [type,event.time,event.contact,...event.bodies,...(event.normal??[0,0,0]),...(event.point??[0,0,0]),...(event.relativeVelocity??[0,0,0])]
      })
      observations.push(events);commands.push('events')
      // Normalize native object order to the queried body's inward normal.
      observations.push(w.contacts(ball).map(c=>[c.id,ball,c.other,...c.normal,c.normalForce]));commands.push(`contacts ${ball}`)
    }
    assert.ok(counts.start>0&&counts.end>0&&counts.impact>0,`${material}: incomplete event fixture`)
  } finally {w.dispose()}
  const native=spawnSync(resolve(directory,'ivp-simulation-native'),[],{input:commands.join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
  assert.equal(native.status,0,native.stderr)
  const expected:number[][][]=native.stdout.trim().split('\n').map(line=>JSON.parse(line))
  assert.equal(expected.length,observations.length)
  let maxDifference=0,firstDifference:unknown
  expected.forEach((rows,index)=> {
    if(index%2===1) rows=rows.map(row=>[row[0]!,2,row[row[1]===2?2:1]!,...row.slice(3,6).map(v=>v*(row[1]===2?-1:1)),row[6]!])
    assert.equal(rows.length,observations[index]!.length,`${material}: event/contact count at query ${index}`)
    rows.forEach((row,i)=>row.forEach((v,j)=> {const delta=Math.abs(v-observations[index]![i]![j]!);assert.ok(Number.isFinite(delta));if(delta>1e-5&&!firstDifference)firstDifference={index,i,j,native:row,wasm:observations[index]![i]};maxDifference=Math.max(maxDifference,delta)}))
  })
  assert.ok(maxDifference<1e-5,`${material}: native/WASM contact difference ${maxDifference}: ${JSON.stringify(firstDifference)}`)
  reports.push({material,queries:observations.length,...counts,maxDifference})
}
writeFileSync(resolve(directory,'contacts-comparison.json'),JSON.stringify(reports,null,2)+'\n')
console.log(JSON.stringify(reports,null,2))
