# Three-post sliding gates (P_Modul_01)

The target and three wooden posts form one sliding assembly. This module occurs 24 times across Levels 1, 2, 5, 7, 8, 9, 10 and 11. The fan update did not fix this mechanism.

## Recovered behavior

`P_Modul_01.nmo` contains three Physicalize behaviors. File indices below refer to the output of `scripts/dump-original-chunks.cpp` on the supplied original module:

| Behavior | Target / collision meshes | Parameters |
| --- | --- | --- |
| 178 | Pusher; `Col01`, `Col02`, `Col03` | Dynamic, mass 3, friction .6, elasticity .4, linear damping .1, angular damping 1, collision group Floor |
| 139 | Rinne; `Rinne_01`, `Rinne_02`, `Rinne_03` | Fixed, friction .7, elasticity .4, collision group Ball |
| 95 | Filler; `Filler_Mesh` | Fixed, friction .7, elasticity .4, collision group Floor |

The local pack already contained these collision meshes, but the generic adapter ignored them. It used a single convex envelope of the rendered gate and only one guide-channel mesh. It also collided the gate with surrounding floor meshes, contrary to the original `nocoll_group_ident` exclusions. That combination jammed the assembly and exposed untextured helper geometry.

The new adapter uses all three original pusher hulls on one dynamic body, all three fixed guide hulls, and the fixed filler. The channel supports and guides the gate physically; the module has no slider joint, hinge or scripted opening animation. Pushing the target moves the entire assembly. Helper collision surfaces are not rendered. Ordinary level floors and other pushers do not collide with the pusher, while the player and guide channel do. Floor stoppers retain contact with the pusher. The shared [original identifier mapping](original-collisions.md) now also excludes the player from stoppers and allows loose props to contact the channel.

Mass remains 3 total, not 3 per hull. The mass center is the original entity origin, with Rapier's computed compound inertia. Exact IVP inertia and contact-solver parity are not claimed. Original friction and drive strengths are preserved: a rolling wood-ball impact moves the gate, stone pushes more strongly, and paper barely moves it. The tested Level 1 gate reaches approximately 1.25 world units of travel at its physical stop; this distance is a measured result, not a scripted clamp.

The assembly, guide channel and filler now enable only in their active sector. The pusher begins frozen and wakes through its recovered 50-unit horizontal proximity watcher. Leaving/resetting the sector disables all their collisions and restores the initial pose. See [sector lifecycle and validation](original-sectors.md). Restarting or changing levels rebuilds its bodies/colliders and disposes the rendered geometry.

## Validation

- Collision-mask regression verifies player/guide contact and floor exclusion, while keeping floor-stopper contact.
- Original Level 1 geometry test verifies three hulls, total mass, wood pushing, guide support, end-of-travel restraint and neighboring-gate independence.
- Material comparison verifies stone moves the gate and paper cannot bulldoze it.
- Route regression verifies the narrow passage cannot be crossed normally with the gates closed, then pushes both gates open and drives the wood ball through on the actual level floor. Ball setup positions are controlled; gate positions are changed only by physical player-ball contact.
- Local-asset tests skip explicitly if the original pack is absent.

In a separate in-app browser tab, wood opened both Level 1 gates to approximately 1.25 units of travel. The ball then crossed the cleared passage and collected the extra life between them. A forced fall reset both assemblies to zero travel in the same sector. Browser error logs were empty. These tests do not constitute a full Level 1 playthrough or complete parity for the other module types.

## Native IVP route verification

The local IVP backend now also passes a closed-versus-open route regression.
Two wooden-ball approaches per gate reach approximately 4.98 original units of
travel, and the ball crosses the cleared corridor. The in-app browser repeated
that sequence and collected the extra life. This confirms the connected native
route without changing recovered physics parameters; see
[the native route report](original-native-routes.md) for exact staging and limits.
