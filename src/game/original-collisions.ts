import recovered from './original-collision-data.json' with { type: 'json' }

export const ORIGINAL_COLLISIONS = recovered

// IVP's Coll_Group_Ident rejects equal nonempty names, and admits every pair
// containing an empty identifier. Bits are web implementation details; neither
// Floor nor Ball means a special physical category beyond that equality rule.
const bits: Record<string, number> = { Floor: 1, Ball: 4, '': 64, Modul29: 128 }
export function originalCollisionGroups(name: string) {
  const bit = bits[name]
  if (typeof bit !== 'number') throw new Error(`Unknown original collision identifier: ${name}`)
  return (bit << 16) | (name ? 0xffff ^ bit : 0xffff)
}
export const PLAYER_GROUPS = originalCollisionGroups(recovered.players.Ball_Wood)
export const LEVEL_FLOOR_GROUPS = originalCollisionGroups(recovered.floors.Phys_Floors)
export const LEVEL_STOPPER_GROUPS = originalCollisionGroups(recovered.floors.Phys_FloorStopper)
