# Suspended swinging sacks (P_Modul_26)

All 18 instances in Levels 8–12 now use physical ropes and sacks with the original two ball joints and alternating drive. They previously used static rendered geometry as collision surfaces.

## Source evidence

`scripts/read-original-sack.py` reads the shallow dump of the supplied `3D_Entities/PH/P_Modul_26.nmo` and produces `src/game/original-sack-data.json`:

```sh
/path/to/dump-chunks /path/to/3D_Entities/PH/P_Modul_26.nmo > /tmp/mod26-chunks.tsv
python3 scripts/read-original-sack.py /tmp/mod26-chunks.tsv > src/game/original-sack-data.json
```

The script validates the sequence's graph links as well as reading its numeric parameters. `scripts/original_chunks.py` handles the primitive behavior's optional execution-priority word and distinguishes time parameters from integer parameters. Source interpretation was checked against the separately installed [CKBuildingBlocks](https://github.com/doyaGu/CKBuildingBlocks/tree/fca1963e39e64daa480918661732b1b0e45fe7b8) implementations of `PhysicsBallJoint.cpp`, `PhysicsForce.cpp`, `sequencer.cpp`, `TimerMini.cpp`, `WaitForAll.cpp` and `ActivateScript.cpp`.

| Original behavior | Recovered behavior |
| --- | --- |
| Physicalize 197 | Rope: dynamic, mass 1, friction .7, elasticity .4, linear/angular damping .1, explicit zero mass-center offset, collision **disabled** |
| Physicalize 247 | Sack: dynamic, mass 10, same coefficients/damping, zero mass-center offset, collision enabled, group `Floor` |
| Ball Joint 162 | Rope to fixed world, at `P_Modul_26_Balljoint_oben` |
| Ball Joint 212 | Rope to sack, at `P_Modul_26_Balljoint_unten` |
| Sequencer 79, first output | Create force 105 and destroy force 43; first direction is holder-local +Z |
| Sequencer 79, second output | Destroy force 105 and create force 43; direction becomes holder-local −Z |
| Delayer 61 → link 119 → Switch 72 | Wait 1500 milliseconds plus a one-frame link delay, then advance the sequencer and restart the timer while active |
| Force 105 / 43 | Continuous controller applying original impulse .25 each IVP tick at sack-local (0,0,0); direction is transformed through the fixed holder |
| Off input → Identity 55 → both Destroy inputs → Wait For All 83 | Stop both controllers before removing joints/bodies and restoring the initial hierarchy |

There is no proximity trigger in this module. Levelinit's `Activate Sector` uses `Activate Script` 3050 with `Reset? = true` (local parameter 3046); `PH_Groups` gives module 26 activation/reset values of 1. The adapter activates in its assigned checkpoint sector, resets its sequence on reactivation, and stops/removes its joints when that sector is left. Respawning restores both poses, velocities and phase. The holder is decorative: this module does not physicalize it.

## Runtime mapping

The rope remains a massive dynamic body even though its collider is disabled. Both connections are spherical joints, allowing deflection out of the normal swing plane when the player hits the sack. The rendered rope follows its rigid body. These are not planar hinges or animation-driven positions.

The `Floor` collision exclusion matches the pusher/hinge mapping: the sack contacts the player and differently grouped objects but does not collide with ordinary level floors or other `Floor` bodies. The two drive directions remain fixed in world space after applying the instance/holder transform; rotating the sack does not rotate the force. The force point moves with the sack.

The controller uses the same momentum conversion as the player: impulse × scale .25 × physics time factor squared × 66 × real timestep. The 1500ms timer uses real time; it is **not** shortened to 750ms by the physics clock's factor of 2. Pausing the engine advances neither timer nor physics.

## Validation and remaining limits

Tests verify the source topology and coefficients, rope mass despite disabled collision, transformed force direction and strength, real-time reversal, sector activation/deactivation, repeated resets without leaked joints, sideways ball-joint movement, and 20 seconds of swinging for every placement on the actual imported floors. A separate Level 8 contact test uses the original paired-rail approach and normal ball drive to compare paper, wood and stone deflections. Paper uses its imported convex hull.

In a separate in-app browser tab, the original rope and sack were visually inspected while moving. Wood passed the first Level 8 sack on its paired rails with both joints intact. The measured joint error was approximately .0002 world units. A forced fall restarted the sequence at its initial direction, and advancing to the next checkpoint disabled the old sector's sacks and removed their joints. Browser error logs were empty. The complete suite passed 54 tests, lint and the production build; this browser check is a targeted obstacle traversal, not a full Level 8 playthrough.

Rapier still supplies the contact solver and hull inertia. The source's single script-frame link delay is currently mapped to one fixed physics tick; exact Virtools render/script scheduling remains outstanding. The broader sector object pooling/visibility system has not been ported, and unrelated module types remain incomplete. These tests do not prove complete playthroughs or full IVP parity.
