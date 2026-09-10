# Driven swinging platforms (P_Modul_08)

The six platforms in Levels 8–11 now use their original compound body, overhead hinge and four-stage force sequence. Previously the whole rendered assembly was static.

## Recovered source

`scripts/read-original-swing.py` reads the shallow dump of the supplied `3D_Entities/PH/P_Modul_08.nmo` and reproduces `src/game/original-swing-data.json`:

```sh
/path/to/dump-chunks /path/to/3D_Entities/PH/P_Modul_08.nmo > /tmp/mod08-chunks.tsv
python3 scripts/read-original-swing.py /tmp/mod08-chunks.tsv > src/game/original-swing-data.json
```

The extractor validates the actual Create/Destroy and timer links. Interpretation follows the separately inspected [CKBuildingBlocks](https://github.com/doyaGu/CKBuildingBlocks/tree/fca1963e39e64daa480918661732b1b0e45fe7b8) implementations of `PhysicsForce.cpp`, `PhysicsHinge.cpp`, `PhysicsWakeUp.cpp` and `TimerMini.cpp`.

| Original source | Recovered setting or behavior |
| --- | --- |
| Physicalize 122 | Six convex hulls (`Col1`–`Col6`) on one body; total mass 10; friction .7; elasticity .4; linear damping .4; angular damping .1; group `Floor`; initial state frozen; collision enabled; zero mass-center offset |
| Hinge 156 | `Schaukel` to fixed world at `P_Modul_08_HingeFrame`; limits disabled |
| Identity 53 → link 204 → Force 139 → WakeUp 199 | Set active, wait one script frame, create the +Z drive in the fixed support's frame and wake the body |
| Delayer 59, 500ms | Stop +Z force 139; start the first coast interval |
| Delayer 168, 500ms → Switch 47 | While active, create −Z force 77 |
| Delayer 162, 500ms | Stop −Z force 77; start the second coast interval |
| Delayer 174, 500ms → Switch 179 | While active, create +Z force 139 and repeat |
| Force 139 / 77 | Impulse 1.1 per IVP tick, applied at the platform origin; opposite directions in `P_Modul_08_Fix` |
| Off sequence | Clear active flag, remove hinge, stop both force controllers, unphysicalize, deactivate the script and restore the initial hierarchy |

The resulting cycle is **push .5s → coast .5s → reverse push .5s → coast .5s**. The two unpowered intervals are explicit in the original graph. Replacing them with uninterrupted alternating force would change the motion. The fixed support has its own rotation inside the module; using only the level instance's rotation would also give the wrong drive direction.

The six hulls leave the deck open between the vertical supports. A single convex envelope of the rendered mesh would incorrectly fill this space. All hulls share the body's total mass rather than each receiving mass 10. The support is rendered as decoration; no Physicalize behavior targets it. The hinge's stored ±45 degree numbers are unused defaults, not motion stops.

The adapter follows the sector lifecycle already recovered from Levelinit: activation resets the script and sequence, leaving the sector stops it, and respawning restores the pose and startup delay. During the initial one-frame delay, the body retains its frozen pose. The rendered platform follows its physical position and rotation, and its colliders report wood rolling audio.

## Validation and limits

Tests check all four stages, absence of drive impulse during coasting, direction independence from body rotation, six-hull total mass, startup freezing, sector reset/deactivation, and repeated joint cleanup. All six original placements complete 20 seconds of drive cycles on the actual imported level floors with stable anchors. Paper, wood and stone can rest on the open deck rather than on a false enclosing hull.

The Level 9 traversal test approaches during the platform's return stroke, rolls onto it with normal wood-ball drive, then counter-steers to land and stop on the exit floor. It verifies contact with the swinging body and subsequent support from the static level floor. An immediate departure at startup misses the retreating platform; the test changes boarding time, not physical coefficients.

The in-app browser check uses `?inspect` → Load swinging platform course → Stage return-stroke approach → Cross swinging platform. The staging control advances two seconds with the ball away from the swept path, then places it at the approach; traversal itself uses normal roll and counter-steering forces. The Level 9 wood ball landed on the exit floor at approximately `(62.961, -15.990, -99.986)` with near-zero speed. Waiting at the edge instead lets the returning platform strike the ball before departure, so these are distinct initial conditions. A forced fall restored the initial pose and drive cycle; advancing to the next checkpoint disabled the platform and removed its active hinge. No browser console errors were reported. All 60 automated tests, lint and the production build passed; the existing bundle-size warning remains.

The contact solver and compound inertia remain Rapier's, so exact original trajectories are not proven. Timers use real milliseconds independently of the physics clock's factor of two. The initial script-frame delay currently maps to one fixed physics tick; exact Virtools scheduling remains outstanding. Full playthroughs of the affected levels and other module behaviors are separate remaining work.

## Native route follow-up (2026-09-09)

All six placements now have native-runtime forward route coverage. Wood crosses
all four Levels 8–10 placements, with actual deck contact and a stable landing on
the authored exit floor. Mistimed control departures fail. Level 11 uses paper
and its intervening `P_Modul_18_09` fan to cross both rising decks in one continuous
sequence after the initial approach placement. Wood does not complete the same
fan-dependent sequence. No bodies are teleported or forces retuned during these
routes. See [native route verification](original-native-routes.md) for measured
positions and explicit limits. These follow-up checks are headless; the earlier
browser observations above were for Rapier, not these native routes.
