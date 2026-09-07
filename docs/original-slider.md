# Crate-supported sliding stone (P_Modul_34)

The 19 instances in Levels 1, 5, 7, 10 and 11 now use the original vertical slider. Previously both imported parts were unconstrained dynamic bodies, so the stone could tip or move sideways instead of lowering into the route when its support crate was removed.

## Recovered source

```sh
/path/to/dump-chunks /path/to/3D_Entities/PH/P_Modul_34.nmo > /tmp/mod34-chunks.tsv
python3 scripts/read-original-slider.py /tmp/mod34-chunks.tsv > src/game/original-slider-data.json
```

The extractor validates the On/Off links and reads the original parameters and frame matrices. Interpretation follows the locally inspected [CKBuildingBlocks](https://github.com/doyaGu/CKBuildingBlocks/tree/fca1963e39e64daa480918661732b1b0e45fe7b8) `SetPhysicsSlider.cpp`, `PhysicsWakeUp.cpp` and `ScaleableProximity.cpp` implementations.

| Source | Behavior |
| --- | --- |
| Physicalize 72 | Crate: one convex hull; mass 1.4; friction .8; elasticity .4; damping .1 linear/.1 angular; starts frozen; empty collision exclusion group; explicit zero mass-center offset |
| Physicalize 142 | Stone: one convex hull; mass 1.6; friction .5; elasticity .4; damping .1/.1; starts frozen; empty collision exclusion group; explicit zero mass-center offset |
| Slider 171 | Stone to `FixCube Object`; axis through `P_Modul_34_Slider_Frame01` and `Frame02`; two locked translation axes, three locked rotation axes; travel limits disabled |
| Proximity 97 | XZ distance 50 original units from the stone; Enter Range output; squared-distance polling; exactness range 55–100; polling delay 10–60 script frames |
| WakeUp 176 | Wakes the stone; no separate scripted wake targets the crate |
| On links | Physicalize crate → physicalize stone → create slider → start proximity watcher |
| Off links | Remove slider → stop watcher → unphysicalize crate → unphysicalize stone → restore hierarchy |
| Levelinit `PH_Groups` | `P_Modul_34`, Activation=1, Reset=1 |

The two slider frames define a nearly vertical axis. The source first configures a hinge-like constraint and immediately replaces that configuration with two fixed translation dimensions and three fixed rotation dimensions. The resulting constraint is a slider. The stored −1/+1 limits are disabled defaults, not travel stops. There is no motor driving the stone down: gravity acts once the support is removed.

The runtime preserves both initial poses until proximity activation. It then restores a sleeping dynamic crate and releases the constrained stone, allowing contact to move or wake the free crate. This prevents Rapier's body/joint registration from settling the crate before the original wake region is entered. Sector deactivation removes the joint and restores both poses; a fall resets the same sector and rearms the proximity watcher.

The shared proximity adapter was moved from `original-chain.ts` to `original-proximity.ts`, retaining the existing linked-bridge behavior and Apache-2.0 attribution. See [third-party references](../THIRD_PARTY.md).

## Validation and remaining limits

Four tests cover recovered parameters, frozen poses outside the wake region, activation/reset and joint cleanup, travel beyond the source's disabled limit defaults, resistance to sideways impulses and torque, and all 19 original placements on actual level floors. With its crate in place, each stone remains supported and keeps its slider axis after waking.

The Level 1 interaction test uses the stone ball's normal rolling forces to push the support crate out with repeated approaches. It checks actual crate contact, support removal, vertical descent, and the ball remaining on the floor. A separate staged upper approach in the same test then crosses the lowered stone: the ball must contact the stone's top and reach a supported exit on the original floor. This verifies the resulting path, not only visible stone movement.

The in-app browser reproduced the sequence using `?inspect` → stone material → Visit sliding stone → Clear support crate → Cross lowered stone bridge. The stone descended approximately 1.200 world units with less than .00001 lateral error. The ball crossed the upper path, stopped near `(36.808, -.481, 143.030)`, and collected the original extra life along it. A forced fall restored both original poses and disarmed the wake state; the next checkpoint deactivated the mechanism. No browser errors were reported.

These are targeted scenarios, not complete playthroughs of every affected level. Exact IVP contact, inertia and sleep-island behavior remain unproven with Rapier; the crate returns to contact-driven sleep at the proximity wake boundary rather than executing IVP's internal sleep transition. Proximity script frames still map to fixed physics ticks. Other ball materials and every instance's complete puzzle route need further comparison with the original. Module 03 now has a weighted-lift adapter; broader lifecycle/solver parity remains outstanding.
