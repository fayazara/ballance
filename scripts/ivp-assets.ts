import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {resolve} from 'node:path'
import type {Plugin} from 'vite'

/** Keep the generated loader and its relative WASM import in one immutable directory. */
export async function readIvpAssets(directory=resolve('.local/ivp-simulation')) {
  const names=['ivp-simulation.mjs','ivp-simulation.wasm'] as const
  const files=await Promise.all(names.map(async name=>({name,source:await readFile(resolve(directory,name))})))
  const build=JSON.parse(await readFile(resolve(directory,'build.json'),'utf8'))
  if(build.revision!=='7579664996e68040dd0158081b04f612e6a2d515'||build.floatingPointContraction!==false)
    throw new Error('Build the verified IVP SDK using scripts/build-ivp-simulation.py before building the game')
  if(!files[1]!.source.subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0])))
    throw new Error('Invalid IVP WebAssembly binary')
  const hash=createHash('sha256')
  for(const file of files){hash.update(file.name);hash.update(file.source)}
  const directoryName=`ivp/${hash.digest('hex').slice(0,20)}`
  return {files:files.map(file=>({...file,fileName:`${directoryName}/${file.name}`})),url:`/${directoryName}/${names[0]}`}
}

export async function ivpAssets(command:'build'|'serve'):Promise<Plugin> {
  const assets=command==='build'?await readIvpAssets():undefined
  return {
    name:'original-ivp-production-assets',
    applyToEnvironment:environment=>environment.name==='client',
    config:()=>({define:{'import.meta.env.VITE_IVP_MODULE_URL':JSON.stringify(assets?.url??'/ivp/ivp-simulation.mjs')}}),
    generateBundle() {
      for(const file of assets?.files??[])this.emitFile({type:'asset',fileName:file.fileName,source:file.source})
    },
  }
}
