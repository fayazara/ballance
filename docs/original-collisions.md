# Original collision identifiers

The runtime now uses one mapping for the original no-collision identifiers. Equal **nonempty** identifiers exclude collision; an empty identifier collides with every identifier, including another empty one. The words `Floor` and `Ball` are exclusion names, not rules about which shapes may touch.

This rule is visible in [IVP's collision filter](https://github.com/doyaGu/ivp/blob/7579664996e68040dd0158081b04f612e6a2d515/ivp_physics/ivp_collision_filter.cxx). The [Physics manager](https://github.com/doyaGu/CKBuildingBlocks/blob/fca1963e39e64daa480918661732b1b0e45fe7b8/Physics_RT/CKIpionManager.cpp) installs that filter alongside an exclusive-pair filter and passes the Physicalize string to `set_nocoll_group_ident`. The TypeScript mapping implements the name-equality rule with Rapier membership/filter bits; those bit values are implementation details.

## Recovered assignments

| Objects | Original identifier |
| --- | --- |
| All three player materials | Ball |
| All three materials' explosion fragments | Ball |
| Phys_Floors, Phys_FloorRails | Floor |
| Phys_FloorStopper | Ball |
| Pusher and filler | Floor |
| Pusher guide channel | Ball |
| Rotating arms, swinging platform, flap, seesaw, pivoting plank, sack | Floor |
| Linked bridge planks | Modul29 |
| Loose objects, short/long bridge bodies, lift pieces, sliding-stone parts, sack rope | Empty |

The rope separately has collision detection disabled; mapping its identifier does not enable its collider. Module-specific fixed/dynamic states, constraints and hulls are unchanged by this mapping.

`python3 scripts/read-original-collisions.py /path/to/chunk-dumps` produces `src/game/original-collision-data.json`. It reads `Physicalize_Floors` (Levelinit 4002), `Physicalize_GameBall` (Balls 2260), all thirteen module files' group parameters, and the actual fragment creation nodes: wood 501, paper 627, stone 756. Creation links are asserted. The superficially similar nodes 857, 970 and 1169 contain empty strings but have only **Unphysicalize** connected; these cleanup-only values must not be treated as fragment creation settings.

## Changes

- Stoppers and guide channels now share the player's Ball exclusion group. Stoppers remain solid to loose props and Floor mechanisms, but cannot obstruct or support the player.
- Guide channels can collide with loose props and other differing identifiers. The previous custom mask admitted only pushers.
- Explosion pieces use Ball, so they hit loose props and Floor mechanisms while remaining excluded from the replacement player, other pieces and Ball stoppers/guides. The previous mask admitted only level floor geometry.
- All module adapters use their recovered identifier through the shared mapping. Player support queries and inspector staging queries use the same filter as the player collider.

## Verification and limits

Four new tests check recovered assignments, physical contact and motion for all sixteen ordered identifier pairs, every one of the eleven original stopper meshes across the twelve-level pack, and actual loose-prop contact with all 51 original fragment hulls. The full suite passes 95 tests with no local-pack skips; lint and production build pass. The existing bundle-size warning remains.

In a separate browser tab, the Level 1 wood ball pushed both gates to approximately 1.24 units of travel and crossed the passage, collecting its extra life. This used staged rolling approaches with normal control forces; obstacles were never repositioned to open the gate. A first attempt using a fixed 1.2-second reverse input behind the second gate carried the ball to approximately Z 204.17 with continuing backward velocity, followed by a fall. Restaging the next forward approach completed the puzzle. That failed approach is retained as a limitation of the fixed-duration browser pilot; this is not evidence of a full continuous course playthrough. The wood-to-stone transformer produced sixteen wooden fragments and left the replacement ball stable on the pad. Browser errors were absent.

This change is local after deployment `0a78e6d5-1420-451b-ad9c-de7f97645dc8`. Named-group coverage does not establish full physics parity: exclusive-pair behavior, original script scheduling, IVP contact/inertia/sleep and twelve end-to-end playthroughs still need verification.

Follow-up inspection of the referenced Physics manager found that `CreateConstraint` delegates directly to `IVP_Controller_Factory::create_constraint`; the hinge, ball-joint and slider creation paths inspected do not add an exclusive collision pair. The exclusive-pair filter is installed but no pair-registration calls were found in that reference manager. No speculative joint exclusions were added to the port. This is a source-reference audit, not proof that every path in the supplied original binary has been exercised.
