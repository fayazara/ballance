import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IvpWorld } from '../src/game/ivp-bridge.ts'
import type { IvpModule } from '../src/game/ivp-bridge.ts'
import { PLAYER_PHYSICS, FLOOR_PHYSICS } from '../src/game/original-physics.ts'

const binary=resolve(process.env.BALLANCE_IVP_BUILD ?? '.local/ivp-simulation','ivp-simulation.mjs')
const available=existsSync(binary)
const ready=available ? import(pathToFileURL(binary).href) : undefined
async function world() { return new IvpWorld(await (await ready!).default() as IvpModule) }
const fixed={ position:[0,0,0],fixed:true,mass:1,...FLOOR_PHYSICS,linearDamping:0,angularDamping:0 }
const patch=(left:number,right:number)=>[left,0,-12,right,0,-12,right,0,12,left,0,-12,right,0,12,left,0,12]
function box(center: number[], half: number[]) {
  return [-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].flatMap(z=>[x,y,z].map((v,i)=>center[i]!+v*half[i]!))))
}

test('IVP accepts the original clock long-frame intervals and retains internal PSI stepping',{skip:!available},async()=> {
  const whole=await world(),split=await world()
  try {
    const settings={position:[0,30,0],...PLAYER_PHYSICS.wood}
    const one=whole.sphere(2,settings),two=split.sphere(2,settings)
    whole.triangles(patch(-20,20),fixed);split.triangles(patch(-20,20),fixed)
    // Four 1000 ms script frames, after original filtering and the 2x factor.
    for(const interval of [.5,.8750000596046448,1.15625,1.3671876192092896]) {
      whole.step(interval)
      const count=Math.ceil(interval/.125)
      for(let i=0;i<count;i++)split.step(interval/count)
      assert.ok(Math.abs(whole.time-split.time)<1e-10)
      const actual=whole.state(one),expected=split.state(two)
      for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i]!-expected[i]!)<1e-8,`state ${i}: ${actual[i]} versus ${expected[i]}`)
    }
    assert.ok(whole.state(one).every(Number.isFinite))
    assert.ok(Math.abs(whole.state(one)[1]!-2)<.1,'ball settles on the physical floor after the long frames')
    for(const invalid of [0,-1,NaN,Infinity])assert.throws(()=>whole.step(invalid))
  } finally {whole.dispose();split.dispose()}
})

test('IVP compound bodies preserve the passage between their separate convex pieces', { skip:!available },async()=> {
  const w=await world()
  try {
    w.triangles(patch(-30,30),{ ...fixed,collisionGroup:'Floor' })
    const arch=w.compound([box([-6,5,0],[1,5,1]),box([6,5,0],[1,5,1]),box([0,11,0],[7,1,1])],fixed)
    assert.equal(arch,2,'the three ledges form one rigid body')
    const through=w.sphere(2,{ position:[0,2.1,-8],...PLAYER_PHYSICS.wood,collisionGroup:'Ball' })
    const blocked=w.sphere(2,{ position:[-6,2.1,-8],...PLAYER_PHYSICS.wood,collisionGroup:'Ball' })
    for(let i=0;i<132;++i) { w.push(through,0,0,.43); w.push(blocked,0,0,.43); w.step() }
    assert.ok(w.state(through)[2]!>5,'merging all vertices into one convex hull would incorrectly seal the passage')
    assert.ok(w.state(blocked)[2]! < -2.9,'the actual pillar must remain solid')
    assert.deepEqual(w.state(arch).slice(0,3),[0,0,0],'a fixed compound cannot be pushed')
  } finally { w.dispose() }
})

test('IVP triangle ledges preserve a real gap and empty collision groups still contact', { skip:!available },async()=> {
  const w=await world()
  try {
    w.triangles([...patch(-12,-4),...patch(4,12)],fixed)
    const supported=w.sphere(2,{ position:[-8,5,0],...PLAYER_PHYSICS.wood })
    const gap=w.sphere(2,{ position:[0,5,0],...PLAYER_PHYSICS.wood })
    for(let i=0;i<264;++i) w.step()
    assert.ok(Math.abs(w.state(supported)[1]!-2)<.1,'supporting triangles should stop the ball')
    assert.ok(w.state(gap)[1]! < -20,'the gap must not be filled by a convex hull of both patches')
  } finally { w.dispose() }
})

test('IVP physicalization applies collision identifiers before contacts are created', { skip:!available },async()=> {
  const w=await world()
  try {
    w.triangles(patch(-30,30),{ ...fixed,collisionGroup:'Floor' })
    w.triangles([0,0,-12,0,12,-12,0,12,12,0,0,-12,0,12,12,0,0,12],{ ...fixed,collisionGroup:'Ball' })
    const ball=w.sphere(2,{ position:[-8,2.1,0],...PLAYER_PHYSICS.wood })
    for(let i=0;i<198;++i) { w.push(ball,.43,0,0); w.step() }
    assert.ok(w.state(ball)[0]! < -1.9,'an empty-group prop must be stopped')
    w.group(ball,'Ball')
    for(let i=0;i<132;++i) { w.push(ball,.43,0,0); w.step() }
    assert.ok(w.state(ball)[0]! < -1.9,'the SDK group-change/recheck API retains an existing friction contact')
    w.remove(ball)
    const player=w.sphere(2,{ position:[-8,2.1,0],...PLAYER_PHYSICS.wood,collisionGroup:'Ball' })
    for(let i=0;i<132;++i) { w.push(player,.43,0,0); w.step() }
    assert.ok(w.state(player)[0]! > 5,'a player physicalized in Ball must pass the Ball stopper')
    assert.ok(Math.abs(w.state(player)[1]!-2)<.1,'the ordinary Floor collision remains active')
  } finally { w.dispose() }
})

test('IVP Unphysicalize preserves sleeping neighbors until input wakes them and removed handles stay invalid', { skip:!available },async()=> {
  const w=await world()
  try {
    const floor=w.triangles(patch(-12,12),fixed)
    const ball=w.sphere(2,{ position:[0,5,0],...PLAYER_PHYSICS.wood })
    for(let i=0;i<660;++i) w.step()
    const resting=w.state(ball)
    assert.deepEqual(resting.slice(7,10),[0,0,0])
    w.remove(floor)
    assert.throws(()=>w.state(floor),/state read failed/)
    for(let i=0;i<66;++i) w.step()
    assert.deepEqual(w.state(ball).slice(0,3),resting.slice(0,3),'original delete_silently does not wake nearby sleepers')
    w.push(ball,.01,0,0)
    for(let i=0;i<132;++i) w.step()
    assert.ok(w.state(ball)[1]! < -10,'waking the ball must expose that its support was removed')
  } finally { w.dispose() }
  w.dispose()
  assert.throws(()=>w.step(),/disposed/)
})

test('IVP sliders lock transverse motion and rotation, and enforce authored travel limits', { skip:!available },async()=> {
  for(const limited of [false,true]) {
    const w=new IvpWorld(await (await ready!).default() as IvpModule,0)
    try {
      const support=w.sphere(.1,{...fixed,collisionEnabled:false})
      const body=w.sphere(1,{position:[2,0,0],mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false})
      w.joint({kind:'slider',reference:body,attached:support,anchor:[0,0,0],axis:[0,0,1],...(limited?{limits:[-.3,.4] as [number,number]}:{})})
      let maxTravel=0
      for(let tick=0;tick<264;++tick) {
        w.pushAt(body,[3,1,0],[.1,.2,.3]);w.step()
        const state=w.state(body)
        assert.ok(Math.abs(state[0]!-2)<.005 && Math.abs(state[1]!)<.005,'transverse coordinates are locked')
        assert.ok(Math.hypot(...state.slice(3,6))<.005,'the slider cannot rotate')
        maxTravel=Math.max(maxTravel,Math.abs(state[2]!))
      }
      assert.ok(limited?maxTravel<.5:maxTravel>10,`slider ${limited?'limits':'free travel'}: ${maxTravel}`)
    } finally { w.dispose() }
  }
})

test('IVP hinges respect rotation limits while ball sockets permit out-of-plane rotation', { skip:!available },async()=> {
  for(const kind of ['hinge','ballSocket'] as const) {
    for(const limited of kind==='hinge'?[false,true]:[false]) {
      const w=new IvpWorld(await (await ready!).default() as IvpModule,0)
      try {
        const support=w.sphere(.1,{...fixed,collisionEnabled:false})
        const body=w.sphere(1,{position:[2,0,0],mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false})
        w.joint({kind,reference:body,attached:support,anchor:[0,0,0],axis:[0,0,1],...(limited?{limits:[-.3,.4] as [number,number]}:{})})
        w.push(body,0,4,4)
        let maxAngle=0,maxZ=0
        for(let tick=0;tick<264;++tick) {
          w.step();const state=w.state(body)
          assert.ok(Math.abs(Math.hypot(...state.slice(0,3))-2)<.015,'joint keeps its pivot distance')
          maxAngle=Math.max(maxAngle,Math.abs(Math.atan2(state[1]!,state[0]!)))
          maxZ=Math.max(maxZ,Math.abs(state[2]!))
        }
        if(kind==='hinge') {
          assert.ok(maxZ<.005,'hinge rotates only about its axis')
          assert.ok(limited?maxAngle<.5:maxAngle>1,`hinge ${limited?'limit':'rotation'}: ${maxAngle}`)
        } else assert.ok(maxZ>.5,'ball joint permits rotation outside the hinge plane')
      } finally { w.dispose() }
    }
  }
})

test('IVP joint handles expire with either body and recreating a mechanism does not retain old constraints', { skip:!available },async()=> {
  const w=await world()
  try {
    for(const removed of ['reference','attached'] as const) {
      const support=w.sphere(.1,{...fixed,position:[0,10,0],collisionEnabled:false})
      const body=w.sphere(1,{position:[2,10,0],mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false})
      const joint=w.joint({kind:'ballSocket',reference:body,attached:support,anchor:[0,10,0]})
      w.remove(removed==='reference'?body:support)
      assert.throws(()=>w.removeJoint(joint),/joint removal failed/)
      for(let tick=0;tick<132;++tick) w.step()
      if(removed==='attached') {
        assert.ok(w.state(body)[1]! < -10,'the remaining body must be released')
        w.remove(body)
      } else w.remove(support)
    }
    assert.throws(()=>w.joint({kind:'hinge',reference:999,attached:0,anchor:[0,0,0],axis:[0,0,1]}),/joint creation failed/)
  } finally { w.dispose() }
})

test('IVP wakes a frozen connected assembly through the original single-body wake operation', {skip:!available},async()=> {
  const w=await world()
  try {
    const settings={mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false,frozen:true}
    const a=w.sphere(1,{...settings,position:[0,10,0]})
    const b=w.sphere(1,{...settings,position:[2,10,0]})
    w.joint({kind:'ballSocket',reference:a,attached:b,anchor:[1,10,0]})
    for(let tick=0;tick<66;++tick) w.step()
    assert.equal(w.state(a)[1],10,'registering the joint preserves the original frozen pose')
    assert.equal(w.state(b)[1],10)
    w.wake(a)
    for(let tick=0;tick<66;++tick) w.step()
    assert.ok(w.state(a)[1]!<5 && w.state(b)[1]!<5,'one wake activates both connected bodies')
    assert.ok(Math.abs(w.state(a)[1]!-w.state(b)[1]!)<.001)
  } finally {w.dispose()}
})

test('IVP springs restore both compressed and stretched anchors using absolute stiffness', {skip:!available},async()=> {
  for(const distance of [1,3]) {
    const w=new IvpWorld(await (await ready!).default() as IvpModule,0)
    try {
      const support=w.sphere(.1,{...fixed,collisionEnabled:false})
      const body=w.sphere(.1,{position:[distance,0,0],mass:1,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false})
      const spring=w.spring({reference:body,attached:support,anchor1:[distance,0,0],anchor2:[0,0,0],length:2,constant:4,axialDamping:1,globalDamping:.1})
      // Keep this convergence fixture awake so the native sleep threshold does
      // not end motion before the spring reaches its analytic rest length.
      for(let tick=0;tick<660;++tick) {w.wake(body);w.step()}
      assert.ok(Math.abs(w.state(body)[0]!-2)<.02,`both compression and extension should approach the rest length: start ${distance}, state ${w.state(body)}`)
      w.remove(support)
      assert.throws(()=>w.removeSpring(spring),/spring removal failed/)
      w.push(body,2,0,0)
      for(let tick=0;tick<132;++tick) w.step()
      assert.ok(w.state(body)[0]!>4,'removing the anchor releases the surviving body')
    } finally {w.dispose()}
  }
})

test('IVP continuous force is a normalized world impulse per PSI and stops on shutdown', {skip:!available},async()=> {
  const w=new IvpWorld(await (await ready!).default() as IvpModule,0)
  try {
    const body=w.sphere(1,{position:[0,0,0],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],mass:2,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false})
    const force=w.force({body,position:[0,0,0],positionSpace:'core',direction:[0,0,8],value:.1})
    for(let tick=0;tick<66;++tick) w.step()
    const state=w.state(body)
    assert.ok(Math.abs(state[9]!-3.3)<.001,`66 per-PSI impulses, without multiplying by dt: ${state[9]}`)
    assert.ok(Math.abs(state[7]!)+Math.abs(state[8]!)+Math.hypot(...state.slice(10,13))<.00001)
    w.removeForce(force)
    for(let tick=0;tick<66;++tick) w.step()
    assert.ok(Math.abs(w.state(body)[9]!-state[9]!)<.00001,'shutdown removes acceleration')
    assert.throws(()=>w.removeForce(force),/force removal failed/)
    const fallback=w.force({body,position:[0,0,0],positionSpace:'core',direction:[0,0,0],value:.1})
    for(let tick=0;tick<66;++tick) w.step()
    assert.ok(Math.abs(w.state(body)[7]!-3.3)<.001,'zero direction follows the original positive-X fallback')
    w.remove(body)
    assert.throws(()=>w.removeForce(fallback),/force removal failed/)
    w.step()
  } finally {w.dispose()}
})

test('IVP force captures world points into rotated core coordinates with a shifted COM', {skip:!available},async()=> {
  const w=new IvpWorld(await (await ready!).default() as IvpModule,0)
  try {
    const body=w.sphere(1,{position:[10,20,30],rotation:[0,0,Math.SQRT1_2,Math.SQRT1_2],massCenter:[1,0,0],mass:2,friction:0,restitution:0,linearDamping:0,angularDamping:0,collisionEnabled:false})
    // COM [1,0,0] rotated 90 degrees about Z puts the core at [10,21,30].
    const centered=w.force({body,position:[10,21,30],positionSpace:'world',direction:[0,0,1],value:.1})
    for(let tick=0;tick<66;++tick) w.step()
    assert.ok(Math.hypot(...w.state(body).slice(10,13))<.00001,'a world point at the core must not introduce torque')
    w.removeForce(centered)
    w.force({body,position:[1,0,0],positionSpace:'core',direction:[0,0,1],value:.1})
    for(let tick=0;tick<22;++tick) w.step()
    assert.ok(Math.hypot(...w.state(body).slice(10,13))>.1,'the target-referential shortcut retains its core-space lever arm')
  } finally {w.dispose()}
})

test('IVP pair exclusions affect only the named bodies and are cleared when a body is removed', {skip:!available},async()=> {
  const w=await world()
  try {
    w.triangles(patch(-30,30),{...fixed,collisionGroup:'Floor'})
    const wall=w.triangles([0,0,-12,0,12,-12,0,12,12,0,0,-12,0,12,12,0,0,12],fixed)
    const create=(z:number)=>w.sphere(2,{position:[-8,2.1,z],...PLAYER_PHYSICS.wood,collisionGroup:'Ball'})
    const pass=create(-5),blocked=create(5)
    w.pair(pass,wall,false);w.pair(wall,pass,false)
    for(let tick=0;tick<132;++tick) {w.push(pass,.43,0,0);w.push(blocked,.43,0,0);w.step()}
    assert.ok(w.state(pass)[0]!>5,'excluded pair passes through the wall')
    assert.ok(w.state(blocked)[0]!<-1.9,'the other body still contacts the same wall')
    assert.ok(Math.abs(w.state(pass)[1]!-2)<.1,'pair exclusion must not disable floor contacts')
    w.remove(pass);w.remove(blocked)
    assert.throws(()=>w.pair(pass,wall,true),/collision pair change failed/)
    const replacement=create(-5)
    for(let tick=0;tick<132;++tick) {w.push(replacement,.43,0,0);w.step()}
    assert.ok(w.state(replacement)[0]!<-1.9,'a replacement body must not inherit an old pointer-pair exclusion')
  } finally {w.dispose()}
})

test('IVP pair enablement restores eligible collisions and never overrides matching group identifiers', {skip:!available},async()=> {
  for(const sameGroup of [false,true]) {
    const w=await world()
    try {
      w.triangles(patch(-30,30),{...fixed,collisionGroup:'Floor'})
      const wall=w.triangles([0,0,-12,0,12,-12,0,12,12,0,0,-12,0,12,12,0,0,12],{...fixed,collisionGroup:sameGroup?'Ball':''})
      const ball=w.sphere(2,{position:[-8,2.1,0],...PLAYER_PHYSICS.wood,collisionGroup:'Ball'})
      w.pair(ball,wall,false);w.pair(wall,ball,true);w.pair(ball,wall,true)
      for(let tick=0;tick<132;++tick) {w.push(ball,.43,0,0);w.step()}
      assert.ok(sameGroup?w.state(ball)[0]!>5:w.state(ball)[0]!<-1.9,'both original filters must permit a collision')
    } finally {w.dispose()}
  }
})

test('IVP reports real friction contacts, impact data, and contact removal without stale handles', {skip:!available},async()=> {
  const w=await world()
  try {
    const floor=w.triangles(patch(-12,12),fixed)
    const ball=w.sphere(2,{position:[0,7,0],...PLAYER_PHYSICS.wood})
    assert.deepEqual(w.contacts(ball),[])
    assert.deepEqual(w.drainEvents(),[])
    for(let tick=0;tick<264;++tick) w.step()
    const events=w.drainEvents(),starts=events.filter(e=>e.kind==='contactStart'),impacts=events.filter(e=>e.kind==='impact')
    assert.ok(starts.length>0 && impacts.length>0,'dropping the ball produces native friction and impact events')
    assert.ok(events.every(e=>e.bodies.includes(ball)&&e.bodies.includes(floor)))
    for(const event of events) {
      assert.ok(Number.isFinite(event.time))
      if(event.kind!=='contactEnd') assert.ok([...event.normal!,...event.point!].every(Number.isFinite),'only valid event geometry is exposed')
      if(event.kind==='impact') assert.ok(event.relativeVelocity!.every(Number.isFinite))
      else assert.equal(event.relativeVelocity,undefined,'friction events do not initialize relative velocity')
    }
    const contacts=w.contacts(ball)
    assert.ok(contacts.length>0)
    assert.ok(contacts.every(c=>c.other===floor&&c.normal[1]>.99),'support normal points into the ball')
    const reverse=w.contacts(floor)
    assert.ok(reverse.every(c=>c.other===ball&&c.normal[1]<-.99),'the same contacts orient toward the queried floor')
    assert.ok(contacts.every(c=>starts.some(e=>e.contact===c.id)))
    assert.deepEqual(w.drainEvents(),[],'events drain once')
    const ids=new Set(contacts.map(c=>c.id))
    w.remove(floor)
    assert.deepEqual(w.contacts(ball),[])
    const ended=w.drainEvents().filter(e=>e.kind==='contactEnd')
    assert.ok(ended.some(e=>ids.has(e.contact)))
    assert.ok(ended.every(e=>e.normal===undefined&&e.point===undefined&&e.relativeVelocity===undefined),'deleted friction geometry is invalid in IVP')
    assert.throws(()=>w.contacts(floor),/contact read failed/)
    for(let tick=0;tick<66;++tick) w.step()
    assert.deepEqual(w.contacts(ball),[])
  } finally {w.dispose()}
})

test('native friction events drive original delayed contact-on and contact-off outputs', {skip:!available},async()=> {
  const {OriginalIvpContact}=await import('../src/game/original-ivp-contact.ts')
  const w=await world()
  try {
    const floor=w.triangles(patch(-12,12),fixed),ball=w.sphere(2,{position:[0,7,0],...PLAYER_PHYSICS.wood})
    const tracker=new OriginalIvpContact(ball,1,.1,.1),changes:unknown[]=[]
    for(let tick=0;tick<264;++tick) {
      w.step();changes.push(...tracker.consume(w.drainEvents(),id=>id===floor?1:0),...tracker.process(w.time))
    }
    assert.deepEqual(changes,[{group:1,active:true}])
    w.remove(floor)
    assert.deepEqual(tracker.consume(w.drainEvents(),()=>0),[],'stored contact identity survives metadata removal')
    assert.deepEqual(tracker.process(w.time),[])
    for(let tick=0;tick<8;++tick) {w.step();changes.push(...tracker.process(w.time))}
    assert.deepEqual(changes,[{group:1,active:true},{group:1,active:false}])
  } finally {w.dispose()}
})
