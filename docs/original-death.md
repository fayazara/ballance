# Authored player death volumes

The native game now uses the 44 `DepthTestCubes` volumes authored across the twelve courses. It no longer kills the player at a fixed checkpoint-relative height. The old test was `player.y < reset.y - 22` in web units; it ignored the volumes' X/Z extents, different heights and orientations.

## Recovered behavior

`Gameplay.nmo` / `BallManager` contains Group Iterator 2929 and Box Box Intersection 2939. Initialization operation 1286 resolves `DepthTestCubes`; its output feeds the group parameter. The iterator's element and `ActiveBall` feed the intersection test. Both hierarchy flags are false.

The building block calls `CollisionManager::BoxBoxIntersection` with both local-box flags true. The manager constructs oriented boxes from each entity's local bounding box and world matrix, then calls `VxIntersect::OBBOBB`. The port reuses `original-box.ts`, retaining volume scale/orientation and the current ball material's mesh bounds and rotation. The touching-boundary comparison is inclusive. It does not substitute a sphere radius or an infinite plane.

Links 2942 and 2943 are zero-delay: the current iterator member is tested, and True starts Deactivate Ball. The False-to-next-member link 2944 delays one script frame. Iterator exhaustion has its own Out event; link 2945 waits one frame before restarting at member zero. Thus a group of N volumes has an N+1-frame cycle while no volume intersects. A hit remains latched until the player resets. Checkpoint sector changes and material changes do not restart this loop; a new ball does.

The native runtime samples before advancing the frame's physics interval, including when the player has been temporarily unphysicalized for a transformation. The engine consumes the hit and starts the delayed Deactivate Ball / New Ball sequence described below, or enters the lost state when no spare life remains. The comparison Rapier path retains its earlier height test.

## Evidence and validation

```sh
python3 scripts/read-original-death.py .local/reference/chunks/Gameplay.tsv
node --test tests/original-death.test.ts
node --test --test-name-pattern='native falls|all six native arm' tests/original-ivp-runtime.test.ts
```

The extractor verifies the group parameter wiring, entity inputs, hierarchy flags and seven relevant graph links with their saved frame delays. The local-box behavior was checked in `Collision/Behaviors/BoxBoxIntersection.cpp` and `Collision/CKCollisionManager_AdvancedIntersectionFunctions.cpp`; iterator progression was checked in `Logics/Behaviors/GroupIterator.cpp`, all from the previously cited CKBuildingBlocks revision.

Tests cover group order independently of object-array order, the empty iterator frame, hit latching/restart, exact touching, rotated/scaled boxes, and rejection of points inside a world AABB but outside the actual oriented volume. Across all twelve levels, each of the 44 authored volumes detects each ball material; all 63 reset points are safe for every material, for 189 reset/material cases. A far-away low point remains safe because the original uses bounded volumes.

A native Level 1 regression naturally drops wood, stone and paper into the first volume. Each hit occurs above the old checkpoint-relative cutoff, then an actual reset clears the hit and restores native floor support. Existing arm routes additionally require that no death volume was touched during their approaches, passages or turns.

In the in-app browser, the development fall control dropped wood into the real first Level 1 volume. It respawned near original `(54.073, 16.033, -152.941)` on the start platform with native support, a cleared hit, and exactly two spare lives, down from three. Repeated browser falls then showed one spare life, zero spare lives, and finally the lost state on the next fall. The full suite passed 208 tests with zero skips; lint and production build also passed.

## Delayed respawn lifecycle

The port now follows the extracted Deactivate Ball 2499 / New Ball 2921 graph:
two script frames before the spare-life test; a 1000 ms Delayer before removing
the old ball and deducting one spare life; one frame before positioning the hidden
replacement; a 3000 ms Delayer before physicalization; and one frame before wake
and restored controls. The original white flash uses its saved 2000 ms Bezier
curve and colors. Game time stops during the transition while native mechanisms
continue stepping. The final spare life permits a replacement; the next fall
with zero spare lives ends the game.

Both Delayer nodes have GUID `(15d472a5,3bea409f)`, version `0x20000`, verified
against the asset by `scripts/read-original-respawn.py`. They match upstream
`Logics/Behaviors/TimerMini.cpp`: reset elapsed to zero on In, then immediately
add the activation frame's float32 DeltaTime and test `elapsed >= duration`.
The previous TypeScript sequence missed that first timer tick. The corrected
version also allows removal on the activation frame when DeltaTime is 1000 ms,
while retaining the separate frame link before New Ball.

`python3 scripts/verify-original-respawn-clock.py` compiles the actual upstream
function with minimal behavior parameter storage. Its activation-inclusive tick
counts for 1000 / 3000 ms are: 10 Hz `10/30`, 30 Hz `31/91`, 60 Hz `60/180`,
120 Hz `121/361`, and 144 Hz `144/433`. These are float32 accumulation results,
not rounded seconds-to-frames conversions. `tests/original-respawn.test.ts`
checks the complete event frames against those counts, including the separate
life-check, positioning and wake links.

The local in-app browser verified a real Level 1 death-volume fall entering
`forming` with no native player body and a hidden ball, then returning to `idle`
with a visible, physicalized, supported ball near `(54.064,16.037,-152.893)`.
The browser error log was empty.

On Level 12, the browser then verified paper, stone and wood respawns in sequence.
Each replacement retained its material, became physicalized/visible, and regained
floor support. Spare lives progressed `3 → 2 → 1 → 0`; the wood replacement still
formed with zero spare lives remaining, and the following fall entered `lost`
without creating a replacement. Paper's game timer remained exactly
`491.016733354414` throughout a two-second formation interval. All 225 tests,
lint and the production build passed after the activation-frame correction.

## Remaining limits

The New Ball lightning sphere, texture cycle, light curves and sound are now
connected; see [original-lightning.md](original-lightning.md). Its separate
particle burst remains incomplete.
The tests establish the selected timers and links, not all
cross-script scheduling. The existing oriented-box helper uses JavaScript double
arithmetic. These tests and the targeted fall do not establish twelve
uninterrupted level playthroughs.

## Initial level entry

Gameplay link 3110 connects `Init Ingame` output 1572 to `BallManager` input 2949
with zero delay. Link 2940 immediately forwards it to `New Ball` input 2919.
The extraction script now validates both links. Initial entry bypasses the
Deactivate Ball life check, removal delay and white screen flash. It enters
formation directly and uses the same 3000 ms physicalization delay and one-frame
wake link as a replacement ball.

The native load path now captures/hides its provisional player and queues this
initial entry for the first simulation frame. Formation keeps the game timer
stopped and does not deduct a life. The original lightning and recording start
when New Ball positions the player. The comparison Rapier path is unchanged.

The in-app browser checked all twelve original courses with a development-only
pause-after-loading checkbox. Each loaded with an unphysicalized, hidden player,
three lives, 500 timer units and no death flash. After two simulated seconds all
remained in formation with unchanged time/lives. After another two seconds every
course had a visible, physicalized, supported ball and three lives. Browser errors
were empty. This is startup coverage, not complete-level route coverage. All 230
tests passed, as did lint and the production build.

## Held keyboard state during formation

The upstream `Controllers/Behaviors/KeyEvent.cpp` resets its output state on
activation, then polls `CKInputManager::IsKeyDown` on that same frame. Disabling
the behavior does not clear the input manager's physical keyboard state.
The browser now retains mapped key presses through death and formation, with
keyup continuing to remove released keys. `stepRespawn` still submits an empty
drive set throughout the sequence; normal drive sampling resumes afterward.
Escape/Enter actions remain suppressed during formation, and blur still clears
held controls. This change passed the existing 230 tests, lint and TypeScript
build checks.

The development inspector exposes Hold/Release forward controls which dispatch
DOM keyboard events through the registered window handlers (not direct writes
to the engine key set). In the in-app browser, holding through two seconds of
initial Level 1 formation retained `arrowup`, left the player unphysicalized,
and kept its position exactly `[54.095623,17.656509,-153.071823]`. After two more
seconds, formation was idle and native movement advanced x to `66.055571`.
Repeating the case but releasing during formation cleared the key set; after
formation, x remained near the spawn at `54.131036` (normal settling), with no
held drive. Both cases had no browser errors. These exercise synthetic DOM
keydown/keyup and real native simulation; physical keyboard hold delivery and
full-level playthroughs remain separate validation.
# Authored resetpoint settling coverage

The native engine's held respawn now positions a captured player without
creating a transient physics body. Previously `transform`, `reset`, and the
final `capture` created and destroyed temporary bodies before formation had
finished. The runtime reset API can now retain an unphysicalized player; only
the recovered `physicalize-ball` event allocates its replacement. The native
regression counts sphere/convex allocations for all three materials, checks
that formation cannot move the captured pose, and checks zero release velocity.

An in-app browser check observed initial formation with no physical ball,
followed by an idle, visible, grounded player. A staged death reduced lives from
three to two and repeated the same unphysicalized formation and supported
recovery. Browser error logs were empty. This checks integration of those
events, not frame-by-frame equivalence to the original executable.

Initial level loading now uses the same deferred ownership: the playable native
runtime constructs its player in captured state, performs held positioning, and
lets the opening sequence create the first body. Previously runtime construction
and the engine's redundant transform/respawn calls allocated temporary player
bodies before `beginInitial`. Standalone solver fixtures retain their explicit
default of immediate physicalization. A constructor regression counts zero
allocations before release and one at release for each material. A fresh browser
load confirmed positioning and formation without a physical ball, then idle,
visible, grounded play with no error logs.

A subsequent engine audit found `cancelTransformation()` still released any
captured player, including one owned by respawn rather than a transformer.
Its recreation path is now guarded by an active, not-yet-physicalized
transformation. The inspector exposes the player's successful physicalization
count so temporary allocations cannot hide behind an ultimately empty handle.
A fresh browser load measured 0 at positioning, 0 during formation, and 1 after
formation. The staged-death fixture itself replaces bodies while positioning;
from the resulting count of 3 during reformation, completion increased it to 4.
Browser error logs were empty. The prior native-only allocation tests did not
exercise the engine's generic cancellation method; this browser measurement
adds that missing integration evidence.

The in-app browser then exercised the inspector's registered keydown/keyup path
during a paused opening sequence. A forward key pressed before formation stayed
in `heldKeys` while `nativeDriveKeys` remained empty and no ball body existed.
After completion, `forward` appeared in the native drive set and the ball moved;
key-up plus the next script frame removed that controller. In a fresh second
load, releasing the key during formation left both sets empty after completion
and the ball grounded. Browser error logs were empty. No input change was
needed: the existing handler retains physical-key intent while respawn blocks
force creation. This is a synthetic registered-event integration check, not
hardware keyboard timing or a full course playthrough.

`node scripts/probe-native-resetpoints.ts` physicalizes each of the 63 saved
resetpoint transforms with each material, preserving the authored rotation and
position, then advances three seconds at 60 script FPS without controls. All
189 cases contact support and finish grounded without triggering a death volume.
The repeatable results are in `original-resetpoint-probe.json`; the native
runtime regression checks every frame for death and retains the same player
body throughout each settling run.

The follow-up checks the initial center against every nondegenerate authored
floor triangle that can collide with Ball. The smallest distance across all
resetpoints is 2.614250384 original units, exceeding the wood/stone radius of 2
and the paper mesh's origin-centered enclosing radius of 2.114776701. Thus these
resetpoint placements do not initially intersect the static floor geometry.
The probe records this distance and rejects invalid sphere clearance. This does
not check overlap with movable module bodies or props.

This verifies native physical placement and short-term settling. It does not
execute the complete engine's respawn animation/message flow or establish
long-term stability or full course traversal.
