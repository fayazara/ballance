import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nearestOriginalTransformer} from '../src/game/original-transformer-proximity.ts'
const player={x:0,y:0,z:0}
test('nearest selection precedes the same-material test, regardless of import order',()=>{
  const farther={kind:'stone',position:{x:.8,y:0,z:0}},closer={kind:'wood',position:{x:.2,y:0,z:0}}
  assert.equal(nearestOriginalTransformer([farther,closer],player),closer)
  assert.equal(nearestOriginalTransformer([closer,farther],player),closer)
})
test('trigger uses full 3D distance, including below the machine, and a strict float radius',()=>{
  const machine={position:player}
  assert.equal(nearestOriginalTransformer([machine],{x:0,y:-.75,z:0}),machine)
  assert.equal(nearestOriginalTransformer([machine],{x:1,y:1,z:0}),undefined)
  assert.equal(nearestOriginalTransformer([machine],{x:1.075,y:0,z:0}),undefined)
  assert.equal(nearestOriginalTransformer([machine],{x:1.0749,y:0,z:0}),machine)
  assert.equal(nearestOriginalTransformer([],player),undefined)
})
test('equal-distance candidates retain group traversal order',()=>{
  const a={position:{x:-.5,y:0,z:0}},b={position:{x:.5,y:0,z:0}}
  assert.equal(nearestOriginalTransformer([a,b],player),a)
  assert.equal(nearestOriginalTransformer([b,a],player),b)
})

test('actual Level 5 and 12 overlapping material machines choose the nearer center on either side',async t=>{
  const {readFileSync,existsSync}=await import('node:fs')
  const {fileURLToPath}=await import('node:url')
  const root=new URL('../.local/original/',import.meta.url)
  if(!existsSync(fileURLToPath(new URL('level_05.json',root)))){t.skip('requires original course assets');return}
  let mixedPairs=0
  for(let level=1;level<=12;level++) {
    const document=JSON.parse(readFileSync(new URL(`level_${String(level).padStart(2,'0')}.json`,root),'utf8'))
    const ids=new Set<number>(document.groups.filter((g:{name:string})=>g.name.startsWith('P_Trafo_')).flatMap((g:{members:number[]})=>g.members))
    const pads=document.objects.filter((o:{id:number})=>ids.has(o.id)).map((o:{name:string;matrix:number[]})=>({name:o.name,kind:o.name.split('_')[2],position:{x:o.matrix[12]!/4,y:o.matrix[13]!/4,z:-o.matrix[14]!/4}})) as {name:string;kind:string;position:{x:number;y:number;z:number}}[]
    for(let i=0;i<pads.length;i++)for(const b of pads.slice(i+1)) {
      const a=pads[i]!,delta={x:b.position.x-a.position.x,y:b.position.y-a.position.y,z:b.position.z-a.position.z}
      const distance=Math.hypot(delta.x,delta.y,delta.z)
      if(a.kind===b.kind||distance>=2.15)continue
      mixedPairs++
      for(const fraction of [.49,.51]) {
        const p={x:a.position.x+delta.x*fraction,y:a.position.y+delta.y*fraction,z:a.position.z+delta.z*fraction}
        const expected=fraction<.5?a:b
        assert.equal(nearestOriginalTransformer([a,b],p),expected,`Level ${level}: ${a.name}/${b.name}`)
        assert.equal(nearestOriginalTransformer([b,a],p),expected,'material grouping must not override distance')
        assert.equal(nearestOriginalTransformer(pads,p),expected,'full course inventory selects the same nearest machine')
      }
    }
  }
  assert.equal(mixedPairs,3,'audit must continue to cover all recovered mixed-material overlap pairs')
})
