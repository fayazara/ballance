import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile,mkdir,rm} from 'node:fs/promises'
import {existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {readIvpAssets} from '../scripts/ivp-assets.ts'
import {IvpWorld} from '../src/game/ivp-bridge.ts'

const build={revision:'7579664996e68040dd0158081b04f612e6a2d515',floatingPointContraction:false}

test('production IVP URLs change when either member of the module pair changes',async()=> {
  const root=await mkdtemp(join(tmpdir(),'ballance-ivp-assets-'))
  try {
    await writeFile(join(root,'build.json'),JSON.stringify(build))
    await writeFile(join(root,'ivp-simulation.mjs'),'export default ()=>{}')
    await writeFile(join(root,'ivp-simulation.wasm'),Buffer.from([0,97,115,109,1,0,0,0]))
    const first=await readIvpAssets(root)
    await writeFile(join(root,'ivp-simulation.mjs'),'export default ()=>{return 1}')
    const second=await readIvpAssets(root)
    assert.notEqual(first.url,second.url,'a changed loader must not reuse the old cache URL')
    await writeFile(join(root,'ivp-simulation.wasm'),Buffer.from([0,97,115,109,1,0,0,0,0,1,0]))
    const third=await readIvpAssets(root)
    assert.notEqual(second.url,third.url,'a changed solver must not reuse the old module URL')
    assert.equal(new URL('ivp-simulation.wasm','https://game.test'+third.url).pathname,'/'+third.files[1]!.fileName)
  } finally {await rm(root,{recursive:true,force:true})}
})

test('production packaging fails for missing, invalid or unverified native builds',async()=> {
  const root=await mkdtemp(join(tmpdir(),'ballance-ivp-assets-'))
  try {
    await assert.rejects(readIvpAssets(root),/ENOENT/)
    await writeFile(join(root,'ivp-simulation.mjs'),'export default ()=>{}')
    await writeFile(join(root,'ivp-simulation.wasm'),'not wasm')
    await writeFile(join(root,'build.json'),JSON.stringify(build))
    await assert.rejects(readIvpAssets(root),/Invalid IVP WebAssembly/)
    await writeFile(join(root,'build.json'),JSON.stringify({...build,floatingPointContraction:true}))
    await assert.rejects(readIvpAssets(root),/Build the verified IVP SDK/)
  } finally {await rm(root,{recursive:true,force:true})}
})

test('packaged native loader resolves its colocated solver and runs the bridge',{skip:!existsSync(resolve('.local/ivp-simulation/ivp-simulation.mjs'))},async()=> {
  const root=await mkdtemp(join(tmpdir(),'ballance-ivp-relocated-'))
  try {
    const assets=await readIvpAssets()
    for(const file of assets.files) {
      const path=join(root,file.fileName)
      await mkdir(resolve(path,'..'),{recursive:true})
      await writeFile(path,file.source)
      assert.deepEqual(await readFile(path),file.source)
    }
    const {default:create}=await import(pathToFileURL(join(root,assets.url)).href)
    const world=new IvpWorld(await create())
    try {
      const ball=world.sphere(2,{position:[0,20,0],mass:.2,friction:.5,restitution:.4,linearDamping:0,angularDamping:0})
      world.step(.1)
      const state=world.state(ball)
      assert.ok(state.every(Number.isFinite))
      assert.ok(state[1]!<20,'the packaged solver advances gravity')
    } finally {world.dispose()}
  } finally {await rm(root,{recursive:true,force:true})}
})
