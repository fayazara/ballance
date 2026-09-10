import {useEffect,useRef,useState} from 'react'
import type {GameState,Settings} from './game/engine'
import type {OriginalEngine} from './game/original-engine'
import {ORIGINAL_CONTROLS,originalKeyLabel,rebindOriginalControl,type OriginalControlAction,type OriginalControlSettings} from './controls/original-controls'
import {OriginalButton as Button,OriginalLabel as Label,OriginalText as Text,OriginalHud,type SpriteName} from './ui/OriginalWidgets'
import {OriginalMenuBackdrop} from './ui/OriginalMenuBackdrop'
import ui from './game/original-ui-data.json'
import './App.css'

type Panel='main'|'levels'|'pause'|'options'|'graphics'|'controls'|'sound'|'credits'|'highscore'|'score'|'confirm'|'name'|null
type Score={Playername:string;Points:number}
const initial:GameState={phase:'menu',level:0,lives:3,time:500,score:1000,material:'wood',checkpoint:0,speed:0,message:''}
function read<T,>(key:string,fallback:T):T {try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}}
function save(key:string,value:unknown){try{localStorage.setItem(key,JSON.stringify(value))}catch{/* Storage may be unavailable. */}}
const label=(index:number)=>ui.labels[index]!.trim()
export default function App() {
  const host=useRef<HTMLDivElement>(null),engine=useRef<OriginalEngine|null>(null)
  const [state,setState]=useState(initial),[panel,setPanel]=useState<Panel>('main'),[busy,setBusy]=useState(true),[error,setError]=useState('')
  const [inCourse,setInCourse]=useState(false),[returnTo,setReturnTo]=useState<Panel>('main')
  const [controls,setControls]=useState<OriginalControlSettings>(()=>read('ballance-original-controls',ORIGINAL_CONTROLS))
  const [binding,setBinding]=useState<OriginalControlAction|null>(null)
  const [volume,setVolume]=useState(()=>read('ballance-original-volume',1))
  const [quality,setQuality]=useState(()=>read('ballance-original-resolution',2))
  const [scoreLevel,setScoreLevel]=useState(0),[playerName,setPlayerName]=useState(()=>read('ballance-original-player-name',''))
  const [scores,setScores]=useState<Score[][]>(()=>read('ballance-original-highscores',ui.highscores))
  const [confirmation,setConfirmation]=useState<'restart'|'home'|'quit'>('restart')
  const dialog=useRef<HTMLDivElement>(null),latest=useRef({controls,volume,quality})
  useEffect(()=>{latest.current={controls,volume,quality}},[controls,volume,quality])
  useEffect(()=> {
    let cancelled=false,game:OriginalEngine|undefined,closeInspector:(()=>void)|undefined
    void (async()=> {
      const {OriginalEngine}=await import('./game/original-engine')
      if(cancelled)return
      const native=new URLSearchParams(location.search).get('physics')!=='rapier'
      game=new OriginalEngine(host.current!,next=>{
        if(cancelled)return
        setState({...next})
        // The engine temporarily pauses simulation while it builds a level.
        // Only a player pause may open the pause menu.
        if(next.phase==='paused'&&game&&!game.loading)setPanel(current=>current??'pause')
        if(next.phase==='playing')setPanel(current=>current==='pause'?null:current)
        if(next.phase==='won'||next.phase==='lost')setPanel(current=>current??'score')
      },native)
      await game.initialize();if(cancelled)return
      engine.current=game
      const current=latest.current
      game.setControls(current.controls);game.setSettings({sound:true,quality:current.quality===2,sensitivity:1});game.audio.volume=current.volume
      game.state.phase='menu';game.emit();setBusy(false)
      if(import.meta.env.DEV&&new URLSearchParams(location.search).get('inspect')==='tools') {
        await game.load(0);setPanel(null);setInCourse(true)
        const {inspectOriginal}=native?await import('./game/original-ivp-inspector'):await import('./game/original-inspector')
        if(cancelled)return
        closeInspector=inspectOriginal(game)
      }
    })().catch(e=>{if(!cancelled){setError(String(e));setBusy(false)}})
    return ()=>{cancelled=true;closeInspector?.();game?.destroy();engine.current=null}
  },[])
  useEffect(()=>{engine.current?.setControls(controls);save('ballance-original-controls',controls)},[controls])
  useEffect(()=>{const game=engine.current;if(game){game.audio.volume=volume;game.audio.sync()}save('ballance-original-volume',volume)},[volume])
  useEffect(()=>{const game=engine.current;if(game){const settings:Settings={sound:true,quality:quality===2,sensitivity:1};game.setSettings(settings)}save('ballance-original-resolution',quality)},[quality])
  const sound=(name='Menu_click')=>{engine.current?.unlock();engine.current?.audio.effect(name)}
  const navigate=(next:Panel)=>{sound();setPanel(next)}
  const play=async(index=state.level)=> {
    const game=engine.current;if(!game)return
    sound('Menu_load');setPanel(null);setBusy(true);setInCourse(true)
    try{await game.load(index)}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const resume=()=>{sound();setPanel(null);if(engine.current?.state.phase==='paused')engine.current.pause()}
  const home=()=>{const game=engine.current;if(game){game.state.phase='menu';game.keys.clear();game.audio.paused=true;game.audio.sync();game.emit()}setInCourse(false);setPanel('main')}
  const back=()=> {
    if(binding){setBinding(null);return}
    if(panel==='pause'){resume();return}
    if(['graphics','controls','sound'].includes(panel??'')){navigate('options');return}
    if(panel==='options'||panel==='highscore'||panel==='credits'){navigate(returnTo);return}
    if(panel==='confirm'){navigate(inCourse?'pause':'main');return}
    navigate('main')
  }
  useEffect(()=> {
    if(!panel)return
    const root=dialog.current
    const key=(e:KeyboardEvent)=> {
      if(binding) {
        e.preventDefault();e.stopImmediatePropagation()
        if(e.code==='Escape'){setBinding(null);return}
        const updated=rebindOriginalControl(controls,binding,e.code)
        if(updated!==controls){setControls(updated);setBinding(null);sound()}
        return
      }
      if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(panel!=='main')back();return}
      if((e.target as HTMLElement).tagName==='INPUT')return
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Enter','Space'].includes(e.code))e.stopImmediatePropagation()
      if(['ArrowUp','ArrowDown','Tab'].includes(e.code)) {
        e.preventDefault();const items=[...root!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const current=items.indexOf(document.activeElement as HTMLButtonElement),delta=e.code==='ArrowUp'||e.shiftKey?-1:1
        items[(current+delta+items.length)%items.length]?.focus();sound('Menu_dong')
      }
    }
    window.addEventListener('keydown',key,true)
    return ()=>window.removeEventListener('keydown',key,true)
  })
  useEffect(()=>{
    if(panel&&!busy)dialog.current?.querySelector<HTMLElement>('input:not([type=range]),button:not(:disabled)')?.focus({preventScroll:true})
  },[panel,busy])
  const options=()=>{setReturnTo(inCourse?'pause':'main');navigate('options')}
  const highscore=()=>{setScoreLevel(state.level);setReturnTo(inCourse?'pause':'main');navigate('highscore')}
  const ask=(action:typeof confirmation)=>{setConfirmation(action);navigate('confirm')}
  const completeScore=()=> {
    if(state.phase==='won'&&state.score>(scores[state.level]?.[9]?.Points??0)){navigate('name');return}
    if(state.phase==='won'&&state.level<11)void play(state.level+1);else home()
  }
  const submitScore=()=> {
    const name=playerName.trim();if(!name)return
    const next=scores.map((rows,index)=>index===state.level?[...rows,{Playername:name,Points:state.score}].sort((a,b)=>b.Points-a.Points).slice(0,10):rows)
    setScores(next);save('ballance-original-highscores',next);save('ballance-original-player-name',name)
    if(state.level<11)void play(state.level+1);else home()
  }
  const menuBackground=!!panel&&!inCourse
  const points=Math.max(0,Math.floor(state.time*2))
  return <main className="original-app">
    <div className="game-canvas" ref={host}/>
    {menuBackground&&<OriginalMenuBackdrop/>}
    {!panel&&!busy&&<OriginalHud points={points} lives={state.lives}/>}
    {panel&&!busy&&<div className={`original-menu ${inCourse?'over-course':''}`} data-panel={panel} role="dialog" aria-modal="true" aria-label={panel==='main'?'Main menu':panel==='pause'?'Pause menu':panel} ref={dialog}><div className="menu-content">
      {panel==='main'&&<>
        {<Button key={'M_Main_But_1'} name={'M_Main_But_1'} onClick={()=>navigate('levels')} compact={false}>{label(0)}</Button>}{<Button key={'M_Main_But_2'} name={'M_Main_But_2'} onClick={highscore} compact={false}>{label(1)}</Button>}{<Button key={'M_Main_But_3'} name={'M_Main_But_3'} onClick={options} compact={false}>{label(2)}</Button>}{<Button key={'M_Main_But_4'} name={'M_Main_But_4'} onClick={()=>{setReturnTo('main');navigate('credits')}} compact={false}>{label(4)}</Button>}{<Button key={'M_Main_But_5'} name={'M_Main_But_5'} onClick={()=>ask('quit')} compact={false}>{label(3)}</Button>}
      </>}
      {panel==='levels'&&<>{Array.from({length:12},(_,i)=><Button key={`M_Start_But_${String(i+1).padStart(2,'0')}` as SpriteName} name={`M_Start_But_${String(i+1).padStart(2,'0')}` as SpriteName} onClick={()=>void play(i)} compact={true}>{`Level ${i+1}`}</Button>)}{<Button key={'M_Start_But_Back'} name={'M_Start_But_Back'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='pause'&&<>{<Button key={'M_Pause_But_1'} name={'M_Pause_But_1'} onClick={()=>ask('restart')} compact={false}>{label(17)}</Button>}{<Button key={'M_Pause_But_2'} name={'M_Pause_But_2'} onClick={()=>ask('home')} compact={false}>{label(18)}</Button>}{<Button key={'M_Pause_But_3'} name={'M_Pause_But_3'} onClick={highscore} compact={false}>{label(1)}</Button>}{<Button key={'M_Pause_But_4'} name={'M_Pause_But_4'} onClick={options} compact={false}>{label(2)}</Button>}{<Button key={'M_Pause_But_Back'} name={'M_Pause_But_Back'} onClick={resume} compact={false}>{label(15)}</Button>}</>}
      {panel==='options'&&<><Label name="M_Options_Title" scale={[.7,.8]}>{label(28)}</Label>{<Button key={'M_Options_But_1'} name={'M_Options_But_1'} onClick={()=>navigate('graphics')} compact={false}>{label(29)}</Button>}{<Button key={'M_Options_But_2'} name={'M_Options_But_2'} onClick={()=>navigate('controls')} compact={false}>{label(30)}</Button>}{<Button key={'M_Options_But_3'} name={'M_Options_But_3'} onClick={()=>navigate('sound')} compact={false}>{label(31)}</Button>}{<Button key={'M_Options_But_Back'} name={'M_Options_But_Back'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='controls'&&<>
        <Label name="M_Opt_Keys_Title" scale={[.7,.8]}>{label(30)}</Label>
        {(['forward','backward','left','right','rotation','overview'] as const).map((action,i)=><div className="setting-row" key={action}><Label name={`M_Opt_Keys_Key${i+1}` as SpriteName}>{label([37,38,39,40,42,41][i]!)}</Label>{<Button key={`M_Opt_Keys_Field${i+1}` as SpriteName} name={`M_Opt_Keys_Field${i+1}` as SpriteName} onClick={()=>{sound();setBinding(action)}} compact={true}>{binding===action?'...':originalKeyLabel(controls.keys[action])}</Button>}</div>)}
        <div className="setting-row"><Label name="M_Opt_Keys_Inv_Field">{label(43)}</Label>
        <div className="setting-choice"><Button name="M_Opt_Keys_Inv_Yes" selected={controls.invertRotation} compact onClick={()=>setControls({...controls,invertRotation:true})}>{label(34)}</Button><Button name="M_Opt_Keys_Inv_No" selected={!controls.invertRotation} compact onClick={()=>setControls({...controls,invertRotation:false})}>{label(35)}</Button></div></div>
        {<Button key={'M_Opt_Keys_But_Back'} name={'M_Opt_Keys_But_Back'} onClick={back} compact={false}>{label(15)}</Button>}
      </>}
      {panel==='sound'&&<><Label name="M_Opt_Sound_Title" scale={[.7,.8]}>{label(31)}</Label><div className="setting-row"><Label name="M_Opt_Sound_VolText">{label(44)}</Label><div className="original-volume"><input aria-label="Music volume" type="range" min="0" max="1" step="0.1" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><output>{Math.round(volume*100)}%</output></div></div>{<Button key={'M_Opt_Sound_But_Back'} name={'M_Opt_Sound_But_Back'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='graphics'&&<><Label name="M_Opt_Graph_Title" scale={[.7,.8]}>{label(29)}</Label><div className="setting-row"><Label name="M_Opt_Gra_ResText">Detail</Label><div className="setting-choice"><Button name="M_Opt_Gra_ResButLeft" selected={quality===0} onClick={()=>setQuality(0)} compact>Low</Button><Button name="M_Opt_Gra_ResButRight" selected={quality===2} onClick={()=>setQuality(2)} compact>High</Button></div></div>{<Button key={'M_Opt_Gra_Back'} name={'M_Opt_Gra_Back'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='highscore'&&<><Label name="M_Highscore_Title" scale={[.7,.8]}>{label(51)+' '+(scoreLevel+1)}</Label>{scores[scoreLevel]!.map((row,i)=><div className="highscore-row" key={i}><Label name={`M_Highscore_Number${String(i+1).padStart(2,'0')}` as SpriteName} scale={[.6,.6]}>{i+1}</Label><div className="original-score-row"><Text scale={[.6,.6]}>{row.Playername}</Text><Text scale={[.6,.6]}>{row.Points}</Text></div></div>)}<div className="highscore-navigation">{<Button key={'M_Highscore_But_1'} name={'M_Highscore_But_1'} onClick={()=>setScoreLevel((scoreLevel+11)%12)} compact={false}>{'‹'}</Button>}{<Button key={'M_Highscore_But_2'} name={'M_Highscore_But_2'} onClick={()=>setScoreLevel((scoreLevel+1)%12)} compact={false}>{'›'}</Button>}</div>{<Button key={'M_Highscore_But_Back'} name={'M_Highscore_But_Back'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='credits'&&<><div className="original-credits">{ui.credits.map((row,i)=><div key={i}>{row['Title Strings'].split('\n').filter(Boolean).map((line,j)=><Text key={j} scale={[.6,.7]}>{line}</Text>)}{row['Text Strings'].split('\n').filter(Boolean).map((line,j)=><Text key={j} scale={[.3,.35]}>{line}</Text>)}</div>)}</div>{<Button key={'M_Credits_But_Back'} name={'M_Credits_But_Back'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='confirm'&&<><Label name="M_YesNo_TextSprite">{label(confirmation==='restart'?21:confirmation==='home'?22:23)}</Label>{<Button key={'M_YesNo_But_Yes'} name={'M_YesNo_But_Yes'} onClick={()=>{if(confirmation==='restart')void play();else if(confirmation==='home')home();else location.assign('about:blank')}} compact={false}>{label(19)}</Button>}{<Button key={'M_YesNo_But_No'} name={'M_YesNo_But_No'} onClick={back} compact={false}>{label(15)}</Button>}</>}
      {panel==='score'&&<><div className="original-score-heading"><Text scale={[.7,.8]}>{state.phase==='won'?`Level ${state.level+1}`:'Game Over'}</Text></div>{[label(45),label(46),label(47),label(48)].map((text,i)=><div className="setting-row" key={i}><Label name={`M_Score_Text${i+1}` as SpriteName}>{text}</Label><Label name={`M_Score_Score${i+1}` as SpriteName}>{state.phase==='won'?[(state.level+1)*100,points,state.lives*200,state.score][i]!:i===3?0:0}</Label></div>)}{<Button key={'M_Dead_But_1'} name={'M_Dead_But_1'} onClick={()=>state.phase==='won'?completeScore():void play()} compact={false}>{state.phase==='won'?label(25):label(17)}</Button>}{<Button key={'M_Dead_But_2'} name={'M_Dead_But_2'} onClick={home} compact={false}>{label(24)}</Button>}</>}
      {panel==='name'&&<><Label name="M_HighEntry_Title" scale={[.7,.8]}>{label(27)}</Label><Label name="M_HighEntry_Score">{`${label(26)}: ${state.score}`}</Label><input className="original-name-entry" aria-label="Player name" value={playerName} maxLength={20} onChange={e=>setPlayerName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitScore()}} autoFocus/>{<Button key={'M_HighEntry_But_1'} name={'M_HighEntry_But_1'} onClick={submitScore} compact={false}>{label(19)}</Button>}</>}
    </div></div>}
    {busy&&<div className="original-loading" role="status" aria-label="Loading"><div className="loading-track"><span/></div></div>}
    {error&&<div className="original-error" role="alert"><p>{error}</p><button onClick={()=>location.reload()}>Retry</button></div>}
  </main>
}
