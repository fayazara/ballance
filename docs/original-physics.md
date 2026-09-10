# Ball and object physics: recovered values

The previous implementation guessed ball masses, crate masses, acceleration and damping. That reversed the intended wooden-ball/crate relationship: wood was 1 and crates were 2. The original player wood ball is 1.9, and a crate is 1.0.

Values below were read directly from the supplied game's `Balls.nmo` (`Physicalize_GameBall`) and `Levelinit.nmo` tables. The extracted numerical evidence is in [original-physics-evidence.json](original-physics-evidence.json).

| Body | Mass | Friction | Elasticity | Linear damping | Angular damping | Drive impulse per original tick |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Player wood | 1.9 | .8 | .2 | .9 | .1 | .43 |
| Player stone | 10 | .5 | .1 | .3 | .1 | .92 |
| Player paper | .2 | .5 | .4 | 1.5 | .1 | .065 |
| Loose wood | 2 | .6 | .2 | .6 | .1 | none |
| Loose stone | 10 | .7 | .1 | .2 | .1 | none |
| Loose paper | .2 | .5 | .4 | 1.5 | .1 | none |
| Wooden crate | 1 | .7 | .3 | .1 | .1 | none |
| Dome (fixed) | ignored | .2 | .8 | ignored | ignored | none |

Domes are anchored obstacles. `Levelinit.nmo` → `Physicalize_Convex` → `P_Dome` references boolean parameter 4011 (original object ID 4090), whose stored value is **true** for `Fixed?`. The importer previously ignored that flag and incorrectly created a dynamic dome using the otherwise-unused mass/damping columns. Domes now use fixed convex bodies from their original mesh, with their original friction and elasticity. They activate with their sector and remain immovable; see [sector object behavior](original-objects.md).

The in-app browser verified three-second pushes with wood, stone and paper: the dome stayed at exactly the same coordinates and each ball collided with its surface. The inspector's `Push dome 3 seconds` control repeats this check. All 28 existing tests, lint and the production build passed after this fix.

Floors, rails and stoppers use friction .7 and elasticity .3. Shared Level 1 module values were also recovered: the pusher has mass 3, friction .6, elasticity .4 and angular damping 1; the sliding stone has mass 1.6/friction .5; its lower wooden box has mass 1.4/friction .8. Both latter bodies have elasticity .4 and linear/angular damping .1. The lower box is dynamic, rather than the static object used in the first import.

## Time, force and contact conversion

`Gameplay.nmo` stores gravity `(0,-20,0)` and a physics time factor of 2. The public reconstruction of the original [SetPhysicsForce building block](https://github.com/doyaGu/CKBuildingBlocks/blob/main/physics_RT/Behaviors/PhysicsForce.cpp) installs a controller that calls `async_push_core` each physics tick. Its value is an impulse per tick, not an ordinary force expressed per second. The [IVP environment](https://github.com/doyaGu/ivp/blob/master/ivp_physics/ivp_environment.cxx) initializes its timestep to 1/66 second. The real-time rate is consequently 132 ticks/second with this game's time factor.

With geometry scale S=.25 and time factor T=2, world-space gravity is `-20*S*T² = -20`. The continuous equivalent of the stored drive impulse J is `J*66*S*T²`: wood 28.38, stone 60.72, paper 4.29. The runtime distributes that impulse over the fixed 132 Hz simulation. It applies the impulse at the center, allowing collision friction to create rotation, rather than injecting additional torque. As in the original force controllers, input persists while airborne and the two arrow axes operate independently.

[IVP's material manager](https://github.com/doyaGu/ivp/blob/master/ivp_physics/ivp_material.cxx) multiplies friction and elasticity coefficients. Rapier's default average gave the wrong interactions. All imported contact materials now explicitly select `Multiply` for both. IVP describes damping as exponential velocity decay. With damping d, the web runtime uses Rapier coefficient `expm1(d*T*dt)/dt`, matching `exp(-d*T*dt)` at the fixed timestep.

Paper uses its imported convex hull for both player and loose objects; wood and stone use the original radius-2 spherical collision shape (radius .5 after scaling). Transformations replace the collider and update all material properties, including inertia. The visual model is not the only thing that changes.

The player's mass center is explicitly the authored origin. Gameplay's ActiveBall creation nodes 233 (convex), 262 and 291 (spherical) all disable automatic mass-center calculation and use a zero shift. `scripts/read-original-player.py` reads these settings and asserts their creation links into `src/game/original-player-data.json`. The shared `replacePlayerCollider` now applies them during initial creation, transformation and respawn. Previously, the asymmetric paper hull inherited Rapier's nonzero calculated centroid. Collider replacement keeps one body and one collider, preserves the current pose, and stores the mass properties on the collider so repeated changes cannot accumulate additional body mass. Missing paper geometry is rejected before the existing collider is removed.

Three additional tests verify the recovered settings, the actual paper hull's mass center and lack of torque from an impulse at the authored origin, and six wood/paper/stone replacement cycles while the body is kinematic as in the transformer. They check restored dynamic mass, positive/repeatable inertia, sphere inertia, unchanged pose and bounded collider count. The Level 2 fan integration uses this same player creation routine. The full suite passes 98 tests; lint and production build pass with the existing bundle-size warning.

Browser verification after this update completed the Level 1 wood-to-stone machine sequence and the Level 2 wood-to-paper sequence, including sixteen departing wooden fragments and an enabled dynamic replacement collider. The transformed paper ball then flew from fan 01 to fan 12, ending near `(251.668, 19.943, 91.686)` with three lives. Browser errors were absent. These changes are local after deployed version `0a78e6d5-1420-451b-ad9c-de7f97645dc8`.

The subsequent [native inertia correction](original-inertia.md) replaces the paper player's Rapier inertia and applies measured compact-surface inertia to 547 moving mechanism/prop bodies across the twelve courses. It preserves original object axes, mass-center overrides and the minimum-axis guard. All 102 tests, lint and production build pass; browser verification of the complete mechanism update remains pending after the local server stopped. Exact contact solving, sleep behavior and complete course traversal remain unverified.

## Flames

The original asset is `Textures/Particle_Flames.bmp`: a purple/magenta flame particle with bright specks. It is now converted to PNG by the local asset importer, rather than replaced with a generated radial glow.

`PS_FourFlames.nmo` stores 20 ms emissions, 50 particles, lifetime 1000 ± 250 ms, speed .008 ± .003 units/ms, initial size 3 ± .3 and ending size .1. The new effect uses those values with the geometry scale, rises from the four original burner positions and fades/shrinks over each particle's lifetime. It uses additive blending and a violet tint to preserve the user's requested purple appearance. Particle paths are deterministic reconstructions; this does not execute Virtools' particle system or reproduce every random trajectory/color evolution. The original stored initial tint is warm, so retaining the texture's purple hue is an intentional presentation choice.

## Validation and parity boundary

An experimental [native/WASM IVP bridge](original-ivp-wasm.md) now runs the actual
SDK solver in WebAssembly. Fifteen isolated material/contact scenarios match its
native scalar build across 7,128 state samples. It is not yet integrated into the
game; the limitations below still apply to the playable backend.

A repeatable three-second push from near contact on a flat floor moves a standard crate approximately 3.65 world units with wood and 8.64 with stone; paper moves it less than .001. These are tests of the web implementation, not measurements of the original executable. Regression tests cover continuous pushing, material acceleration/coasting order, data-table agreement, impulse consistency across simulation rates, and all original reset surfaces.

The runtime still uses Rapier rather than IVP. Contact solvers, sleep thresholds, paper hull construction, special constraints and exact original trajectories can therefore differ. This patch replaces guessed material physics with recovered values and documented unit conversions; it is not a claim of complete 1:1 game parity. Later-level machinery still needs separate behavior implementations and end-to-end playthroughs.

## Reproduce the evidence

`scripts/dump-original-chunks.cpp` is a read-only LibCmo utility. Build it against the separately built LibCmo/YYCCommonplace libraries documented in [original-import.md](original-import.md), then run it on `Balls.nmo`, `Levelinit.nmo`, `Gameplay.nmo` and `PH/PS_FourFlames.nmo`, saving output as `balls-chunks.tsv`, `levelinit-chunks.tsv`, `gameplay-chunks.tsv` and `fire-chunks.tsv` in a temporary directory. It shallow-loads serialized objects and does not run their scripts or the original executable.

Run `python3 scripts/read-original-physics.py /path/to/dumps` to decode the typed data-array columns and selected parameters. Raw object dumps and original textures remain local; only the small numerical evidence is documented here.

## Collision filtering

The shared [collision identifier mapping](original-collisions.md) applies the recovered no-collision names to all adapters. In particular, the player passes through Ball floor stoppers, loose props contact guide channels, and debris contacts props while remaining excluded from the player. This establishes the named-group rule; exclusive-pair filtering and exact solver behavior remain separate.
