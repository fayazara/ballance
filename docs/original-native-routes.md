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
