// Shared native/WASM recorder for machine-assembly verification.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { IvpWorld,ivpDescriptor,ivpJointDescriptor,ivpSpringDescriptor,ivpForceDescriptor } from '../src/game/ivp-bridge.ts'
import type { IvpModule,IvpBodyDescriptor,IvpJointDescriptor,IvpSpringDescriptor,IvpForceDescriptor } from '../src/game/ivp-bridge.ts'
export class IvpReplay {
  world:IvpWorld
  commands:string[]
  samples:number[][]=[]
  constructor(module:IvpModule,gravity=-20) {this.world=new IvpWorld(module,gravity);this.commands=[`world ${gravity}`]}
  sphere(radius:number,d:IvpBodyDescriptor) {
    const id=this.world.sphere(radius,d)
    this.commands.push(`ballg ${d.collisionGroup || '_'} ${radius} ${ivpDescriptor(d).join(' ')}`);return id
  }
  convex(vertices:ArrayLike<number>,d:IvpBodyDescriptor) {
    const id=this.world.convex(vertices,d)
    this.commands.push(`hullg ${d.collisionGroup || '_'} ${vertices.length/3} ${Array.from(vertices).join(' ')} ${ivpDescriptor(d).join(' ')}`);return id
  }
  triangles(vertices:ArrayLike<number>,d:IvpBodyDescriptor) {
    const id=this.world.triangles(vertices,d)
    this.commands.push(`trimeshg ${d.collisionGroup || '_'} ${vertices.length/9} ${Array.from(vertices).join(' ')} ${ivpDescriptor(d).join(' ')}`);return id
  }
  compound(hulls:number[][],d:IvpBodyDescriptor) {
    const id=this.world.compound(hulls,d),packed=hulls.flatMap(h=>[h.length/3,...h])
    this.commands.push(`compoundg ${d.collisionGroup || '_'} ${hulls.length} ${packed.join(' ')} ${ivpDescriptor(d).join(' ')}`);return id
  }
  joint(d:IvpJointDescriptor) {
    const id=this.world.joint(d)
    this.commands.push(`joint ${{hinge:1,slider:2,ballSocket:3}[d.kind]} ${d.reference} ${d.attached} ${ivpJointDescriptor(d).join(' ')}`);return id
  }
  spring(d:IvpSpringDescriptor) {const id=this.world.spring(d);this.commands.push(`spring ${d.reference} ${d.attached} ${ivpSpringDescriptor(d).join(' ')}`);return id}
  force(d:IvpForceDescriptor) {const id=this.world.force(d);this.commands.push(`force ${d.body} ${+(d.positionSpace==='core')} ${ivpForceDescriptor(d).join(' ')}`);return id}
  removeForce(id:number) {this.world.removeForce(id);this.commands.push(`remove_force ${id}`)}
  removeSpring(id:number) {this.world.removeSpring(id);this.commands.push(`remove_spring ${id}`)}
  remove(id:number) {this.world.remove(id);this.commands.push(`remove ${id}`)}
  pair(a:number,b:number,enabled:boolean) {this.world.pair(a,b,enabled);this.commands.push(`pair ${a} ${b} ${+enabled}`)}
  wake(id:number) {this.world.wake(id);this.commands.push(`wake ${id}`)}
  pushAt(id:number,point:number[],impulse:number[]) {this.world.pushAt(id,point,impulse);this.commands.push(`push_at ${id} ${[...point,...impulse].join(' ')}`)}
  step() {this.world.step();this.commands.push(`step ${1/66}`)}
  state(id:number) {const state=this.world.state(id);this.samples.push(state);this.commands.push(`state ${id}`);return state}
  compare(directory:string) {
    const native=spawnSync(resolve(directory,'ivp-simulation-native'),[],{input:this.commands.join('\n')+'\n',encoding:'utf8',maxBuffer:16*1024*1024})
    assert.equal(native.status,0,native.stderr)
    const expected:number[][]=native.stdout.trim().split('\n').map(line=>JSON.parse(line))
    assert.equal(expected.length,this.samples.length)
    let difference=0
    for(let i=0;i<this.samples.length;++i) {
      assert.equal(expected[i]!.length,this.samples[i]!.length)
      for(let j=0;j<this.samples[i]!.length;++j) difference=Math.max(difference,Math.abs(this.samples[i]![j]!-expected[i]![j]!))
    }
    assert.ok(Number.isFinite(difference)&&difference<1e-5,`Native/WASM difference ${difference}`)
    return {samples:this.samples.length,maxDifference:difference}
  }
}
