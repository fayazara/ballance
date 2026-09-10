# Fallen-object cleanup

`Gameplay.nmo` computes the minimum world bounding-box Y of `DepthTestCubes`, starting at zero, then subtracts 200 original units (50 web units). Its `DepthTest` loop compares each registered entity's world origin Y strictly against that cutoff. Below it, the script destroys the physics body, hides the entity itself, and moves its hierarchy to world zero. This is separate from the [player death-volume trigger](original-death.md), which now uses the same authored boxes in the native path.

`Levelinit.nmo` table `DepthTestGroups` registers loose paper, wood and stone balls and boxes. Module 03 adds its eight falling wall/doorway pieces after proximity activation; the lift platform is excluded. Other hinged modules are not implicitly added.

The web runtime disables the retained Rapier body to remove it from simulation and contact, hides its mesh and moves it to zero. Retaining the handle lets existing adapters restore the object safely. Sector reset restores cleaned loose objects; lift reset restores its cleaned weights before disabling/rebuilding the lift. Registration is deduplicated, survives sector resets and is discarded at level teardown.

## Evidence and reproduction

Run `python3 scripts/read-original-depth.py /path/to/chunk-dumps` to regenerate `src/game/original-depth-data.json`. The extractor asserts the source links, parameter destinations, strict comparisons and one-frame sweep loop. Gameplay behavior indices: 1829 computes maxDepth; 1927 subtracts the margin; 1838 tests entity Y; 1900 destroys physics; 1855 hides; 1849 moves the entity. Levelinit table 4065 and compound 3254 supply initial membership.

Operation GUID meanings and world-coordinate extraction were checked against [CKParameterOperations](https://github.com/doyaGu/CKParameterOperations/tree/66354cb5a31302a1d928402019afb2b70e941431), `ParameterOperationTypes.h` and `ParameterOperationFunctions.cpp`. The `GetBoundingBox(FALSE)` argument means world bounds, as declared by `CK3dEntity::GetBoundingBox(CKBOOL Local = FALSE)`; the reverse-engineered operator's nearby “Local bbox” comment is misleading. No upstream implementation source is copied into the web runtime.

Five tests verify cutoff geometry across all twelve levels, natural free fall and disabled collision, exact-boundary survival, exclusion of unregistered objects, repeated sector restoration and activation/reset membership across all nine lift placements. The complete suite passes 80 tests with the local pack available.

## Remaining differences

The native IVP adapter now registers Module 03's eight wall/door pieces only
after its proximity watcher wakes the platform. Source links 418→411,
412→474, 475→488 and 491→484 lead from wake-up through the DepthTest group
lookup and falling-parts iterator to Add To Group. Membership remains global
through sector reset; reconstructed native bodies inherit it. The regression
checks absent membership before waking, all eight members afterward, natural
fall cleanup, and registration/pose restoration after reset. Previously the
native adapter registered the weights immediately when activating a sector.

The placement regression now covers all nine authored Module 03 lifts across
the twelve course files. For each fresh runtime it leaves the player far away
for 70 script frames and checks that none of the lift's nine bodies is eligible
for cleanup. It then stages the captured player at the source wake frame and
advances proximity polling, verifying exactly eight registered weights and an
excluded platform. Sector reset replaces all nine native handles while retaining
the eight memberships. This checks placement transforms and registration
lifecycle, not traversal through each lift puzzle.

The native path sweeps once per script frame, before advancing physics. This
matches the recovered frame boundary: `CKContext::Process` in the local CK2
reference executes behaviors before manager PostProcess, and the supplied
physics DLL's `CKIpionManager::PostProcess` performs simulation (see
[frame timing](original-frame-timing.md)). A prop crossing the cutoff during
simulation stays physical until the following script frame. A native regression
launches a loose prop off the course, observes that crossing, then verifies
destruction on the next zero-duration script frame. The previous native order
removed it immediately after simulation, one behavior observation too early.

The source delays one script frame between full group sweeps. Complete behavior
dispatch ordering and first-activation timing remain unverified. The comparison
Rapier path still sweeps after each fixed physics tick and disables retained
bodies rather than destroying them. Native bodies are destroyed and rebuilt on
reset. These checks do not prove full level playthroughs.
