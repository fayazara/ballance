import * as THREE from 'three'
import {SCALE} from './original-data.ts'
import data from './original-point-trails-data.json' with {type:'json'}

// P_Extra_Point.nmo: six TT_TimedependentPointParticlesystem blocks.
// "Emission Delay" is consumed as a rate by TimePointEmitter, not milliseconds.
export const POINT_TRAIL={rate:data.emissionRate,lifetime:data.lifetimeMs/1000,capacity:data.capacity,startSize:data.startSize*SCALE,endSize:data.endSize*SCALE,endColor:data.endColor[0]!} as const
export const POINT_SATELLITES=data.satellitePositions
const axes=[[0,1,0],[0,0,1],[1,0,0],[.5,.5,.707],[.707,-.707,0],[-.5,-.5,.707]].map(p=>new THREE.Vector3(...p).normalize())
const starts=POINT_SATELLITES.map(p=>new THREE.Vector3(...p).normalize().multiplyScalar(2))
export function pointSatellitePosition(index:number,time:number,out=new THREE.Vector3()) {
  out.copy(starts[index]!).applyAxisAngle(axes[index]!,time*data.motion.Rotationspeed).multiplyScalar(SCALE)
  out.z=-out.z
  return out
}
type Dot={position:THREE.Vector3;born:number;emitter:number}
/** World-stationary dots in the pickup frame, independent of subsequent orbit rotation. */
export class OriginalPointTrailState {
  dots:Dot[]=[]
  private previousTime?:number
  private emissionTime=0
  private previous=starts.map((_,i)=>pointSatellitePosition(i,0))
  reset(){this.dots=[];this.previousTime=undefined;this.emissionTime=0}
  update(time:number,positions=starts.map((_,i)=>pointSatellitePosition(i,time)),active=Array<boolean>(6).fill(true)) {
    if(this.previousTime===undefined||time<this.previousTime||time-this.previousTime>1) {
      this.reset();this.previousTime=time
      this.previous.forEach((p,i)=>p.copy(positions[i]!));return
    }
    const dt=time-this.previousTime;this.previousTime=time
    this.dots=this.dots.filter(dot=>time-dot.born<POINT_TRAIL.lifetime)
    this.emissionTime+=dt
    const count=Math.floor(POINT_TRAIL.rate*this.emissionTime)
    if(count<1)return
    this.emissionTime=0
    for(let i=0;i<6;i++) {
      const current=positions[i]!
      if(!active[i]){this.previous[i]!.copy(current);continue}
      const existing=this.dots.filter(dot=>dot.emitter===i).length
      for(let j=0;j<Math.min(count,POINT_TRAIL.capacity-existing);j++) {
        this.dots.push({position:current.clone().lerp(this.previous[i]!,j/count),born:time,emitter:i})
      }
      this.previous[i]!.copy(current)
    }
  }
}
export class OriginalPointTrails {
  state=new OriginalPointTrailState()
  geometry=new THREE.BufferGeometry()
  mesh:THREE.Points
  private positions=new Float32Array(6*POINT_TRAIL.capacity*3)
  private ages=new Float32Array(6*POINT_TRAIL.capacity)
  constructor(material:THREE.PointsMaterial) {
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setAttribute('trailAge',new THREE.BufferAttribute(this.ages,1).setUsage(THREE.DynamicDrawUsage))
    this.geometry.setDrawRange(0,0)
    this.mesh=new THREE.Points(this.geometry,material);this.mesh.frustumCulled=false
  }
  update(time:number,positions?:THREE.Vector3[],active?:boolean[]) {
    this.state.update(time,positions,active)
    this.state.dots.forEach((dot,i)=>{dot.position.toArray(this.positions,i*3);this.ages[i]=time-dot.born})
    this.geometry.setDrawRange(0,this.state.dots.length)
    this.geometry.attributes.position!.needsUpdate=true;this.geometry.attributes.trailAge!.needsUpdate=true
  }
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.state.reset()}
}
