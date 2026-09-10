export type OriginalControlAction='forward'|'backward'|'left'|'right'|'rotation'|'overview'
export type OriginalControlSettings={keys:Record<OriginalControlAction,string>;invertRotation:boolean}
export const ORIGINAL_CONTROLS:OriginalControlSettings={keys:{forward:'ArrowUp',backward:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',rotation:'ShiftLeft',overview:'Space'},invertRotation:false}
const names:Record<OriginalControlAction,string>={forward:'arrowup',backward:'arrowdown',left:'arrowleft',right:'arrowright',rotation:'shift',overview:' '}
export function originalControlKey(code:string,settings:OriginalControlSettings) {
  return (Object.keys(names) as OriginalControlAction[]).find(action=>settings.keys[action]===code)
}
export function originalEngineKey(code:string,settings:OriginalControlSettings) {const action=originalControlKey(code,settings);return action?names[action]:undefined}
export function originalKeyLabel(code:string) {
  return ({ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',ShiftLeft:'Left Shift',ShiftRight:'Right Shift',Space:'Space',ControlLeft:'Left Ctrl',ControlRight:'Right Ctrl',AltLeft:'Left Alt',AltRight:'Right Alt',Enter:'Enter',Backspace:'Backspace'} as Record<string,string>)[code]??code.replace(/^(Key|Digit|Numpad)/,'')
}
export function rebindOriginalControl(settings:OriginalControlSettings,action:OriginalControlAction,code:string):OriginalControlSettings {
  if(!code||['Escape','Tab','MetaLeft','MetaRight'].includes(code))return settings
  const previous=settings.keys[action],other=originalControlKey(code,settings)
  return {...settings,keys:{...settings.keys,...(other?{[other]:previous}:{}),[action]:code}}
}
