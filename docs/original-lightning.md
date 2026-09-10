# Respawn lightning sphere

`scripts/read-original-lightning.py` reads script 437 from the supplied
`Balls.nmo` chunk dump. It checks all 35 selected graph links, the Sequencer
version/initial state, the sphere's ONE/ONE blending, and the light/sphere parent
references to `Ball_Pos_Frame`. The extracted data contains the original curves,
three texture names, durations, rotation rate and point-light parameters.

The New Ball position event now starts the imported sphere and `Misc_Lightning`
recording while the replacement ball remains hidden and unphysicalized. The
sphere grows with the saved 1500 ms curve, rotates around local Y at the saved
2π radians/second rate, and hides when its 3000 ms timer completes. The three
textures advance once per script frame through Sequencer/Parameter Selector,
resetting to the first texture on activation. No separate texture frame rate is
introduced. The renderer reuses the already-loaded textures, with source and
destination factors both ONE and depth writes disabled.

The light first follows a 28-key blue flicker curve over 2500 ms, then a 1500 ms
white fade. The second progression consumes its activation frame through the
zero-delay link, discarding the previous timer's overshoot. The light continues
after the sphere hides and follows `Ball_Pos_Frame` after the ball reactivates.
Its authored offset is `(0,9,0)`, range is 20, and attenuation coefficients are
`(0,1,0)` in original units. The Three.js light uses the corresponding converted
offset, range and inverse-distance decay, without additional shadow maps. Its
intensity is zero while idle to retain the renderer's light-count shader variant.

## Validation

```sh
python3 scripts/read-original-lightning.py .local/reference/chunks/Balls.tsv
node --test tests/original-lightning.test.ts
```

Tests cover frame-based texture selection and restart, growth duration, separate
sphere/light completion, original blue curve keys, imported geometry, texture
reuse, ONE/ONE blending, light offset/follow and reset cleanup. The full suite
passes 229 tests; lint and production build pass.

In the local in-app browser, a Level 1 fall reached `forming` with the real ball
hidden/unphysicalized and the lightning sphere visible at full scale, texture
index 2, at age 2500.000244 ms. A screenshot confirmed the textured violet/white
shell at the reset position after the screen flash had cleared. This is a
rendering check, not a claim that the audio was auditioned through speakers.
After the full transition, the browser reported an inactive lightning effect,
hidden shell, disabled light, and a visible/physicalized ball with floor support
and two spare lives. The error log was empty.

## Remaining fidelity work

- Script 437 activates the separate `BallParticle_Frame script` after 2500 ms.
  That particle burst is not implemented by this sphere port.
- Initial-level spawning now enters the same New Ball formation directly; see
  [initial level entry](original-death.md#initial-level-entry).
- Three.js point-light cutoff and fragment lighting differ from the original
  fixed-function light rasterization. The source light parameters and curves are
  retained, but pixel-identical illumination is not established.
- Rotation uses a Three.js transform rather than the original repeated float32
  matrix updates. General cross-script scheduler equivalence remains unverified.

The implementation does not establish full game or all-level parity.
