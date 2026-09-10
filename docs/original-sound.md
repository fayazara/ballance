# Original native contact sounds

The local IVP runtime now consumes its collision events instead of discarding
them. `OriginalIvpSound` connects `OriginalIvpContact` to the recovered Sound.nmo
rolling graph and reproduces the PhysicsCollDetection impact thresholds.
The deployed/default Rapier path retains its earlier sound implementation.

Recovery uses `scripts/read-original-audio.py`. It reads Sound.nmo, the
Levelinit.nmo sound-group selectors, and the original physical modules. The
read-only chunk utility's new `--managers` option exposes each file's attribute
name table, allowing saved numeric attributes to be resolved by their actual
names. `original-audio-data.json` contains those module IDs, the ball/surface
recording table, delays and impact settings. No executable was run.

- The three floor rolling groups select stone, wood and metal. Imported module
  bodies use their authored `Continuous Contact ID`, not a material guess.
  Crates, ending-platform plates and several other objects have impact IDs only;
  the adapter does not invent a rolling ID for them.
- Rolling starts and stops after the stored 0.3000000119 IVP seconds, including
  the original short-contact retention and ordered outputs. Wood and stone can
  have independent surface loops simultaneously. Paper shares a single Wave
  Player, including its source graph's ordered stop commands.
- Speed uses the original object's 3D displacement over the script-frame time.
  Gain is `speed * 0.05`, clamped by the audio transport, and pitch is
  `0.5 + speed * 0.01`. Browser pitch preservation is disabled so playback-rate
  changes actually change pitch. Physics/script updates currently use the fixed
  web timestep; exact render-frame scheduling is still a parity boundary.

| Impact ID | Surface | Strict minimum speed | Normalization maximum | Cooldown (IVP seconds) |
| --- | --- | --- | --- | --- |
| 1 | Stone | 2 | 30 | 1 |
| 2 | Wood | 2 | 14 | 1 |
| 3 | Metal | 2 | 14 | 2 |
| 4 | Dome | 1 | 15 | 1 |

Impact level uses the magnitude of the original contact's relative velocity,
not only its vertical or normal component. Each ID has its own cooldown,
initially measured from zero as in the source listener. The recorded BallSound
table selects the exact material/surface sound, including `Hit_Stone_Kuppel` for
stone on a dome. Two alternating browser instances per ID reproduce the two
Play Sound Instance nodes. New hit recordings are included by the asset-prep
script and have been converted into the local pack.

Capture, replacement and respawn reset the contact listener and stop stale
rolling loops. Sector/body removal clears metadata; retained contact identities
still allow end events to stop their original group. Browser pause/mute pauses
all tracks. The development inspector now also synchronizes audio when its
staged-run controls pause the game.

Verification: 149 tests passed with no skips, plus lint and build. New tests cover
source attribute distinctions, delayed multi-surface loops, the paper shared
player, strict speed thresholds, independent cooldowns, material/capture cleanup
and browser transport behavior. The actual Level 1 pusher test observes wooden
gate impact recordings for wooden and stone player balls. The in-app browser
reported ready state 4 and active playback for `Roll_Wood_Stone`,
`Hit_Wood_Stone` and `Hit_Wood_Wood`, with no media errors, then sound was muted
again. This verifies event selection/loading/playback state, not a listening
comparison against the original game.

Level-specific music selection, ambient/theme scheduling and checkpoint/ending
transitions are now connected; see [original-music.md](original-music.md).

Still incomplete: the remaining message-driven sound activation timing, some non-player mechanism effects,
exact waveform/pitch equivalence to Virtools/DirectSound, and full-level listening
and playthrough verification. The native engine remains local and opt-in.
