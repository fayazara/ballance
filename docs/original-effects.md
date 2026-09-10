# Original debris and collectibles

## Transformer debris

The outgoing ball now splits at 2.35 seconds, before the replacement appears at 2.5 seconds. `Balls.nmo` contains 16 wooden pieces, 17 stone pieces and 18 paper pieces; the renderer uses these meshes, their original textures and local transforms, rotated into the outgoing ball's orientation.

The explosion behavior parameters were read from `Balls.nmo` with `scripts/dump-original-chunks.cpp`:

| Material | Fragment mass | Friction | Elasticity | Linear / angular damping | Impulse range |
| --- | --- | --- | --- | --- | --- |
| Wood | 0.2 | 2 | 1 | 0.3 / 0.2 | 1.5–3 |
| Stone | 0.8 | 2 | 1 | 0.3 / 0.2 | 4–9 |
| Paper | 0.02–0.09 | 1–5 | 1 | 6 / 0.5 | 0.5–1.3 |

Wood parameters are file indices 463–490, stone 708–745, and paper 566–639. Directions follow each fragment's local Y axis, as in the original Physics Impulse block. Momentum is converted by scene scale × original physics time factor (0.25 × 2). The [building-block implementation](https://github.com/doyaGu/CKBuildingBlocks/blob/main/physics_RT/Behaviors/PhysicsImpulse.cpp) confirms these are impulses in a fragment-relative frame.

Each fragment has a Rapier convex hull and collides with the course and props. The recovered Ball exclusion identifier prevents contact with the replacement player, other fragments, floor stoppers and Ball guide channels. Pieces still contact loose props and Floor mechanisms; see [collision identifiers](original-collisions.md). The original runtime has one fragment set per material; this adapter retains that bound (51 maximum), fades pieces after the recovered 20-second timeout, and removes them after a two-second fade. Respawning or changing courses clears their bodies and visuals. Paper wind controllers, the fade curve, and the separate lightning effect remain approximations or pending.

## Collectibles

The white/blue placeholder polyhedra have been removed from original mode.

- **Extra life:** the original `P_Extra_Life_Sphere` mesh, `P_Extra_Life_Oil` texture, silver `ExtraBall` billboard, and `P_Extra_Life_Shadow` floor texture. The shell ripples through animated UV offsets, scales vertically between 1.2 and 0.8, and bobs between original Y offsets -0.4 and +1.2 over two seconds. The original script uses these endpoints; the web interpolation and additive shading are reconstructed. The small silver center remains circular while the shell changes shape.
- **Point extra:** a silver center with six silver satellites at the saved `P_Extra_Point_Frame1`–`6` positions, plus the original `FloorGlow` footprint. Collection trails now use textured silver billboards, too. Idle satellites now orbit independently at the recovered 5 rad/s on the six TT Extra axes, with two-original-unit radius. Each leaves stationary red dots using the original ExtraParticle texture, source emission-rate input 90, 1,000 ms lifetime, size 0.5 to 0.2 original units and RGBA fading from 1 to 40/255. Each emitter retains at most 100 particles, rendered together in one points draw per pickup. Activation and pursuing motion now use the TT Extra state machine described below.
- The original proximity values are 4.5 units for lives and 3 units for point activation, converted to world scale. Lives still grant one spare ball. Point extras grant 100 time points on activation and 20 per arriving satellite, matching the recovered graph. Normal gameplay gains no labels or panels.

All textures already come from the ignored local asset pack. The normal preparation command exports both extra modules; no extra asset download or production redistribution is required.

## Checks

Automated tests verify the burst fires exactly once before replacement, cancellation prevents a delayed burst, each material produces the correct number of moving pieces, repeated use stays within the pool bound, and expiry/respawn cleanup removes physics bodies. In-app browser checks verify the textured life bubble, an extra life increasing the HUD from 3 to 4, all three fragment sets (51 total), and the wooden fragments visibly separating from the ball.

The final browser pass also inspected the silver point satellites, collected a full trail with the expected time reward, and confirmed respawn clears all debris. Browser error logs were empty. All 28 tests, lint and the production build passed; the existing Vite large-chunk warning remains.

The reported early ending was confirmed by the user to be a dead end on the route. Level-end behavior was not changed.

## Red satellite trails (September 9)

`scripts/read-original-point-trails.py` checks all six matching time-dependent
emitters (522, 586, 652, 831, 893, 955) in P_Extra_Point.nmo and records the dump
hash in `original-point-trails-data.json`. Its input named Emission Delay is a
rate in the source `TimePointEmitter` implementation. The web adapter batches
emission at presentation updates and interpolates emitter positions; it is not
a general port of the particle scheduler. Particle lifetime, material fading,
texture and size come from the recovered data.

Regression checks cover stationary emitted dots, continued independent orbit,
expiry, bounded storage, pause and reset. A local IVP browser preview showed the
dotted reddish trails around the six silver satellites with no console errors.
The responsive UI, keyboard mapping, and minimal HUD checks are documented in
[original-ui.md](original-ui.md).

## Point activation and pursuit

`OriginalPointExtra` maps TT Extra block 132 to idle, scatter, pursuit and ready
states. The six initial positions now come from the saved Ball1–Ball6 objects
relative to the pickup root, rather than rounded particle-emitter frame offsets.
Activation includes the radius boundary at three original units and awards 100
time points immediately. The six satellites keep their identities and move
away from the saved activation position minus 5.1 original Y units for 1,000 ms.
Previous-frame displacement is damped by 0.3 in scatter and 0.95 in pursuit.
Their attraction strengths run from 0.12 through 0.1866667, in increments of
0.08 / 6. The timestep coefficient updates every second script frame, matching
the saved Exactness Framedelay. These are kinematic visual objects, not new
rigid bodies or collisions with the course.

A satellite hits at squared distance <= 4 original units, not radius 4. Each hit
grants 20 time points once. The ready transition occurs the frame after the last
hit. Collection uses Extra_Start and Extra_Hit recordings. Checkpoint changes
and death discard uncollected satellites without awarding their points. The
old 22 substitute pursuing particles were removed. Red trails follow the
actual moving satellites and stop emitting when each is collected.

Tests cover activation boundary, one-second scatter, the displacement equation,
hit radius, exactly 220 total points, and cancellation. In the native browser
check the paused activation state retained all six satellites. Advancing two
seconds collected them all: time rose from 528.900000 to 586.900000 seconds,
accounting for 60 seconds of rewards and two seconds of countdown.

This adapter does not yet reproduce the original silver hit-burst particle
systems, all script activation scheduling, or float32 rounding at every vector
operation. Those remain parity gaps; unit tests do not prove all-level parity.
