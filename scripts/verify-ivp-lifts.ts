// All nine weighted lifts with actual convex contacts, spring and slider.
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as THREE from 'three'
import { IvpReplay } from './ivp-replay.ts'
import { OriginalIvpLift } from '../src/game/original-ivp-lift.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import source from '../src/game/original-lift-data.json' with {type:'json'}
const directory=resolve(process.argv[2] ?? '.local/ivp-simulation')
const {default:createModule}=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const load=(name:string):OriginalDocument=>JSON.parse(readFileSync(resolve('.local/original',name+'.json'),'utf8'))
const doc=load('p_modul_03'),reports=[]
for(let level=1;level<=12;++level) {
  for(const parent of load(`level_${String(level).padStart(2,'0')}`).objects.filter(o=>o.name.startsWith('P_Modul_03_'))) {
    const replay=new IvpReplay(await createModule())
    let assembly:OriginalIvpLift|undefined
    let loaded=0,unloaded=0,lateralError=0
    try {
      assembly=new OriginalIvpLift(replay,parent,doc)
      const {parts,platform,origin,axis}=assembly
      assembly.wake()
      const travel=()=>new THREE.Vector3(...replay.world.state(platform).slice(0,3) as [number,number,number]).sub(origin).dot(axis)
      for(let tick=0;tick<1056;++tick) {
        replay.step()
        if(tick%22===0) for(const id of parts.values()) replay.state(id)
      }
      loaded=travel()
      const loadedStates=[...parts.values()].map(id=>replay.world.state(id))
      assert.ok(loadedStates.every(s=>s.every(Number.isFinite)),`${parent.name}: non-finite loaded state`)
      // The original weights are removable. Remove all eight after their contact
      // load has settled, then wake the platform as player interaction would.
      // This isolates unloading response, not the player's wall-pushing route.
      for(const name of [...parts.keys()]) if(name!==source.wakeTarget) assembly.removeWeight(name)
      assembly.wake()
      for(let tick=0;tick<1056;++tick) {
        replay.step();if(tick%22===0) replay.state(platform)
      }
      unloaded=travel()
      const delta=new THREE.Vector3(...replay.world.state(platform).slice(0,3) as [number,number,number]).sub(origin)
      lateralError=delta.addScaledVector(axis,-delta.dot(axis)).length()
      assert.ok(lateralError<.005,`${parent.name}: lateral slider drift ${lateralError}`)
      assert.ok(unloaded-loaded>5,`${parent.name}: weights did not load the platform (${loaded} -> ${unloaded})`)
      assembly.dispose();replay.step()
    } finally {assembly?.dispose();replay.world.dispose()}
    reports.push({level,name:parent.name,loaded,unloaded,rise:unloaded-loaded,lateralError,...replay.compare(directory)})
  }
}
assert.equal(reports.length,9)
writeFileSync(resolve(directory,'lifts-comparison.json'),JSON.stringify(reports,null,2)+'\n')
console.log(JSON.stringify({lifts:reports.length,bodies:reports.length*source.parts.length,samples:reports.reduce((n,r)=>n+r.samples,0),maxDifference:Math.max(...reports.map(r=>r.maxDifference)),minimumRise:Math.min(...reports.map(r=>r.rise)),maxLateralError:Math.max(...reports.map(r=>r.lateralError))},null,2))
