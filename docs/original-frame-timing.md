# Original frame timing

The local native path now runs gameplay behaviors once per presentation frame,
then advances IVP by the original filtered physics duration. This replaces the
earlier approximation of running behaviors at every 132 Hz web physics tick.
IVP still schedules its own 66 Hz PSI events internally. A behavior frame, a
physics interval and an internal PSI are different things.

## Evidence and arithmetic

In the supplied `physics_RT.dll`, `CKIpionManager::PostProcess` starts at
`0x10007ce0`. The arithmetic span `0x10007cef–0x10007d1a` reads the time manager's
frame duration and computes:

```
intermediate = (previousFilteredMs * 3 + frameMs) / 4
storedFilteredMs = float32(intermediate)
physicsSeconds = float32(intermediate * float32(2 * float32(.001)))
```

The `FST` at `0x10007d0e` stores the new float32 history without rounding the
value retained on the x87 stack. The final multiplication must use that retained
intermediate. `verify-original-physics-clock.py` checks the disassembled bytes
against the supplied DLL and evaluates the limited arithmetic span using
rational arithmetic with x87 intermediate and float32 store rounding. Its 125
fixtures cover six frame rates, jitter, four consecutive one-second frames and
recovery. This is a read-only arithmetic check, not execution of the original DLL.

The supplied `CK2.dll` time manager clamps elapsed milliseconds before script
execution and physics post-processing (`0x240180c0–0x24018100`). Its constructor
defaults to 1–200 ms, but **Ballance changes the maximum to 1000 ms**. In `Menu.nmo`,
`Update Settings` behavior 11762 contains two Time Settings blocks, 11538 and
11565. Binary Switch 11512 reaches them via zero-delay links 11748 and 11749.
Both set minimum 1 ms, maximum 1000 ms and scale 1; their graphics timing mode
differs. `read-original-time-settings.py` verifies these links and extracts both
parameter lists. A scan of the 50 supplied NMO documents found these two Time
Settings blocks and no serialized Time Manager overrides.

`original-script-clock.ts` applies these recovered limits in the native RAF
path. The previous web cap of 50 ms discarded elapsed time during stalls. Four
consecutive 1000 ms script frames produce physics intervals of approximately
0.5, 0.875, 1.15625 and 1.36719 seconds. The bridge's fabricated one-second
restriction rejected the third interval; it now accepts positive finite durations
and lets IVP's `simulate_dtime` perform internal stepping. Invalid zero, negative
and non-finite intervals are still rejected.

## Behavior timers and lifecycle

`OriginalIvpRuntime.step(deltaMs)` consumes an already prepared script-frame
duration. Its default is one 132 Hz test frame for older fixtures; the live game
passes the actual frame duration explicitly. Physics filter history survives
sector and player resets.

The swing/sack timer sequencer follows `Logics/Behaviors/TimerMini.cpp` in
CKBuildingBlocks revision `fca1963e39e64daa480918661732b1b0e45fe7b8`: float32 elapsed
accumulation includes the activation frame, overshoot is discarded, and the
following distinct timer can run through a zero-delay link in the same frame.
The sack's extra one-frame link is now a frame countdown instead of an added
fixed number of milliseconds. At 60 Hz, thirty float32 additions reach only
499.9998779296875 ms; a 500 ms timer first completes on addition 31. Tests check
the actual runtime's stage transitions. Full original graph ordering has not
been ported, and TimerMini has not received a separate DLL arithmetic oracle.

Loading and pausing clear the RAF baseline. This prevents a queued pre-load
timestamp from producing a negative delta, and prevents paused time from becoming
a catch-up frame. Physics filter history itself is not cleared by pause.

## Validation and limits

The native/WASM replay now includes three stalled-drop scenarios, one per ball
material, with 136 body-state samples each. All 408 additional samples match
exactly. Across all 18 replay scenarios, 7,536 samples agree within the existing
1e-5 diagnostic threshold; the largest difference is 2.22e-16 in two existing
rolling scenarios. A bridge regression also compares long intervals against
equal-duration smaller calls, checks floor contact, and rejects invalid input.

The Level 2 staged paper transfer was repeated in the in-app browser with the
rebuilt solver. It finished near original `(1006.574, 79.520, -366.743)`, above the
raised grille at Y 60.623, with its real fan force active and no ground contact.
The screenshot showed the airborne ball. The initial live game also ran at
roughly 120 Hz. Browser checks did not inject an actual browser stall; long-frame
coverage is headless.

This does not establish original-game executable equivalence. The original x87
control-word settings, clock-source precision over long uptimes, exact full-graph
execution order and manager persistence across whole-level loads remain open.
Browser RAF supplies the presentation schedule rather than the original graphics
driver. Complete playthroughs of all twelve levels are still unverified. The
deployed backend remains Rapier; these latest changes are local native-path work.

## Reproduction

Use the separately supplied installation and existing read-only chunk dumper:

```sh
.local/reference/dump-chunks ORIGINAL/3D_Entities/Menu.nmo > .local/reference/chunks/Menu.tsv
python3 scripts/read-original-time-settings.py .local/reference/chunks/Menu.tsv > /tmp/time-settings.json
cmp /tmp/time-settings.json src/game/original-time-settings-data.json
objdump -d --x86-asm-syntax=intel ORIGINAL/BuildingBlocks/physics_RT.dll > .local/reference/physics-rt-disassembly.txt
python3 scripts/verify-original-physics-clock.py .local/reference/physics-rt-disassembly.txt ORIGINAL/BuildingBlocks/physics_RT.dll > /tmp/physics-clock.json
cmp /tmp/physics-clock.json tests/fixtures/original-physics-clock.json
python3 scripts/build-ivp-simulation.py .local/reference/ivp .local/ivp-simulation
node scripts/verify-ivp-simulation.ts .local/ivp-simulation
pnpm test
```
