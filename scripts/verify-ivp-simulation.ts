// Compare the same IVP simulation through native and WebAssembly builds.
// Run: node scripts/verify-ivp-simulation.ts /path/to/bridge-build
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PLAYER_PHYSICS, CRATE_PHYSICS, FLOOR_PHYSICS } from '../src/game/original-physics.ts'
import type { Material } from '../src/game/levels.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'
import {OriginalPhysicsClock} from '../src/game/original-physics-clock.ts'
import {originalScriptDeltaMs} from '../src/game/original-script-clock.ts'

const directory = resolve(process.argv[2] || '.local/ivp-simulation')
const { default: createModule } = await import(pathToFileURL(resolve(directory, 'ivp-simulation.mjs')).href)
const document = JSON.parse(readFileSync(new URL('../.local/original/balls.json', import.meta.url), 'utf8')) as OriginalDocument
const paper = document.objects.find(o => o.name === 'Ball_Paper')!
assert.deepEqual(paper.matrix, [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], 'probe expects original paper object axes')
const paperPoints = [...new Set(document.meshes.find(m => m.id === paper.mesh)!.positions.reduce<string[]>((points, _v, i, all) => {
  if (i % 3 === 0) points.push(all.slice(i, i+3).map(Math.fround).join(' '))
  return points
}, []))].flatMap(v => v.split(' ').map(Number))

type Settings = { mass: number; friction: number; restitution: number; linearDamping: number; angularDamping: number }
function descriptor(position: number[], settings: Settings, fixed = false, rotation = [0,0,0,1]) {
  return [...position, ...rotation, settings.mass, settings.friction, settings.restitution,
    settings.linearDamping, settings.angularDamping, +fixed, 0,0,0,1,0]
}
function box(x: number, y: number, z: number) {
  return [-x,x].flatMap(a => [-y,y].flatMap(b => [-z,z].flatMap(c => [a,b,c])))
}
const floorMaterial = { ...CRATE_PHYSICS, ...FLOOR_PHYSICS }
type Command = { op: 'world' | 'step' | 'state' | 'push' | 'ball' | 'hull'; values: number[] }
type Scenario = { name: string; commands: Command[] }
const scenarios: Scenario[] = []
for (const material of ['wood','stone','paper'] as Material[]) {
  for (const setup of ['impulse','drop','roll','push','slope']) {
    const commands: Command[] = [{ op: 'world', values: [setup === 'impulse' ? 0 : -20] }]
    let playerId = 1
    if (setup !== 'impulse') {
      const angle = setup === 'slope' ? .15 : 0
      commands.push({ op: 'hull', values: [8, ...box(100,.5,30), ...descriptor([0,-.5,0], floorMaterial, true, [0,0,Math.sin(angle/2),Math.cos(angle/2)])] })
      playerId++
    }
    const d = descriptor(setup === 'impulse' ? [0,10,0] : [-10,setup === 'drop' ? 12 : setup === 'slope' ? 5 : 2.1,0], PLAYER_PHYSICS[material])
    commands.push(material === 'paper' ? { op: 'hull', values: [paperPoints.length/3,...paperPoints,...d] } : { op: 'ball', values: [2,...d] })
    if (setup === 'push') commands.push({ op: 'hull', values: [8,...box(2,2,2),...descriptor([0,2.1,0],CRATE_PHYSICS)] })
    const steps = 396 // Six original physics seconds / three game-clock seconds.
    for (let tick=0; tick<steps; ++tick) {
      if ((setup === 'impulse' && tick === 0) || (setup === 'roll' || setup === 'push') && tick < 264) {
        commands.push({ op: 'push', values: [playerId,setup === 'impulse' ? 1 : PLAYER_PHYSICS[material].driveImpulse,0,0] })
      }
      commands.push({ op: 'step', values: [1/66] }, { op: 'state', values: [playerId] })
      if (setup === 'push') commands.push({ op: 'state', values: [3] })
    }
    scenarios.push({ name: `${material}-${setup}`, commands })
  }
  const clock=new OriginalPhysicsClock(),d=descriptor([0,30,0],PLAYER_PHYSICS[material])
  const commands:Command[]=[{op:'world',values:[-20]},
    {op:'hull',values:[8,...box(100,.5,30),...descriptor([0,-.5,0],floorMaterial,true)]},
    material==='paper'?{op:'hull',values:[paperPoints.length/3,...paperPoints,...d]}:{op:'ball',values:[2,...d]}]
  for(const elapsed of [...Array<number>(12).fill(1000/60),1000,1000,1000,1000,...Array<number>(120).fill(1000/60)]) {
    commands.push({op:'step',values:[clock.step(originalScriptDeltaMs(elapsed))]},{op:'state',values:[2]})
  }
  scenarios.push({name:`${material}-stalled-drop`,commands})
}

const reports: { name: string; samples: number; maxDifference: number; firstDifference: number | null; final: number[]; finalCrate?: number[] }[] = []
for (const scenario of scenarios) {
  // Match the fresh native process: IVP has process-global state in addition to
  // each environment. Environment reuse is a separate lifecycle check.
  const module = await createModule()
  const protocol = scenario.commands.map(c => `${c.op} ${c.values.join(' ')}`).join('\n')+'\n'
  writeFileSync(resolve(directory, `${scenario.name}.input`), protocol)
  const native = spawnSync(resolve(directory,'ivp-simulation-native'), [], {
    input: protocol, encoding: 'utf8', maxBuffer: 8*1024*1024,
  })
  assert.equal(native.status, 0, `${scenario.name}: native failed: ${native.stderr}`)
  const expected: number[][] = native.stdout.trim().split('\n').map(line => JSON.parse(line))
  const samples: number[][] = []
  let world = 0
  const output = module._malloc(17*8)
  function withBuffer(values: number[], fn: (pointer: number) => number) {
    const pointer = module._malloc(values.length*8)
    try { module.HEAPF64.set(values,pointer/8); return fn(pointer) } finally { module._free(pointer) }
  }
  try {
    for (const { op, values: v } of scenario.commands) {
      let result: number
      switch (op) {
        case 'world': world = module._ivp_new(v[0]); result=world; break
        case 'ball': result=withBuffer(v.slice(1), p => module._ivp_ball(world,v[0],p,0)); break
        case 'hull': result=withBuffer(v.slice(1), p => module._ivp_hull(world,v[0],p,p+v[0]!*3*8,0)); break
        case 'step': result=module._ivp_step(world,v[0]); break
        case 'push': result=module._ivp_push(world,...v); break
        case 'state':
          result=module._ivp_state(world,v[0],output)
          samples.push([...module.HEAPF64.subarray(output/8,output/8+17)]); break
      }
      assert.ok(result!, `${scenario.name}: ${op} rejected`)
    }
  } finally { module._free(output); if(world) module._ivp_delete(world) }
  assert.equal(samples.length, expected.length)
  let maxDifference = 0, firstDifference: number | null = null
  samples.forEach((sample,index) => sample.forEach((value,axis) => {
    assert.ok(Number.isFinite(value), `${scenario.name}: non-finite state`)
    const difference = Math.abs(value-expected[index]![axis]!)
    if (difference !== 0 && firstDifference === null) firstDifference=index
    maxDifference=Math.max(maxDifference,difference)
  }))
  const pushes=scenario.name.endsWith('-push')
  reports.push({ name: scenario.name, samples: samples.length, maxDifference, firstDifference,
    final: samples[samples.length-(pushes?2:1)]!, ...(pushes ? { finalCrate: samples.at(-1)! } : {}) })
  writeFileSync(resolve(directory, `${scenario.name}.json`), JSON.stringify({ native: expected, wasm: samples }))
  console.log(`${scenario.name}: ${samples.length} states, max native/WASM difference ${maxDifference}`)
}
writeFileSync(resolve(directory,'comparison.json'), JSON.stringify(reports,null,2)+'\n')
// This is a port diagnostic, not a loose gameplay-equivalence tolerance. A failed
// contact comparison must be investigated before switching the game's backend.
assert.ok(reports.every(r => r.maxDifference < 1e-5), 'Native/WASM trajectories diverged; inspect comparison.json')
for (const report of reports) {
  if (report.name.endsWith('-roll')) assert.ok(report.final[0]! > 0 && Math.abs(report.final[1]!-2) < .25, `${report.name}: should roll on the floor`)
  if (report.name.endsWith('-slope')) assert.ok(report.final[0]! < -10, `${report.name}: should descend the slope`)
  if (report.name.endsWith('-drop')) assert.ok(Math.abs(report.final[1]!-2) < .25, `${report.name}: should settle on the floor`)
}
const distance=(name: string)=>reports.find(r=>r.name===name)!.finalCrate![0]!
assert.ok(distance('wood-push') > distance('paper-push')+1, 'wood must push the crate farther than paper')
assert.ok(distance('stone-push') > distance('paper-push')+1, 'stone must push the crate farther than paper')
