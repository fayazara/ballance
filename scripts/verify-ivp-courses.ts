// Actual imported courses through the IVP bridge, with native replay comparison.
// node scripts/verify-ivp-courses.ts /path/to/bridge-build [first-level] [last-level]
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { IvpModule } from '../src/game/ivp-bridge.ts'
import { originalIvpFloors, originalIvpResetpoints } from '../src/game/original-ivp-level.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import { OriginalIvpPlayer } from '../src/game/original-ivp-player.ts'
import { IvpReplay } from './ivp-replay.ts'

const directory=resolve(process.argv[2] ?? '.local/ivp-simulation')
const first=Number(process.argv[3] ?? 1), last=Number(process.argv[4] ?? 12)
assert.ok(Number.isInteger(first) && Number.isInteger(last) && first>=1 && last<=12 && last>=first)
const root=new URL('../.local/original/',import.meta.url)
const load=(name: string)=>JSON.parse(readFileSync(new URL(name+'.json',root),'utf8')) as OriginalDocument
const balls=load('balls')
const { default:createModule }=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const report=[]
for(let level=first;level<=last;++level) {
  const name=`level_${String(level).padStart(2,'0')}`, document=load(name)
  const floors=originalIvpFloors(document), resets=originalIvpResetpoints(document)
  const module:IvpModule=await createModule(), replay=new IvpReplay(module), world=replay.world
  const {commands,samples}=replay, probes:{ name:string; origin:number[]; final:number[] }[]=[]
  const started=performance.now()
  try {
    for(const floor of floors) {
      const id=replay.triangles(floor.triangles,floor.descriptor)
      assert.ok(id>0)
    }
    console.log(`${name}: loaded ${floors.length} floor bodies, ${floors.reduce((n,f)=>n+f.triangles.length/9,0)} triangles`)
    for(const reset of resets) for(const kind of ['wood','stone','paper'] as const) {
      const origin=reset.matrix.slice(12,15).map(Math.fround)
      const player=new OriginalIvpPlayer(replay,balls,kind,{position:origin,rotation:[0,0,0,1]}), id=player.body!
      for(let tick=0;tick<264;++tick) {
        replay.step()
        if(tick%66===65) replay.state(id)
      }
      const final=world.state(id)
      assert.ok(final.every(Number.isFinite),`${name} ${reset.name} ${kind}: non-finite state`)
      // Reset frames intentionally sit above the resting ball (the first one
      // drops ~1.63 original units). Use the established imported-course bound
      // of one web unit / four original units, plus the independent velocity check.
      assert.ok(Math.abs(final[1]!-origin[1]!)<4,`${name} ${reset.name} ${kind}: left reset platform (${origin[1]} to ${final[1]})`)
      assert.ok(Math.abs(final[8]!)<.15,`${name} ${reset.name} ${kind}: did not settle (${final[8]})`)
      probes.push({ name:`${reset.name}-${kind}`, origin, final })
      player.dispose()
      assert.throws(()=>world.state(id),/state read failed/,'removed body must not retain a live physics handle')
    }
  } finally { world.dispose() }
  assert.throws(()=>world.step(),/disposed/)
  const native=spawnSync(resolve(directory,'ivp-simulation-native'),[],{ input:commands.join('\n')+'\n', encoding:'utf8', maxBuffer:32*1024*1024 })
  assert.equal(native.status,0,`${name}: native replay failed (${native.signal}): ${native.stderr}`)
  const expected:number[][]=native.stdout.trim().split('\n').map(line=>JSON.parse(line))
  assert.equal(samples.length,expected.length)
  const differences=samples.map((state,index)=>Math.max(...state.map((value,i)=>Math.abs(value-expected[index]![i]!))))
  const maxDifference=Math.max(...differences)
  const summary={ name, floors:floors.length, triangles:floors.reduce((n,f)=>n+f.triangles.length/9,0), resets:resets.length,
    probes:probes.length, samples:samples.length, maxDifference, elapsedMs:Math.round(performance.now()-started) }
  writeFileSync(resolve(directory,`${name}-comparison.json`),JSON.stringify({ ...summary, probes, native:expected,wasm:samples },null,2)+'\n')
  assert.ok(maxDifference<1e-5,`${name}: native/WASM course state divergence ${maxDifference}`)
  report.push(summary)
  writeFileSync(resolve(directory,'courses-comparison.json'),JSON.stringify(report,null,2)+'\n')
  console.log(`${name}: ${probes.length} material/reset probes passed, native/WASM max difference ${maxDifference}`)
}
