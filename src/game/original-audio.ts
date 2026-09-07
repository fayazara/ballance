import type { Material } from './levels'
export class OriginalAudio {
  enabled = false; unlocked = false; paused = true
  tracks = new Map<string, HTMLAudioElement>()
  get(name: string, loop = false) {
    if (!this.tracks.has(name)) { const a = new Audio(`/original/audio/${name}.ogg`); a.loop = loop; a.volume = loop ? 0.18 : 0.55; this.tracks.set(name, a) }
    return this.tracks.get(name)!
  }
  unlock() { this.unlocked = true; this.sync() }
  sync() {
    for (const a of this.tracks.values()) if (!this.enabled || this.paused) a.pause()
    if (this.enabled && this.unlocked && !this.paused) {
      for (const name of ['Music_Theme_1_1', 'Music_Atmo_1']) void this.get(name, true).play().catch(() => {})
    }
  }
  effect(name: string) { if (this.enabled && this.unlocked) { const a = this.get(name); a.currentTime = 0; void a.play().catch(() => {}) } }
  stop(name: string) { const a = this.tracks.get(name); if (a) { a.pause(); a.currentTime = 0 } }
  resumeEffect(name: string) { const a = this.tracks.get(name); if (a && !a.ended && this.enabled && this.unlocked && !this.paused) void a.play().catch(() => {}) }
  fan(distance: number) {
    if (!Number.isFinite(distance)) { this.stop('Misc_Ventilator'); return }
    const a = this.get('Misc_Ventilator', true)
    if (!this.enabled || !this.unlocked || this.paused || distance >= 20) { a.pause(); return }
    a.volume = .35 * Math.max(0, 1 - distance / 20) ** 2
    if (a.paused) void a.play().catch(() => {})
  }
  roll(material: Material, speed: number, grounded: boolean, surface: 'Stone' | 'Wood' | 'Metal' = 'Stone') {
    const name = material === 'paper' ? 'Roll_Paper' : `Roll_${material === 'wood' ? 'Wood' : 'Stone'}_${surface}`
    for (const [key, a] of this.tracks) if (key.startsWith('Roll_') && key !== name) a.pause()
    const a = this.get(name, true)
    if (!this.enabled || !this.unlocked || this.paused || !grounded || speed < .15) { a.pause(); return }
    a.volume = Math.min(speed / 9, .28); a.playbackRate = .8 + Math.min(speed / 12, .6); if (a.paused) void a.play().catch(() => {})
  }
  dispose() { for (const a of this.tracks.values()) { a.pause(); a.removeAttribute('src'); a.load() } this.tracks.clear() }
}
