# Original Ballance content import

The local game now reads the 12 original NMO levels, textures, ball models and selected audio from the user-supplied 2004 installer. This is an asset conversion and new web runtime, not a decompilation of Player.exe or execution of its behavior scripts. The NoCD executable and level-unlock database are not used.

## What works

- Original object transforms, triangle meshes, material slots, UVs, floor/rail collision groups, and each level's five sky textures.
- Real wood, stone and paper ball meshes with Rapier rigid-body simulation, momentum, rolling, gravity and continuous collision detection.
- Loose balls, crates and domes; shared movable pieces for Level 1's modules 01 and 34.
- Original reset/checkpoint, transformer, point-extra, life-extra and finish locations.
- Three spare lives. Point extras generate 22 pursuing particles, each granting 10 time points. Life extras reappear when their section resets; point extras do not. Checkpoints discard uncollected trailing particles.
- 1,000 starting time points, decreasing at two per second; final score includes remaining points, level bonus and spare lives.
- Original music/ambience, rolling audio and selected event effects. Sound remains opt-in and obeys browser gesture restrictions.
- Original camera controls: Space raises the view, Shift plus left/right rotates 90 degrees. WASD and Q/E are additional conveniences.

## Remaining fidelity work

All twelve courses load, but this is not complete behavioral parity. Levels 2–12 are explicitly marked as mechanics in progress. Their special fans, swinging/hinged mechanisms, collapsible bridges and scripted machinery currently use the imported static meshes where no behavior adapter exists. They are not guaranteed completable.

Level 1 is the first playable integration, with its core interactions implemented. Its shared pushers/sliding stone use reconstructed rigid-body behavior; original physics parameters and constraints have not been recovered. The whole course has not been completed end to end in testing. Lantern/flame effects, scoring-particle motion, transformation timing and finish animation are approximations. The first original music theme is currently reused across levels, with surface-specific rolling sounds selected using the original sound groups. Original menu scripts, cutscenes, tutorials, sound scheduling and the UFO extraction sequence are not executed. The absent thirteenth bonus level is not part of this ISO.

## Local asset boundary

`.local/original/` is ignored by Git. The custom Vite middleware serves it under `/original/` only during `npm run dev`. It is outside `public/`, and the production build never copies it into `dist`. With no local pack, the app falls back to the existing three original web courses. Normal Cloudflare deployment contains only the new code and independently made assets.

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

## Verification

`npm test` covers transform/winding correctness, dynamic-object coordinates, paired-rail grounding and the existing procedural game. When the local pack is present, it also loads all 12 original levels into Rapier and settles a ball at every reset point; that integration test skips explicitly without the pack.

The in-app browser was used to visually inspect Level 1 and verify a two-second opening roll, checkpoint activation, fall/respawn, stone transformation, collectible trail scoring, the finish/results trigger, next-course navigation and loading Level 12. Audio elements reached playable state and music playback was observed in browser telemetry; this is not a listening-quality assessment. These targeted checks do not constitute full playthroughs.

For repeatable local checks, `?inspect` adds an explicit developer panel. It can advance a fixed duration, place the ball at interaction markers and report position, material, points and audio state. These controls do not appear on the normal game route and are excluded from production. Inspection runs do not save records.
