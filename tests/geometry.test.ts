import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bridgeSpans } from '../src/game/geometry.ts'
import { levels } from '../src/game/levels.ts'

test('opening bridge stops flush at the stone decks on both ends', () => {
  const level = levels[0]!, bridge = level.surfaces[1]!
  assert.deepEqual(bridgeSpans(bridge, level.surfaces), [[-3, 3.5]])
})
test('all flat bridge decks exclude coplanar stone intersections', () => {
  for (const level of levels) for (const bridge of level.surfaces) {
    if (!['wood', 'fragile'].includes(bridge.kind) || bridge.endY !== undefined) continue
    const alongX = bridge.w > bridge.d
    for (const [start, end] of bridgeSpans(bridge, level.surfaces)) {
      for (let t = start + 0.001; t < end; t += 0.05) {
        const x = bridge.x + (alongX ? t : 0), z = bridge.z + (alongX ? 0 : t)
        assert.ok(!level.surfaces.some(deck => deck.kind === 'stone' && deck.y === bridge.y && Math.abs(x - deck.x) < deck.w / 2 - 0.0001 && Math.abs(z - deck.z) < deck.d / 2 - 0.0001), `${level.name}: overlapping bridge deck at ${x}, ${z}`)
      }
    }
  }
})
test('sloped bridges retain their complete incline geometry', () => {
  const level = levels[0]!, ramp = level.surfaces[5]!, half = Math.hypot(8, 2) / 2
  assert.deepEqual(bridgeSpans(ramp, level.surfaces), [[-half, half]])
})
