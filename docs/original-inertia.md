# Original rotational inertia

The imported paper player and moving convex mechanisms now use measurements from
the separately compiled [IVP reference](https://github.com/doyaGu/ivp/tree/7579664996e68040dd0158081b04f612e6a2d515)
instead of Rapier's calculated convex inertia. This changes angular response to
contact and torque without changing the recovered masses or hull assignments.
The reference is an SDK source reconstruction, not a measurement of the original
game DLL executing a course.

## Evidence and conversion

`ivp_compact_builder/ivp_rot_inertia_solver.cxx` integrates the compact surface
around its calculated centroid. For coordinate second moments a, b, c, it stores
`(hypot(b,c), hypot(a,c), hypot(a,b))`. It does not use the conventional sums or
diagonalize the full inertia tensor. `ivp_physics/ivp_object.cxx` multiplies these
entries by mass; each entry is then at least 3% of the original vector's length
(`IVP_Template_Real_Object::auto_check_rot_inertia`). Spheres use `2/5 * m * r²`.

The probe in `scripts/measure-original-inertia.cpp` builds each convex point soup
and combines its ledges into a single compact surface. A unit cube with corners
±1 returns .4714045227 on every axis rather than the conventional 2/3. A box with
half-extents (2,3,4) returns (6.119186878, 5.497474194, 3.282952785), checking that
the coordinate axes are not permuted. The original paper hull returns
(1.107558966, 1.107101440, 1.108973384) per mass in original length units.

Runtime entries are multiplied by mass and `.25²`. The minimum-axis guard is
applied before supplying Rapier's principal-inertia values. The local principal
frame follows the original object axes, with the web coordinate system's Z
reflection. Our meshes bake placement rotation into their vertices, so assigning
an identity inertia frame to those mechanisms would be incorrect.

`Physics_RT/CKIpionManager.cpp` in the separately inspected CKBuildingBlocks
reference sets an explicit object-space center override when automatic center
calculation is disabled. It does not recalculate the surface inertia around that
override. The adapters preserve that behavior. The authored center shift is
rotated into the baked mesh's axes and converted to web units; collision-geometry
scale is not applied to that shift.

The measurements use the collision hulls and scales in the web importer’s actual
placements. There are 64 unique surface/scale cases covering 547 placed bodies:

| Body | Count |
| --- | ---: |
| Chain planks | 153 |
| Lift platform, gates and walls | 81 |
| Loose crates | 66 |
| Pivoting planks | 43 |
| Sliding stone and support crate | 38 |
| Suspended rope and sack | 36 |
| Short bridges | 29 |
| Three-post gates | 24 |
| Long bridges | 22 |
| Loose paper balls | 19 |
| Seesaws | 17 |
| Flaps | 7 |
| Rotating arms | 6 |
| Swinging platforms | 6 |

All measurements record SHA-256 hashes of the source float32 vertex bytes and
the placements using them. Unknown surface/scale combinations fail explicitly.
Uniform-looking source transforms retain their small authored deviations from
unit scale. The generator measures each actual case; it does not scale a single
compound measurement, which failed a native nonuniform-scale comparison.

## Reproduction

The SDK checkout used here is clean at revision
`7579664996e68040dd0158081b04f612e6a2d515`. On macOS, with that checkout and the
local original asset pack already prepared:

```sh
ivp_source=/path/to/ivp
ivp_build=/tmp/ballance-ivp-build
python3 scripts/build-ivp-simulation.py "$ivp_source" "$ivp_build"
python3 scripts/measure-original-player-inertia.py "$ivp_build/measure-inertia" "$ivp_source" > /tmp/player-inertia.json
python3 scripts/measure-original-object-inertia.py "$ivp_build/measure-inertia" "$ivp_source" > /tmp/object-inertia.json
python3 scripts/measure-original-object-inertia.py "$ivp_build/measure-inertia" "$ivp_source" --fragments > /tmp/fragment-inertia.json
node scripts/verify-ivp-compounds.ts "$ivp_build"
```

The build uses the same pinned libraries and disabled floating-point contraction
as the native/WASM simulation bridge. The generators require its `build.json`
and record those numeric settings. Rebuilding the earlier probe this way changed
ten of the 64 machinery/prop entries by more than 1e-7 relative, with the largest
axis change about 27.8% for one lift gate. Convex construction can amplify numeric
branch differences; the previous native-only measurements were not sufficient
as a WASM reference. The refreshed measurements are checked against actual IVP
body inertia and native/WASM off-center impulse trajectories, rather than only
against the Rapier adapter's use of the same table.

The player generator now includes the probe's additional second-moment diagnostic
field; its center and inertia measurements match the checked-in player data.
The object generator invokes `scripts/list-original-inertia.ts` to enumerate
placements using the same Three.js matrix operations as the adapters. It rounds
scaled vertices to float32 before calling the native builder, matching the
reference manager's `VxVector` multiplication.

## Verification and remaining scope

The regression suite includes tests of the native controls, all source
mesh hashes and placement scales, and all 547 actual runtime bodies. The latter
applies torque along each original axis with an additional body rotation, checks
the resulting angular velocity, and checks mass and authored center. Thin parts
exercise the 3% inertia guard. Existing gate passage, crate pushing, bridge,
seesaw, lift, fan and reset tests also pass. Lint and production build pass; the
existing bundle-size warning remains.

The paper-player browser check completed a wood-to-paper transformer sequence
with sixteen wooden fragments, then transferred from Level 2 fan 01 to fan 12,
ending near (251.668, 19.952, 91.686) with three lives. Browser verification of the
subsequent full mechanism update is pending: the local server stopped listening
on port 5174 during reload. The earlier page also showed failed Vite hot reloads
and fan audio load errors, so it is not evidence for a clean final runtime.

Remaining parity limits include original hierarchy/local `GetScale` and surface
cache behavior versus the importer's baked world transforms, IVP versus Rapier
convex construction and contact solving, original script-frame timing, sleeping,
fragment lifecycle timing, and continuous playthroughs of all twelve courses.
No original executable or NoCD binary was run. The numeric-build correction is
local after deployment `ba95072d-3b29-4ad6-90e2-d4a85184499c`.

The subsequent [fragment correction](original-debris.md) adds 51 separately
measured fragment surfaces and the original burst offsets/paper wind. The course
body count above remains 547 and does not include those fragments.

A read-only hierarchy audit confirmed that LibCmo's `CK3dEntity::Load` deliberately
discards parent IDs. The serialized chunks retain them. Comparing world scales
with parent-relative scales across 137 entity/frame records in Balls and the
13 mechanism files found small but nonzero differences (largest vector difference
about .00002581 in a module-25 frame). This does not indicate a large visible
scale change, but exact local-scale and cached-surface construction still need
to be reconciled with the runtime's baked transforms.
