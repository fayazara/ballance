// Typed ownership boundary for the separately built IVP module. Values use the
// original game's units/axes. This does not select the playable game's backend.
export interface IvpModule {
  _ivp_bridge_abi(): number
  HEAPF64: Float64Array
  HEAPU8: Uint8Array
  _malloc(bytes: number): number
  _free(pointer: number): void
  _ivp_new(gravity: number): number
  _ivp_delete(world: number): void
  _ivp_time(world: number): number
  _ivp_ball(world: number, radius: number, descriptor: number, group: number): number
  _ivp_hull(world: number, count: number, vertices: number, descriptor: number, group: number): number
  _ivp_trimesh(world: number, faces: number, vertices: number, descriptor: number, group: number): number
  _ivp_compound(world: number, hulls: number, length: number, vertices: number, descriptor: number, group: number): number
  _ivp_group(world: number, body: number, group: number): number
  _ivp_remove(world: number, body: number): number
  _ivp_pair(world: number, first: number, second: number, enabled: number): number
  _ivp_event_count(world: number): number
  _ivp_events(world: number, output: number, capacity: number): number
  _ivp_contacts(world: number, body: number, output: number, capacity: number): number
  _ivp_joint(world: number, kind: number, reference: number, attached: number, descriptor: number): number
  _ivp_remove_joint(world: number, joint: number): number
  _ivp_wake(world: number, body: number): number
  _ivp_spring(world: number, reference: number, attached: number, descriptor: number): number
  _ivp_remove_spring(world: number, spring: number): number
  _ivp_force(world: number, body: number, corePoint: number, descriptor: number): number
  _ivp_remove_force(world: number, force: number): number
  _ivp_step(world: number, dt: number): number
  _ivp_push(world: number, body: number, x: number, y: number, z: number): number
  _ivp_push_at(world: number, body: number, values: number): number
  _ivp_state(world: number, body: number, output: number): number
}
export interface IvpBodyDescriptor {
  position: readonly number[]
  rotation?: readonly number[]
  mass: number
  friction: number
  restitution: number
  linearDamping: number
  angularDamping: number
  fixed?: boolean
  massCenter?: readonly number[]
  collisionEnabled?: boolean
  frozen?: boolean
  collisionGroup?: string
}
export interface IvpContact {
  id:number
  other:number
  /** Current world-space surface normal pointing into this body. */
  normal:[number,number,number]
  normalForce:number
}
export interface IvpCollisionEvent {
  kind:'contactStart'|'contactEnd'|'impact'
  time:number
  contact:number
  bodies:[number,number]
  /** Normal points from bodies[0] toward bodies[1]; absent on contactEnd. */
  normal?:[number,number,number]
  point?:[number,number,number]
  /** Valid only for impact events, not friction creation/deletion. */
  relativeVelocity?:[number,number,number]
}
export interface IvpJointDescriptor {
  kind: 'hinge' | 'slider' | 'ballSocket'
  /** Zero denotes world space, otherwise a live body handle. */
  reference: number
  attached: number
  anchor: readonly number[]
  axis?: readonly number[]
  /** Hinge limits use radians; slider limits use original length units. */
  limits?: readonly [number,number]
}
export interface IvpSpringDescriptor {
  reference: number
  attached: number
  anchor1: readonly number[]
  anchor2: readonly number[]
  length: number
  constant: number
  axialDamping: number
  globalDamping: number
}
export function ivpSpringDescriptor(d: IvpSpringDescriptor) {
  if(d.anchor1.length!==3 || d.anchor2.length!==3) throw new Error('Invalid IVP spring dimensions')
  const values=[...d.anchor1,...d.anchor2,d.length,d.constant,d.axialDamping,d.globalDamping]
  if(!values.every(Number.isFinite)) throw new Error('Invalid IVP spring descriptor')
  return values
}
export interface IvpForceDescriptor {
  body: number
  position: readonly number[]
  /** The original target-referential shortcut uses raw core coordinates. */
  positionSpace: 'core' | 'world'
  /** Already transformed by the creation-time direction referential. */
  direction: readonly number[]
  /** Original per-PSI impulse, despite the source behavior's Force name. */
  value: number
}
export function ivpForceDescriptor(d: IvpForceDescriptor) {
  if(d.position.length!==3 || d.direction.length!==3) throw new Error('Invalid IVP force dimensions')
  const values=[...d.position,...d.direction,d.value]
  if(!values.every(Number.isFinite)) throw new Error('Invalid IVP force descriptor')
  return values
}
export function ivpJointDescriptor(d: IvpJointDescriptor) {
  if(d.anchor.length!==3 || d.axis && d.axis.length!==3 || d.limits && d.limits.length!==2) throw new Error('Invalid IVP joint dimensions')
  if(d.kind!=='ballSocket' && !d.axis) throw new Error('IVP hinge/slider requires an axis')
  const values=[...d.anchor,...(d.axis ?? [0,0,1]),+!!d.limits,...(d.limits ?? [0,0])]
  if(!values.every(Number.isFinite)) throw new Error('Invalid IVP joint descriptor')
  return values
}
export function ivpDescriptor(d: IvpBodyDescriptor) {
  if (d.position.length !== 3 || d.rotation && d.rotation.length !== 4 || d.massCenter && d.massCenter.length !== 3) throw new Error('Invalid IVP pose dimensions')
  const values = [...d.position, ...(d.rotation ?? [0,0,0,1]), d.mass, d.friction, d.restitution,
    d.linearDamping, d.angularDamping, +!!d.fixed, ...(d.massCenter ?? [0,0,0]), +(d.collisionEnabled ?? true), +!!d.frozen]
  if (values.length !== 18 || !values.every(Number.isFinite)) throw new Error('Invalid IVP body descriptor')
  return values
}
export class IvpWorld {
  private module: IvpModule
  private handle: number
  private output: number
  constructor(module: IvpModule, gravity = -20) {
    if (typeof module._ivp_bridge_abi !== 'function' || module._ivp_bridge_abi() !== 7) throw new Error('Rebuild the IVP module: bridge ABI 7 is required')
    this.module = module; this.handle = module._ivp_new(gravity)
    if (!this.handle) throw new Error('IVP environment creation failed')
    this.output = module._malloc(17*8)
  }
  private get live() {
    if (!this.handle) throw new Error('IVP environment is disposed')
    return this.handle
  }
  private buffer(values: ArrayLike<number>, run: (pointer: number) => number) {
    const pointer = this.module._malloc(values.length*8)
    try { this.module.HEAPF64.set(values,pointer/8); return run(pointer) } finally { this.module._free(pointer) }
  }
  private result(value: number, operation: string) {
    if (!value) throw new Error(`IVP ${operation} failed`)
    return value
  }
  private string(value: string, run: (pointer: number) => number) {
    if(value.includes('\0')) throw new Error('Invalid IVP collision identifier')
    const bytes=new TextEncoder().encode(value+'\0'), pointer=this.module._malloc(bytes.length)
    try { this.module.HEAPU8.set(bytes,pointer); return run(pointer) } finally { this.module._free(pointer) }
  }
  private descriptor(d: IvpBodyDescriptor, run: (descriptor: number, group: number) => number) {
    return this.buffer(ivpDescriptor(d),p=>this.string(d.collisionGroup ?? '',g=>run(p,g)))
  }
  sphere(radius: number, descriptor: IvpBodyDescriptor) {
    const world = this.live
    return this.result(this.descriptor(descriptor,(p,g)=>this.module._ivp_ball(world,radius,p,g)), 'sphere creation')
  }
  convex(vertices: ArrayLike<number>, descriptor: IvpBodyDescriptor) {
    if (vertices.length % 3) throw new Error('Invalid IVP convex positions')
    const world = this.live
    return this.result(this.descriptor(descriptor,(d,g)=>this.buffer(vertices,p=>this.module._ivp_hull(world,vertices.length/3,p,d,g))), 'convex creation')
  }
  triangles(vertices: ArrayLike<number>, descriptor: IvpBodyDescriptor) {
    if (vertices.length % 9) throw new Error('Invalid IVP triangle positions')
    const world = this.live
    return this.result(this.descriptor(descriptor,(d,g)=>this.buffer(vertices,p=>this.module._ivp_trimesh(world,vertices.length/9,p,d,g))), 'triangle mesh creation')
  }
  compound(hulls: readonly ArrayLike<number>[], descriptor: IvpBodyDescriptor) {
    if(!hulls.length || hulls.some(h=>h.length<12 || h.length%3)) throw new Error('Invalid IVP compound hulls')
    const world=this.live, packed=hulls.flatMap(h=>[h.length/3,...Array.from(h)])
    return this.result(this.descriptor(descriptor,(d,g)=>this.buffer(packed,p=>this.module._ivp_compound(world,hulls.length,packed.length,p,d,g))),'compound creation')
  }
  group(body: number, name: string) {
    // Native recheck semantics: this does not destroy existing friction contacts.
    // Physicalize supplies collisionGroup on the descriptor before creation.
    const world=this.live
    this.result(this.string(name,p=>this.module._ivp_group(world,body,p)),'collision group change')
  }
  remove(body: number) { this.result(this.module._ivp_remove(this.live,body),'body removal') }
  /** Pair exclusions combine with identifier filtering; enabling cannot override an equal nonempty group. */
  pair(first: number, second: number, enabled: boolean) { this.result(this.module._ivp_pair(this.live,first,second,+enabled),'collision pair change') }
  joint(descriptor: IvpJointDescriptor) {
    const world=this.live, kind={hinge:1,slider:2,ballSocket:3}[descriptor.kind]
    return this.result(this.buffer(ivpJointDescriptor(descriptor),p=>this.module._ivp_joint(world,kind,descriptor.reference,descriptor.attached,p)),'joint creation')
  }
  removeJoint(joint: number) { this.result(this.module._ivp_remove_joint(this.live,joint),'joint removal') }
  wake(body: number) { this.result(this.module._ivp_wake(this.live,body),'body wake') }
  spring(descriptor: IvpSpringDescriptor) {
    const world=this.live
    return this.result(this.buffer(ivpSpringDescriptor(descriptor),p=>this.module._ivp_spring(world,descriptor.reference,descriptor.attached,p)),'spring creation')
  }
  removeSpring(spring: number) { this.result(this.module._ivp_remove_spring(this.live,spring),'spring removal') }
  force(descriptor: IvpForceDescriptor) {
    const world=this.live
    return this.result(this.buffer(ivpForceDescriptor(descriptor),p=>this.module._ivp_force(world,descriptor.body,+(descriptor.positionSpace==='core'),p)),'force creation')
  }
  removeForce(force: number) { this.result(this.module._ivp_remove_force(this.live,force),'force removal') }
  push(body: number, x: number, y: number, z: number) { this.result(this.module._ivp_push(this.live,body,x,y,z),'impulse') }
  pushAt(body: number, position: readonly number[], impulse: readonly number[]) {
    if(position.length!==3 || impulse.length!==3) throw new Error('Invalid IVP impulse dimensions')
    const world=this.live
    this.result(this.buffer([...position,...impulse],p=>this.module._ivp_push_at(world,body,p)),'impulse at position')
  }
  step(dt = 1/66) { this.result(this.module._ivp_step(this.live,dt),'simulation step') }
  get time() { return this.module._ivp_time(this.live) }
  state(body: number) {
    this.result(this.module._ivp_state(this.live,body,this.output),'body state read')
    return Array.from(this.module.HEAPF64.subarray(this.output/8,this.output/8+17))
  }
  private rows(count:number,width:number,read:(pointer:number)=>number) {
    if(count<0) throw new Error('IVP contact read failed')
    const pointer=this.module._malloc(Math.max(1,count*width)*8)
    try {
      if(read(pointer)!==count) throw new Error('IVP contact read failed')
      return Array.from({length:count},(_,i)=>Array.from(this.module.HEAPF64.subarray(pointer/8+i*width,pointer/8+(i+1)*width)))
    } finally {this.module._free(pointer)}
  }
  contacts(body:number):IvpContact[] {
    const world=this.live,count=this.module._ivp_contacts(world,body,0,0)
    return this.rows(count,7,p=>this.module._ivp_contacts(world,body,p,count)).map(row=> {
      const first=row[1]===body,sign=first?-1:1
      return {id:row[0]!,other:row[first?2:1]!,normal:[row[3]!*sign,row[4]!*sign,row[5]!*sign],normalForce:row[6]!}
    })
  }
  drainEvents():IvpCollisionEvent[] {
    const world=this.live,count=this.module._ivp_event_count(world)
    return this.rows(count,14,p=>this.module._ivp_events(world,p,count)).map(row=>({
      kind:row[0]===1?'contactStart':row[0]===2?'contactEnd':'impact',time:row[1]!,contact:row[2]!,bodies:[row[3]!,row[4]!],
      ...(row[0]===2?{}:{normal:row.slice(5,8) as [number,number,number],point:row.slice(8,11) as [number,number,number]}),
      ...(row[0]===3?{relativeVelocity:row.slice(11,14) as [number,number,number]}:{})
    }))
  }
  dispose() {
    if (!this.handle) return
    this.module._ivp_delete(this.handle); this.module._free(this.output); this.handle=0
  }
}
