# Original material transformer

The original-mode transformer now captures the ball, animates the original machine, changes material near the end, and restores player physics. Same-material machines do nothing. Captured balls ignore steering; pausing freezes the sequence; respawn, restart, course changes and time expiry cancel it safely.

## Recovered behavior

The local `Gameplay.nmo` and `AnimTrafo.nmo` were read with `scripts/dump-original-chunks.cpp`. The numerical findings, original object IDs, and curve knots are recorded in [original-transformer-evidence.json](original-transformer-evidence.json). No executable was run.

| Behavior | Original value | Web behavior |
| --- | --- | --- |
| Nearest transformer test | distance < 4.3 | distance < 1.075 at 0.25 scene scale |
| Ball dephysicalization | 1,350 ms | Fixed body with disabled collider during capture |
| TT Set Dynamic Position | force 2; damping 0.7 on each axis; offset (0, -3, 0) | Spring capture to machine-local (0, +0.75, 0) |
| Ring_Open | 350 ms; displacement (-0.5, 0, -0.5) in each segment's frame | Four original segments open outwards |
| Up 'n Down | 2,000 ms; vertical travel 5.2 | Original ring, bars and flash field rise 1.3 world units and return |
| FlashAnim | alternate horizontal UV offset ±0.5 every 50 ms | Original additive flash texture alternates its two halves |
| Ring_Close | 200 ms | Original ring returns flush with the static machine |
| Old-ball explosion | 1,000 ms after capture ends | Old ball splits into its original material-specific fragments at 2.35 seconds |
| Set new Ball / physicalize | 150 ms after explosion | Material and collision shape change once at 2.5 seconds; velocities reset |

The animation graph links intro → ring open → up/down → ring close → exit; FlashAnim starts alongside up/down. The gameplay graph links capture → 1,000 ms delay → old-ball explosion → 150 ms delay → new ball → physicalize. The static machine is hidden while its animated counterpart is shown and restored after 2.55 seconds.

The spring formula was checked against the [TT Set Dynamic Position implementation](https://github.com/doyaGu/CKBuildingBlocks/blob/main/TT_Toolbox_RT/Behaviors/SetDynamicPosition.cpp). The saved 2D curve knots and tangent slopes are reconstructed with cubic Hermite interpolation. This is a new runtime adapter, not execution of Virtools scripts: original render-frame dependence, exact Virtools curve evaluation, lightning, and environment-map shading remain fidelity work. The explosion interval now spawns simulated original fragments; see [debris findings](original-effects.md).

## Assets and verification

`prepare-original.py` now exports `AnimTrafo.nmo` as well as the levels and shared modules. To update an existing local pack without re-exporting all levels:

```sh
python3 scripts/extract-original.py --transformer \
  --library /path/to/BMap.dylib \
  --game /path/to/Programmdateien_der_Anwendung \
  --output .local/original
```

The animation meshes and two textures remain in the ignored local pack and are not copied to production.

`tests/original-transformation.test.ts` exercises all six material transitions, same-material rejection, overlapping triggers, input resistance, capture position, delayed replacement, restored mass/collisions, cancellation before/after replacement, and read-only animation sampling during pause. The imported visual test also covers null material slots and restoration of the stationary machine. The in-app browser's `?inspect` route offers small simulation steps and reports the active sequence, material, body type and collider state; it hides the pause overlay to allow visual inspection while simulation is paused.

Browser verification on Level 1: an off-center wooden ball converged to the stone machine's center despite two seconds of held input; it was still wood at 2.197 seconds and stone with dynamic physics and enabled collision after 2.55 seconds. The raised ring/flash field and restored static machine were visually inspected. Pause/resume retained the active sequence, and restarting mid-animation returned a visible, dynamic wooden ball to the level start. No additional browser exceptions appeared after the null material-slot fix. All 26 tests, lint and the production build passed; Vite retains its existing large-chunk warning.
