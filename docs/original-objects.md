# Sector-managed loose objects and domes

`Levelinit.nmo` assigns Activation=2 to boxes, paper balls and domes, and Activation=3 to wood/stone balls. All use Reset=2. Gameplay's activation restores the entity matrix, shows the hierarchy, looks up its physical properties and creates its body. Reset destroys its physics and hides the hierarchy. These objects do not use the module proximity watchers; dynamic bodies start awake when their sector activates.

The adapter now applies that lifecycle to all 157 placements: 66 crates, 52 stone balls, 19 paper balls, nine wood balls and eleven domes. Bodies remain disabled and meshes hidden outside the active sector. Activation enables the body and shows the mesh; reset clears motion and restores its authored pose. Fallen-object cleanup can disable an active object without causing it to reappear on the next physics tick. Sector reset/re-entry restores it.

## Collision and mass properties

The original Type 2 path uses one convex hull from the entity's current mesh. Type 3 uses one sphere of radius two original units, centered at `(0,0,0)`. Therefore paper and crates retain convex shapes, wood/stone use radius .5 in web coordinates, and domes now use a **fixed convex body** instead of the previous stationary triangle mesh. Dome shadow geometry is not used as a physical surface.

Every recovered row uses an empty collision group, collision enabled, Start Frozen=false and Automatic Calculate Mass Center=false. Shift Mass Center is `(0,0,0)`. Dynamic bodies now use that explicit origin instead of Rapier's automatically computed mass center. Numerical mass/friction/elasticity/damping values are unchanged. Rapier still supplies inertia and solves contacts; exact IVP inertia parity is not claimed.

## Evidence and verification

`python3 scripts/read-original-objects.py /path/to/chunk-dumps` regenerates `src/game/original-object-data.json`. It resolves parameter references in Levelinit's `Physicalize_Convex` (4015), `Physicalize_Balls` (4024) and `PH_Groups` (4025), checks Gameplay's table-output connections and activation/reset links, and checks shape-count and mass-center parameters. Gameplay nodes 6250 and 6459 create convex and spherical bodies; 6100's Destroy input precedes Hide 6106.

Five tests cover all 157 actual placements and their shape/mass/lifecycle properties, repeated cleanup/reset, continuous pushing of the original crate by all three materials, and direct contact with the original fixed dome. The full suite passes 88 tests with the imported pack present. Lint and the production build pass; the existing bundle-size warning remains.

Browser verification used the original Level 1 floor. A one-second normal wood input from the staged approach moved `P_Box_01` approximately .94 web units along X. Moving to the next checkpoint disabled the first sector's objects and enabled the second sector's objects. Wood, stone and paper each pushed against the dome without changing its position. Returning to the crate and forcing a fall restored it to its starting floor position. No browser errors were recorded.

These changes were deployed in version `0a78e6d5-1420-451b-ad9c-de7f97645dc8`. Full placeholder pooling, all original visibility transitions, script timing, collision exclusions, exact solver behavior and full twelve-level playthroughs remain outstanding. Tests that isolate an object on a flat floor are explicitly separate from the browser check on the actual course.
