import {test} from 'node:test'
import assert from 'node:assert/strict'
import oracle from '../docs/original-transformer-spring-oracle.json' with {type:'json'}
import {originalSpringStep} from '../src/game/original-transformer-spring.ts'
test('local-frame spring arithmetic matches all compiled upstream samples',()=>{
  let current={x:0,y:0,z:0},previous={...current}
  for(const [dt,frame,x,y,z] of oracle.samples){
    if(frame===0){current={x:Math.fround(3.2),y:Math.fround(3.2),z:Math.fround(1.2)};previous={...current}}
    else {const next=originalSpringStep(current,previous,{x:0,y:0,z:0},{x:0,y:-3,z:0},dt!);previous=current;current=next}
    assert.deepEqual(current,{x:Math.fround(x!),y:Math.fround(y!),z:Math.fround(z!)},`delta ${dt} frame ${frame}`)
  }
  assert.equal(oracle.samples.length,64)
})

test('all saved transformer frames preserve local capture targets through render conversion', async()=>{
  const {readFileSync}=await import('node:fs')
  const {OriginalTransformerFrame}=await import('../src/game/original-transformer-spring.ts')
  let count=0,tilted=0
  for(let level=1;level<=12;level++){
    const doc=JSON.parse(readFileSync(new URL(`../.local/original/level_${String(level).padStart(2,'0')}.json`,import.meta.url),'utf8'))
    const ids=new Set(doc.groups.filter((g:{name:string})=>g.name.startsWith('P_Trafo_')).flatMap((g:{members:number[]})=>g.members))
    for(const o of doc.objects.filter((o:{id:number})=>ids.has(o.id))){
      const frame=new OriginalTransformerFrame(o.matrix),target={x:0,y:3,z:0}
      const recovered=frame.local(frame.rendered(target))
      assert.ok(Math.hypot(recovered.x,recovered.y-3,recovered.z)<.002,`Level ${level} ${o.name}`)
      if(Math.abs(o.matrix[5]-1)>.001)tilted++
      count++
    }
  }
  assert.equal(count,195)
  assert.ok(tilted>0)
})
