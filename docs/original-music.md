# Original music sequencing

The local game now replaces the fixed pair of looping background recordings with
music selection recovered from `Sound.nmo`, `Levelinit.nmo`, and `Musicfiles.nmo`.
The shared audio transport serves both the default renderer and the experimental
native path. These changes have not been deployed.

Reproduce the metadata after producing the corresponding read-only chunk dumps:

```sh
python3 scripts/read-original-music.py /tmp/ballance-original-audit > src/game/original-music-data.json
```

`Levelinit.nmo` behavior 69 reads column 7 of `AllLevel` (object 4055). The table
selects theme sets `1, 5, 2, 3, 1, 5, 4, 2, 3, 1, 3, 4` for levels 1–12.
Its `load Music_ThemeXX` graph builds three filenames with suffixes `_1`, `_2`,
and `_3`, while registering them as `Music_Theme_1` through `Music_Theme_3`.
The recording set and the random variant are separate selections.

The Sound.nmo graph runs independent ambient and theme sequences:

- Ambient uses three equally weighted recordings, initially waits 0–15 seconds,
  and chooses another random delay after the previous recording ends.
- Themes begin after the manager's seven-second delay. After each recording
  ends, they wait 0–50 seconds before choosing another equally weighted variant.
- Both Wave Players have looping disabled. The browser's actual media completion
  drives the next wait; recording lengths are not hard-coded.
- The last-checkpoint message stops active/pending themes. Ambient continues.
- `LastStage` starts `Music_EndCheckpoint`, initially stopping it with a ten-second
  fade. Its 200-original-unit XYZ proximity detector starts a thirteen-second
  fade-in on approach and a 1.5-second fade-out on exit. The Init/Fix graph ignores
  the first outside event. Respawn rearms proximity after three seconds.
- Boarding switches to `Music_Final`, or `Music_LastFinal` on level 12, and fades
  the checkpoint recording out over 400 ms. Completion tracks do not loop.

The music manager owns desired voices separately from HTML audio elements.
Pause/resume retains playback position; stale completion notifications cannot
stop a newly loaded level's voice. Level replacement stops all prior voices.
Asset preparation includes all fifteen theme recordings, three ambient
recordings and both completion recordings. Original files remain local assets.

Verification: all 157 tests pass with zero skips; lint and production build pass.
The six music tests cover every level/variant, independent delays, media-end
scheduling, checkpoint cancellation, approach/exit/completion fades, stale events,
level replacement and transport pause/resume. In the in-app browser,
`Music_Theme_1_2` and `Music_Atmo_2` reached ready state 4, played without looping,
and resumed without resetting their playback position. Subsequent playback selected
`Music_Theme_1_3` and `Music_Atmo_3`. A staged native Level 1 bridge approach and
boarding selected `Music_EndCheckpoint` and `Music_Final`, both ready state 4.
The test tab was left paused and muted.

Remaining parity boundaries: the browser preference uses pause/mute rather than
executing all original menu Start/End Music messages; the music volume is the
original default full gain rather than a port of the options slider. Proximity
polling uses the existing fixed script-tick mapping. Random choice uses JavaScript's
PRNG rather than the original C runtime seed. Simultaneous graph IO execution and
DirectSound fade curves still need comparison with original gameplay. Menu,
high-score, thunder and final UFO audio flows remain separate pending work. Browser
state and tests establish loading and scheduling behavior, not listening parity.
