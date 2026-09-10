# Rotating arms (P_Modul_17)

The six rotating obstacles in Levels 3, 7 and 9 now respond to ball contact and return under an offset spring. The previous importer treated their whole rendered shape as static.

## Recovered behavior

`scripts/read-original-arms.py` reads the shallow chunk dump of the supplied `3D_Entities/PH/P_Modul_17.nmo` and reproduces `src/game/original-arms-data.json`:

```sh
/path/to/dump-chunks /path/to/3D_Entities/PH/P_Modul_17.nmo > /tmp/mod17-chunks.tsv
python3 scripts/read-original-arms.py /tmp/mod17-chunks.tsv > src/game/original-arms-data.json
```

| Original source | Setting |
| --- | --- |
| Physicalize 116 | Target `Modul17_Dreharme`; three convex hulls `Col01`–`Col03`; total mass 3; friction .7; elasticity .4; group `Floor`; collision enabled; starts awake |
| Body damping / mass center | Linear damping 3, angular damping .005, automatic center disabled, explicit center `(0,0,0)` |
| Hinge 67 | Fixed-world hinge at `P_Modul_17_HingeFrame`; local Z defines the axis; angular limits disabled |
| Spring 50 | Moving target to `FixCube Object`, rest length 0, stiffness .32, axial damping .1, full relative-velocity damping .1 |
| Spring attachment 1 | `(0,4,0)` in `P_Modul_17_HingeFrame`, attached to the moving arm |
| Spring attachment 2 | `(0,0,-4)` in the arm's initial frame, attached to the fixed world |
| Get Cell 77 / Binary Switch 121 | Read `CurrentLevel` row 0, column 4; On physicalizes, creates hinge, then creates spring; Off removes hinge, removes spring, unphysicalizes and restores the hierarchy |
| Levelinit `PH_Groups` | `P_Modul_17`: Activation=1, Reset=1 |

The reference frames define the initial world attachment points; they do not decide which body owns an anchor. In particular, the second point remains fixed even though its initial position is expressed in the arm's frame. The hinge frame also contains approximately 2× scale. Removing that scale from point conversion would halve the first attachment's lever arm. The axis is normalized separately.

The interpretation was checked against [CKBuildingBlocks](https://github.com/doyaGu/CKBuildingBlocks/tree/fca1963e39e64daa480918661732b1b0e45fe7b8), specifically `SetPhysicsSpring.cpp` and `PhysicsHinge.cpp`. The spring force model was checked against `ivp_controller/ivp_actuator_spring.cxx` in the locally inspected [IVP source](https://github.com/doyaGu/ivp/tree/7579664996e68040dd0158081b04f612e6a2d515). No original executable or IVP implementation is linked into the web runtime.

`original-spring.ts` implements Hooke's law with both damping components using the velocity at the moving attachment, including rotation. If `d` is the displacement from the fixed point, `n` its normalized direction, and `v` the attachment velocity, the force is:

```
F = -k (|d| - L) n - c_axial (v · n) n - c_global v
```

Rest length is converted to world units. Under the existing original time factor of 2, stiffness is multiplied by 4 and both damping coefficients by 2. This is a force integrated over the physics step, unlike the original ball-drive values that specify an impulse per IVP tick. No angular motor, artificial return animation, or ±45° stop is added.

## Validation and limits

Five tests cover recovered settings, damping directions and units, sector activation/reset, joint cleanup, all six original placements on their actual level floors, and ball contact. After an imposed deflection, every placement retains its pivot and returns toward its initial orientation over a 60-second simulation.

The Level 9 contact test rolls each of wood, stone and the original convex paper ball through the target end of the first arm. Capped normal player forces steer and counter-steer; the test requires contact with the arm, rotation, passage beyond it, and final support from the static exit floor. It does not merely check that the ball flew past the obstacle.

In the in-app browser, `?inspect` → Load rotating arm course → Visit rotating arm → Cross rotating arm passed for all three materials, retaining three lives and stopping near `(46.3, -16.0, -83.0)`. The developer controls stage the ball at the approach; traversal itself uses normal controls. A forced fall restored the arm's zero-angle pose. Automated tests separately verify sector deactivation and removal of its hinge.

These checks do not prove an identical original trajectory. Inertia, collision solving and constraint stabilization remain Rapier's; exact IVP sleep behavior and the complete original sector object-pooling system are not ported. Full route playthroughs of Levels 3, 7 and 9 remain outstanding. Weighted lifts (03) and sliding stones (34) now have separate adapters; shared lifecycle details and full-game verification remain outstanding.

## Native IVP follow-up

The validation above describes the earlier Rapier adapter. The local native IVP
runtime now has separate staged passage coverage for all six placements across
Levels 3, 7 and 9, with all three materials. Wood and stone pass and stop on the
exit floor; paper deflects the arm but stalls under the same input controller.
The earlier Rapier result that paper passes is not evidence of native parity.
See [native route validation](original-native-routes.md#native-rotating-arm-follow-up)
for scope and the connected Level 7 turn onto its outgoing path.
