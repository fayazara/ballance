# Phone play and flight download

Phone play starts with only one small controls button visible. Tap it to reveal
or hide the HUD, **D-pad** / **Gyroscope** selector and camera controls; steering
continues while these are hidden. The D-pad
appears at the initial touch anywhere on the playfield. Its circular thumb follows
the drag with magnetic eight-way steering and disappears on release. The origin
stays fixed for that gesture; extra steering fingers are ignored, while camera
buttons can still be held with another finger. Camera rotation buttons
and a held VIEW button remove the need for a keyboard. Controls clear on pause,
visibility loss, pointer cancellation, screen rotation, mode change and unmount.

Gyroscope uses screen-relative DeviceOrientation gravity projection, a calibrated
neutral position, dead zone and smoothing. Motion permission is requested from
the Gyroscope tap on browsers requiring it. Denial, unsupported contexts and
missing sensor events retain the D-pad. Both landscape rotations and portrait
are supported; rotate the phone or tap Calibrate to establish a new neutral.
The screen wake lock is requested while playing where supported; OS battery
policies may decline it. Touch devices default to lower graphics quality unless
the player already saved a preference. Insets accommodate phone notches.

Before a flight, open the published game in the phone browser, pause, and choose
**Save for flight**. Leave the panel open until **Ready for offline play** appears.
The pack is approximately 57 MB and includes all twelve levels, their entities,
textures, skies, music and sounds, plus the application shell. Check it once in
airplane mode in the same browser before boarding. Installing to the home screen
is optional; if using a separate installed-app storage context, download there.
Browser storage can be cleared by the user or reclaimed by the OS. The download
requests persistent storage where supported, without making it a requirement.

The deploy staging script creates a content-addressed offline manifest. Downloads
verify every file's SHA-256 and only publish the ready marker after all workers
finish successfully. Partial packs are retryable and never reported ready. A
saved pack serves a coherent shell and assets during flaky/offline connections.
The service worker supports audio byte ranges; AAC/M4A copies cover browsers
without Ogg/Vorbis support. Original licensed assets remain separately supplied;
no installer or original executable is deployed. The IVP experiment remains
local and opt-in; this phone release uses the existing production physics path.

## Validation (2026-09-08)

Flow: load game → choose steering → use camera/touch controls → pause → save for
flight → disconnect the preview server → reload → select Level 12.

| Check | Result |
| --- | --- |
| App identity, meaningful content, no framework overlay | Passed in in-app Browser |
| Portrait layout | Checked at 390 × 844 |
| Landscape layout | Checked at 844 × 390 |
| D-pad drag and camera rotation | Exercised in Browser |
| Gyroscope denial | Correct fallback to D-pad observed |
| Gyro coordinates/calibration and multi-pointer release | Unit tests passed |
| Complete pack download | Browser reported Ready; 268 files, 56.8 MB |
| Offline cold reload / previously unopened Level 12 | Passed after preview process exited |
| Browser console errors/warnings | None in tested flows |
| Build, lint, regression suite | Passed; 164 tests, zero skips |

No physical iPhone or Android sensor was available in this session. Sensor math,
permission fallback and browser layout are verified; actual tilt feel, device GPU
performance, and iOS/Android OS-specific permission dialogs need a real-phone
check. This release does not claim completion of the larger 1:1 parity goal.

Floating-pad follow-up: fixed touch origin, clamped circular thumb, neutral dead
zone, and magnetic diagonals tested; release hides the pad. HUD and auxiliary
controls collapse behind one toggle on phones. Regression suite: 165 passing.
