# Ballance

A React + Three.js rolling-ball game with two content modes. A local original-game asset pack loads the actual twelve Ballance courses through a new Rapier runtime. Without it, the app opens the three independently made web courses. Both modes open directly into play with a minimal HUD.

See [Original content import](docs/original-import.md) for setup, implemented behavior, verification and remaining fidelity work. Original game content stays local and is excluded from production builds.

## Play the local original courses

- **WASD / arrows:** roll relative to the camera.
- **Space:** raise the camera.
- **Shift + left/right**, or **Q/E:** rotate the camera.
- **Escape:** pause. **R:** restart.
- Three spare lives, original checkpoints/transformers and collectible trails.
- Transformers pull the ball to the center, play the original ring animation, then replace its material and release it. [Timing and fidelity notes](docs/original-transformer.md).
- Fans lift paper using the original force and wind-column dimensions. Steer while rising to reach higher fans and platforms; wood and stone remain grounded. [Fan implementation and outstanding mechanisms](docs/original-fans.md).
- The old ball breaks into its original wood, stone or paper fragments. Extra lives have iridescent bubbles; point extras have orbiting silver satellites. [Effects notes](docs/original-effects.md).

All 12 layouts are imported. Level 1 is the first playable integration; later courses still need their special mechanism behaviors and are marked accordingly. Ball and crate material values now come from the original data tables; see [physics findings](docs/original-physics.md). The contact solver is still Rapier, so exact IVP parity is not claimed.

## Play the independent web courses

- **WASD / arrow keys:** roll, relative to the camera.
- **Space:** brake.
- **Q / E:** rotate the camera.
- **Escape / P:** pause or resume.
- **R:** restart the whole course.
- Touch devices show directional controls and a brake button.

Roll over transformation pads to become wood, stone, or paper. Stone pushes the block on course 2. Paper can cross fragile bridges and ride fans over gaps. Wood is required to finish. Brass rings save checkpoints and the current material. Falling costs one of five lives and restores the last checkpoint. Golden collectibles award 50 points and 10 seconds; checkpoints award 100 points. Completing a course adds five points per remaining second.

The pause menu contains course selection and settings. Sound starts muted. Sound, rendering quality, steering strength, and per-course high scores persist in localStorage. The game still works when storage is unavailable. Hidden or unfocused windows pause automatically.

## Development

Requires Node 22.18+ (Node 24 recommended for the TypeScript test runner).

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

The existing Cloudflare Vite plugin builds the client into `dist/client` and the Worker into `dist/ballance`. `npm run deploy` builds and deploys through the existing Wrangler configuration. No deployment has been performed as part of this implementation.

## Source

- `src/game/levels.ts`: course geometry, checkpoints, collectibles, transformers, blocks, and fans.
- `src/game/geometry.ts`: trims coplanar bridge/platform overlaps to prevent flickering seams.
- `src/game/physics.ts`: deterministic rolling simulation, surface heights, acceleration, drag, brakes, gravity, and landing.
- `src/game/engine.ts`: Three.js rendering, fixed 120 Hz simulation, game rules, camera, sound, atmosphere, and cleanup.
- `src/game/original-data.ts`, `original-engine.ts`, `original-audio.ts`: original content conversion, rendering, Rapier physics and audio playback.
- `scripts/prepare-original.py`: creates a local original asset pack.
- `tests/original-import.test.ts`: coordinate conversion, rail support and original reset-point integration checks.
- `src/App.tsx`: minimal HUD, menus, touch controls, and preferences.
- `public/textures/cloudscape.jpg`: generated sky artwork, served locally.
- `tests/physics.test.ts`: ten physics tests, including ramp traversal, both fan-gap landings, frame-step consistency, and braking.
- `tests/geometry.test.ts`: three regression tests for bridge seams and ramp preservation.

## Independent course scope and assets

The fallback mode is an original three-course fan recreation. Physics is a purpose-built surface simulation: rails use narrow support strips and blocks use simplified collision/push logic. It does not reproduce the original's full rigid-body object system, seesaws, or every obstacle type.

Platform and ball textures are procedural. The sky artwork was generated specifically for this project. Geometry and sound are generated in code. No original game binaries, textures, music, or screenshots are bundled in production. The separate local importer reads user-supplied assets. See [the reference notes](docs/references.md) for research and attribution.

Ballance was created by Cyparade and originally published by Atari. The original game is available from [its current publisher on Steam](https://store.steampowered.com/app/2000770/Ballance/).
