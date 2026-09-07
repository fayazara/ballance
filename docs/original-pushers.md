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

The new adapter uses all three original pusher hulls on one dynamic body, all three fixed guide hulls, and the fixed filler. The channel supports and guides the gate physically; the module has no slider joint, hinge or scripted opening animation. Pushing the target moves the entire assembly. Helper collision surfaces are not rendered. Ordinary level floors and other pushers do not collide with the pusher, while the player and guide channel do. Floor stoppers retain contact with the pusher. This is a scoped collision fix, not a complete replacement of the game's collision-group mapping.

Mass remains 3 total, not 3 per hull. The mass center is the original entity origin, with Rapier's computed compound inertia. Exact IVP inertia and contact-solver parity are not claimed. Original friction and drive strengths are preserved: a rolling wood-ball impact moves the gate, stone pushes more strongly, and paper barely moves it. The tested Level 1 gate reaches approximately 1.25 world units of travel at its physical stop; this distance is a measured result, not a scripted clamp.

The assembly participates in the existing moving-object synchronization and sector reset. Respawning in its sector restores position, rotation and velocities. Restarting or changing levels rebuilds its bodies/colliders and disposes the rendered geometry.

## Validation

- Collision-mask regression verifies player/guide contact and floor exclusion, while keeping floor-stopper contact.
- Original Level 1 geometry test verifies three hulls, total mass, wood pushing, guide support, end-of-travel restraint and neighboring-gate independence.
- Material comparison verifies stone moves the gate and paper cannot bulldoze it.
- Route regression verifies the narrow passage cannot be crossed normally with the gates closed, then pushes both gates open and drives the wood ball through on the actual level floor. Ball setup positions are controlled; gate positions are changed only by physical player-ball contact.
- Local-asset tests skip explicitly if the original pack is absent.

In a separate in-app browser tab, wood opened both Level 1 gates to approximately 1.25 units of travel. The ball then crossed the cleared passage and collected the extra life between them. A forced fall reset both assemblies to zero travel in the same sector. Browser error logs were empty. These tests do not constitute a full Level 1 playthrough or complete parity for the other module types.
