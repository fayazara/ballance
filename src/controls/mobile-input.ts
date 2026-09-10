export type Axes={x:number;z:number}
const clamp=(v:number)=>Math.max(-1,Math.min(1,v))
/** Gravity projected onto screen axes, independent of compass heading. */
export function screenTilt(beta:number,gamma:number,angle:number):Axes {
  const rad=Math.PI/180,b=beta*rad,g=gamma*rad,a=angle*rad
  const x=Math.sin(g)*Math.cos(b),z=Math.sin(b)
  return {x:x*Math.cos(a)+z*Math.sin(a),z:z*Math.cos(a)-x*Math.sin(a)}
}
export function tiltAxes(value:Axes,neutral:Axes,sensitivity=1):Axes {
  const axis=(v:number)=>Math.abs(v)<.035?0:clamp(Math.sign(v)*(Math.abs(v)-.035)/.3*sensitivity)
  return {x:axis(value.x-neutral.x),z:axis(value.z-neutral.z)}
}
export function padAxes(x:number,y:number,size:number):Axes {
  const nx=(x-size/2)/(size/2),ny=(y-size/2)/(size/2)
  if(Math.hypot(nx,ny)<.22)return {x:0,z:0}
  const angle=Math.atan2(ny,nx),sector=Math.round(angle/(Math.PI/4))
  return {x:Math.round(Math.cos(sector*Math.PI/4)),z:Math.round(Math.sin(sector*Math.PI/4))}
}
/** Fixed touch origin, bounded thumb travel, and magnetic eight-way steering. */
export function floatingPad(dx:number,dy:number,radius=44) {
  const distance=Math.hypot(dx,dy),scale=distance>radius?radius/distance:1
  return {dx:dx*scale,dy:dy*scale,axes:padAxes(dx+radius,dy+radius,radius*2)}
}
export class TouchPointers {
  readonly held=new Map<number,Axes>()
  set(id:number,axes:Axes) {this.held.set(id,axes);return this.axes}
  release(id:number) {this.held.delete(id);return this.axes}
  clear() {this.held.clear()}
  get axes():Axes {let x=0,z=0;for(const a of this.held.values()){x+=a.x;z+=a.z}return {x:clamp(x),z:clamp(z)}}
}
