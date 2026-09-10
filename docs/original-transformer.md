# Original material transformer

The original-mode transformer now captures the ball, animates the original machine, changes material near the end, and restores player physics. Same-material machines do nothing. Captured balls ignore steering; pausing freezes the sequence; respawn, restart, course changes and time expiry cancel it safely.

## Recovered behavior

The local `Gameplay.nmo` and `AnimTrafo.nmo` were read with `scripts/dump-original-chunks.cpp`. The numerical findings, original object IDs, and curve knots are recorded in [original-transformer-evidence.json](original-transformer-evidence.json). No executable was run.

| Behavior | Original value | Web behavior |
| --- | --- | --- |
| Nearest transformer test | distance < 4.3 | distance < 1.075 at 0.25 scene scale |
| Ball dephysicalization | 1,350 ms | Fixed body with disabled collider during capture |
| TT Set Dynamic Position | force 2; damping 0.7 on each axis; offset (0, -3, 0) | Spring capture to machine-local (0, +0.75, 0) |
| Ring_Open | 350 ms; displacement (-0.5, 0, -0.5) in each segment's frame | Four original segments open outwards |
| Up 'n Down | 2,000 ms; vertical travel 5.2 | Original ring, bars and flash field rise 1.3 world units and return |
| FlashAnim | alternate horizontal UV offset ±0.5 every 50 ms | Original additive flash texture alternates its two halves |
| Ring_Close | 200 ms | Original ring returns flush with the static machine |
| Old-ball explosion | 1,000 ms after capture ends | Old ball splits into its original material-specific fragments at 2.35 seconds |
| Set new Ball / physicalize | 150 ms after explosion | Material and collision shape change once at 2.5 seconds; velocities reset |

The animation graph links intro → ring open → up/down → ring close → exit; FlashAnim starts alongside up/down. The gameplay graph links capture → 1,000 ms delay → old-ball explosion → 150 ms delay → new ball → physicalize. The static machine is hidden while its animated counterpart is shown and restored after 2.55 seconds.

### Capture stop position

Reinspection of Gameplay compound 576 `dephysic Ball` found exactly three
children: 562 Physicalize, 528 TT Set Dynamic Position, and 568 Delayer.
Links 570/571 deactivate physics and start the spring; link 573 starts the
1350 ms timer from the spring's On output. Timer output 564 reaches spring
Off input 496 through zero-frame link 569 and compound exit 575 through link
572. There is no Set Position behavior in this compound.

`TT_Toolbox_RT/Behaviors/SetDynamicPosition.cpp` processes Off by clearing
its running flag, then executes its ordinary spring update before returning
CKBR_OK. The web adapter now performs that final update on the capture-ending
step and preserves its residual position through the explosion delay. It
previously assigned the exact target every frame after capture, adding a
teleport absent from this graph. A 10 Hz regression case distinguishes both
the final spring update and subsequent frozen position. Existing capture tests
now require convergence near the center rather than an exact center snap.
The broader graph scheduling and spring float arithmetic differences remain.

TT Set Dynamic Position's On branch saves the target's current position and
returns CKBR_ACTIVATENEXTFRAME before the spring arithmetic. Its On output
still starts the capture timer through link 573 during that activation frame.
The adapter now keeps the first capture-frame position unchanged while advancing
the timer; spring movement starts on the following frame. If an unusually large
activation delta also completes the capture timer, its zero-delay Off invocation
still performs the final spring update. A regression check distinguishes the
stationary activation frame from the first subsequent moving frame.

`scripts/verify-original-transformer-spring.py` compiles the upstream
SetDynamicPosition function with entity/parameter storage stubs. Positions are
already in its local coordinate frame; the harness does not emulate world
matrix conversion. Four frame durations produce 64 samples, saved with the
source hash in `original-transformer-spring-oracle.json`. Fused contraction is
disabled for the reference's individual float operations.
`originalSpringStep` matches every float32 coordinate in that fixture and is
now connected to gameplay through `OriginalTransformerFrame`. Capture converts
the rendered ball position to original units and the machine's local frame,
executes the spring there, then writes back through the machine world matrix.
The adapter uses the complete saved matrix, including tilted machines. The
identity-frame gameplay test matches 48 compiled source samples exactly; all
195 saved transformer group members across the 12 levels pass a local-target
round trip within 0.002 original units. This is not proof of exact VxMath matrix
parity: inversion still uses Three.js followed by float32 rounding, and the
multiply operation ordering has not been compared against the original DLL.
The center-only test API retains its previous recurrence for fixtures without
a machine matrix; production always supplies the saved machine matrix.

### Chained capture, explosion and replacement timers

Timing inputs now come from `src/game/original-transformer-clock-data.json`,
generated by `scripts/read-original-transformer-clock.py` from Gameplay.tsv.
The extractor verifies all three timer GUIDs/versions, their parameter values,
the capture compound's child inventory, and eleven relevant frame links. It
records the dump hash and source object indices. Runtime timing consumes the
generated durations and physicalization delay directly; the compiled TimerMini
oracle remains an independent arithmetic check.

The adapter now accumulates float32 milliseconds separately for Delayers 568
(1350 ms), 5 (1000 ms), and 487 (150 ms). Links 860/874/855/854 and the
start-Explosion compound's internal links have zero-frame delay. Each newly
activated timer therefore consumes the current frame's delta, discarding the
previous timer's overshoot. Ball visibility follows the actual explosion event,
not a nominal 2.35-second timestamp. Completion also waits for replacement, so
an unusual frame sequence cannot abandon a pending material change.

`scripts/verify-original-transformer-clock.py` compiles the original TimerMini
function and supplies only behavior parameter storage. Its duration tick counts
at 10/30/60/120/144 Hz are respectively `(14,10,2)`, `(41,31,5)`, `(82,60,9)`,
`(162,121,18)`, and `(195,144,22)`. Regression tests check explosion and material
replacement against these counts, including same-frame timer activation. All
232 tests, lint, and TypeScript checks pass.

Further graph inspection found **two-frame link 164** from Set-new-Ball child
output 135 to compound exit 168, before link 858 starts Physicalize-new-Ball.
Material replacement and physicalization now run as separate events, with two
script steps between them. Replacement changes the rendered model and prepares
the comparison collider while native IVP remains captured. The delayed callback
creates the native body and enables the comparison collider; completion cannot
discard this pending callback. Cancellation restores physics without executing
the delayed callback later. Regression tests check this separation at all five
oracle frame rates. Trigger messages have two-frame links 871 and 873;
entry link 873 is now connected as described below. The general
message scheduler and post-transformation rearming are not yet exact.

The native Level 1 browser check advanced the transformer one frame at a time.
At 2.483333 seconds it displayed stone with no native physics body; at 2.5 seconds
it was still unphysicalized; at 2.516667 seconds it had a native body. Two more
seconds left the stone ball supported by the actual pad, with transformation
inactive and no browser errors. All 232 tests, lint and TypeScript checks passed.

### Entry navigation stop and delayed capture

Saved message type 14, sent by 494 to All_Gameplay, reaches Wait Message 3065.
BallNav On/Off compound 3094 forwards output 3062 through link 3087 to 3093;
link 3127 reaches Ball Navigation Off input 1756. Its Nop output 1705 turns off
the key behaviors and explicitly shuts down all four force controllers through
links 1742–1745. Message type 7 received by 3071 supplies the resume path.
These numeric message identifiers are dump-local references, not invented names.

Entry link 873 delays capture by two script frames after the stop/sound message
chain. The engine now queues the selected pad/material, suppresses steering on
the following frame while retaining the physical body and momentum, and starts
capture on the second subsequent frame. Initial death detection, reset, and
transformation cancellation discard a pending entry. The delay is read from
the graph extraction, not converted to a fixed number of milliseconds.

In the native Level 1 browser check, successive samples reported entry frames
2 and 1 with a physicalized ball (vertical velocity continued from -0.602 to
-0.897 original units/s), followed by active capture with no physics body.
The final stone ball settled on the pad. Resetting during a subsequent pending
entry left a supported wooden ball with no later transformation. No browser
errors occurred. General receiver scheduling, source camera/sound message
timing, and the post-release rearming link 871 still need verification.

### Navigation resumes independently of the visual ring

Physicalize-new-Ball output 340 sends message 7 via 583. The message manager
processes queued messages in PostProcess; Wait Message 3071 supplies the
navigation-on path on the following script frame. The engine now allows normal
steering on that following frame even while the separate visual sequence is
active. Previously it suppressed drive until the hardcoded visual duration
elapsed, adding extra non-steerable frames at high refresh rates.

With forward held in the native browser test, at age 2.516667 seconds the new
stone ball was physicalized and its drive set was empty. At 2.533333 seconds
the forward drive was active while the visual sequence was still active; it
remained active when the ring finished. During the preceding replacement delay
the drive set stayed empty. No browser errors occurred. The development
inspector now displays native drive keys separately from held keyboard keys,
so input state and actual controller activation can be checked independently.

### Rearming transformer detection

Graph link 871 waits two frames after resume sound output 840 before clearing
the transforming flag through Identity 809. Link 865 then waits one additional
frame before Get Nearest In Group input 6. The extraction validates both links
and exports their three-frame sum. Detection now rearms three script frames
after physicalization; the adapter's extra 0.3-second post-animation cooldown
has been removed. The separate one-second reset guard has also been removed after tracing
zero-delay links 3112 (Init Ingame output 1572 to Trafo Manager input 875)
and 857 (manager input to nearest-machine test input 6). The extraction
validates both links. There is no extra reset timer in that initialization path.
The engine still withholds ordinary gameplay sampling during ball formation;
full concurrent script scheduling during formation remains unverified.

The native browser inspector observed countdown 3 on the physicalization frame,
then 2, 1, 0 on consecutive frames, without errors. A 144 Hz regression case
also verifies that a new capture can begin after rearm/entry even when the
previous visual tail has not quite ended; an active capture still rejects
overlapping requests. The existing 232-test suite passed, followed by the new
case in the eight-test transformer suite. Lint and TypeScript checks passed.

### Nearest machine and trigger distance

Get Nearest In Group 17 uses Trafo Group, local point `(0,0,0)`, and ActiveBall
as its reference. Its source compares float squared distances, retains the
first minimum, and outputs `sqrtf(min)`. Test 446 compares that distance strictly
below the saved radius `4.300000190734863`; only afterward does compound 437
compare materials. The extractor now validates these inputs and exports the
radius as well.

The adapter now selects the nearest machine before matching materials. A nearer
same-material machine therefore prevents a farther different-material machine
from activating. The invented requirement that the player be above the machine
origin has been removed. Distances are evaluated in original units using float32
rounding, including the strict radius boundary. Tests cover order-independent
nearest selection, the same-material case, the lower half of the spherical
trigger, exact radius exclusion, and stable tie handling. Exact tie parity still
depends on reconstructing the runtime Trafo Group insertion order: the current
pad inventory remains grouped by material and sorted by name.

The group construction was traced to Gameplay compound 949 `create TrafoGroup`:
Object Create 936 creates Trafos, Objects With Attribute Iterator 927 enumerates
the attribute-manager list, and Add To Group 941 inserts each result. The
iterator preserves `CKAttributeManager::GetAttributeListPtr` order. The current
asset format does not export that registration history, so sorting by source
object ID or group membership would not prove tie parity.

An all-twelve-course placement audit found mixed-material trigger overlap in
three pairs: Level 5 `P_Trafo_Wood_04` / `P_Trafo_Stone_05`, and Level 12
`P_Trafo_Wood_07a` / `P_Trafo_Stone_11` and `/ P_Trafo_Stone_14`. Regression tests
now load every course's transformer inventory and sample both sides of each
pair's midpoint, checking both reversed pair order and the full course inventory.
All six sample positions select the correct nearer machine. Exact midpoint ties
remain registration-order dependent. Four proximity tests, lint and TypeScript
checks passed; this placement audit is not a gameplay traversal of these areas.

### Replacement world orientation

Set-new-Ball compound 169 captures a matrix through Op 51 with ActiveBall input
45; result parameter 47 connects to BallMatrix parameter 20. After selecting
the replacement, Set World Matrix 25 reads parameter 20 and applies it to
ActiveBall. Set World Matrix 133 reads the same matrix for BallPos_Frame before
parenting it to the new ball. This preserves full orientation, not just position;
resetting the new paper hull to identity would change its physical contact pose.

A native/WASM replay regression now covers all six different-material pairs
with a non-identity quaternion. Each outgoing ball first receives a drive force,
then capture/replacement must preserve its rotation while clearing drive and
momentum. Twenty zero-gravity physics steps per pair verify stable position,
orientation and zero velocity; native and WASM recordings agree for all 120
samples. All four IVP player tests ran without skips; lint and TypeScript checks
passed. This verifies body recreation, not the complete engine transformer
visual path or subsequent floor contacts at every orientation.

### Material identity during the physicalization delay

Set-new-Ball selects ActiveBall before the two-frame link to physicalization.
The native adapter now changes the captured player's material identity at that
selection event, without creating an IVP body. Previously its displayed material
changed immediately but `OriginalIvpPlayer.material` and `localBounds` still
described the outgoing ball for two frames. That affected depth tests and other
material-dependent script checks during the delay.

`selectCapturedMaterial` is permitted only while the player has no physics body.
The native runtime's deferred material path uses it and refreshes the sound
binding with no body. A regression test replaces captured stone with paper,
checks the bounds against the original paper mesh, preserves the pose, verifies
that two simulation steps do not create a body, and then explicitly physicalizes.
All 239 tests passed without skips, along with lint and TypeScript checks.

The spring formula was checked against the [TT Set Dynamic Position implementation](https://github.com/doyaGu/CKBuildingBlocks/blob/main/TT_Toolbox_RT/Behaviors/SetDynamicPosition.cpp). The saved 2D curve knots and tangent slopes are reconstructed with cubic Hermite interpolation. This is a new runtime adapter, not execution of Virtools scripts: original render-frame dependence, exact Virtools curve evaluation, lightning, and environment-map shading remain fidelity work. The explosion interval now spawns simulated original fragments; see [debris findings](original-effects.md).

## Assets and verification

`prepare-original.py` now exports `AnimTrafo.nmo` as well as the levels and shared modules. To update an existing local pack without re-exporting all levels:

```sh
python3 scripts/extract-original.py --transformer \
  --library /path/to/BMap.dylib \
  --game /path/to/Programmdateien_der_Anwendung \
  --output .local/original
```

The animation meshes and two textures remain in the ignored local pack and are not copied to production.

`tests/original-transformation.test.ts` exercises all six material transitions, same-material rejection, overlapping triggers, input resistance, capture position, delayed replacement, restored mass/collisions, cancellation before/after replacement, and read-only animation sampling during pause. The imported visual test also covers null material slots and restoration of the stationary machine. The in-app browser's `?inspect` route offers small simulation steps and reports the active sequence, material, body type and collider state; it hides the pause overlay to allow visual inspection while simulation is paused.

Browser verification on Level 1: an off-center wooden ball converged to the stone machine's center despite two seconds of held input; it was still wood at 2.197 seconds and stone with dynamic physics and enabled collision after 2.55 seconds. The raised ring/flash field and restored static machine were visually inspected. Pause/resume retained the active sequence, and restarting mid-animation returned a visible, dynamic wooden ball to the level start. No additional browser exceptions appeared after the null material-slot fix. All 26 tests, lint and the production build passed; Vite retains its existing large-chunk warning.


### Native capture/release across the saved transformer inventory

The integration test in `tests/original-ivp-player.test.ts` runs all six material
replacements at each of the 195 saved transformer group members in all twelve
levels (1,170 capture/release sequences). It starts with a non-identity ball
orientation and a registered drive force, advances the actual transformation
sequence at 100 ms per frame, and transfers poses through the same coordinate
conventions as the engine. It checks that the player stays unphysicalized until
release, material replacement happens once, world orientation survives, and
new native bodies have no inherited linear/angular velocity. Final local
positions match the compiled spring's final capture sample within 0.003
original units, including tilted machine frames. This tolerance covers the
remaining matrix conversion rounding gap; it is not an exact DLL comparison.
These are isolated capture tests, not level traversal or surrounding-contact
proof. Group members include saved duplicate placements that gameplay filters.
