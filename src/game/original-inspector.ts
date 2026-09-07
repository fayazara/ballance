import { OriginalEngine } from './original-engine'
import { originalPosition } from './original-data'
import type { Material } from './levels'

// Explicit local test route only. No test controls are included in normal gameplay.
export function inspectOriginal(engine: OriginalEngine) {
  const panel = document.createElement('aside')
  panel.setAttribute('aria-label', 'Original game test controls')
  panel.style.cssText = 'position:fixed;top:100px;left:20px;z-index:30;padding:12px;background:#fffe;color:#222;max-width:420px;font:12px monospace;border-radius:8px'
  const output = document.createElement('output'); output.style.cssText = 'display:block;white-space:pre-wrap;margin-bottom:8px'; panel.append(output)
  const button = (label: string, action: () => void) => { const b = document.createElement('button'); b.textContent = label; b.style.cssText = 'padding:7px;border:1px solid #888;margin:3px;font:11px monospace'; b.onclick = () => { action(); update() }; panel.append(b) }
  const update = () => {
    const p = engine.body?.translation()
    output.textContent = JSON.stringify({ phase: engine.state.phase, level: engine.state.level + 1, loading: engine.loading, position: p && [p.x, p.y, p.z].map(n => Number(n.toFixed(3))), speed: Number(engine.state.speed.toFixed(3)), material: engine.state.material, checkpoint: engine.state.checkpoint, lives: engine.state.lives, points: engine.state.score, pendingPoints: engine.pendingPoints.length, audio: [...engine.audio.tracks].map(([name, audio]) => ({ name, playing: !audio.paused, ready: audio.readyState, error: audio.error?.code })) }, null, 1)
  }
  const run = (seconds: number, direction = 0) => {
    if (engine.loading || !engine.body) return
    engine.state.phase = 'playing'; engine.touch.z = direction
    for (let i = 0; i < seconds * 120 && engine.state.phase === 'playing'; i++) engine.step(1 / 120)
    engine.touch.z = 0; if (engine.state.phase === 'playing') engine.state.phase = 'paused'; engine.emit()
  }
  button('Settle 2 seconds', () => run(2))
  button('Roll forward 2 seconds', () => run(2, -1))
  button('Roll backward 3 seconds', () => run(3, 1))
  button('Respawn', () => engine.respawn())
  button('Force fall', () => { const p = engine.body!.translation(); engine.body!.setTranslation({ ...p, y: p.y - 80 }, true); run(.1) })
  button('Next checkpoint', () => { const point = engine.checkpoints[engine.state.checkpoint]?.position; if (!point) return; engine.body!.setTranslation({ x: point.x, y: point.y + .7, z: point.z }, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); run(.1) })
  button('First extra', () => { const point = engine.pickups.find(p => p.object.name.includes('Point') && !p.taken)?.position; if (!point) return; engine.body!.setTranslation(point, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); run(1.8) })
  button('Stone transformer', () => { const pad = engine.pads.find(p => p.object.name.includes('Stone')); if (!pad) return; const p = originalPosition(pad.object); engine.body!.setTranslation({ x: p.x, y: p.y + .8, z: p.z }, true); engine.body!.setLinvel({ x: 0, y: 0, z: 0 }, true); engine.padCooldown = 0; run(.2) })
  for (const kind of ['wood', 'stone', 'paper'] as Material[]) button(kind, () => engine.transform(kind))
  button('Finish trigger', () => { if (!engine.finish) return; engine.state.checkpoint = engine.checkpoints.length; const p = engine.finish.position; engine.body!.setTranslation({ x: p.x, y: p.y + 1, z: p.z }, true); run(.1) })
  document.body.append(panel); const interval = window.setInterval(update, 200)
  return () => { clearInterval(interval); panel.remove() }
}
