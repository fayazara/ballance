# Sector activation for physics modules

The original `Levelinit.nmo` table `PH_Groups` assigns Activation=1 and Reset=1 to all thirteen scripted physics module types. Gameplay activates a Type 1 object by restoring its placement, showing its hierarchy and activating its script with Reset=true. Deactivation runs the script again with its off state; the module removes its constraints, destroys its physics and restores its initial conditions.

The previous gate, passive-hinge and linked-bridge adapters were created physical at level load and polled proximity without checking the active sector. They now follow the same sector lifecycle as the more recent module adapters.

- The 24 Module 01 gates enable their guide channel and filler together with the pusher body. The pusher remains frozen until its original 50-unit XZ proximity watcher enters range. Deactivation disables all four helper colliders and the moving assembly, then restores its pose and velocities.
- The 118 passive hinges create their constraint only when their sector activates. Modules 19, 25, 30 and 37 remain frozen until their authored MF-frame proximity triggers. Module 41 starts dynamic on sector activation. Deactivation removes the hinge and disables/restores the body.
- The 17 linked bridges create ten joints and nine frozen bodies on sector activation. Their existing outer wake and inner stone-break watchers run only while active. Deactivation removes all surviving joints, disables/restores all planks and rearms both triggers for re-entry.

The recovered older proximity watchers use distance 50, horizontal axes, Enter Range output, squared-distance exactness bounds 55–100 and frame delays 10–60. They now use the shared `OriginalProximity` implementation instead of the hinges' previous every-tick distance check.

## Reproduction and validation

`python3 scripts/read-original-sectors.py /path/to/chunk-dumps` regenerates `src/game/original-sector-data.json`. The reader asserts the module on/off links, original PH table flags and Gameplay Type 1 activation/reset links, and extracts proximity settings and MF frames. The pusher watcher targets the moving pusher origin instead of an MF frame.

Three lifecycle regressions cover the recovered flags, all 159 affected placements across twelve levels, and repeated stone-break/sector-exit/re-entry cycles. Every placement is checked for inactive bodies, zero inactive joints, correct reactivation counts, restored pose and cleared velocities. Gate guide colliders are checked separately. Existing physical pushing, hinge rotation and bridge traversal tests still run using explicit active-sector inputs.

In the in-app browser, wood opened both Level 1 gates to about 1.25 web units, crossed the passage and collected the extra life. The next checkpoint disabled both gates and restored zero travel; returning to their sector and falling restored them correctly. In Level 2, stone released the bridge to nine joints. Advancing the checkpoint removed all bridge and passive-hinge joints. Returning and crossing with wood restored ten bridge joints, kept the bridge intact and retained three lives. Browser error logs were empty.

The full suite passes 83 tests with the original pack present; lint and the production build pass. The existing bundle-size warning remains.

## Remaining scope

This update was deployed in version `0a78e6d5-1420-451b-ad9c-de7f97645dc8`. It does not complete all-level physics parity. Type 2/3 loose-object activation is covered in [sector objects](original-objects.md). Original placeholder pooling/visibility, script-frame scheduling, complete collision-group exclusions and exact IVP contact/sleep/inertia remain separate work. These lifecycle fixtures and targeted crossings are not twelve complete playthroughs.
