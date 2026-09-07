# Weighted spring lifts (P_Modul_03)

Module 03 is a spring-supported lift with removable wall weights, not just a gate. Its nine instances occur in Levels 7, 9, 10 and 12. The previous importer made the entire assembly static. The new adapter uses nine physical bodies: a platform, seven walls, and a doorway with three separate collision hulls.

## Recovered behavior

```sh
/path/to/dump-chunks /path/to/3D_Entities/PH/P_Modul_03.nmo > /tmp/mod03-chunks.tsv
python3 scripts/read-original-lift.py /tmp/mod03-chunks.tsv > src/game/original-lift-data.json
```

The extractor reads the original body settings, slider and spring frames, and proximity parameters, and validates the original activation/shutdown links. Interpretation follows the inspected [CKBuildingBlocks source](https://github.com/doyaGu/CKBuildingBlocks/tree/fca1963e39e64daa480918661732b1b0e45fe7b8), particularly Physicalize, Set Physics Spring, Set Physics Slider, Physics WakeUp, Scaleable Proximity, Group Iterator and Add To Group.

| Source | Recovered setting |
| --- | --- |
| Wall Physicalize 321, 251, 107, 216, 286, 72, 142 | Each wall has mass 2, friction .4, restitution .01, damping .5 linear/1.5 angular and one dedicated convex hull |
| Doorway Physicalize 181 | Mass 2, friction .4, restitution 0, damping .5/1, three convex hulls preserving its open entrance |
| Platform Physicalize 379 | Mass 3, friction .7, restitution 0, damping 1/3, one convex hull |
| All nine bodies | Initially frozen, collisions enabled, empty collision-exclusion group, explicit zero mass-center offset |
| Slider 468 | Platform to fixed world, axis from `frame_low` to `frame_high`, rotation locked, travel limits disabled |
| Spring 410 | Platform attachment at `frame_low` to fixed attachment at `frame_high`, rest length 0, stiffness 15, axial damping .1, full velocity damping 1 |
| Proximity 440 | XZ distance 35 from `P_Modul_03_MF`, Enter Range output, squared-distance polling, exactness range 35–50, polling delay 10–60 script frames |
| WakeUp 415 | Wakes the platform; surrounding pieces respond through contact |
| Activation | Physicalize surrounding pieces, physicalize platform, create slider, create spring, start proximity watcher |
| Shutdown | Remove slider and spring, stop watcher, unphysicalize surrounding pieces and platform, restore hierarchy |
| Levelinit `PH_Groups` | `P_Modul_03`, Activation=1, Reset=1 |

All eight surrounding pieces are loose weights, including the doorway. They are not rigidly attached to the platform and have no individual hinges. Their contact with the platform supplies the load. Removing a piece reduces that load, so the spring lifts the platform farther. The adapter does not animate the rise or prescribe a target height.

The spring uses the same recovered force interpretation as the [rotating-arm adapter](original-arms.md). At the existing time scale, the world stiffness is 15×4=60. Removing the eight mass-2 weights changes the equilibrium height by `16×20/60`, approximately 5.333 world units. Wood, stone and paper add their actual body masses to the platform load.

## Validation

Six tests verify source parameters, frozen startup, proximity activation, reset and joint cleanup, the spring's loaded-to-empty height change, all nine placements on original level floors, entry through the open doorway, contact-driven wall removal, riding the moving floor, and all three ball materials' effects on equilibrium height.

The Level 7 interaction fixture starts the wooden ball on the actual entrance path, rolls through the doorway, pushes the opposite wall away, then counter-steers toward the center. The test requires a wall to fall below the platform and the ball to remain physically supported by the rising platform. No wall is teleported or disabled in this interaction test. A separate force-model test removes the wall bodies to measure unloaded equilibrium directly.

The in-app browser reproduced doorway entry, one fallen wall and the wood ball remaining aboard, with three lives preserved. The ball stopped near `(330.736, 3.357, -17.832)` above the platform at Y≈2.726. A forced fall restored the initial platform height, all surrounding pieces and the untriggered proximity state. Browser error logs were empty. The full suite passes 75 tests; lint and build pass, with the existing bundle-size warning.

## Remaining parity work

Activation now registers `P_Modul_03_FallingParts` with the shared depth cleanup. Fallen weights stop simulating below the recovered level cutoff, disappear and return on reset. See [cleanup evidence and remaining scheduling differences](original-depth.md).

Exact IVP inertia, contact solving, sleep-island behavior and script-frame scheduling remain unproven. The adapter holds the cage frozen until proximity activation, then restores sleeping dynamic weights before waking the platform; this is not an implementation of IVP's internal wake propagation. All placements are physically exercised, but clearing every wall, reaching every exit, and complete level playthroughs remain outstanding. The module inventory tracks these broader gaps; the presence of an adapter is not proof of complete 1:1 parity.
