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

The force is converted with the same units and IVP timestep mapping as player control: `0.1 × 0.25 × 2² × 66 = 6.6` units of momentum per second. Gravity is -20. Paper mass is 0.2, so its weight is 4 and it accelerates upward. Wood weighs 38 and stone 200; neither lifts. There is no arbitrary material-specific boost or height snap. The original persistent force controller is created or destroyed when the proximity-driven box test runs; ordinary movement out of the column destroys it, and re-entry restores it after the original polling transition. Sector reset always destroys it. Overlapping fans contribute separately.

Each instance uses its own imported transform, including elevation, rotation and scale. The test is oriented box overlap, including the rotating paper ball's mesh extent. A ball can partially overlap a grille and catch the airflow. The invisible column has no physical collider; the original grille and platform retain their level-floor collision. The rotor is visual and rotates about its imported pivot.

The two original smoke layers use `Particle_Smoke.png`, recovered speed/lifetime/color/size parameters and additive blending. The fast stream evolves color only; the soft stream evolves both color and size. Particle emission is normalized to 50 Hz and deterministic, so visuals are a reconstruction rather than exact Virtools particle rendering. Fan sound uses the original recording, per-instance proximity state and recovered distance attenuation (see below). Particles and audio pause with the game; level changes dispose fan geometry and clear the loop. Re-running `prepare-original.py` includes the new sound in the local pack.

## Sector and proximity script recovery

`python3 scripts/read-original-fans.py /path/to/chunk-dumps` regenerates `src/game/original-fan-data.json`. It checks the fan's Activation=1 / Reset=1 row in Levelinit and the on/off connections in its original script.

| Watcher | Range (original units) | Axes | Output flags | Exactness interval / frame delay |
| --- | --- | --- | --- | --- |
| Outer (340) | 80 | XZ | Enter + Exit | 85–100 / 10–60 |
| Force (387) | 7 | XZ | In + Enter | 12–20 / 1–10 |
| Sound (498) | 25 | XYZ | Enter + Exit | 25–30 / 1–10 |

Outer entry resets and starts the particle script, enables the force watcher and starts sound proximity polling. The inner EnterRange output fetches the current ball; subsequent InRange outputs execute Box Box Intersection. The proximity implementation now preserves all four original transition outputs, including initial ExitRange when starting outside the range, and retains the polling countdown when restarted. These outputs and the gain curve are adapted from the referenced CKBuildingBlocks source; see [attribution](../THIRD_PARTY.md).

Outer exit deactivates particles/rotation and stops force/sound proximity polling. The original has a separate explicit sector-off path that destroys the force controller and stops the sound. The port preserves this distinction: it does not replace the original persistent controller with unconditional every-tick box testing. Directly teleporting out of a live column can therefore bypass the intermediate box-test exit; normal movement and the explicit respawn/sector-reset path are tested separately.

`TT ProximityVolumeControl` (573) uses distance in the fan MF's local frame, near=2 and far=25. Between their squared distances, gain is `0.02 × 50^(1 − (distance² − 4) / 621)`, with full gain inside the near range. The separate 3D proximity watcher starts/stops the sound. Each audible fan now has its own browser playback channel; this removes the previous single-nearest-fan approximation, but does not yet reproduce the original reusable sound-slot pool. Particles remain reconstructed, and script-frame countdowns still run on fixed physics ticks rather than the original render/script clock.

Fan sector reset clears controller state, sound, proximity countdowns, particle age and rotor pose. Only fans in the current sector can restart. Rotor motion advances during the activated particle script, rather than jumping to an angle derived from global elapsed time.

## Verification

The original five fan tests cover paper ascent and sustained finite-height hover, wood/stone remaining grounded, leaving and re-entering airflow, partial overlap, rotated and translated trigger volumes, and force independence at 66/132/264 Hz. The integration test loads the actual Level 2 floor geometry, fan meshes/transforms and convex paper ball, then flies from fan 01 onto raised fan 12 using capped player control forces. It skips explicitly when the local original pack is absent.

In a separate in-app browser test tab, paper went from Y 11.956 on fan 01 to Y 19.955 above fan 12 after ascent and steering. Wood and stone remained near Y 11.91 on the lower grille. Crossing requires steering during ascent; waiting until a downward part of the hover cycle can miss the platform edge. The initial failed crossing was retained as a timing finding, not hidden by changing fan strength. The successful route is also covered by the local integration test. Browser error logs were empty. The original fan audio reached ready state and was observed playing in browser telemetry during live gameplay; no listening-quality comparison has been performed.

Three additional tests cover source settings and transition timing, all 113 actual placements through three inactive/active/reset cycles, and independent horizontal particle/3D sound proximity plus the recovered gain curve. The full suite passes 91 tests, with no skips when the local pack is present; lint and the production build pass (existing bundle-size warning remains).

After the sector update, a separate browser tab again transferred paper from fan 01 to fan 12, ending at approximately `(251.668, 19.955, 91.686)`. Wood and stone stayed near Y 11.91. Advancing to the next checkpoint left no enabled/running fans or active fan sounds. A forced fall returned to the checkpoint with no retained airflow or sound; returning to the fan restarted lift. Browser error logs were empty. This pass inspected audio readiness and controller gain while muted; it did not compare listening quality.

This fan lifecycle update is local and follows deployed version `0a78e6d5-1420-451b-ad9c-de7f97645dc8`. These checks verify this fan route and placement lifecycle, not full completion of all twelve courses.

## Remaining module inventory

Counts are module instances in the imported twelve-level pack. Every listed type now has a physics adapter. Shared lifecycle behavior and complete routes still require verification. Importing the meshes alone does not establish gameplay parity.

| Module | Instances | Imported parts | Current behavior / outstanding work |
| --- | ---: | --- | --- |
| 01 | 24 | Pusher, Rinne, Filler | Original compound hulls, physical guide and collision exclusions implemented; Level 1 opening/crossing tested. See [pusher findings](original-pushers.md). |
| 03 | 9 | Floor, walls, Gate | Nine-body spring lift with removable wall weights, open doorway, proximity activation and reset implemented; see [lift validation](original-lift.md) |
| 08 | 6 | Fix, Schaukel | Original six-hull hinged body, four-stage drive/coast sequence and sector reset implemented; see [swing validation](original-swings.md) |
| 17 | 6 | Dreharme | Original three-hull body, hinge, offset return spring and sector reset implemented; see [arm validation](original-arms.md) |
| 18 | 113 | Rotor, Kollisionsquader | Sector/proximity scripts, force, trigger, rotor and distance gain implemented; all 113 lifecycle fixtures and Level 2 flight verified |
| 19 | 7 | Axis, Flaps | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 25 | 29 | Bridge, Hinge | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 26 | 18 | Sack, Halter, Rope | Massive non-colliding rope, two ball joints, alternating drive and sector lifecycle implemented; see [sack validation](original-sacks.md) |
| 29 | 17 | Nine Platte pieces | Nine physical planks, ten hinges, stone-triggered release and sector reset implemented; see [bridge validation](original-chain.md) |
| 30 | 17 | Wippe | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 34 | 19 | Schiebestein, Kiste | Original crate and vertical slider, proximity activation and sector reset implemented; see [slider validation](original-slider.md) |
| 37 | 22 | Bridge, Hinge | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |
| 41 | 43 | P_Modul_41 | Passive hinge and original compound collision implemented; see [hinge validation](original-hinges.md) |

Also outstanding: exact script-frame scheduling for [fallen-object cleanup](original-depth.md), complete sector lifecycle and collision filtering, full level playthroughs, exact original constraint/contact solver behavior, tutorial and cutscene flows, per-level music scheduling, transformer lightning/curve fidelity, and the complete UFO finish sequence. See `original-import.md` for the overall runtime boundary. This project is not yet a 1:1 recreation.
