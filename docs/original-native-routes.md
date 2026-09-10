# Native route verification

These checks exercise the local IVP gameplay backend, not the earlier Rapier
fixtures. The existing native parameters and imported collision geometry passed;
no extra gate motor, scripted displacement or flight boost was added.

## Level 1: both three-post gates

The regression in `tests/original-ivp-runtime.test.ts` first attempts the corridor
with both gates closed and confirms that the ball cannot cross. It then restores
the scene and gives each gate two wooden-ball approaches. Each approach starts
10 original units behind the current target and holds the ordinary drive for
three web seconds. Gate travel reaches about 4.98 original units, at the physical
channel stop. The ball is then placed at the corridor entrance and driven across
both gates, remaining supported by the actual floor.

Only the player's approach/entrance placements are staged. Gate bodies are never
teleported or assigned artificial velocities. Placement height comes from a
triangle intersection with the authored floor; subsequent motion and contacts
are entirely native IVP.

The independent in-app browser repeated the closed and open cases. The closed
case stopped near original X 259.96. After two pushes per gate, the crossing ended
near `(276.90, -2.97, -792.74)`, with ground contact and the extra life between the
gates collected. Both gate bodies remained near their five-unit travel stops.
The development inspector exposes these same staged actions.

## Level 2: first fan to raised fan

A paper ball starts 2.2 original units above fan `P_Modul_18_01` in sector 3.
The fixture waits until it rises two units above the upper grille height, then
steers toward `P_Modul_18_12`, ten original units sideways and fifteen units
higher. This uses the rising hover phase rather than a hardcoded one-second wait.
The eight-second regression passes at both 60 and 132 script frames per second. The fixture only presses/releases the normal
directional keys; it does not change force strength or position during flight.
The upper fan's real controller engages, the first fan releases its controller,
and the ball stays within 1.2 original horizontal units of the upper grille while
hovering 14–24 units above it.

The browser inspector uses 60 Hz script frames for the staged sequence. With
normal live rendering at roughly 120 Hz before staging, the rebuilt runtime
finished near original `(1006.574, 79.520, -366.743)` above the upper grille at
`(1006.669, 60.623, -366.743)`. The ball was visibly airborne, the upper fan was
active and the lower fan was inactive. These are observations of this web port,
not an original-executable trajectory comparison.

## Level 7: unload and ride the weighted lift

The native regression starts wood above the paired entrance rails for
`P_Modul_03_01` in sector 5, then waits for real contact support. From there it
uses only ordinary directional keys: enter the doorway, push Wall04 off, brake
back toward the center, and push Wall03, Wall02, Wall01, Wall07, Wall06 and Wall05
off in succession. Each return to the center must have a supporting contact with
the actual moving platform. Each wall must fall through the source depth limit
and be removed by the runtime's existing cleanup, rather than by the fixture.

In the measured run, removing successive remaining walls raised the platform
from original Y 10.783 through 13.496, 16.145, 18.775, 21.438, 24.123 and 26.799.
The wooden ball then rolled onto the authored upper path at about Y 30.812.
The doorway weight remains on the lift. A control run that removes only Wall04
cannot reach that upper exit. A sector reset restores all nine lift bodies and
invalidates the old handles.

The route is continuous after its single initial player placement. It needs no
solver changes, scripted lift motion, artificial impulses, wall teleportation or
disabling colliders. This is a headless test of the playable native runtime;
this follow-up has not yet repeated the sequence in the browser or compared a
recording of the original executable. Other lift placements and full Level 7
remain separate verification work.

## Levels 8–11: all six driven swinging platforms

The native runtime regressions now cover forward travel across all six placed
`P_Modul_08` decks. Direction follows the course layout and checkpoint/finish
positions: negative Z in Level 8, positive X in Level 9 and Level 10's first
crossing, negative X in Level 10's second crossing, and positive X through both
Level 11 platforms. The initial drive direction in the module's force table is
not necessarily the direction in which the player traverses the course.

For the four Levels 8–10 placements, wood is staged once at the approach, allowed
to establish native support, driven across the moving deck and counter-steered
to stop on the authored exit floor. The checks require actual deck contact,
subsequent support from the static course rather than another moving prop, and
low final speed. Counterexamples use the same start/inputs with an earlier or
later boarding phase and fail to cross. These phases are fixture initial
conditions, not scripted platform animation or a guarantee that any departure
at that time succeeds from a different approach.

These crossing fixtures now use 60 Hz script frames with the recovered filtered
physics clock. Successful boarding phases are 0.2 seconds for Level 8, 3.5 for
Level 9 and 1 second for both Level 10 placements; controls use 1, 0, 0 and 0
seconds respectively. These are controller fixture phases, not game settings.

The Level 10 second exit has sloped rail faces. Requiring the ball to sleep on a
flat landing was an incorrect test assumption: releasing input makes it roll
back under gravity. The check still requires actual deck contact, static-course
support and less than 0.5 horizontal units of target error. Its speed bound is
one rendered frame's wood input impulse (at most three 66 Hz PSI events at 2x
speed, or about 0.679 original units/second), allowing discrete counter-steering
on those rails. Material coefficients and collision geometry are unchanged.

Level 11 is a connected two-platform/fan sequence, not two equivalent flat
crossings. `P_Modul_18_09` occupies the small landing between the lower and upper
decks. Paper crosses the first deck, centers over the real fan, and rises from
the landing at Y `-111.086` to about `-90.654`. The same still-physical ball then
steers toward the upper crossing, contacts its moving deck and stops on the
exit at approximately `(1206.482, -97.858, -343.565)`. The fixture never captures,
repositions or changes its material between these stages. Its wood control does
not engage the fan and does not complete this input sequence.

These tests use the existing native solver, source force/coast timers, hulls,
material properties and air column. No coefficients or mechanisms changed to
make the routes pass. They are headless native-runtime checks; matching an
original executable recording and in-browser checks remain outstanding. They
also do not establish uninterrupted playthroughs of Levels 8–11.

## Scope

The timing follow-up suite passes 182 tests with zero skips, plus lint. The original gate
and fan routes were also checked in the in-app browser; the newer lift and swing
routes above have only been checked headlessly. Together they exercise actual
player/mechanism interactions, rather than only isolated assembly construction.
Complete level playthroughs, remaining finale presentation, full behavior-graph
ordering and other documented fidelity boundaries remain open. The native runtime
now separates presentation frames from filtered physics intervals; see
[original-frame-timing.md](original-frame-timing.md). The native
backend is now the local development default (`?physics=rapier` selects the comparison backend); these changes did not
change the production backend or deploy a new build. Earlier gate and lift
fixtures retain their explicit 132 Hz test-frame cadence; their numeric browser
observations above predate the timing follow-up.

## Native rotating-arm follow-up

A native-runtime regression covers all six arm placements across Levels 3, 7
and 9 with each ball material (18 staged approaches). It waits for
native floor support before applying ordinary discrete directional inputs. Each
case must contact and deflect the real arm and finish supported on the authored
static floor. Wood and stone reach and stop at the exit; paper contacts the arm
but does not pass under the same controller. Source masses, springs, hulls and
input forces are unchanged.

Level 7 requires a turn: a straight target eight units beyond the pivot falls
off the authored platform. The verified route contacts the outer arm at a
12-unit lever offset, crosses to four units beyond the pivot, moves along the
platform to the 19-unit offset, and turns down the narrow outgoing path. The
same physical wood or stone ball completes all three segments without resetting
or changing material. Every waypoint requires native static-floor support,
less than 0.3 original units of horizontal target error and speed below 0.3.
The turning controller releases its keys once near the target and slow enough,
then allows two seconds of native coasting before checking the stop. Paper
remains supported against the arm and does not start the later waypoints.

Exploratory checks at the shorter 8- and 10-unit lever offsets let stone pass
but stalled wood. At 14 units, all three materials bypassed the arm without
contact, so that path is not used as evidence of pushing behavior. These are
input-specific observations, not a universal claim that paper cannot traverse
this part of the level.

This is headless, staged route evidence, not uninterrupted level completion or
a trajectory comparison against the original executable. Local default IVP selection was
also verified in the browser without a physics query parameter. Production builds now package the same IVP backend; the live deployment includes
that change as of September 9, 2026. See [packaging verification](original-ivp-wasm.md#production-packaging-verification).

## Level 2: material-dependent chain bridge crossing

The native runtime test now stages the ball once on the approach to
`P_Modul_29_01` in sector 3, waits one second for support, then holds the normal
right-direction input for three seconds. It repeats the route with wood, stone
and paper at both 60 and 120 script frames per second. Every case must establish
contact with the authored approach and with an actual bridge plank. Wood and
paper must subsequently contact the authored floor beyond the bridge. Stone
must emit the original rope-tearing sound once, fail that supported crossing,
and fall at least 15 original units below the bridge origin. Resetting between
cases rebuilds the assembly; no plank pose, force or constraint is changed by
the fixture.

All six route cases pass. This closes the earlier isolated Level 2 bridge
contact/traversal gap, but does not establish other bridge placements, reverse
crossings, a full level playthrough, or original-executable trajectory equality.

## Chain inventory route audit

`scripts/probe-native-chain-routes.ts` probes both directions of all 17 saved
chain bridges using a wooden ball and the actual course collision geometry.
Run `node scripts/probe-native-chain-routes.ts` for a 12-unit local approach and
60 settling frames; pass `8 12` for the shorter approach. The checked-in
`original-chain-route-probe.json` and
`original-chain-route-short-approach-probe.json` record all 34 outcomes for each
configuration. A supported exit means that a supporting authored-floor contact
occurred beyond 12 units along the crossing axis; it does not mean that the
ball stopped there or remained safe after continuing to hold the drive.

The first probe establishes approach support, plank contact and supported exits
in both directions at 13 placements. Its four unresolved placements are Level
4 `P_Modul_29_02`, Level 8 `P_Modul_29_03`, and Level 10 `P_Modul_29_01` and
`P_Modul_29_02`. The shorter approach establishes a supported forward crossing
at the Level 8 bridge and Level 10 `P_Modul_29_02`. Their continued straight-line
inputs subsequently fall off the downstream route, so those are not safe-stop
fixtures. The Level 4 bridge stops the ball near either end; the tilted Level
10 `P_Modul_29_01` lacks an established approach in the shorter probe and falls.
These two placements require geometry/contact inspection before diagnosing a
solver problem. Failed approaches are retained as evidence rather than silently
omitted or treated as proof that the course is broken.

### Resolving the two remaining chain approach failures

Contact inspection explains the Level 4 false negative: the forward crossing
lands on its authored floor at local X about 9.50, then reaches an authored end
wall at X about 11.45. The generic 12-unit exit target is beyond that wall. A
specific native regression requires plank contact, support beyond X=9, a static
wall contact opposing the drive beyond X=11, and continued floor support. It
passes without changing geometry or physics.

Level 10 `P_Modul_29_01` is banked. A straight longitudinal drive slides off its
side. A second regression uses ordinary longitudinal and lateral keys, choosing
the lateral key from the local side-position error and side velocity. After one
initial placement it contacts the first, middle and final planks, then lands on
the authored exit floor. The same initial placement with no lateral correction
fails. The test stops after two seconds, while the balanced ball is supported;
continuing straight would eventually leave the downstream route. No force
strength, collider, gravity or constraint is changed.

Together with the earlier probes, these checks establish at least one supported
crossing at all 17 chain placements. They do not establish every material,
reverse direction, safe downstream stop, full level route, or matching original
executable trajectories. The original failed probe outputs remain diagnostic
records of their exact input sequences.

### Chain material and reset coverage

The former Level 2 release test now covers all 17 placements, staging wood,
stone, paper and stone again above each authored release plank. Each reset must
destroy the previous plank handle. The first script frame's tearing-event count
must match the number of authored release centers inside the strict four-unit
radius for stone, and zero for wood/paper. Continued simulation checks that the
release remains one-shot and can be triggered again after a sector reset.

Level 6 contains two vertically adjacent bridges. Above the lower release plank,
the staged ball is 2.5 units from that plank and about 3.602 units from the upper
one, so both stone triggers enter immediately. Above the upper plank, only its
trigger enters initially; the falling stone subsequently releases the lower
bridge. These fixtures expect two total tearing events in Level 6 and one at
other placements. All 68 material/reset scenarios pass. This verifies the
staged material/proximity lifecycle, not continuous route entry with every
material or equality to an original-executable contact recording.

## Level 8: first suspended sack with the native oscillator running

A native runtime regression stages paper, wood and stone on the paired-rail
approach to `P_Modul_26_01`, waits one second, then drives right for four seconds.
At both 60 and 120 script FPS, each ball must establish authored-floor support,
contact the sack, and regain supporting floor beyond it. The massive rope must
never appear in player contacts because its source collision flag is disabled.
A subsequent sector reset destroys the old sack handle and exactly restores its
initial native pose. All six cases pass with the oscillator and both joints
active throughout; the test does not alter their forces or motion.

This replaces the earlier absence of a native player-contact route check for
this sack. It does not extend the old isolated Rapier test's mass/displacement
ordering to the running oscillator: different materials reach the swinging
sack at different phases. The full three-sack corridor, downstream stopping,
and the other 17 placements remain separate route verification work.

### Three-sack corridor and unresolved 120 FPS paper case

The continuous corridor fixture stages the player only at the first approach,
waits one second, then uses normal directional inputs with positional braking
toward original X=622 and the first sack's Z. At ten seconds, 60 FPS wood and
paper and 120 FPS wood have passed the last sack and remain on authored floor,
within one unit of the braking target. Their residual speed is below one frame
of that material's ordinary drive response; this allows discrete braking on the
exit slope rather than asserting a perfectly sleeping body. They contact at
least two sacks and never drop below the corridor's lower bound.

The fourth sequential case, 120 FPS paper, currently falls. It reaches about
X=622, Y=-133 by ten seconds instead of remaining on the exit. A fresh 120 FPS
runtime probe succeeded, whereas the test retaining the runtime across earlier
60/120 FPS resets failed. Physics-clock history or other retained state is an
investigation lead, not a diagnosed cause. Reproduce the unresolved case with:

```sh
BALLANCE_SACK_PROBE_ALL=1 node --test --test-name-pattern='three-sack corridor' tests/original-ivp-runtime.test.ts
```

The ordinary regression covers only the three established routes; the opt-in
fourth case intentionally remains a failing diagnostic. Stone also stalls near
the third sack under these inputs and is not certified by this route fixture.
No gameplay physics were changed to fit these input sequences.

### Paper departure timing follow-up

Repeating the fourth paper run in the same reused runtime, while changing only
its departure wait, established supported exit arrivals at 0, 0.25, 0.5, 0.75,
1.5 and 2 seconds. The 1 and 1.25 second departures failed. All runs retained the
previous three trajectories, native time (~59.95 seconds), filtered clock,
material parameters, sack controllers and course geometry. This establishes
that the reused-runtime route is traversable; a failing open-loop input sequence
alone does not establish a reset or solver bug.

The ordinary corridor regression now includes the 120 FPS paper case with a
half-second departure wait. It meets the same approach-support, multiple-sack
contact, exit-support, braking-distance and bounded-speed assertions as the
other three cases. `BALLANCE_SACK_PROBE_ALL=1` replaces that departure with the
unsuccessful one-second input sequence and retains the previous reproducer.
No gameplay reset, clock or contact behavior was changed. Matching the original
executable's successful departure windows remains unverified.

### Stone stall diagnosis

Eight departure phases from 0 to 2 seconds left stone short of the third sack
under the direct corridor inputs. Contact inspection at the stalled endpoint
shows only the two authored rail faces, not a sack or other moving prop. Their
normal ratios imply an uphill grade of about 0.320. With original gravity 20,
climbing at that grade requires horizontal acceleration greater than about
6.397 before damping. Stone's source drive supplies `0.92 * 66 / 10 = 6.072`
original units per physics-second squared. Thus sustained drive is insufficient
to accelerate uphill from rest on that grade. Momentum and a different route
remain separate possibilities; this is not proof that stone can never traverse
this section.

A native regression now retains the direct stone approach, requires actual
paired-rail support without moving-prop contact at its endpoint, and checks the
gravity/drive comparison from the measured normals and source material values.
This resolves the suspected immovable-sack diagnosis without altering any
physical parameters. Original-executable comparison remains outstanding.

## Sack placement route inventory

`node scripts/probe-native-sack-routes.ts` now probes both local-X directions at
all 18 sacks with wood, a single staged approach, one second of settling and
four seconds of ordinary drive. `node scripts/probe-native-sack-routes.ts 8 60 z`
checks local Z instead. The complete 72 outcomes are retained in
`original-sack-route-probe.json` and
`original-sack-route-perpendicular-probe.json`. A positive exit records a
supporting authored-floor contact at least eight units beyond the sack during
the attempt; it is not a final stop or full-course route.

Local-X attempts establish entrance support, sack contact and an exit at 12
placements. The perpendicular approach adds Level 11 `P_Modul_26_02`, where both
local-X starts were off the route. Five placements remain unresolved by these
simple approaches: Level 9 `P_Modul_26_01` and `P_Modul_26_03`, Level 10
`P_Modul_26_02`, Level 11 `P_Modul_26_03`, and Level 12 `P_Modul_26_04`.
Some failures never establish entrance support, and some pass or contact the
sack without finding the probe's straight exit. Their path geometry and input
sequence require inspection; none is classified as a solver defect from these
probes alone. All original forces and colliders remain active.

### Steering recovery at two additional sacks

A native regression now crosses Level 9 `P_Modul_26_01` in negative local X and
Level 10 `P_Modul_26_02` in both local-X directions. It uses the same eight-unit
approach and one-second settling phase as the initial probe, followed by normal
keyboard steering/braking toward an exit twelve units beyond the sack. All
three attempts require approach support, actual sack contact, final authored-floor
support, and a final position within one horizontal unit of the exit target.
They pass at 60 FPS. No sack controller or contact parameters are modified.

This establishes supported crossings at 15 of the 18 sack placements. The
unresolved placements are now Level 9 `P_Modul_26_03`, Level 11 `P_Modul_26_03`
and Level 12 `P_Modul_26_04`. Straight-line failures at the newly covered sacks
were insufficient route control, not evidence of an immovable object. Other
materials, departure phases and original-executable trajectory comparison
remain outside these three fixtures.

### Turning and diagonal sack paths

Floor-triangle inspection resolves two misplaced straight-line probes. Level 9
`P_Modul_26_03` sits on a narrow world-Z path that turns toward positive X just
beyond the sack. The native fixture starts at world offset (0,4,-8), steers to
(0,0,3), then brakes at (10,0,5), relative to the sack root. Level 11
`P_Modul_26_03` crosses a diagonal floor strip: start (-8,4,2), steer through
(0,0,0), finish at (10,0,-4). Y in the steering waypoints is ignored; gravity
and contacts determine height.

Both wood routes use one initial placement, ordinary keys, and the running sack
oscillators. They require initial floor support, real sack contact, completion
of both steering legs, final floor support and a horizontal stopping error below
one original unit. Both pass at 60 FPS. This establishes supported routes at 17
of the 18 sack placements; Level 12 `P_Modul_26_04` remains unresolved. The test
does not establish uninterrupted level traversal or original-executable parity.

### Final Level 12 sack: upper-route check

A specific regression crosses `P_Modul_26_04` with wood in both world-Z
directions. It starts eight units before the sack and four units above its root,
waits half a second for approach support, then uses ordinary steering/braking
toward the upper junction eight units beyond the sack. Both runs contact the
sack, remain above the lower route throughout, and finish on authored floor
within one horizontal unit of the upper target. The same initial placement and
one-second departure fails in each direction. No physics values are changed.

Other exploratory timings reached a floor roughly seven units lower, exposing
a limitation of the generic inventory probe: any-floor support alone does not
prove that the intended route was preserved. This regression therefore requires
final height above root Y-2 and minimum height above root Y-3 in addition to
floor contact. The half-second cases pass both gates.

All 18 sack placements now have at least one staged supported-crossing result,
but the generic inventory cases still need equivalent route-layer and safe-stop
checks before being treated as complete obstacle-route verification. None of
these fixtures establishes uninterrupted twelve-level traversal or original
executable trajectory parity.

### Correction after identifying exit-floor objects

The inventory probe now records the first exit frame, its position and height
relative to the sack, minimum preceding height, and exact authored supporting
floor IDs/names. The native runtime retains the floor-handle to source-object
mapping for this diagnostic purpose; it does not change collisions.

This stronger evidence retracts three generic upper-route coverage claims:
Level 12 `P_Modul_26_01` (negative local X), `P_Modul_26_02` (negative local X),
and `P_Modul_26_03` (positive local X) first find support 7.82, 7.91 and 7.81
units below their respective sack roots. They land on `A01_Rail_03` or
`A01_Rail_04`. Those probes establish lower-rail landings, not preservation of
the upper route. The previously stated all-18 supported result must not be read
as all-18 correct-route coverage: these three upper crossings remain unverified.
The dedicated `P_Modul_26_04` half-second fixture already enforces upper-route
height and remains valid.

Level 8's lower inventory exits lie on `A03_Rail_01`, the sloping corridor
covered by the continuous three-sack fixture. A fixed root-relative height
threshold therefore cannot replace checking authored floor identity and route
geometry. The complete first-exit records remain in both probe JSON files.

### Upper-route verification for all four Level 12 sacks

The dedicated upper-route fixture now covers `P_Modul_26_01` through
`P_Modul_26_04`, both world-Z directions, and half-second versus one-second
departure waits: sixteen native scenarios. All eight half-second crossings
establish entrance support, contact the corresponding sack, remain above root
Y-3 throughout, and finish on authored floor above root Y-2 within one horizontal
unit of the upper target. All eight one-second attempts fail the upper-exit
criterion. These checks replace the three lower-rail inventory results as
positive evidence for the correct upper route.

All sixteen scenarios pass at 60 script FPS without changing physical bodies,
controllers or forces. Each obstacle is staged independently; this is not a
continuous four-sack run, a 120 FPS guarantee, or an original-executable timing
comparison. The older lower-floor probe outputs remain useful counterexamples.

### Continuous Level 12 four-sack upper corridor

The native runtime regression now crosses the entire four-sack section with a
single wooden-ball placement before sack 01. After a half-second departure wait,
ordinary keys steer/brake toward successive upper junctions at original
Z=113.771, 97.811, 81.787 and 65.787, holding X at the corridor center. The next
leg starts only when the ball is supported, within 0.6 units of the junction,
and slower than 0.5 original units per physics second. The player handle remains
unchanged and all sack controllers continue running throughout.

At 60 FPS the ball contacts the first two sacks, avoids the later swings,
remains on the upper route (minimum Y about 1.442), and finishes supported and
slow beyond sack 04. A control with the same initial placement and direct
steering toward only the final target falls. The forty-second test requires
minimum height, final upper-floor support, stopping distance, low final speed
and at least two real sack contacts. No body is moved by the fixture after its
single initial placement; no physics parameters change.

This is a continuous local route, not an uninterrupted Level 12 playthrough.
Other materials, frame rates and original-executable trajectory/timing parity
remain unverified for the complete corridor.

### Four-sack corridor at 120 FPS

The continuous wooden-ball fixture now runs at both 60 and 120 script FPS with
the same half-second initial wait and supported, low-speed junction transitions.
Both junction-braking runs retain the player handle, remain above the lower
route, and finish supported and slow beyond sack 04. Both direct-through
controls fail. The 120 FPS trajectory contacts sack 01 but avoids later swings;
the 60 FPS trajectory contacts two sacks. Requiring every obstacle to collide
would reject valid timed avoidance, so the test preserves the first-sack contact
requirement and separately checks the extra contact in the 60 FPS fixture.

The passing routes demonstrate playability at both frame rates, not identical
trajectories. Matching original executable contact phases and testing other
materials remain separate work.

### Uneven-frame actuator timer comparison

`scripts/verify-original-actuator-clock.py` compiles the actual upstream
`TimerMini.cpp` function with a minimal parameter-storage harness. The generated
`original-actuator-clock-oracle.json` records first completion for 500 ms and
1500 ms timers over three repeating frame schedules, including zero-duration
frames and 350 ms stalls. The six source results take respectively 30/89,
32/96, and 6/15 timer activations.

The native runtime regression compares those completion frames to Level 8's
`P_Modul_08_01` swinging-platform and `P_Modul_26_01` sack force controllers.
It separately accounts for the extracted swing startup link and sack output
link. Existing force handles remain attached until the expected transition;
the subsequent stage replaces the handle. A zero-duration script frame consumes
the sack's one-frame output delay, independently of physics advancement.

This verifies timer arithmetic and adapter link handling for the first stage.
The oracle does not execute the original behavior graph or prove its dispatch
ordering or physical trajectories under long stalls.

The subsequent repeated-cycle fixture executes 400 script frames per schedule
and actuator kind. Its C++ harness reactivates separate TimerMini instances using
the extracted four-stage swing/two-stage sack topology, zero-delay swing links,
and one-frame sack links. All six native transition sequences match, including
timer reactivation after a complete cycle. The native test also checks every
frame for absent force controllers during swing stages 1 and 3 and present
controllers during the powered stages. This extends the arithmetic check to
repeated activation and validates unpowered intervals; the harness-supplied graph
connections remain an assumption, not an original executable scheduler oracle.
