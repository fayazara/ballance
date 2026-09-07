import type { Surface } from './levels.ts'
export type Span = [number, number]

/** Visible bridge lengths in local coordinates, excluding coplanar stone decks. */
export function bridgeSpans(bridge: Surface, surfaces: Surface[]): Span[] {
  const alongX = bridge.w > bridge.d
  const length = alongX ? bridge.w : bridge.d
  if (bridge.endY !== undefined && bridge.endY !== bridge.y) {
    return [[-Math.hypot(length, bridge.endY - bridge.y) / 2, Math.hypot(length, bridge.endY - bridge.y) / 2]]
  }
  let spans: Span[] = [[-length / 2, length / 2]]
  const center = alongX ? bridge.x : bridge.z
  const crossCenter = alongX ? bridge.z : bridge.x
  const crossWidth = alongX ? bridge.d : bridge.w
  for (const deck of surfaces) {
    if (deck.kind !== 'stone' || Math.abs(deck.y - bridge.y) > 0.001) continue
    const deckCross = alongX ? deck.z : deck.x, deckCrossWidth = alongX ? deck.d : deck.w
    if (Math.abs(crossCenter - deckCross) + crossWidth / 2 > deckCrossWidth / 2 + 0.001) continue
    const deckCenter = alongX ? deck.x : deck.z, deckLength = alongX ? deck.w : deck.d
    const cutStart = deckCenter - deckLength / 2 - center, cutEnd = deckCenter + deckLength / 2 - center
    spans = spans.flatMap(([start, end]): Span[] => {
      if (cutEnd <= start || cutStart >= end) return [[start, end]]
      const remaining: Span[] = []
      if (cutStart > start) remaining.push([start, cutStart])
      if (cutEnd < end) remaining.push([cutEnd, end])
      return remaining
    })
  }
  return spans
}
