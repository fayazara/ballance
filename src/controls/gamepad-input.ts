export type ControllerInput={x:number;z:number;brake:boolean}
export type ControllerAction='accept'|'back'|'pause'|'cameraLeft'|'cameraRight'|'up'|'down'|'left'|'right'
export type ControllerPad=Pick<Gamepad,'id'|'index'|'connected'|'mapping'|'axes'|'buttons'>
export const idleController=():ControllerInput=>({x:0,z:0,brake:false})
const clamp=(value:number)=>Math.max(-1,Math.min(1,Number.isFinite(value)?value:0))
/** Ignore resting stick drift, then smoothly restore the full axis range. */
export function controllerAxis(value=0) {
  const axis=clamp(value),deadzone=.2
  return Math.abs(axis)<=deadzone?0:Math.sign(axis)*(Math.abs(axis)-deadzone)/(1-deadzone)
}
export function selectController(pads:readonly (ControllerPad|null)[],previous?:number) {
  return pads.find(pad=>pad?.connected&&pad.index===previous)??pads.find(pad=>pad?.connected)??null
}
export function controllerName(pad:ControllerPad) {
  return /dualsense|054c.*0(?:ce6|df2)/i.test(pad.id)?'PS5 controller':/dualshock|playstation/i.test(pad.id)?'PlayStation controller':'Controller'
}
export function readController(pad:ControllerPad) {
  const pressed=(index:number)=>pad.buttons[index]?.pressed??false
  // Raw joysticks still get their primary stick and first two buttons. Extra
  // buttons only use the browser's canonical mapping, never guessed USB indices.
  const standard=pad.mapping==='standard'
  const x=clamp(controllerAxis(pad.axes[0])+(standard?Number(pressed(15))-Number(pressed(14)):0))
  const z=clamp(controllerAxis(pad.axes[1])+(standard?Number(pressed(13))-Number(pressed(12)):0))
  const actions=new Set<ControllerAction>()
  if(pressed(0))actions.add('accept')
  if(pressed(1))actions.add('back')
  if(standard) {
    if(pressed(9))actions.add('pause')
    if(pressed(4))actions.add('cameraLeft')
    if(pressed(5))actions.add('cameraRight')
  }
  if(x<-.5)actions.add('left');if(x>.5)actions.add('right')
  if(z<-.5)actions.add('up');if(z>.5)actions.add('down')
  // A soft response near the center gives fine control without reducing the
  // available force at full travel. Menu navigation keeps its linear threshold.
  return {input:{x:Math.sign(x)*x*x,z:Math.sign(z)*z*z,brake:standard&&pressed(3)},actions}
}
/** Button edges prevent held confirm/pause buttons leaking into the next menu. */
export class ControllerActions {
  private held=new Set<ControllerAction>()
  private repeatAt=new Map<ControllerAction,number>()
  reset(held=new Set<ControllerAction>()) {this.held=new Set(held);this.repeatAt.clear()}
  update(held:Set<ControllerAction>,now:number) {
    const fired:ControllerAction[]=[]
    for(const action of held) {
      const navigation=['up','down','left','right'].includes(action)
      if(!this.held.has(action)) {
        fired.push(action)
        if(navigation)this.repeatAt.set(action,now+400)
      } else if(navigation&&now>=(this.repeatAt.get(action)??Infinity)) {
        fired.push(action);this.repeatAt.set(action,now+160)
      }
    }
    for(const action of this.held)if(!held.has(action))this.repeatAt.delete(action)
    this.held=new Set(held)
    return fired
  }
}
