# Passive hinged mechanisms

The runtime now physicalizes these five original module types instead of displaying static meshes:

| Module | Mechanism | Instances across the 12 levels | Original collision hulls | Mass |
| --- | --- | ---: | ---: | ---: |
| 19 | Flap assembly | 7 | 4 | 3 |
| 25 | Short drawbridge | 29 | 2 | 3 |
| 30 | Seesaw | 17 | 2 | 3 |
| 37 | Long drawbridge | 22 | 3 | 3 |
| 41 | Small pivoting plank | 43 | 2 | 1 |

## Source evidence and implementation

`src/game/original-hinge-data.json` is generated from the original NMO Physicalize and Set Physics Hinge behavior parameters. It records target and collision-mesh names, friction, restitution, mass, damping, collision group, frozen state, mass-center override, the invisible hinge referential's complete matrix, limit enablement and activation distance. These frames were not part of the renderer's exported mesh-object list.

Reproduce the data with shallow module dumps from `scripts/dump-original-chunks.cpp` named `mod19-chunks.tsv`, `mod25-chunks.tsv`, `mod30-chunks.tsv`, `mod37-chunks.tsv` and `mod41-chunks.tsv`, then:

```sh
python3 scripts/read-original-hinges.py /path/to/dumps > src/game/original-hinge-data.json
```

The reader follows parameter references; it does not derive physics from the appearance of meshes. The PhysicsHinge implementation in the separately inspected CKBuildingBlocks source uses the referential's world position and forward (local Z) direction to anchor the target to `FixCube`. The web implementation creates a fixed anchor at that point and a revolute joint. Both the anchor and axis are transformed through each level instance and handedness conversion.

All five modules store ±45-degree default limit values, but **their Limitations flag is false**. The web runtime does not impose those inactive limits. Physical level geometry supplies contact stops where present. The two bridge types use an empty collision-group name and collide with floor geometry; the seesaw, flaps and small planks use Floor exclusions. Decorative hinge/axis meshes have no physicalization behavior and are rendered without inventing extra colliders.

Mass-center offsets are intentional. For example, the seesaw uses `(0,4,0)` and the long bridge uses `(-7.5,0,0)` in the moving object's original local frame. These offsets are transformed into the body's web coordinate frame. The IVP source sets a mass-center override independently of its surface inertia calculation; the port likewise does not add a guessed parallel-axis adjustment. Rapier still supplies compound inertia and contact/constraint solving, so this is not proof of exact IVP solver parity.

Modules 19, 25, 30 and 37 begin frozen and activate within the recovered 50-original-unit horizontal proximity. Merely calling Rapier `sleep()` was insufficient because attaching a joint could wake the body immediately. The runtime now holds the initial pose fixed until proximity activation, then makes it dynamic. Module 41 starts dynamic when its sector activates, as specified in its original script. Sector deactivation removes the joint and disables/restores the body; re-entry creates the joint again at its correct anchor. Proximity now uses recovered adaptive polling and the original MF frames. See [sector lifecycle and validation](original-sectors.md). No artificial motors or animation-driven opening are added.

## Verification and limits

Six hinge tests cover recovered flags/offsets, mass and compound hull counts, frozen activation, arbitrary instance orientation, constrained rotation, pivot retention and reset. Every one of the 118 instances is simulated in its actual level floor geometry with an anchor-error check. That broad stability check is **not** an all-level traversal test.

Targeted gameplay tests use the actual level meshes and ordinary player control forces:

- Wood loads and rolls across the Level 2 seesaw onto its exit platform.
- Stone knocks down the Level 2 short drawbridge through contact.
- Stone tilts a Level 7 pivoting plank.

A separate in-app browser tab verified visible Level 2 seesaw movement under wood, rolling off onto the adjacent route, and Level 7 plank movement under stone. The selected plank tilted about 38 degrees; its anchor error remained below 0.00001 world units. A fall restored the plank to its starting pose. Browser error logs were empty. Dropping a ball over an upright bridge was not a successful traversal test; the subsequent physics test instead approached and pushed the bridge from its actual platform.

Still required for full parity: full route verification for every mechanism placement and material, exact original solver/inertia comparison, additional behavior flow and proximity lifecycle auditing, and the modules with springs, timed forces, ball joints, sliders and chained hinges. The broader goal of all physics in all levels remains unfinished.
