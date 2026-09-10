# Original gameplay camera and input reference

The local native path uses the camera rig saved in `Camera.nmo` and its
navigation graph in `Gameplay.nmo`. `scripts/read-original-camera.py` recovers
six world matrices, parent relationships, two dynamic-position controllers,
projection parameters, turn curves and delayed links. It checks the shared
parameters connecting high view to the camera controller and the matrix shared
by player/camera respawn. The generated data records hashes of both input dumps.

## Recovered behavior

`Cam_MF` parents the look target and camera. `Cam_Orient` and `Cam_OrientRef`
parent to the look target; `Cam_Pos` parents to `Cam_Orient`. The saved local
camera offset is approximately `(0,35,-22)` original units. Reset first restores
the rig, then applies the checkpoint's full world matrix. The player receives
that same matrix, including its orientation. The paper hull therefore respawns
with the authored rotation rather than identity.

The look target follows BallPos_Frame with force `(10,10,10)`, zero damping.
The eye follows Cam_Pos with force `(5,.8,5)` and damping `(.5,.3,.5)`. Both use
`OriginalDynamicPosition`, whose arithmetic has a separate checked DLL fixture.
The controller's activation callback only records the current position. Normal
updates use the saved Gameplay_Ingame child order: input, navigation, eye,
then look target. This is not a full implementation of the original scheduler.

Left/right selection starts a 250 ms Bezier Progression (saved version 0x10005).
The saved curve flags select linear interpolation. Set Euler Orientation turns
Cam_Orient by positive/negative pi/2 relative to Cam_OrientRef. Progression
completes only when elapsed time is strictly greater than 250 ms; the completion
link commits Cam_OrientRef one frame later. Another turn cannot start while the
first is active. A held movement force retains the direction captured when its
key was pressed; a fresh press resolves the committed reference. The engine
captures that reference before advancing the current frame's camera navigation.
Keyboard and phone arrows share the engine turn action.

High view selects OffsetY=-50 and ForceY=2. Releasing it restores offset zero and
force .8. It raises the camera without changing the horizontal orbit. The saved
horizontal FOV is 1.0122909546 radians at 4:3, with clipping 3/1200 original units.
The web renderer uses the corresponding vertical FOV (45.1484174 degrees) and
keeps it fixed at other viewport aspects. This preserves the original 4:3
projection while allowing wider/narrower responsive views.

When the ending detaches Cam_Pos, it freezes the desired world anchor, not the
lagging eye position. Both dynamic-position controller histories continue across
the handoff. The existing ending translation and look-target tracking then run
without also stepping the normal camera.

## Evidence and limits

Source interpretation was checked against CKBuildingBlocks `SetEulerOrientation`
and `BezierProgression`, plus the supplied VxMath.dll yaw-matrix arithmetic
(`Vx3DMatrixFromEulerAngles`, 0x2429b280). The reset graph's matrix operation was
identified as Get World Matrix in the supplied ParameterOperations.dll. These
are read-only recoveries; the original game executable was not run.

Tests cover strict turn completion, input-reference delay, independent eye/target
motion, high view, continuous ending handoff, and all 63 checkpoint camera and
paper-body orientations. A real native ball in free air verifies that existing
key forces retain their direction through a reference change, while release and
re-press use the new direction. The complete suite passes 189 tests with zero
skips; lint and production build pass.

The in-app browser repeated a left turn and raised view, both Level 1 gate
pushes and corridor traversal, and the Level 2 lower-to-upper paper fan route.
The latter finished near `(1006.702,79.578,-366.743)`, with the upper fan active
and no ground contact. No browser errors were reported. These routes use staged
starting positions; they are not full playthroughs or original-game recordings.

Remaining limits include original scheduler priority/interleaving, exact x87
matrix/trigonometric rounding, complete respawn presentation timing, and
uninterrupted verification of all twelve levels. The recovered camera is local
to `?physics=ivp`; the production backend still uses Rapier. The camera integration
and phone turn fix in this follow-up were not deployed.

Reproduce:

```sh
python3 scripts/read-original-camera.py .local/reference/chunks > /tmp/original-camera-data.json
cmp /tmp/original-camera-data.json src/game/original-camera-data.json
node --test tests/original-camera.test.ts
node --test --test-name-pattern='camera-relative|checkpoint orientation' tests/original-ivp-runtime.test.ts
pnpm test
pnpm lint
pnpm build
```
