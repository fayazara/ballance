# Original ending-balloon physics

The local IVP path now instantiates the physical assembly from the supplied
`3D_Entities/PH/PE_Balloon.nmo`. The ordinary/deployed Rapier path remains on the
older finish implementation. No original executable was run.

`scripts/read-original-finish.py` reads the original PE and Gameplay chunk dumps
and emits `src/game/original-finish-data.json`. The shared chunk reader now reads
compound behavior graphs as well as primitive behaviors, including saved
priorities and target classes. Recovery follows the create links in authored
order and asserts the approach, boarding and bridge-release links.

| Parts | Original creation settings |
| --- | --- |
| Eight entry plates | Mass 0.5, Floor exclusion identifier, frozen, collision enabled, authored COM zero, each selected plate's own convex mesh |
| Platform | Mass 4, Floor exclusion identifier, frozen, collision enabled, six convex hulls, COM `(0,2,0)` |
| Four balloons and four ropes | Mass 0.2, empty exclusion identifier, frozen, collision disabled, damping 1/1 |
| Hidden sliding control body | Mass 4, empty exclusion identifier, frozen, collision disabled, damping 1/1, `Box_slide_Mesh` |

The assembly has seventeen hinges, two sliders and a spring. The physics is
activated with the final checkpoint; leaving that sector or resetting disposes
its bodies and their controllers. Its source setup creates bodies, sliders,
spring and hinges before monitoring approach. At the 70-unit XZ proximity, it
wakes the platform and installs eight persistent balloon/rope forces. Rope force
positions use the original external hinge reference transformed into world space,
then the native controller stores that point in the body's core frame. Every
force direction is normalized before applying its original impulse per PSI.

The one-unit XYZ boarding trigger starts the sliding body's departure force,
sends the level-end events, and destroys only hinge 524 between the platform and
the first plate. The remaining bridge hinges stay connected. The player's input
stops, physics continues, and the ball rides the platform. The web result waits
for the recovered Gameplay timing: a 3000 ms sky-transition interval followed by
10000 ms on ordinary levels or 23000 ms on the last level. Escape, Enter or Space
can skip the wait after the first interval.

Verification:

- Every level creates all 18 bodies and 19 joint handles; approach starts eight
  forces; boarding starts the ninth and removes one hinge. Repeated resets and
  sector changes invalidate the old body/force handles.
- A driven wooden ball crosses the actual Level 1 entry bridge, triggers boarding
  by ordinary contact and proximity, then remains supported during departure
  with its controls released.
- The in-app browser showed that same staged Level 1 crossing, rope/balloon
  motion, bridge separation and a grounded player on the departing platform.
  The result arrived at 13 seconds. This is a staged ending test, not a complete
  Level 1 playthrough.
- The complete suite passed 143 tests, with no skips; lint and build passed.

Remaining fidelity work: the source's sky-layer color transition is timed but
not rendered yet; the final-level UFO/hyperspace choreography is not implemented.
The detailed camera parenting, exact message-driven sound transitions and result
presentation still need source-faithful integration. A straight full-throttle
stone approach fell off the bridge in a probe; that observation does not prove a
physics mismatch, but stone traversal needs a controlled gameplay check. The
native backend remains local and opt-in at `?physics=ivp`.

## UFO motion recovery (2026-09-09)

`scripts/read-original-ufo.py` now exports all thirteen rows of
`PE_UFO_Pos&Time`, their finish/ball reference selectors, body/top spin,
grab and flash durations, and the relevant behavior links into
`src/game/original-ufo-data.json`. The angle parameter is a float in radians;
the shared chunk reader previously treated that parameter GUID as an integer.
The recovered angular speed is approximately 150 degrees per second.

The outer graph connects boarding's message output to the last-level gate and
then the UFO, with one frame of delay on each link. Showing the UFO initializes
the iterator immediately and starts dynamic positioning after another frame.
Each completed waypoint wait advances the iterator on the following frame.
The thirteen waits total 18,800 ms; this total excludes those frame delays.
The sixth row starts the 1,000 ms claw animation. Completion removes the ball's
physics, sets its parent to the UFO, and centers it at the UFO origin **one frame
later**. Iterator completion triggers the 800 ms hyperspace flash.

`src/game/original-dynamic-position.ts` implements the unrestricted update used
by this UFO. The supplied `TT_Toolbox_RT.dll` registers behavior GUID
`0x0fd4755f/0x7de22dc8` at callback `0x10004a80`. Its update stores the current
position as the next frame's previous position and calculates, per axis:

```
displacement = float32(current - previous)
error = float32(target - current)
scaledForce = float32(force * deltaMs * float32(0.001))
next = float32((error - offset) * scaledForce + displacement * damping + current)
```

The On input saves current position and returns without integrating. Damping
is per callback; it is not exponentiated or multiplied by delta time. The UFO
uses zero offset, no distance limit and world-coordinate position inputs. The
controller takes already-resolved positions. `OriginalUfo` now resolves the
finish/ball frames and schedules the delayed graph transitions in the native
rendering path, once per presentation frame rather than per physics step.

Validation uses `scripts/verify-original-dynamic-position.py`, a restricted
interpreter for the two arithmetic spans of the supplied DLL disassembly. It
checks every selected instruction's bytes against the DLL before interpreting
them, models 64-bit x87 significands and single-precision stores, and generates
53 numeric cases in `tests/fixtures/original-dynamic-position.json`. The
TypeScript controller matches those cases exactly: all thirteen row settings
at four frame durations, plus independent XYZ coefficients and offsets.
Additional tests cover overshoot, reset, angle decoding and delayed graph links.
The initial arithmetic recovery passed the then-current 172-test suite.

JavaScript double intermediates are not a general bit-exact replacement for x87
arithmetic, and the original runtime's FPU control word has not been verified.

Reproduce using the restored, ignored reference directory:

```sh
python3 scripts/read-original-ufo.py .local/reference/chunks/PE_Balloon.tsv > /tmp/original-ufo-data.json
cmp /tmp/original-ufo-data.json src/game/original-ufo-data.json
python3 scripts/verify-original-dynamic-position.py .local/reference/tt-toolbox-disassembly.txt .local/reference/game/Programmdateien_der_Anwendung/BuildingBlocks/TT_Toolbox_RT.dll > /tmp/original-dynamic-position.json
cmp /tmp/original-dynamic-position.json tests/fixtures/original-dynamic-position.json
node --test tests/original-ufo.test.ts
```

## UFO integration and detached camera (2026-09-09)

The local native engine now renders the original body, counter-rotating top,
and eight animated fingers. Six quaternion keys per finger retain their
nonuniform times (0, 35, 59, 70, 75, 100), tension, and scale. Tangent construction
was recovered from `CK2_3D.dll` function `0x10051040`, using logarithmic quaternion
differences, unequal neighboring time spans and Squad controls. The public
rendering-engine reconstruction's simplified tangent interpolation was rejected.
The Vx quaternion convention requires conjugation for Three.js; tests compare
every finger's initial quaternion against its saved parent-relative matrix.
The saved progression curves drive the 1,000 ms grab and 800 ms flash.

Capture removes the physical ball through the runtime's capture API (including
input/fan/sound cleanup), reparents its pose to the UFO, and centers it one frame
later. Respawn cancels the sequence and restores a physical player. The claw
one-shot is wired and its missing OGG/AAC recordings are now included by
`prepare-original.py`. Audible timing/gain and pause/resume parity remain
unverified; the continuous UFO sound/pitch/proximity and lights are unfinished.

`read-original-ending-camera.py` checks Gameplay's message-manager mapping for
`Level_Finish` (ID 11 in this file), then follows the links through camera/input
deactivation to `Set Parent Cam_Pos -> NULL`. Link 5933 inserts **two presentation
frames**, and the remaining links to detachment and clipping have zero delay.
The camera position controller continues toward the detached world-space frame
with forces `[5, .8, 5]` and damping `[.5, .3, .5]`; its separate look target
continues toward `BallPos_Frame` with forces `[10, 10, 10]`, zero damping.
The UFO graph translates Cam_Pos by `[0, -15, 0]` in its upright self frame.
Finish clipping changes to 3/2500 original units.

`OriginalEndingCamera` implements that separation for native endings. It starts
from the existing gameplay camera pose to avoid a visible snap. The subsequent [normal camera recovery](original-camera.md) now supplies the
actual Cam_Pos anchor and preserves both incoming controller histories. Exact
original scheduler interleaving and recording-based framing comparison remain
unverified.

The first browser check showed the camera chasing the abducted ball and missing
the flash. Detachment fixed framing but exposed a second error: the flash lost
its saved orientation and appeared edge-on. It now keeps the authored rotation,
and the material uses its recovered `VXBLEND_ONE`/`VXBLEND_ONE` additive factors.
An in-app browser check on the Level 12 native route now shows the textured purple
flash against the sky and restores the visible ball/gameplay camera after reset.
This was a staged bridge approach with real drive/contact physics, not a full
Level 12 playthrough or a side-by-side original-executable comparison.

The native Level 12 regression runs boarding, all thirteen waypoints, capture,
carried poses, flash and reset. It checks the flash against the ending camera's
frustum and verifies its face direction and blend factors. Separate camera tests
cover the two-frame detach, stable position, tracking target, single downward
translation and cancellation. Claw tests cover keys and continuity, but do not
yet provide a DLL numeric oracle for quaternion interpolation.

Camera recovery reproduction (after generating the regular three chunk dumps):

```sh
.local/reference/dump-chunks .local/reference/game/Programmdateien_der_Anwendung/3D_Entities/Gameplay.nmo --managers > .local/reference/chunks/Gameplay-managers.tsv
python3 scripts/read-original-ending-camera.py .local/reference/chunks > /tmp/original-ending-camera-data.json
cmp /tmp/original-ending-camera-data.json src/game/original-ending-camera-data.json
node --test tests/original-ending-camera.test.ts tests/original-ufo.test.ts
node --test --test-name-pattern='Level 12 boarding' tests/original-ivp-runtime.test.ts
```

The native backend remains local and opt-in. These checks do not establish
all-level physics parity; the deployed game still uses the existing solver.
The current complete suite passes 176 tests with zero skips. Lint, production
build, and `git diff --check` pass; the build retains its existing bundle-size
warning.
