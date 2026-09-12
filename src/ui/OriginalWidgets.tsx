import type {CSSProperties,ReactNode} from 'react'
import data from '../game/original-ui-data.json'
export type SpriteName=keyof typeof data.sprites

/** Browser text and beveled frames retain the menu's character without stretching its 4:3 atlas. */
export function OriginalText({children,scale=[.45,.55],className='',style}:{children:string|number;scale?:readonly number[];className?:string;style?:CSSProperties}) {
  const size=scale[0]!>=.7?'large':scale[0]!<.4?'small':'normal'
  return <span className={`original-text text-${size} ${className}`} style={style}>{children}</span>
}
export function OriginalButton({name,children,onClick,onFocus,disabled=false,selected,compact=false}:{name?:SpriteName;children:ReactNode;onClick:()=>void;onFocus?:()=>void;disabled?:boolean;selected?:boolean;compact?:boolean}) {
  const back=name?.endsWith('Back'),caption=children==='‹'?'Previous level':children==='›'?'Next level':typeof children==='string'?children:undefined
  return <button className={`original-button ${selected?'selected':''} ${compact?'compact':''} ${back?'menu-back':''}`} data-sprite={name} disabled={disabled} onClick={onClick} onFocus={onFocus} aria-label={caption} aria-pressed={selected}>
    {typeof children==='string'?<OriginalText>{children}</OriginalText>:children}
  </button>
}
export function OriginalLabel({name,children,scale=[.35,.4]}:{name:SpriteName;children:string|number;scale?:readonly number[]}) {
  const title=name.endsWith('Title')
  return <div className={`original-label ${title?'menu-title':''}`} data-sprite={name}><OriginalText scale={scale}>{children}</OriginalText></div>
}
export function OriginalHud({points,lives}:{points:number;lives:number}) {
  return <div className="original-hud">
    <div className="original-points" role="status" aria-label={`${points} time points`}>{points}</div>
    <div className="original-lives" aria-label={`${lives} extra lives`}>
      {Array.from({length:Math.max(0,Math.min(10,lives))},(_,index)=><span className="original-life" key={index}/>)}
      {lives>10&&<span className="life-overflow">+{lives-10}</span>}
    </div>
  </div>
}
