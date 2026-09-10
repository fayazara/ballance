import {Quaternion,Vector3} from 'three'

export interface UfoRotationKey {time:number;rotation:readonly number[];tension:number}
export interface UfoCurvePoint {flags:number;position:readonly number[];incoming:readonly number[];outgoing:readonly number[]}
const quaternion=(value:readonly number[])=>new Quaternion(value[0],value[1],value[2],value[3]).normalize()
const negate=(q:Quaternion)=>q.set(-q.x,-q.y,-q.z,-q.w)

function logDifference(from:Quaternion,to:Quaternion) {
  const q=from.clone().conjugate().multiply(to).normalize()
  const length=Math.hypot(q.x,q.y,q.z)
  return new Vector3(q.x,q.y,q.z).multiplyScalar(length>1e-10?Math.atan2(length,q.w)/length:1)
}
function exp(value:Vector3) {
  const length=value.length(),factor=length>1e-10?Math.sin(length)/length:1
  return new Quaternion(value.x*factor,value.y*factor,value.z*factor,Math.cos(length))
}

/** Authored UFO tracks have zero continuity, bias and ease. The nonuniform-time
 * quaternion controls follow CK2_3D.dll 0x10051040, not the simplified tangent
 * implementation in the public engine reconstruction. */
export class UfoRotationTrack {
  private keys:readonly UfoRotationKey[]
  private controls:{incoming:Quaternion;outgoing:Quaternion}[]
  constructor(keys:readonly UfoRotationKey[]) {
    this.keys=keys
    this.controls=keys.map((key,index)=> {
      const current=quaternion(key.rotation),before=keys[index-1],after=keys[index+1]
      const previous=before?quaternion(before.rotation):undefined,next=after?quaternion(after.rotation):undefined
      if(previous&&previous.dot(current)<0)negate(previous)
      if(next&&next.dot(current)<0)negate(next)
      const a=previous?logDifference(previous,current):logDifference(current,next!)
      const b=next?logDifference(current,next):a.clone()
      const left=before&&after?2*(key.time-before.time)/(after.time-before.time):1
      const right=before&&after?2*(after.time-key.time)/(after.time-before.time):1
      const factor=(1-key.tension)*.5
      return {
        incoming:current.clone().multiply(exp(a.clone().multiplyScalar((1-factor*left)*.5).addScaledVector(b,-factor*left*.5))),
        outgoing:current.clone().multiply(exp(a.clone().multiplyScalar(factor*right*.5).addScaledVector(b,(factor*right-1)*.5))),
      }
    })
  }
  sample(time:number) {
    const keys=this.keys
    if(time<=keys[0]!.time)return quaternion(keys[0]!.rotation)
    if(time>=keys.at(-1)!.time)return quaternion(keys.at(-1)!.rotation)
    const end=keys.findIndex(key=>key.time>time),start=end-1
    const t=(time-keys[start]!.time)/(keys[end]!.time-keys[start]!.time)
    const outer=quaternion(keys[start]!.rotation).slerp(quaternion(keys[end]!.rotation),t)
    const inner=this.controls[start]!.outgoing.clone().slerp(this.controls[end]!.incoming,t)
    return outer.slerp(inner,2*t*(1-t)).normalize()
  }
}

/** CK2dCurve GetY uses Hermite tangents and solves X before evaluating Y.
 * These saved curves contain either linear segments or authored tangents;
 * their first endpoint's zero-TCB outgoing tangent is already the next delta. */
export function ufoCurve(points:readonly UfoCurvePoint[],progress:number) {
  const x=Math.max(0,Math.min(1,progress))
  const end=points.findIndex((point,index)=>index>0&&point.position[0]!>=x)
  if(end<0)return points.at(-1)!.position[1]!
  const a=points[end-1]!,b=points[end]!
  if(x===a.position[0])return a.position[1]!
  if(x===b.position[0])return b.position[1]!
  if(a.flags&2)return a.position[1]!+(b.position[1]!-a.position[1]!)*(x-a.position[0]!)/(b.position[0]!-a.position[0]!)
  let low=0,high=1,y=0
  for(let i=0;i<100;i++) {
    const t=(low+high)*.5,t2=t*t,t3=t2*t
    const h=[2*t3-3*t2+1,-2*t3+3*t2,t3-2*t2+t,t3-t2]
    const at=(axis:number)=>h[0]!*a.position[axis]!+h[1]!*b.position[axis]!+h[2]!*a.outgoing[axis]!+h[3]!*b.incoming[axis]!
    const sample=at(0);y=at(1)
    if(Math.abs(sample-x)<1e-5)break
    if(sample<x)low=t;else high=t
  }
  return Math.max(0,Math.min(1,y))
}
