# Original fan behavior and remaining mechanism inventory

## Fan recovery

The fan is `P_Modul_18`, instantiated 113 times across Levels 2–12. Level 1 has none. The previous generic module importer made its invisible `Kollisionsquader` a static triangle collider and never executed the fan script. The resulting invisible wall blocked the intended paper-ball route.

Recovered from the supplied installation's `3D_Entities/PH/P_Modul_18.nmo`, using `scripts/dump-original-chunks.cpp`:

| Behavior / parameter (file object index) | Recovered value |
| --- | --- |
| Get Cell (350), CurrentLevel row 0 / column 1 | Current player ball |
| Box Box Intersection (398) | Player's oriented mesh bounds against `P_Modul_18_Kollisionsquader`; hierarchy disabled |
| SetPhysicsForce (433), Force Value (429) | 0.1 |
| Direction (425), direction referential (427) | `(0,1,0)`, no reference: world-up |
| Force position (422) | Ball center `(0,0,0)` in target frame |
| Trigger local mesh bounds | X `[-1,1]`, Y `[0,16]`, Z approximately `[-1,1]` |
| Trigger local translation | Approximately `(0,1.1399,-0.000588)` |
| Per Second (286), angle X (284) | -15 radians/second, relative to rotor |
| Wave Player (549), loop (545) | Loop enabled; original `Misc_Ventilator.wav` |

The force is converted with the same units and IVP timestep mapping as player control: `0.1 × 0.25 × 2² × 66 = 6.6` units of momentum per second. Gravity is -20. Paper mass is 0.2, so its weight is 4 and it accelerates upward. Wood weighs 38 and stone 200; neither lifts. There is no arbitrary material-specific boost, height snap, or stored force after leaving the column. Re-entering the column restores lift. Overlapping fans contribute separately.

Each instance uses its own imported transform, including elevation, rotation and scale. The test is oriented box overlap, including the rotating paper ball's mesh extent. A ball can partially overlap a grille and catch the airflow. The invisible column has no physical collider; the original grille and platform retain their level-floor collision. The rotor is visual and rotates about its imported pivot.

The two original smoke layers use `Particle_Smoke.png`, recovered speed/lifetime/color/size parameters and additive blending. The fast stream evolves color only; the soft stream evolves both color and size. Particle emission is normalized to 50 Hz and deterministic, so visuals are a reconstruction rather than exact Virtools particle rendering. Fan sound uses the original recording with approximate nearest-fan distance attenuation. Particles and audio pause with the game; level changes dispose fan geometry and clear the loop. Re-running `prepare-original.py` includes the new sound in the local pack.

## Verification

Five fan tests cover paper ascent and sustained finite-height hover, wood/stone remaining grounded, leaving and re-entering airflow, partial overlap, rotated and translated trigger volumes, and force independence at 66/132/264 Hz. The integration test loads the actual Level 2 floor geometry, fan meshes/transforms and convex paper ball, then flies from fan 01 onto raised fan 12 using capped player control forces. It skips explicitly when the local original pack is absent.

In a separate in-app browser test tab, paper went from Y 11.956 on fan 01 to Y 19.955 above fan 12 after ascent and steering. Wood and stone remained near Y 11.91 on the lower grille. Crossing requires steering during ascent; waiting until a downward part of the hover cycle can miss the platform edge. The initial failed crossing was retained as a timing finding, not hidden by changing fan strength. The successful route is also covered by the local integration test. Browser error logs were empty. The original fan audio reached ready state and was observed playing in browser telemetry during live gameplay; no listening-quality comparison has been performed.

These checks verify this fan route, not full completion of all twelve courses.

## Remaining module inventory

Counts are module instances in the imported twelve-level pack. “Static” below describes the current runtime adapter, not an assertion that every component should move. Original scripts/constraints still need to be recovered and validated for those modules. Importing the meshes alone does not establish gameplay parity.

| Module | Instances | Imported parts | Current behavior / outstanding work |
| --- | ---: | --- | --- |
| 01 | 24 | Pusher, Rinne, Filler | Original compound hulls, physical guide and collision exclusions implemented; Level 1 opening/crossing tested. See [pusher findings](original-pushers.md). |
| 03 | 9 | Floor, walls, Gate | Static; gate behavior not ported |
| 08 | 6 | Fix, Schaukel | Static; swinging mechanism not ported |
| 17 | 6 | Dreharme | Static; rotating-arm mechanism not ported |
| 18 | 113 | Rotor, Kollisionsquader | Fan force, trigger and rotor implemented; targeted route verified |
| 19 | 7 | Axis, Flaps | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 25 | 29 | Bridge, Hinge | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 26 | 18 | Sack, Halter, Rope | Static; suspended-sack constraints not ported |
| 29 | 17 | Nine Platte pieces | Nine physical planks, ten hinges, stone-triggered release and sector reset implemented; see [bridge validation](original-chain.md) |
| 30 | 17 | Wippe | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 34 | 19 | Schiebestein, Kiste | Dynamic bodies; original constraints and complete script flow still need verification |
| 37 | 22 | Bridge, Hinge | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 41 | 43 | P_Modul_41 | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |

Also outstanding: full level playthroughs, exact original constraint/contact solver behavior, tutorial and cutscene flows, per-level music scheduling, transformer lightning/curve fidelity, and the complete UFO finish sequence. See `original-import.md` for the overall runtime boundary. This project is not yet a 1:1 recreation.
