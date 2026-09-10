import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {IvpWorld} from '../src/game/ivp-bridge.ts'
import {OriginalIvpLift} from '../src/game/original-ivp-lift.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
const binary=resolve(process.env.BALLANCE_IVP_BUILD ?? '.local/ivp-simulation','ivp-simulation.mjs')
const pack=resolve('.local/original')
const available=existsSync(binary)&&existsSync(resolve(pack,'level_12.json'))
const load=(name:string):OriginalDocument=>JSON.parse(readFileSync(resolve(pack,name+'.json'),'utf8'))
test('native lift sector reset reconstructs every removed weight and rejects old body handles',{skip:!available},async()=> {
  const {default:createModule}=await import(pathToFileURL(binary).href)
  const w=new IvpWorld(await createModule()),doc=load('p_modul_03')
  const parent=Array.from({length:12},(_,i)=>load(`level_${String(i+1).padStart(2,'0')}`).objects).flat().find(o=>o.name.startsWith('P_Modul_03_'))!
  let assembly:OriginalIvpLift|undefined
  try {
    // Construction failure must remove its temporary support, too.
    assert.throws(()=>new OriginalIvpLift(w,parent,{...doc,objects:[]}),/Missing IVP lift part/)
    assert.throws(()=>w.state(1),/state read failed/)
    assembly=new OriginalIvpLift(w,parent,doc)
    const initial=w.state(assembly.platform),old=[...assembly.parts.values()]
    const wall=[...assembly.parts.keys()].find(name=>name.includes('Wall'))!
    assert.equal(assembly.removeWeight(wall),true)
    assert.equal(assembly.removeWeight(wall),false)
    assembly.wake()
    for(let tick=0;tick<132;++tick) w.step()
    assembly.dispose();assembly.dispose()
    for(const id of old) assert.throws(()=>w.state(id),/state read failed/)
    assert.throws(()=>assembly!.wake(),/disposed/)
    assembly=new OriginalIvpLift(w,parent,doc)
    assert.equal(assembly.parts.size,9)
    const restored=w.state(assembly.platform)
    restored.slice(0,7).forEach((v,i)=>assert.ok(Math.abs(v-initial[i]!)<1e-8,'sector reset restores the original object pose'))
    assembly.wake()
    for(let tick=0;tick<132;++tick) w.step()
    assert.ok(w.state(assembly.platform).every(Number.isFinite),'recreated contacts and constraints remain valid')
  } finally {assembly?.dispose();w.dispose()}
})
