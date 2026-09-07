# Original debris and collectibles

## Transformer debris

The outgoing ball now splits at 2.35 seconds, before the replacement appears at 2.5 seconds. `Balls.nmo` contains 16 wooden pieces, 17 stone pieces and 18 paper pieces; the renderer uses these meshes, their original textures and local transforms, rotated into the outgoing ball's orientation.

The explosion behavior parameters were read from `Balls.nmo` with `scripts/dump-original-chunks.cpp`:

| Material | Fragment mass | Friction | Elasticity | Linear / angular damping | Impulse range |
| --- | --- | --- | --- | --- | --- |
| Wood | 0.2 | 2 | 1 | 0.3 / 0.2 | 1.5–3 |
| Stone | 0.8 | 2 | 1 | 0.3 / 0.2 | 4–9 |
| Paper | 0.02–0.09 | 1–5 | 1 | 6 / 0.5 | 0.5–1.3 |

Wood parameters are file indices 463–490, stone 708–745, and paper 566–639. Directions follow each fragment's local Y axis, as in the original Physics Impulse block. Momentum is converted by scene scale × original physics time factor (0.25 × 2). The [building-block implementation](https://github.com/doyaGu/CKBuildingBlocks/blob/main/physics_RT/Behaviors/PhysicsImpulse.cpp) confirms these are impulses in a fragment-relative frame.

Each fragment has a Rapier convex hull and collides with the course and props. Fragments are excluded from collisions with the replacement player and with each other to prevent disruptive solver impulses. The original runtime has one fragment set per material; this adapter retains that bound (51 maximum), fades pieces after the recovered 20-second timeout, and removes them after a two-second fade. Respawning or changing courses clears their bodies and visuals. Paper wind controllers, exact fragment collision filtering, the fade curve, and the separate lightning effect remain approximations or pending.

## Collectibles

The white/blue placeholder polyhedra have been removed from original mode.

- **Extra life:** the original `P_Extra_Life_Sphere` mesh, `P_Extra_Life_Oil` texture, silver `ExtraBall` billboard, and `P_Extra_Life_Shadow` floor texture. The shell ripples through animated UV offsets, scales vertically between 1.2 and 0.8, and bobs between original Y offsets -0.4 and +1.2 over two seconds. The original script uses these endpoints; the web interpolation and additive shading are reconstructed. The small silver center remains circular while the shell changes shape.
- **Point extra:** a silver center with six silver satellites at the saved `P_Extra_Point_Frame1`–`6` positions, plus the original `FloorGlow` footprint. Collection trails now use textured silver billboards, too. Satellite rotation and pursuing trails remain approximations of the original TT Extra/particle scripts.
- The original proximity values are 4.5 units for lives and 3 units for point activation, converted to world scale. Lives still grant one spare ball; point trails still grant their existing time rewards. Normal gameplay gains no labels or panels.

All textures already come from the ignored local asset pack. The normal preparation command exports both extra modules; no extra asset download or production redistribution is required.

## Checks

Automated tests verify the burst fires exactly once before replacement, cancellation prevents a delayed burst, each material produces the correct number of moving pieces, repeated use stays within the pool bound, and expiry/respawn cleanup removes physics bodies. In-app browser checks verify the textured life bubble, an extra life increasing the HUD from 3 to 4, all three fragment sets (51 total), and the wooden fragments visibly separating from the ball.

The final browser pass also inspected the silver point satellites, collected a full trail with the expected time reward, and confirmed respawn clears all debris. Browser error logs were empty. All 28 tests, lint and the production build passed; the existing Vite large-chunk warning remains.

The reported early ending was confirmed by the user to be a dead end on the route. Level-end behavior was not changed.
