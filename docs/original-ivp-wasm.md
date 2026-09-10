# IVP WebAssembly simulation bridge

The IVP solver now builds and runs as the default development and production game path.
Use `?physics=rapier` only for an explicit comparison. The live deployment was updated to this production build on September 9, 2026. The IVP path uses the separately supplied SDK
reference at commit `7579664996e68040dd0158081b04f612e6a2d515`; it does not execute
the original EXE or DLLs.

## Implemented and checked

`scripts/ivp-simulation-bridge.cpp` exposes environment creation/destruction,
spherical, convex, compound and concave triangle bodies, original mass/material/damping/COM settings,
collision identifiers/enablement, fixed/frozen creation, body removal, center/off-center impulses, hinges/sliders/ball sockets, wake operations, simulation steps and pose,
velocity, inertia and sleep-state reads. It calls the SDK's actual geometry
builder, collision detection and contact solver. Units and handedness remain in
the original coordinate system; no web scale or time-factor conversion is applied
inside this bridge. Physics runs at 66 Hz.

The Emscripten output is an ES module targeting `web,node`, with a separate WASM
binary. The tested build uses Emscripten 6.0.2.
Browser module loading and Level 1 gameplay integration have now been checked in
the in-app browser, in addition to the Node 24 simulation checks.

## Local playable path

Build the SDK into `.local/ivp-simulation` with the command below. With the Vite
server running, open `/` (or the compatible `/?physics=ivp`). Add `?inspect=tools`
(or `&inspect=tools` after an existing query) for development controls that
stage the player at a gate, crate or transformer and advance the actual game
simulation by a fixed duration. These controls are absent from the normal game.
During development, Vite serves the generated module and WASM under `/ivp`.
For production, `scripts/ivp-assets.ts` emits both files into a shared
`ivp/<content-hash>/` directory and compiles its loader URL into the client.
The loader resolves its WASM relative to that URL. A change to either file
changes the directory hash, avoiding a stale loader/new solver pairing. Builds
fail if the separately generated SDK files or verified build metadata are missing.
Only the two browser runtime files are emitted, not SDK source or native tools.

`OriginalIvpRuntime` owns course-floor bodies, the player, sector-specific props,
push gates, sliding-stone assemblies, passive hinges, nine-plank chain bridges,
fan airflow, lifts, spring-return arms, driven swings and suspended sacks. It synchronizes the
existing Three.js meshes, including reflected rotations and baked initial mesh
orientations. Rapier bodies remain as existing renderer/trigger scaffolding and a
player-pose mirror, but Rapier does not step in this mode. Sector resets remove
the previous native parts and their constraints before recreating the sector.
Unsupported mechanism types fail loading explicitly. All twelve original levels
now contain connected mechanism types, and an integration test constructs every
sector and settles the player at each of the 63 reset points. Successful
construction and reset checks are not complete level playthroughs.

Browser checks observed a grounded player, gate motion with matching rendered
positions, transformer capture, a wood-to-stone swap and 16 moving wooden fragments.
Fragments now live in the same IVP world as the player and course, retaining the
original material pools, impulses, paper wind and fade lifecycle. The prior
integration left those fragments in an unstepped Rapier world; that is fixed.

Integration tests cover all four Level 1 reset sectors, stale-body removal, fixed
domes, actor pose synchronization, captured-player input isolation, all 51 fragment
bodies and their expiry. Gate contact tests distinguish paper, wood and stone:
from the short staged approach, wood travels roughly 1.46 original units and stone
reaches the approximately 5-unit channel stop. A longer wooden-ball approach
increases travel. A subsequent native regression and browser check now open both
gates with two wooden-ball pushes each, then cross the corridor and collect its
extra life. The closed-gate control remains blocked. See `original-native-routes.md`;
this still does not establish an uninterrupted complete-level playthrough.

The next integration connects the original passive hinges and ten-joint chain
assembly directly to native constraints. Chain proximity wakes the connected
island and a stone-ball entry at the release plank removes source joint 187,
emitting the original rope-tear sound request exactly once. Reset recreates that
joint. A course test drops the stone player on Level 2's seesaw and verifies real
player contact, hinge rotation and mesh synchronization; another exercises the
chain trigger with wood, stone, paper and stone again after reset.

Fan controllers now act on the playable player rather than its Rapier mirror.
Capture, material changes, sector changes and destruction detach their handles
before the corresponding body is removed. Native runtime tests verify hover with
paper and ground support with wood/stone, including material recreation inside
an active air column. In the browser, Level 2 loaded with the entire sector's
assemblies and the staged paper ball rose from original Y 47.823 to Y 64.930
over fan 01 (grille origin Y 45.623). Course integration tests exercise every
reset sector in Levels 2, 4, 5 and 6. A subsequent native test and browser check
transfer the paper ball from Level 2 fan 01 to the raised fan 12 using discrete
directional inputs; see `original-native-routes.md`. Other fan routes remain open.

The remaining actuator assemblies are now connected as well. Lifts reuse
`OriginalIvpLift`, including all eight removable weights, their contact groups,
the slider, return spring and proximity wake. Rotating arms have the recovered
hinge and offset return spring attached to a real fixed support body (the native
spring API requires two bodies). Sacks retain both ball-socket joints and the
collision-disabled rope body. Their persistent force changes direction after
1,500 ms plus the recovered one-frame link. Swings wait one startup frame and
cycle through push, coast, reverse push and coast in 500-ms stages. These timers
use the web/script clock while native impulses run at 66 Hz on the 2x IVP clock.
The native runtime now runs scripts once per presentation frame, uses the
recovered float32 timer behavior and smooths the physics interval separately.
It also applies the original menu's 1–1000 ms frame limits. See
[original-frame-timing.md](original-frame-timing.md) for source evidence, numeric
checks and remaining scheduler differences.

The course integration test now covers every reset sector in all twelve levels,
including finite native states and corresponding visible actor positions. A
separate test runs every placed sack and swing through at least one full drive
cycle in its actual course sector and verifies that reset deletes old force
handles and resets the sequencer. This extends the earlier isolated actuator
verifiers to the actual runtime. The Level 7 lift now has a continuous staged-entry test: wood pushes all seven
wall weights off, rides the rising platform and exits onto the upper path. A
loaded control fails to reach that exit. See `original-native-routes.md`. All six swinging-platform placements now have headless forward-crossing checks,
including a continuous paper/fan/two-deck sequence in Level 11. Other lift
placements, arm passage, sack avoidance and full level routes remain to be
verified.

Native depth cleanup now uses the same recovered course limit in original units:
the minimum world bounding-box Y of `DepthTestCubes`, initially zero, minus 200.
Only explicit loose-object group members and the lift's falling weights are
removed below it. Removal deletes the native body, hides the mesh and resets its
position to zero. Lift removal updates `OriginalIvpLift` ownership so a later
sector reset cannot double-delete a weight. Tests launch an actual Level 1 crate
and Level 7 lift weight off their platforms, observe deletion after the fall,
then verify recreated bodies and restored visible poses on reset. Native rendering
no longer copies stale Rapier actor poses before syncing IVP.

A static-module audit of the supplied `P_Trafo_Wood`, `P_Trafo_Stone`,
`P_Trafo_Paper`, `PC_TwoFlames` and `PS_FourFlames` files found no independent
Physicalize behavior. All 195 transformer release positions across the twelve
levels have nearby support from the authored course collision. Tilted pads are
checked for initial contact, since the ball can subsequently roll off their
slopes. The Rapier path's fabricated colliders on these decorative modules have
also been removed.

The ending balloon is different: its source contains physicalization of a
compound platform, hinged entry plates, balloon bodies and a sliding control
body. Its 18 native bodies, approach forces, hinged bridge and boarding/departure
sequence are now connected. A staged Level 1 browser run crossed the bridge and
rode the departing platform until the result at 13 seconds. The final-level UFO flight, capture, flash and detached camera are now connected;
exact normal-camera behavior and parts of the audio/presentation remain incomplete; see
`original-finish.md`. Module coverage alone does **not** prove full-game parity.

`scripts/verify-ivp-simulation.ts` replays identical commands through native and
WebAssembly builds. Fifteen scenarios cover all three player materials: impulse
and damping in zero gravity, dropping onto a floor, sustained rolling input,
pushing a dynamic crate, and rolling down a slope. The paper body uses the actual
imported `Ball_Paper` vertices; the floor and crate are controlled box fixtures.
Ball settings and input strengths come from the recovered material definitions.

A fresh build and comparison passed **7,128 body-state samples** over six original
physics seconds per scenario. Position, linear/angular velocity, inertia and sleep
states matched exactly in these runs. Two scenarios had quaternion interpolation
rounding differences no larger than `2.220446049250313e-16`. The comparison fails
above `1e-5` rather than quietly accepting trajectory divergence.

The crate's final forward positions in these fixtures were 14.11 original units
for wood, 22.57 for stone and 0.21 for paper. These results establish actual
material-dependent pushing in the SDK experiment. They are not measurements from
an original level or a claim about how many pushes a particular puzzle requires.

## Portability corrections

### Original course geometry

`original-ivp-level.ts` now prepares all twelve courses for the IVP bridge. It keeps
scaled vertices in each object's axes and assigns the body's translation and
rotation separately. `ivp_trimesh` follows `CKIpionManager::AddConcaveSurface`:
one three-point ledge per original face, in source order, compiled into one
surface per floor object. It preserves holes and does not replace a concave floor
with its convex hull. Invisible collision-only floors are included.

`verify-ivp-courses.ts` loaded **491 floor bodies / 247,257 triangles** across all
twelve courses. Wood, stone and the actual paper hull settled at all **63 reset
points**: 189 material/reset probes, with **756 exactly matching native/WASM state
samples**. Each probe simulated four original seconds and then removed the ball.
The check bounds height relative to the reset frame (which may be above the
resting position), checks settled vertical speed and compares native trajectories.
It does not establish route traversability or functioning machinery.

### Original player ownership and keyboard wake

`original-ivp-player.ts` owns the original sphere/paper hull and physicalization
settings. Capturing removes the physical body and its force controllers; releasing
or respawning creates a new body with the selected material and authored zero
mass-center offset. A captured visual pose can be moved independently. Rendering
reflects the original Z axis and converts positions by 0.25 and speed by 0.5.
The course verifier now uses this component for all 189 material/reset probes;
all 756 sampled states still match the native replay exactly.

The input graph is recovered by `scripts/read-original-player.py` from
`Gameplay.nmo`. Key Event behaviors 1613, 1635, 1605 and 1597 connect their
Pressed/Released outputs to Create/Shutdown on forces 1589, 1627, 1649 and 1667.
Both outputs of every force connect to Physics WakeUp 1653, targeting ActiveBall.
Thus releasing a key wakes the ball as well as pressing it. The reference
`PhysicsWakeUp.cpp` queues `ensure_in_simulation()` before simulation; adding or
removing a force controller alone does not wake it.

The component retains independent directional controllers and wakes on their
creation/removal. Tests reproduce a sleeping ball with opposing held keys, release
one key and verify motion from the surviving controller. Native/WASM replay checks
all three materials through idle sleep, press, cancellation, release, capture and
respawn, including clearing residual forces. These tests are component checks in
Node, not browser input or full transformer-animation verification. The native caller now resolves the saved Cam_OrientRef on new key presses and
keeps existing force directions until release. Camera-turn commits, checkpoint
orientation and the remaining scheduler limits are covered in
[original-camera.md](original-camera.md).

### Native fan airflow

`original-ivp-fan.ts` implements the recovered fan range/box gates and owns a
persistent IVP force controller. Script sampling is separate from PSI stepping;
the original 0.1 world-up impulse runs every PSI while the controller exists.
There is no fan-specific wake in the recovered graph. Sector exit and failed box
intersection remove the controller. Outer-range exit stops polling without
inventing a new force shutdown. Owners must detach the fan before deleting its
player body, then reset range state for a sector reset.

All **113 fan placements** were checked with paper, wood and stone, including
force persistence without further script samples and sector shutdown:
**14,916 native/WASM states matched exactly**. A separate Level 2 test loads the
actual course floors and runs each material above fan 01 for twelve original
seconds. Paper repeatedly leaves/re-enters the finite top of the column; its final
height is 19.1582 original units above the emitter. Wood and stone settle at
2.02285 units. All **2,775 sampled states match** the native replay. These tests
sample the behavior graph at 66 Hz. Subsequent runtime checks cover the first
Level 2 transfer at 60 and 132 Hz, and live script frames now follow presentation
frames. Other fan routes remain pending; see `original-native-routes.md`.

The fan trigger has a small authored shear. `original-box.ts` follows VxMath's
normalized matrix axes and direct axis projections instead of orthogonalizing
its transform. Both the playable Rapier fan and the native component use this
box test. The source and JavaScript float-precision limitation are recorded in
`THIRD_PARTY.md`. The existing Rapier Level 2 fan-transfer regression also passes;
this is not a native-backend browser playthrough.

The typed `IvpWorld` wrapper checks bridge ABI 7, owns WASM temporary buffers and
rejects use after disposal. Original collision identifiers are assigned on the
creation template **before** collision detection is enabled. The SDK's live
identifier-change/recheck call retains existing friction contacts, so using it
after creation is not interchangeable with original Physicalize semantics.
Unphysicalize follows the original block's `delete_silently`: removing support
does not wake an already sleeping neighbor, but subsequent input wakes that body
and it falls. Removed handles remain invalid.

Sixteen WASM regression tests exercise triangle and compound gaps, empty/matching collision
identifiers, creation versus live-contact changes, silent removal and waking after
support removal. With the built module available, all **126 project tests** pass
without skips. The fifteen controlled native/WASM comparisons also still pass.

### Compound collision surfaces and impulses

`IvpWorld.compound` creates one IVP body from multiple convex ledges. It uses the
same per-hull Pointsoup builder followed by one Ledge Soup compile as the original
manager. `pushAt` forwards an authored world point and impulse to the SDK's
`async_push_object_ws`; it supports a nonzero COM and rotated object axes.

`verify-ivp-compounds.ts` checks all **115** recovered machinery/prop/fragment
shape-scale variants (64 machinery/prop surfaces covering 547 placements, plus 51
fragments). Nine contain multiple convex pieces. Each case checks initial inertia
against the refreshed measurement tool, then replays an off-center impulse for
132 ticks in native and WASM builds. All **15,295 state samples matched exactly**.
The rotated, translated fixtures include a nonzero COM override. A separate
compound arch collision regression checks passage through the gap, blockage by a
pillar, and a fixed assembly staying in place.

These checks establish shape construction, inertia and impulse response. They do
not yet establish the constraints or multi-body behavior of an assembled machine.
The inertia probe is now built alongside the bridge with the same libraries and
floating-point flags; see [the inertia correction](original-inertia.md).

### Original joint operations and connected machinery

The ABI 4 bridge forwards hinge, slider and ball-socket creation to
`IVP_Controller_Factory::create_constraint` using the exact template calls in the
recovered `PhysicsHinge`, `SetPhysicsSlider` and `PhysicsBallJoint` callbacks.
Hinges use world anchor/axis and Z rotation bounds in radians. Sliders preserve
both template-setup calls from the source and apply Z translation bounds in
original units. The reference/attached body order is preserved. Limit defaults
remain inactive unless the source enables them.

The bridge owns live joint handles. Removing either body first releases its
connected joints, invalidating their handles before IVP's automatic core cleanup
could leave dangling pointers. Explicit joint removal and world destruction also
release them. `wake` calls `ensure_in_simulation`, matching `PhysicsWakeUp`.
A regression confirms that joint registration preserves a frozen two-body pose,
and waking one body activates both. Separate tests verify constrained axes,
active/inactive limits, ball-socket freedom and removal/recreation lifecycle.

`verify-ivp-joints.ts` tests five controlled cases and all **118** placed passive
hinges across twelve courses. These tests use the actual hulls, mass, damping,
COM and hinge frames, but disable contacts to isolate constraint motion. All
**4,551 samples matched exactly**; maximum pivot drift was 0.003361 original
units. The fixture removes each joint and continues simulation after release.

`verify-ivp-chains.ts` tests all **17 chain bridges**, comprising 153 actual planks
and 170 hinges, with their original collision identifier and frozen creation.
It wakes the recovered target plank, simulates the connected bridge, removes the
specific source release hinge, continues simulation and deletes all planks to
exercise reset cleanup. Across **7,344 samples**, the largest native/WASM
difference was quaternion rounding of `2.220446049250313e-16`. Every released
endpoint dropped by at least 1.1185 original units in the fixture.

The chain simulation exposes transient anchor separation up to **0.382735
original units in both builds**. This is measured reference-solver behavior,
not a claim of perfect rigidity; no extra stiffness or iterations were added to
hide it. The direct native comparison remains the numeric check. These runs do
not yet exercise player-triggered release, floor contact or a full chain-bridge
playthrough in the browser.

### Springs and sustained force controllers

ABI 5 adds `spring`, `removeSpring`, `force` and `removeForce`. Spring creation
uses two resolved world anchors and the original absolute, bidirectional
`IVP_Template_Spring` settings: rest length, stiffness, axial damping and global
relative-position damping. The SDK's spring actuator supplies the actual force
integration; the web bridge does not approximate it with repeated impulses.

The recovered `PhysicsForce` behavior is different: its controller applies one
captured world impulse **per PSI**, without a delta-time multiplier. The creation
callback resolves and normalizes the direction once (using positive X when its
squared length is at most 0.0001). Its point is transformed into core coordinates
once unless the source position referential is the target, in which case the
raw point is already treated as a core-space lever arm. The controller then
converts the fixed world impulse into current core axes on each tick. The bridge
preserves that behavior, including actuator priority and shutdown. Callers must
resolve external referential frames before creation. This controller is adapted
from the Apache-2.0 CKBuildingBlocks reference; attribution is in THIRD_PARTY.md.

The ownership layer releases springs/forces before either referenced body is
deleted and rejects their expired handles. Tests cover restoration from both
compression and extension, anchor deletion, force shutdown, normalized per-PSI
strength, zero-direction fallback and application points on a rotated body with
a nonzero COM. The spring convergence fixture explicitly wakes its body each
tick: normal IVP sleeping can stop it before analytic equilibrium (one default
fixture slept at separation 2.0537 for rest length 2). Normal sleep behavior is
retained in the machinery comparisons.

`verify-ivp-actuators.ts` compares **33 placed fixtures**: six spring-driven arm
assemblies, nine lift platform/slider/spring assemblies, and eighteen two-body
suspended sacks. It uses recovered geometry, frames, COM, material properties,
spring settings and both sack force directions. All **3,672 native/WASM state
samples matched exactly** over twelve original physics seconds per fixture.
Shutdown, direction replacement and destruction are included.

These tests disable contacts to isolate actuators. The lift fixture includes only
the platform, slider and spring, not the other gates/weights; the sack fixture
switches force every 198 PSI to test both directions, without claiming to emulate
the script's delayed frame links. Full lift contact dynamics, precise activation
ordering and browser gameplay remain unverified.

### Pair filters and complete lift assemblies

ABI 6 installs the original `IVP_Meta_Collision_Filter`, combining group-identifier
filtering with `IVP_Collision_Filter_Exclusive_Pair` in the recovered manager's
order. `pair(a,b,enabled)` updates that pair and requests native filter rechecks;
it cannot override the group filter. Removing a body clears its pair entries
before its address can be reused. Live filter rechecks retain the SDK's existing
friction-contact semantics. Tests cover symmetric/idempotent pair changes,
restored eligible contacts, unaffected floor/other-body contacts, group-filter
composition, and replacement bodies not inheriting removed exclusions.

No lift-specific pair exclusions were recovered, so none are invented.
`OriginalIvpLift` in the game source constructs all nine original bodies with
normal contacts, their frozen flags, slider, spring and mass properties. It
supports the source wake target, individual weight removal, disposal and fresh
sector construction. Its geometry uses the same measured placement transform
convention as the existing adapters; hierarchy/local-scale fidelity remains a
separate issue. This component is prepared for IVP gameplay integration; the
playable engine still selects Rapier.

`verify-ivp-lifts.ts` uses this component for **all nine lifts / 81 bodies**.
Each loaded assembly simulates sixteen original seconds with contacts enabled.
The fixture removes all eight walls/gate weights, wakes the platform, then
simulates sixteen more seconds. All **4,320 native/WASM state samples match
exactly**. Minimum platform rise after unloading is **21.38866 original units**,
and maximum measured sideways slider drift is `1.337e-13`. This verifies actual
weight/contact loading and release, beyond the earlier isolated spring fixture.
A separate regression destroys a partially unloaded assembly, rebuilds all nine
parts, verifies the restored pose and stale handles, and resumes simulation.

These lift tests do not yet contain the surrounding course floors or a player
pushing each wall off. Programmatic removal isolates the unloading response;
player interaction, depth-triggered removal and full-route passage still require
integration checks. Construction order currently follows the recovered data
array; exact original script scheduling is not established by these tests.

### Native contacts and original delayed contact outputs

ABI 7 registers global friction and post-collision listeners, matching the
recovered manager. `contacts(body)` reports each live friction identity, the other
body, the current surface normal oriented into the queried body, and normal
force. `drainEvents()` returns contact start/end and impact events once, in SDK
callback order. Event timestamps and the `time` getter use the SDK clock.
Contact identities are monotonic within a world and are invalidated on friction
deletion, including body removal. The runtime must drain events regularly.

The query reads the SDK's cached live normal and friction pressure. It never
reads destroyed friction geometry. Deleted events expose only time/identity/body
pairs; contact-start events expose normal and point; relative velocity is exposed
only on post-collision impacts. Native/WASM comparison caught uninitialized
relative-speed fields in friction creation and pre-collision callbacks. The
bridge now uses the original post-collision subscription and omits those invalid
friction fields rather than reporting platform-dependent garbage.

`verify-ivp-contacts.ts` compares drops, sustained input against a crate, contact
loss and support deletion for all three materials, using the actual paper hull.
All **3,960 event/contact queries matched exactly**. The fixtures generated 45
contact starts, 45 ends and 45 impact callbacks. Regression checks also cover
normal orientation, current contacts versus an airborne ball, one-time draining,
stale handles, and contact loss when support is removed.

`OriginalIvpContact` adapts the recovered continuous-contact group behavior. It
counts multiple friction points, uses strict delay comparisons, retains a brief
inactive contact's pending start for twice the start delay, supports immediate
activation on qualifying re-entry, cancels pending off on re-entry, and processes
pending records newest first rather than sorting group IDs. Stop emits one off
for every active group. It stores the contact's group so removal still works
after the other body's metadata disappears. Source-derived timeline tests cover
these cases; a native integration test feeds actual friction callbacks and SDK
time through the tracker to obtain delayed on/off transitions.

This tracker now feeds the playable IVP backend's rolling sounds. Imported
contact/impact IDs and native collision events select surface-specific rolling
and hit recordings; see `original-sound.md` for source recovery and verification.
The native path no longer uses the Rapier ray result to choose its rolling sound.
Ray queries and non-audio contact-driven gameplay outputs remain separate work.

### Native scalar comparison

Two differences had to be resolved before the native build was a useful oracle:

1. The ARM compiler contracted multiply/add operations. Small rounding changes
   grew into different contacts, particularly for the paper hull. Both builds now
   explicitly use `-ffp-contract=off` as well as the reference's
   `-fno-strict-aliasing` requirement.
2. `ivp_great_matrix.hxx` selects a different matrix kernel for `PLATFORM_64BITS`:
   four-element blocks, a 16-byte mask and a four-byte offset shift. Its original
   32-bit scalar branch uses one-element blocks, eight-byte alignment and an
   eight-byte offset shift. The latter matches the target WASM build. The native
   comparison therefore uses that scalar layout with a pointer-width alignment
   mask. Without this correction, wood/stone crate pushes diverged despite equal
   inertia and matching single-body motion. With it, those pushes matched exactly.

The build script generates a compatibility header in its output directory and
force-includes it only in the native reference build. It leaves the pinned source
checkout untouched. This isolates scalar-kernel portability; it does not prove
bit-for-bit agreement with the original Windows DLL's compiler or x87 arithmetic.

## Reproduce

Requirements: the pinned clean SDK checkout, CMake, a native C++ compiler,
Emscripten, Node, installed project dependencies and the local imported balls pack.

```sh
python3 scripts/build-ivp-simulation.py /path/to/ivp .local/ivp-simulation
node scripts/verify-ivp-simulation.ts .local/ivp-simulation
node scripts/verify-ivp-courses.ts .local/ivp-simulation
node scripts/verify-ivp-compounds.ts .local/ivp-simulation
node scripts/verify-ivp-joints.ts .local/ivp-simulation
node scripts/verify-ivp-chains.ts .local/ivp-simulation
node scripts/verify-ivp-actuators.ts .local/ivp-simulation
node scripts/verify-ivp-lifts.ts .local/ivp-simulation
node scripts/verify-ivp-contacts.ts .local/ivp-simulation
BALLANCE_IVP_BUILD=.local/ivp-simulation pnpm test
```

The build verifies the SDK commit and clean state. It creates a writable local
Emscripten cache, logs each configure/build/link operation, and records compiler
and compatibility information in `build.json`. No global compiler files are
modified. The verifier writes each replay protocol, both trajectories and
`comparison.json` to that same directory. Native verifier executables, SDK
source and generated headers stay outside the deployed application. Production
packaging takes only the generated ES module and WASM from this directory.

## Remaining integration

The production build now defaults to IVP, matching local development. The live
deployment includes this packaging change as of September 9, 2026. The IVP adapter now connects the mechanism types present in all twelve levels.
The ending UFO and detached camera are connected; exact normal-camera behavior,
ray queries and remaining music/event sequencing still need work. Contact-ID metadata, rolling loops and player
impact sounds are now connected; see `original-sound.md`. Native component verifiers for other
levels do not establish that those levels are playable in the browser. Level 1’s
two-gate corridor and Level 2’s first raised-fan transfer have now been checked
in-browser; complete level playthroughs remain unverified.
Floor import currently verifies unit-scale,
unsheared world frames; the previously identified local hierarchy/scale boundary
still applies. The recovered SDK source is a reference
reconstruction, so agreement with its native build is necessary evidence for this
port but not proof of full original-game parity.

## Production packaging verification

A Cloudflare Vite production preview, using the emitted bundle and staged game
pack, initialized IVP at `/` without any physics query parameter. Levels 1, 7
and 12 entered gameplay directly and retained three extra lives at their starts;
normal Escape and Exit Level returned to the menu. The preview served the
content-hashed loader as `text/javascript` and its solver as `application/wasm`,
with bytes matching their offline-manifest SHA-256 hashes.

Three packaging regressions check that either file changes the shared URL,
missing/invalid/unverified build inputs fail, and a relocated generated loader
loads its adjacent solver and advances a falling body through the bridge.
The emitted runtime is about 686 KiB before compression. Workers serves these
as client assets; they are not imported into the Worker executable. Asset MIME
handling follows the [Cloudflare static asset documentation](https://developers.cloudflare.com/workers/static-assets/headers/);
the client-only plugin uses [Vite's environment hook](https://vite.dev/guide/api-environment-plugins).
The existing offline manifest includes both files. No live deployment or
complete offline-flight playthrough was performed in this packaging check.
The full suite passed 204 tests with zero skips; lint and the production build
also passed.

## Player death-volume follow-up

The native runtime now samples the authored `DepthTestCubes` group using the
original ordered, frame-delayed local-box intersection loop. The engine consumes
that hit instead of its former checkpoint-relative death height. All 44 volumes
and 189 reset/material cases are checked; natural native falls and an in-browser
life deduction/respawn are covered. Full death presentation remains separate.
See [death-volume evidence and limits](original-death.md).

## September 9 deployment

`pnpm run deploy` published version `1470dfa1-b753-4f4a-afa0-0f67138e9d33`
to https://ballance.fayaz.workers.dev/. The production build passed, and the
latest suite passed 211 tests with zero skips. The deployed offline manifest
is `44012f097b2bf7056beb` (293 files, 59.1 MB), including the native solver.
This deployment does not establish complete original-game parity.
