# Desktop interface and controls

The menu flow, English labels, default highscore tables and credits come from the
user-supplied Menu.nmo, Language.nmo and base.nmo. Run
`python3 scripts/read-original-ui.py` against the existing chunk dumps to
regenerate `src/game/original-ui-data.json`. The recovered data includes source
hashes and the original sprite rectangles/font coordinates for reference.

After reviewing the stretched atlas version, the user requested similar custom
responsive elements instead. The rendered interface therefore uses browser text,
CSS beveled metal frames, gold edges and a red selected state, with flow layout,
wrapping, scrollable short screens and a two-column level selector. It does not
render stretched bitmap text or use the original screen rectangles. The menu
background uses the converted MenuLevel.nmo scene. DomeShadow and
Trafo_Shadow_Big are converted directly from their TGA files to preserve alpha
lost by BMap's image export. Preparation includes this scene and menu sounds.

Desktop defaults are Up/Down/Left/Right for rolling, left Shift plus left/right
for camera rotation, Space for overview, and Escape for pause/back. Key rebinding
and inverted rotation are saved locally. Assigning a key already in use swaps
the two actions, preserving all six controls; Escape, Tab and platform command
keys remain reserved. The default WASD, Q/E and R shortcuts were removed.
The controls match the supplied game's
[English manual](https://ftpmirror.your.org/pub/misc/ftp.atari.com/manuals/pc/ballance/help_eng.htm).

Main, level selection, pause, options, sound, controls, highscores, credits,
confirmation, completion and highscore entry panels replace the earlier custom
cards and toolbars. All twelve levels remain selectable. The in-game HUD shows
only time points and extra lives, with responsive CSS artwork. Graphics offers
an accurately named Low/High detail setting (pixel ratio and shadows), rather
than displaying original fixed resolutions that the browser does not use.
Developer inspection is available only with `?inspect=tools`; local development uses IVP by default, with `physics=rapier` available for explicit comparisons. Production builds now also use IVP by default; the live deployment received that packaging update on September 9, 2026.

Validation: all 192 tests passed, including new key mapping/swap/reserved-key
checks. The browser was checked at 1280x720 and inside a 390x680 viewport; main
menu and controls remained readable without clipping. Keyboard-only menu
navigation, rebinding and restoring Forward, Escape pause/resume, Level 1
loading and the minimal HUD were exercised in the browser. A fresh reload had
no console errors. Build and lint pass.

This is an adaptation of the interface, not pixel parity. Original animated menu
camera/demo, menu ambience timing, tutorial screens and every score transition
have not been fully ported or playtested. Phone controls are outside this pass.
The full native physics port and all-level end-to-end verification remain open.

Loading temporarily pauses the simulation but must not open the player pause
menu. The App engine callback ignores paused state emissions while
`game.loading` is true, and clears a stale pause panel when the engine reports playing. Browser regression checks confirmed normal Level 1 and
Level 2 starts on the native path, Level 12 on the standard path, and a confirmed restart return directly to the game; Escape
continues to open and close the pause menu.
