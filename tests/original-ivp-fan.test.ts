import {test} from 'node:test'
import assert from 'node:assert/strict'
import {existsSync,readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {OriginalIvpFan} from '../src/game/original-ivp-fan.ts'
import {OriginalIvpPlayer} from '../src/game/original-ivp-player.ts'
import {originalIvpFloors} from '../src/game/original-ivp-level.ts'
import type {OriginalDocument} from '../src/game/original-data.ts'
import {IvpReplay} from '../scripts/ivp-replay.ts'
const directory=resolve(process.env.BALLANCE_IVP_BUILD??'.local/ivp-simulation')
const binary=resolve(directory,'ivp-simulation.mjs'),pack=resolve('.local/original')
const available=existsSync(binary)&&existsSync(resolve(pack,'level_12.json'))
const load=(name:string)=>JSON.parse(readFileSync(resolve(pack,name+'.json'),'utf8')) as OriginalDocument
async function replay(gravity=-20) {const {default:create}=await import(pathToFileURL(binary).href);return new IvpReplay(await create(),gravity)}

test('all 113 native fan placements apply material-dependent persistent force and shut down on sector exit',{skip:!available},async t=> {
  const balls=load('balls'),module=load('p_modul_18'),r=await replay(0)
  let count=0
  try {
    for(let level=1;level<=12;++level) {
      const document=load(`level_${String(level).padStart(2,'0')}`)
      for(const parent of document.objects.filter(o=>o.name.startsWith('P_Modul_18_'))) {
        const sector=Number(document.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))?.name.slice(-2)||1)
        const fan=new OriginalIvpFan(r,parent,module,sector)
        const speeds:number[]=[]
        try {
          for(const material of ['paper','wood','stone'] as const) {
            const player=new OriginalIvpPlayer(r,balls,material,{position:fan.column.center.toArray(),rotation:[0,0,0,1]})
            try {
              fan.sample(player,sector+1);assert.equal(fan.active,false)
              fan.sample(player,sector);assert.equal(fan.active,false,'EnterRange only refreshes the ball reference')
              fan.sample(player,sector);assert.equal(fan.active,true,`${level}/${parent.name}`)
              // No new script samples: the controller must still run on PSI.
              for(let tick=0;tick<20;++tick) {r.step();r.state(player.body!)}
              const speed=r.state(player.body!)[8]!
              assert.ok(speed>0);speeds.push(speed)
              fan.sample(player,sector+1);assert.equal(fan.active,false)
              for(let tick=0;tick<20;++tick) {r.step();r.state(player.body!)}
              assert.ok(r.state(player.body!)[8]!<speed,'shutdown leaves damping and no persistent airflow')
              fan.reset()
            } finally {fan.detachPlayer();player.dispose()}
          }
          assert.ok(speeds[0]!>speeds[1]!&&speeds[1]!>speeds[2]!,'same fan impulse accelerates lighter balls more')
          count++
        } finally {fan.dispose()}
      }
    }
  } finally {r.world.dispose()}
  assert.equal(count,113)
  t.diagnostic(JSON.stringify({placements:count,...r.compare(directory)}))
})

test('native Level 2 fan sustains paper hover above the real course while wood and stone remain grounded',{skip:!available},async t=> {
  const document=load('level_02'),module=load('p_modul_18'),balls=load('balls'),r=await replay()
  const parent=document.objects.find(o=>o.name==='P_Modul_18_01')!
  const sector=Number(document.groups.find(g=>/^Sector_/.test(g.name)&&g.members.includes(parent.id))?.name.slice(-2)||1)
  const fan=new OriginalIvpFan(r,parent,module,sector),heights:Record<string,number>={}
  try {
    for(const floor of originalIvpFloors(document)) r.triangles(floor.triangles,floor.descriptor)
    for(const material of ['paper','wood','stone'] as const) {
      const player=new OriginalIvpPlayer(r,balls,material,{position:fan.origin.clone().add({x:0,y:2.2,z:0}).toArray(),rotation:[0,0,0,1]})
      try {
        let switchedOff=false,switchedOn=false,previous=false
        for(let tick=0;tick<792;++tick) {
          fan.sample(player,sector);r.step()
          if(tick%6===5) r.state(player.body!)
          if(material==='paper'&&previous&&!fan.active) switchedOff=true
          if(switchedOff&&!previous&&fan.active) switchedOn=true
          previous=fan.active
        }
        const state=r.state(player.body!),height=state[1]!-fan.origin.y
        heights[material]=height
        if(material==='paper') {
          assert.ok(height>15&&height<23,`paper hover height ${height}`)
          assert.ok(switchedOff&&switchedOn,'paper must leave and re-enter the finite column at its top')
        } else assert.ok(height>1&&height<3,`${material} unexpectedly lifted/fell: ${height}`)
      } finally {fan.detachPlayer();player.dispose();fan.reset()}
    }
  } finally {fan.dispose();r.world.dispose()}
  t.diagnostic(JSON.stringify({heights,...r.compare(directory)}))
})
