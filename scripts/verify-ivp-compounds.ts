// Exercise every measured mechanism surface/scale through actual IVP bodies.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { IvpWorld, ivpDescriptor } from '../src/game/ivp-bridge.ts'
import type { OriginalDocument, OriginalMesh } from '../src/game/original-data.ts'
import measured from '../src/game/original-object-inertia.json' with { type:'json' }
import fragments from '../src/game/original-fragment-inertia.json' with { type:'json' }

const directory=resolve(process.argv[2] ?? '.local/ivp-simulation'), pack=resolve('.local/original')
const { default:createModule }=await import(pathToFileURL(resolve(directory,'ivp-simulation.mjs')).href)
const meshes=new Map<string,OriginalMesh>()
for(const name of readdirSync(pack).filter(n=>n.endsWith('.json') && !n.startsWith('level_')).sort()) {
  const doc=JSON.parse(readFileSync(resolve(pack,name),'utf8')) as Partial<OriginalDocument>
  for(const mesh of doc.meshes ?? []) if(mesh.name) {
    if(meshes.has(mesh.name)) assert.deepEqual(meshes.get(mesh.name)!.positions,mesh.positions)
    meshes.set(mesh.name,mesh)
  }
}
const report=[]
assert.equal(measured.numericBuild.floatingPointContraction,false)
assert.deepEqual(fragments.numericBuild,measured.numericBuild)
for(const [key,data] of Object.entries({ ...measured.measurements,...fragments.measurements })) {
  const names=key.split('@')[0]!.split('|')
  const hulls=names.map((name,index)=> {
    const mesh=meshes.get(name); assert.ok(mesh,`Missing collision mesh ${name}`)
    const bytes=Buffer.alloc(mesh.positions.length*4); mesh.positions.forEach((v,i)=>bytes.writeFloatLE(v,i*4))
    assert.equal(createHash('sha256').update(bytes).digest('hex'),data.positionsSha256[index])
    return [...new Set(mesh.positions.reduce<string[]>((rows,_,i,all)=> {
      if(i%3===0) rows.push(all.slice(i,i+3).join(' ')); return rows
    },[]))].flatMap(row=>row.split(' ').map((v,axis)=>Math.fround(Number(v)*data.scale[axis]!)))
  })
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(.3,-.7,.2))
  const descriptor={ position:[31,23,-47],rotation:rotation.toArray(),mass:3.25,friction:.7,restitution:.3,
    linearDamping:0,angularDamping:0,massCenter:[.4,-.3,.2],collisionEnabled:false }
  const w=new IvpWorld(await createModule(),0), samples:number[][]=[]
  const packed=hulls.flatMap(h=>[h.length/3,...h])
  const commands=['world 0',`compound ${hulls.length} ${packed.join(' ')} ${ivpDescriptor(descriptor).join(' ')}`,'state 1']
  try {
    const id=w.compound(hulls,descriptor); assert.equal(id,1)
    const state=w.state(id); samples.push(state)
    const inertia=data.inertiaPerMass.map(v=>v*descriptor.mass), minimum=Math.hypot(...inertia)*measured.minimumAxisFactor
    for(let axis=0;axis<3;++axis) {
      const expected=Math.max(inertia[axis]!,minimum)
      assert.ok(Math.abs(state[13+axis]!-expected)<Math.max(1e-5,expected*2e-7),`${key}: original compound inertia axis ${axis}: actual ${state[13+axis]}, expected ${expected}`)
      assert.ok(Math.abs(state[axis]!-descriptor.position[axis]!)<1e-6,`${key}: COM override must not shift the object's initial pose`)
    }
    // Deliberately off-center, with a rotated body and nonzero authored COM.
    // Both builds receive identical world-space point/impulse parameters.
    const point=new THREE.Vector3(1.4,.1,-.3).applyQuaternion(rotation).add(new THREE.Vector3(...descriptor.position as [number,number,number]))
    const impulse=new THREE.Vector3(.6,.2,-.4).applyQuaternion(rotation)
    w.pushAt(id,point.toArray(),impulse.toArray())
    commands.push(`push_at 1 ${[...point.toArray(),...impulse.toArray()].join(' ')}`)
    for(let tick=0;tick<132;++tick) {
      w.step(); samples.push(w.state(id)); commands.push(`step ${1/66}`,'state 1')
    }
    assert.ok(Math.hypot(...samples[1]!.slice(10,13))>1e-8,`${key}: off-center impulse must generate rotation`)
  } finally { w.dispose() }
  const native=spawnSync(resolve(directory,'ivp-simulation-native'),[],{ input:commands.join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024 })
  assert.equal(native.status,0,`${key}: native replay failed ${native.stderr}`)
  const expected:number[][]=native.stdout.trim().split('\n').map(line=>JSON.parse(line))
  assert.equal(expected.length,samples.length)
  const maxDifference=Math.max(...samples.flatMap((state,index)=>state.map((v,i)=>Math.abs(v-expected[index]![i]!))))
  assert.ok(maxDifference<1e-5,`${key}: native/WASM difference ${maxDifference}`)
  report.push({ key,hulls:hulls.length,placements:data.placements.length,samples:samples.length,maxDifference })
}
writeFileSync(resolve(directory,'compounds-comparison.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({ surfaces:report.length,multiHull:report.filter(r=>r.hulls>1).length,
  coveredPlacements:report.reduce((n,r)=>n+r.placements,0),samples:report.reduce((n,r)=>n+r.samples,0),maxDifference:Math.max(...report.map(r=>r.maxDifference)) },null,2))
