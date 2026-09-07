import { useEffect, useRef, useState } from 'react'
import { GameEngine } from './game/engine'
import type { GameState, Settings } from './game/engine'
import { levels } from './game/levels'
import './App.css'

type Course = { name: string; difficulty: string; checkpoints: unknown[] }
type Engine = GameEngine | import('./game/original-engine').OriginalEngine
type Panel = 'levels' | 'guide' | 'settings' | null
const initial: GameState = { phase: 'playing', level: 0, lives: 5, time: 240, score: 0, material: 'wood', checkpoint: 0, speed: 0, message: '' }
const defaults: Settings = { sound: false, quality: true, sensitivity: 1 }
function readStored<T,>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage is optional. */ } }
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <path d="M4 12h15M13 5l7 7-7 7" />,
    sound: <path d="M11 5 6 9H3v6h3l5 4zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16" />,
    muted: <path d="M11 5 6 9H3v6h3l5 4zM16 9l6 6m0-6-6 6" />,
    settings: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="16" cy="17" r="3" /></>,
    pause: <path d="M8 5v14M16 5v14" />,
    restart: <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    expand: <path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    flag: <path d="M5 21V3c5-4 9 4 14 0v10c-5 4-9-4-14 0" />,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 4M12 17h.01" /></>,
    courses: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
export default function App() {
  const container = useRef<HTMLDivElement>(null), engine = useRef<Engine | null>(null)
  const [courses, setCourses] = useState<Course[]>(levels), [original, setOriginal] = useState(false), [loading, setLoading] = useState(true)
  const [state, setState] = useState(initial), [panel, setPanel] = useState<Panel>(null), [error, setError] = useState('')
  const [settings, setSettings] = useState(() => ({ ...defaults, ...readStored<Settings>('ballance-settings', defaults) }))
  const settingsRef = useRef(settings)
  const [records, setRecords] = useState<Record<string, number>>(() => readStored('ballance-records', {}))
  useEffect(() => {
    let game: Engine | undefined, active = true, previousPhase = 'menu', recordKey = 'ballance-records', closeInspector: (() => void) | undefined
    const update = (next: GameState) => {
      if (!active) return
      setState(next)
      if (next.phase === 'won' && previousPhase !== 'won' && !new URLSearchParams(location.search).has('inspect')) setRecords(previous => {
        const records = { ...previous, [next.level]: Math.max(previous[next.level] || 0, next.score) }
        save(recordKey, records); return records
      })
      previousPhase = next.phase
    }
    void (async () => {
      const response = await fetch('/original/manifest.json').catch(() => null)
      const manifest = response?.ok && response.headers.get('content-type')?.includes('application/json') ? await response.json() : null
      if (!active) return
      if (manifest) {
        recordKey = 'ballance-original-records'; setRecords(readStored(recordKey, {}))
        const { OriginalEngine } = await import('./game/original-engine')
        if (!active) return
        const imported = new OriginalEngine(container.current!, update); game = imported
        await imported.initialize()
        if (!active) return
        setCourses(manifest.levels); setOriginal(true)
        if (import.meta.env.DEV && new URLSearchParams(location.search).has('inspect')) {
          const { inspectOriginal } = await import('./game/original-inspector')
          if (!active) return
          closeInspector = inspectOriginal(imported)
        }
      } else game = new GameEngine(container.current!, update)
      if (!active || !game) return
      engine.current = game; game.setSettings(settingsRef.current); game.start(); setLoading(false)
    })().catch(e => { if (active) { setLoading(false); setError(e instanceof Error ? e.message : 'Game could not start.') } })
    return () => { active = false; closeInspector?.(); game?.destroy(); engine.current = null }
  }, [])
  useEffect(() => { settingsRef.current = settings; engine.current?.setSettings(settings); save('ballance-settings', settings) }, [settings])
  const busy = loading || state.message === 'Loading…'
  const modalOpen = !!panel || ['paused', 'won', 'lost'].includes(state.phase)
  useEffect(() => {
    if (!modalOpen) return
    const dialog = document.querySelector<HTMLElement>('.dialog'), before = document.activeElement as HTMLElement | null
    dialog?.focus()
    const key = (e: KeyboardEvent) => {
      if (panel && e.key === 'Escape') { e.stopImmediatePropagation(); setPanel(null) }
      if (e.key === 'Tab') {
        const items = dialog?.querySelectorAll<HTMLElement>('button, input, a[href]')
        if (!items?.length) return
        const first = items[0]!, last = items[items.length - 1]!
        if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); before?.focus() }
  }, [panel, modalOpen])
  const openPanel = (next: Panel) => { if (engine.current?.state.phase === 'playing') engine.current.pause(); setPanel(next) }
  const play = (index = state.level) => { setPanel(null); engine.current?.start(index) }
  const fullScreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() } catch { engine.current?.message('Fullscreen unavailable') } }
  const time = `${Math.floor(state.time / 60).toString().padStart(2, '0')}:${Math.floor(state.time % 60).toString().padStart(2, '0')}`
  const level = courses[state.level]!
  return <main className="app">
    <div className="game-canvas" ref={container} />
    <div className="vignette" aria-hidden="true" />
    <header className="hud-top">
      <div className="stats"><span className={`timer ${state.time < 30 ? 'urgent' : ''}`} aria-label={`Time remaining ${time}`}><Icon name="clock" size={16} />{time}</span><span className="score" aria-label={`${state.score} points`}><i />{state.score.toString().padStart(4, '0')}</span><div className="lives" aria-label={`${state.lives} lives remaining`}>{Array.from({ length: Math.max(original ? 3 : 5, state.lives) }, (_, i) => <i key={i} className={i < state.lives ? 'alive' : ''} />)}</div></div>
      <div className="hud-buttons"><button className="icon-button" title="Sound" aria-label={settings.sound ? 'Mute sound' : 'Enable sound'} onClick={() => setSettings({ ...settings, sound: !settings.sound })}><Icon name={settings.sound ? 'sound' : 'muted'} /></button><button className="icon-button" aria-label="Pause game" title="Pause (Esc)" onClick={() => engine.current?.pause()}><Icon name="pause" /></button></div>
    </header>
    <div className="hud-bottom"><div className="ball-status" aria-label={`${state.material} ball`}><span className={`ball-swatch ${state.material}`} /><div className="speed-meter" title="Rolling speed"><div style={{ height: `${Math.min(state.speed / 5.6, 1) * 100}%` }} /></div><span className="checkpoint-count" aria-label={`${state.checkpoint} of ${level.checkpoints.length} checkpoints`}><Icon name="flag" size={15} />{state.checkpoint}/{level.checkpoints.length}</span></div><div className="hud-buttons"><button className="icon-button" aria-label="How to play" title="Controls" onClick={() => openPanel('guide')}><Icon name="help" size={19} /></button><button className="icon-button" aria-label="Choose course" title="Courses" onClick={() => openPanel('levels')}><Icon name="courses" size={17} /></button><button className="icon-button" aria-label="Toggle fullscreen" title="Fullscreen" onClick={() => void fullScreen()}><Icon name="expand" size={18} /></button></div></div>
    {state.message && state.phase === 'playing' && <div className="toast" role="status">{state.message}</div>}
    <div className="touch-controls" aria-label="Touch controls"><div className="dpad">{[{ label: '↑', x: 0, z: -1, cls: 'up' }, { label: '←', x: -1, z: 0, cls: 'left' }, { label: '↓', x: 0, z: 1, cls: 'down' }, { label: '→', x: 1, z: 0, cls: 'right' }].map(d => <button key={d.cls} className={d.cls} aria-label={`Roll ${d.cls}`} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); if (engine.current) Object.assign(engine.current.touch, { x: d.x, z: d.z }) }} onPointerUp={() => { if (engine.current) Object.assign(engine.current.touch, { x: 0, z: 0 }) }} onPointerCancel={() => { if (engine.current) Object.assign(engine.current.touch, { x: 0, z: 0 }) }}>{d.label}</button>)}</div><button className="touch-brake" onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); if (engine.current) engine.current.touch.brake = true }} onPointerUp={() => { if (engine.current) engine.current.touch.brake = false }} onPointerCancel={() => { if (engine.current) engine.current.touch.brake = false }}>{original ? 'VIEW' : 'BRAKE'}</button></div>
    {!busy && modalOpen && <div className="modal-backdrop"><section className={`dialog ${panel === 'levels' ? 'courses-dialog' : ''}`} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      {panel && <button className="icon-button close-dialog" aria-label="Close dialog" onClick={() => setPanel(null)}><Icon name="close" /></button>}
      <h1 id="dialog-title">{panel === 'levels' ? 'Courses' : panel === 'guide' ? 'Controls' : panel === 'settings' ? 'Settings' : state.phase === 'paused' ? 'Paused' : state.phase === 'won' ? 'Course complete' : 'Game over'}</h1>
      {!panel && <><p className="result-info">{state.phase === 'paused' ? (state.message || level.name) : state.phase === 'won' ? `${state.score.toLocaleString()} points` : state.lives ? 'Time’s up' : 'No lives remaining'}</p><div className="menu-buttons"><button className="primary" onClick={() => state.phase === 'paused' ? engine.current?.pause() : state.phase === 'won' && state.level < courses.length - 1 ? play(state.level + 1) : play()}>{state.phase === 'paused' ? 'Resume' : state.phase === 'won' && state.level < courses.length - 1 ? 'Next course' : 'Play again'}<Icon name="arrow" /></button>{state.phase === 'paused' && <button onClick={() => play()}>Restart <Icon name="restart" size={17} /></button>}<button onClick={() => setPanel('levels')}>Courses<Icon name="courses" size={17} /></button><button onClick={() => setPanel('settings')}>Settings<Icon name="settings" size={17} /></button></div></>}
      {panel === 'levels' && <div className="course-list">{courses.map((l, i) => <button key={l.name} onClick={() => play(i)} className="course-option"><span className="option-number">{String(i + 1).padStart(2, '0')}</span><div><h2>{l.name}</h2><p>{l.difficulty}{records[i] ? ` · Best ${records[i]}` : ''}</p></div><Icon name="arrow" size={18} /></button>)}</div>}
      {panel === 'guide' && <><div className="guide-controls"><span><kbd>W A S D</kbd> / <kbd>↑ ← ↓ →</kbd><b>Roll</b></span><span><kbd>SPACE</kbd><b>{original ? 'Raise camera' : 'Brake'}</b></span><span><kbd>{original ? 'SHIFT + ← / →' : 'Q / E'}</kbd><b>Rotate camera</b></span><span><kbd>ESC</kbd> / <kbd>R</kbd><b>Pause / restart</b></span></div><div className="material-guide">{[{ name: 'wood', text: original ? 'Balanced weight and grip.' : 'Balanced. Required to enter the finish portal.' }, { name: 'stone', text: original ? 'Heavy. Pushes loose balls and crates.' : 'Heavy. Pushes blocks, breaks fragile planks.' }, { name: 'paper', text: 'Light. Crosses fragile bridges and rides updrafts.' }].map(m => <div key={m.name}><span className={`ball-swatch ${m.name}`} /><p><strong>{m.name}</strong>{m.text}</p></div>)}</div><p className="guide-note">{original ? 'Transformers change the ball. Checkpoints save progress. Collect the silver trails from golden extras for 220 time points.' : 'Pads transform the ball. Rings save checkpoints. Golden lights add 50 points and 10 seconds.'}</p></>}
      {panel === 'settings' && <><div className="setting-row"><span>Sound</span><button className={`toggle ${settings.sound ? 'on' : ''}`} role="switch" aria-checked={settings.sound} aria-label="Sound" onClick={() => setSettings({ ...settings, sound: !settings.sound })}><span /></button></div><div className="setting-row"><span>High quality</span><button className={`toggle ${settings.quality ? 'on' : ''}`} role="switch" aria-checked={settings.quality} aria-label="High quality" onClick={() => setSettings({ ...settings, quality: !settings.quality })}><span /></button></div><div className="setting-row"><label htmlFor="steering">Steering</label><input id="steering" type="range" min="0.6" max="1.4" step="0.1" value={settings.sensitivity} onChange={e => setSettings({ ...settings, sensitivity: Number(e.target.value) })} /><span>{Math.round(settings.sensitivity * 100)}%</span></div></>}
    </section></div>}
    {busy && <div className="loading-indicator" role="status">Loading…</div>}
    {error && <div className="modal-backdrop"><section className="dialog" role="alert"><h1>Unable to load game</h1><pre>{error}</pre><button className="primary" onClick={() => location.reload()}>Retry<Icon name="restart" /></button></section></div>}
  </main>
}
