# Checkpoint trigger and flame scripts

`scripts/read-original-checkpoint.py` reads the saved `PC_TwoFlames.nmo`
behavior graph from `.local/reference/chunks/PC_TwoFlames.tsv`, records its
SHA-256, and checks the controlling zero-delay links. The generated data is
`src/game/original-checkpoint-data.json`; the runtime is `OriginalCheckpoint`.

The current checkpoint watches the ball's center against its root on X/Z,
with a strict range of 70 original units. Its adaptive polling uses 10–100
script frames, with squared exactness distances 75–150. Entering the range
activates the center-flame script and its inner trigger in the same script
frame; leaving disables both. The inner trigger uses XYZ and a strict radius
of 6.5 original units around `PC_TwoFlames_Flame_Big`, whose authored local Y
translation is 1.4948457479476929. Its polling range is 1–15 frames with
exactness distances 20–30. This replaces the previous flat horizontal radius
and independent vertical tolerance.

Inner entry stops both center watchers, sends the checkpoint and sound events,
then activates both small-flame scripts and their separate X/Z proximity
watcher. That watcher uses the same 70-unit range but a 20–100-frame polling
interval. Revisiting a collected checkpoint can relight its side flames but
never sends another checkpoint event. Unactivated future checkpoints have no
flame scripts running. Gameplay's next-checkpoint graph resets the next script
with CurrentLevel column 4 false before positioning and enabling it; its
two-frame reposition link is not yet reproduced by this adapter.

The engine samples the current trigger before native physics and activates the
new sector for that frame. It saves the current ball material and uses the
corresponding authored reset frame on respawn. Respawning reconstructs the
current checkpoint's polling state; completed checkpoints keep their separate
side-flame controllers. The explicit Rapier comparison uses the same logic at
its existing fixed-tick cadence.

Flame origins now use the three authored frames. The center uses its saved
five-unit initial size, 12 ± 4 units/second speed and 1 ± 0.5-second lifetime;
side flames use three-unit size, 8 ± 3 units/second and 1 ± 0.25-second lifetime.
The previous invented point lights were removed. This retains the existing
violet particle renderer: random emission, full emitter orientation, angular
motion, activation clearing and per-particle state are not yet a general port
of the original particle system.

## Verification

- All 51 placed checkpoints preserve the transformed authored trigger center,
  reject an overhead pass, and trigger once on entry.
- Boundary tests cover strict XYZ range, adaptive delays, reset countdowns and
  the center-to-side transition, including leaving and revisiting a checkpoint.
- In the local native browser, staging eight units above the first checkpoint
  kept sector 1; a two-second gravity fall activated sector 2. Saving stone,
  switching to wood and respawning restored stone at the sector 2 reset frame.
- Browser screenshots showed only the center flame before collection and only
  the two side flames after collection. Browser error logs were empty.

These are staged checkpoint checks, not uninterrupted twelve-level playthroughs.
The original death fade/NewBall timing and complete checkpoint message ordering
remain separate parity gaps.
