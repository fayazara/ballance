# Ballance

A React + Three.js port using the twelve original Ballance courses and a WebAssembly build of the IVP physics SDK reference. Development and production builds now select IVP by default. `?physics=rapier` selects the earlier comparison adapter. The source game pack and SDK are supplied separately.

The full 1:1 port is **in progress**. All twelve layouts and their mechanism types are connected, but uninterrupted complete playthroughs and original-executable equivalence remain unverified. See [native runtime coverage](docs/original-ivp-wasm.md), [route verification](docs/original-native-routes.md), and [original content import](docs/original-import.md) for concrete evidence and limitations.

## Controls

- **Arrow keys:** roll relative to the camera.
- **Left Shift + left/right:** rotate the camera by 90 degrees.
- **Space:** raise the camera.
- **Escape:** pause or return from a menu.

Controls can be rebound in Options. The responsive interface follows the original menu flow and shows only time points and extra lives during play. It uses browser-rendered text and custom responsive artwork; it is not a pixel-perfect execution of the original interface scripts. See [interface coverage](docs/original-ui.md).

## Development and build

Requires Node 22.18+ (Node 24 recommended), the converted original pack at `.local/original`, and the separately built IVP runtime at `.local/ivp-simulation`.

```sh
pnpm install
# One-time native runtime build; requires the supplied SDK and Emscripten:
python3 scripts/build-ivp-simulation.py .local/reference/ivp .local/ivp-simulation
pnpm dev
pnpm test
pnpm lint
pnpm build
```

The import and SDK setup are documented in [original-import.md](docs/original-import.md) and [original-ivp-wasm.md](docs/original-ivp-wasm.md). The build fails when the generated runtime is missing or its metadata does not match the verified SDK settings. Development inspection controls are available at `/?inspect=tools`; they are absent from production.

The Cloudflare Vite plugin writes the client into `dist/client` and Worker into `dist/ballance`. The production client includes the IVP loader and WASM in one content-hashed directory. To preview the complete production game locally:

```sh
pnpm build
node scripts/stage-original-assets.mjs
pnpm exec vite preview
```

`pnpm run deploy` builds, stages the converted game pack and offline manifest, then deploys through the existing Wrangler configuration. Both native runtime files are included in the offline manifest. Ordinary `pnpm build` includes the solver but does not copy the original game pack. The live deployment is not changed by building or previewing locally.

## Source and verification

- `src/game/original-engine.ts`: game lifecycle, rendering, original behaviors, audio and native-runtime integration.
- `src/game/original-ivp-runtime.ts`: native course bodies, player, sector lifecycle and mechanisms.
- `src/game/ivp-bridge.ts`, `scripts/ivp-simulation-bridge.cpp`: typed ownership boundary and compiled SDK bridge.
- `src/game/original-ivp-player.ts`: original ball shapes, material properties and input force controllers.
- `src/game/original-camera.ts`: recovered camera rig and navigation behavior.
- `src/App.tsx`, `src/ui/`: responsive menu flow and HUD.
- `scripts/prepare-original.py`: conversion of the separately supplied game assets.
- `scripts/read-original-*.py`: extraction of original settings and behavior data.
- `scripts/verify-ivp-*.ts`: native/WASM replay comparisons.
- `tests/original-ivp-runtime.test.ts`: actual-course native interaction and lifecycle checks.

The earlier independent-course engine and Rapier adapters remain in the repository for comparison; the current app opens the original-game interface. Test coverage of a staged route or a successfully constructed sector does not establish full-level completion.

Ballance was created by Cyparade and originally published by Atari. Original game assets and the separately supplied SDK have their own provenance. See [third-party references](THIRD_PARTY.md) and [research notes](docs/references.md). Production packaging includes converted game assets and the generated browser solver, not the original installer, EXE or DLLs.
