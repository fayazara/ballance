# Original Ballance content import

The local game now reads the 12 original NMO levels, textures, ball models and selected audio from the user-supplied 2004 installer. This is an asset conversion and new web runtime, not a decompilation of Player.exe or execution of its behavior scripts. The NoCD executable and level-unlock database are not used.

## What works

- Original object transforms, triangle meshes, material slots, UVs, [named collision identifiers](original-collisions.md), and each level's five sky textures.
- Real wood, stone and paper ball meshes with recovered material parameters, correctly scaled drive impulses, momentum, gravity and continuous collision detection. Paper uses its convex collision hull.
- Original purple flame texture, with rising particle emitters using recovered lifetime, speed and size settings.
- [Sector-managed loose balls/crates and fixed convex domes](original-objects.md), and shared movable pieces for Level 1's modules 01 and 34. The three-post target gates now use their original compound collision hulls and sliding guide; see [pusher findings](original-pushers.md).
- All 113 fan instances use the recovered upward force and oriented wind volumes. Paper rises and can steer between fans; wood and stone stay grounded. Rotors, smoke and original fan audio are active. See [fan behavior and mechanism inventory](original-fans.md).
- Passive hinges for modules 19, 25, 30, 37 and 41: original pivots, compound hulls, mass centers and activation across 118 instances. See [hinge findings and verification limits](original-hinges.md).
- Module 29's 17 linked bridges use nine physical planks, ten hinges, the original stone-triggered connection release, tearing sound and sector reset. See [bridge behavior and limits](original-chain.md).
- Module 26's 18 suspended sacks use physical ropes, ball joints, alternating drive and sector activation/reset. See [sack behavior and limits](original-sacks.md).
- Module 08's six swinging platforms use an overhead hinge, six collision hulls and the recovered push/coast/reverse/coast sequence. See [swing behavior and limits](original-swings.md).
- Original reset/checkpoint, transformer, point-extra, life-extra and finish locations.
- Transformer capture, original animated ring/bar/flash meshes, delayed material replacement and release. See [transformer findings](original-transformer.md).
- Material-specific debris uses the original ball fragments. Extra lives and point extras use the original bubble, silver-ball and floor textures. See [effects findings](original-effects.md).
- Three spare lives. Point extras award 100 time points on activation, then six pursuing satellites grant 20 time points apiece. Life extras reappear when their section resets; point extras do not. Checkpoints discard uncollected trailing particles.
- 1,000 starting time points, decreasing at two per second; final score includes remaining points, level bonus and spare lives.
- Original music/ambience, rolling audio and selected event effects. Sound unlocks on the first interaction and obeys browser gesture restrictions.
- Original camera controls: Space raises the view, Shift plus left/right rotates 90 degrees. The original defaults can be rebound in Options; the earlier convenience shortcuts were removed. See [the desktop interface](original-ui.md).

## Remaining fidelity work

All twelve courses load, but this is not complete behavioral parity. Levels 2–12 are explicitly marked as mechanics in progress. Fans, pushers, five passive hinge types, linked breakable bridges, suspended sacks, swinging platforms, spring-return rotating arms, crate-supported vertical sliders and weighted spring lifts now have behavior adapters. The [module inventory](original-fans.md#remaining-module-inventory) identifies the remaining gaps. They are not guaranteed completable.

The playable scene now retains Level 4's three invisible collision floors:
`A02_FloorCol_Object_invisible`, `A04_invisibleColl1` and `A04_invisibleColl2`.
They previously disappeared from physics when the renderer skipped the invisible
group. `originalSceneEntries` keeps their colliders and hides their meshes. The
all-course reset test uses this same scene-selection function and asserts that
every original collision-floor ID survives selection. The separate
[IVP course audit](original-ivp-wasm.md) checks all 491 original floor bodies in
the experimental native/WASM backend.

Level 1 is the first playable integration, with its core interactions implemented. Its shared pushers use recovered compound hulls and a physical guide, while the sliding stone uses reconstructed rigid-body behavior; ball/object material parameters have now been recovered, but complete constraint and solver parity is still outstanding. See [the physics findings](original-physics.md). The whole course has not been completed end to end in testing. Lantern effects, scoring-particle motion and finish animation are approximations. Transformer timings and debris parameters now come from the original scripts; exact curve evaluation and the lightning effect remain incomplete. Level-specific theme sets, randomized ambient/theme sequences, and checkpoint/ending music transitions are now connected locally; see [the music findings](original-music.md). Surface-specific rolling sounds use the original sound groups. The responsive desktop menus use recovered labels, menu flow and source scene; they are not a full execution of the original menu scripts. See [interface coverage and limits](original-ui.md). Cutscenes, tutorials and remaining special-event behavior are still incomplete. The absent thirteenth bonus level is not part of this ISO.

## Asset packaging

`.local/original/` is ignored by Git. The custom Vite middleware serves it under `/original/` during development. `pnpm run deploy` builds the application, then stages the converted JSON, PNG, JPG and Ogg files into `dist/client/original` before uploading through Wrangler. The staging step requires a manifest and rejects files above the Workers asset limit. It does not upload installers or executables. An ordinary build still excludes the pack; the application requires the served asset pack for its original courses and menu scene.

The download's presence does not grant redistribution rights to its content. Keep the imported pack local unless you have permission to publish it. A future distributable version can accept users' own game files.

## Reproduce the conversion

Requirements: Python 3, CMake, a C++23 compiler, zlib/iconv, ffmpeg with libvorbis, and unshield for the InstallShield cabinets. On the tested Mac, `unshield` was installed with Homebrew. No original executable needs to run.

The tested reader was the MIT-licensed [LibCmo21](https://github.com/yyc12345/libcmo21), commit `a5aee0a464e6936e726af4eb3219140c447dbe36`. Its dependencies were [YYCCommonplace](https://github.com/yyc12345/YYCCommonplace), commit `422aa152ff36a9f545d9c7a8d127b996e3f13f73`, and [stb](https://github.com/nothings/stb), commit `2e2bef463a5b53ddf8bb788e25da6b8506314c08`. The external reader is built separately; its binary/source is not vendored into this app.

Build YYCCommonplace with `CMAKE_POSITION_INDEPENDENT_CODE=ON`, install it to an isolated prefix, then configure LibCmo21 with:

```sh
cmake -S /path/to/libcmo21 -B /tmp/cmo-build \
  -DCMAKE_BUILD_TYPE=Release \
  -DNEMO_BUILD_UNVIRT=OFF -DNEMO_BUILD_BALLANCE=ON -DNEMO_BUILD_BMAP=ON \
  -DYYCCommonplace_ROOT=/path/to/yycc-install -DSTB_ROOT=/path/to/stb
cmake --build /tmp/cmo-build -j6
```

Read `Setup/data1.cab`, `Setup/data1.hdr` and `Setup/data2.cab` from the ISO with `bsdtar -xOf`, saving them beside each other, then run `unshield -d /tmp/ballance-install x /path/to/data1.cab`. The German installer directory `Programmdateien_der_Anwendung` contains `3D_Entities`, `Textures` and `Sounds`.

From the project root:

```sh
python3 scripts/prepare-original.py \
  --library /tmp/cmo-build/Ballance/BMap/BMap.dylib \
  --game /tmp/ballance-install/Programmdateien_der_Anwendung
```

This runs `extract-original.py`, exports the levels and shared entities to JSON, writes PNG textures, converts sky BMPs to JPEG and selected WAVs to Ogg, and generates `.local/original/manifest.json`. Each level JSON records the SHA-256 of its source NMO. Windows/Linux BMap library names differ; pass the correct library path.

The converter translates no scripts. The renderer changes Virtools' left-handed coordinates to Three.js right-handed coordinates, reverses winding, flips V and scales coordinates by 0.25. Ball radius is therefore 0.5 world units.

The imported world matrices do not preserve parent relationships: the current
LibCmo reader explicitly discards parent IDs. The serialized NMO chunks still
contain those IDs. Exact hierarchy-dependent local scales and collision-surface
caching therefore remain a parity boundary; see [the inertia audit](original-inertia.md).
Broken-ball center, inertia, burst-offset and wind behavior are documented in
[original-debris.md](original-debris.md).

## Verification

`npm test` covers transform/winding correctness, dynamic-object coordinates, paired-rail grounding and the existing procedural game. When the local pack is present, it also loads all 12 original levels into Rapier and settles a ball at every reset point; that integration test skips explicitly without the pack.

The in-app browser was used to visually inspect Level 1 and verify a two-second opening roll, checkpoint activation, fall/respawn, stone transformation, collectible trail scoring, the finish/results trigger, next-course navigation and loading Level 12. Audio elements reached playable state and music playback was observed in browser telemetry; this is not a listening-quality assessment. These targeted checks do not constitute full playthroughs.

For repeatable local checks, `?inspect` adds an explicit developer panel. It can advance a fixed duration, place the ball at interaction markers and report position, material, points and audio state. These controls do not appear on the normal game route and are excluded from production. Inspection runs do not save records.

The six Module 17 rotating arms use their original hinge and offset spring attachment points. All three ball materials can push through the tested Level 9 arm. See [recovered arm behavior and limits](original-arms.md).

Module 34 now constrains the supported stone vertically and restores its original proximity wake/reset sequence. The tested Level 1 crate removal lowers the stone into a traversable upper path. See [slider findings and limits](original-slider.md).

Module 03 is now a weighted spring lift: its seven walls and open doorway can be knocked off to reduce the load and raise the platform. All nine placements are simulated, and the Level 7 doorway/wall-removal interaction is verified. See [lift findings and remaining limits](original-lift.md).
