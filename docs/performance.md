# Runtime performance — 2026-09-10

The reported issue is a frame-rate drop with sound enabled, particularly on iPhone.
The local in-app browser did not reproduce the severe drop in the sampled areas;
the measurements below establish reduced work, not a measured improvement from a
previously low frame rate. No physical iPhone or native CPU/GPU profiler was available.

## Changes

- Short effects, rolling/contact sounds and fans share one Web Audio context and
  cached decoded samples. Rolling pitch changes update an AudioParam without
  repeatedly configuring an HTML media player. Pending decoding is cancelled
  logically when a voice stops; late completion cannot start that voice.
- Music remains streamed. Playback requests are deduplicated while pending,
  unchanged properties are not written, and pause invalidates pending requests
  so rapid pause/resume still works.
- Imported opaque triangle groups sharing a material are combined at load time.
  Triangle winding, vertex attributes and material membership are preserved.
  Alpha-blended meshes retain their original group order; physics owns separate
  indices. Empty, unused imported material slots are supported.
- Coarse-pointer devices use a maximum 1.5 pixel ratio, a 1.2-million-pixel target
  and 1024-square shadows (desktop: ratio 2, 4-million-pixel target, 2048 shadows).
  Sustained slow frames lower render resolution; recovery is deliberately slower.
  The minimum ratio is 0.75 on phones. Simulation timing and control input are
  independent of render resolution.

## Browser measurements

Eight-second requestAnimationFrame samples, native IVP, Level 1 start, with an
identical 1908 × 1996 drawing buffer and 3,082 rendered triangles. The development
inspector was active in both versions. Counts instrument actual HTMLMediaElement
setters/methods and restore the original descriptors when each measurement ends.

| Metric | Before, sound on | After, sound on | After, sound off |
| --- | ---: | ---: | ---: |
| FPS | 120.00 | 120.01 | 120.00 |
| p95 frame interval | 9.2 ms | 9.3 ms | 9.3 ms |
| Frames over 33.4 ms | 0 | 0 | 0 |
| Draw calls | 231 | 68 | 68 |
| HTML volume writes | 2,886 | 0 | 0 |
| HTML playbackRate writes | 962 | 0 | 0 |
| HTML preservesPitch writes | 962 | 0 | 0 |

The after sound-on sample also recorded one music seek. Legitimate music startup,
fades and track changes can still produce media operations. The new sample context
was running with a playing rolling voice; this was not a benchmark with broken or
silenced playback.

Final Level 2 paper-ball fan sample: 120 FPS, p95 9.3 ms, no frames over 33.4 ms,
308 draw calls, 3,257 triangles at the same drawing-buffer size. Web Audio reported
two playing voices and three cached sample buffers. HTML media recorded only two
volume writes, two seeks and two play calls associated with music startup. Browser
error log was empty. A screenshot confirmed the textured paper ball and fan scene
rendered after the change. Audio signal quality was not auditioned through a
physical output device.

These are short, selected-scene measurements, not full-level or physical-iPhone
benchmarks. The fan view remains more expensive than the starting platform.

## Regression checks

All 219 tests pass, including decoded-buffer reuse, changing pitch without source
recreation, pending-play cancellation, music pause/resume, material-group preservation
and the coarse-pointer adaptive render budget. The render-budget test also covers
sustained 5 FPS stalls. Lint and production build pass; the build retains its
existing large-chunk warning. Normal Start → Level 1 entered gameplay directly
with no browser errors. No deployment was performed for this change.

Use `?inspect=tools` locally and the **Measure sound on/off** buttons to repeat a
measurement. Do not run builds concurrently with a frame-rate measurement.

## Second pass and deployment

The Level 2 fan floor contains 254 alternating material groups, including an
alpha-blended grille. The first pass skipped this entire mesh. Batching now works
within contiguous solid sections, treating transparent, non-depth-writing and
nonstandard-blending groups as ordering barriers. No triangle crosses a barrier.

Flames and fan smoke now cache their invariant random seed calculations, avoid
buffer uploads while animation time is unchanged, and have conservative culling
spheres. Red collectible trails update their bounds with the live dots so they
can be culled outside the view without losing trails during satellite pursuit.
This reduces offscreen rendering; particle simulation still advances normally.

The same Level 2 fan test now reports **60 draw calls**, down from **308**, while
retaining **3,257 triangles** and the **1908 × 1996** drawing buffer. Sound-on
sampling returned 120 FPS, p95 9.3 ms and zero frames over 33.4 ms. Two Web Audio
voices were playing and the browser error log was empty. This is reduced rendering
work, not a measured FPS increase on the already refresh-limited desktop test.

All **223 tests** pass. Added coverage verifies ordering barriers, conservative
particle bounds for every flame profile, moving trail bounds, and paused effect
uploads. Lint and TypeScript checks pass. Physical-iPhone performance is still
unmeasured. The deployment requested with this second pass includes both passes.

Deployed with `pnpm run deploy` to `https://ballance.fayaz.workers.dev/`, version
`45bec4e0-d2b6-4179-bf0e-e229c6d90568`. The public HTML serves the matching new
`index-DMN_o7GZ.js` bundle. Offline pack version: `71e86082520ade6e90b8`.
