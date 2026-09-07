# Nine-plank breakable bridges (P_Modul_29)

The 17 instances in Levels 2, 3, 4, 6, 7, 8, 9, 10 and 11 now use nine rigid planks connected by ten hinges. They previously rendered as static geometry. Wood and paper can cross; the original script releases a connection for the stone ball.

## Recovered source

`scripts/read-original-chain.py` reads the shallow chunk dump of the supplied `3D_Entities/PH/P_Modul_29.nmo` and reproduces `src/game/original-chain-data.json`:

```sh
/path/to/dump-chunks /path/to/3D_Entities/PH/P_Modul_29.nmo > /tmp/mod29-chunks.tsv
python3 scripts/read-original-chain.py /tmp/mod29-chunks.tsv > src/game/original-chain-data.json
```

The numerical parameters, named objects and graph connections are read from the original file, not fitted to the screenshot. File indices below refer to that dump. Interpretation follows the separately inspected [CKBuildingBlocks](https://github.com/doyaGu/CKBuildingBlocks) implementations of `PhysicsHinge.cpp`, `PhysicsWakeUp.cpp`, `ScaleableProximity.cpp` and `Test.cpp`. No original executable is run.

| Source behavior | Meaning |
| --- | --- |
| Physicalize 384, 419, 454, 489, 524, 559, 594, 629, 664 | One convex hull per plank; mass .5 except Platte09 at 1; friction .7; elasticity .4; linear damping .1; angular damping .3; initially frozen; explicit zero mass-center offset |
| Hinges 116 and 133 | Attach Platte01 and Platte09 to the fixed world |
| Hinges 151, 169, 187, 205, 223, 241, 259, 277 | Connect successive planks. Their stored ±45 degree limits are disabled |
| Proximity 99 → WakeUp 349 → Proximity 344 | At 80 original units in X/Z from the module frame, wake the connected physics unit via Platte04 and arm the inner trigger |
| Proximity 344 → Get Cell 74 → Test 699 | On entering a 4-unit **3D** radius around the moving Platte06 origin, test the current ball's name against `Ball_Stone`. Comparison operator 1 means Equal |
| Test True → compound input 302 → Hinge 187 Destroy | Remove the connection between Platte07 and Platte06, leaving the other nine hinges intact |
| Test True → Wave Player 319 | Play `Misc_RopeTears` and disable the inner trigger |

Both proximity behaviors select **Enter Range** only. Changing the ball material while remaining inside does not independently fire the trigger; leaving and entering again does. The inner trigger includes Y, so a stone ball passing on a higher story does not break the bridge below it. It follows the moving plank, not its initial position. No force threshold, arbitrary plank deletion, or animated substitute is used for the break.

All planks use the original `Modul29` collision exclusion: they collide with the ball and floor but not one another or another instance of the same module. Initial orientations are baked into mesh and collider geometry; the recovered frame's local Z determines each hinge axis. Total bridge mass is 5. The Rapier adapter holds the initial pose until activation, then releases the connected bodies together. Sector deactivation removes the remaining joints, disables all planks, restores poses and velocities and rearms the triggers. Reactivation rebuilds all ten joints; inactive sectors do not poll wake or break triggers. See [sector lifecycle and validation](original-sectors.md). Planks report wood rolling audio; the tearing sound is converted into the ignored local asset pack.

## Verification and limits

The regression suite verifies frozen activation, motion under load, endpoint and internal anchor stability, material-specific release, 3D distance, enter/reenter semantics, repeatable resets without leaked joints, and all 17 placements on their actual imported level floors. A targeted route test uses the regular drive impulses and real paper convex hull to cross the Level 2 bridge with wood/paper and release it with stone. Ball approach positions are controlled for these tests; the planks move through physics.

In a separate in-app browser tab, wood and paper crossed the Level 2 bridge with all ten joints intact. Stone reduced the count to nine; a further half-second showed the released planks dropping. A forced fall restored the original plank heights and all ten joints in that sector. Browser errors were empty. The rope-tearing audio asset reached playable state; this was not a listening-quality assessment. The corresponding tests, lint and production build passed.

The solver is still Rapier, with computed hull inertia and extra constraint iterations. This is not proof of IVP contact/inertia parity. The original adaptive frame-delay settings are preserved, but script frames currently map to fixed physics ticks rather than the original render/script scheduler. End-to-end playthroughs of every affected level remain outstanding.
