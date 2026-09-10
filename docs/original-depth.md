# Fallen-object cleanup

`Gameplay.nmo` computes the minimum world bounding-box Y of `DepthTestCubes`, starting at zero, then subtracts 200 original units (50 web units). Its `DepthTest` loop compares each registered entity's world origin Y strictly against that cutoff. Below it, the script destroys the physics body, hides the entity itself, and moves its hierarchy to world zero. This is separate from the [player death-volume trigger](original-death.md), which now uses the same authored boxes in the native path.

`Levelinit.nmo` table `DepthTestGroups` registers loose paper, wood and stone balls and boxes. Module 03 adds its eight falling wall/doorway pieces after proximity activation; the lift platform is excluded. Other hinged modules are not implicitly added.

The web runtime disables the retained Rapier body to remove it from simulation and contact, hides its mesh and moves it to zero. Retaining the handle lets existing adapters restore the object safely. Sector reset restores cleaned loose objects; lift reset restores its cleaned weights before disabling/rebuilding the lift. Registration is deduplicated, survives sector resets and is discarded at level teardown.

## Evidence and reproduction

Run `python3 scripts/read-original-depth.py /path/to/chunk-dumps` to regenerate `src/game/original-depth-data.json`. The extractor asserts the source links, parameter destinations, strict comparisons and one-frame sweep loop. Gameplay behavior indices: 1829 computes maxDepth; 1927 subtracts the margin; 1838 tests entity Y; 1900 destroys physics; 1855 hides; 1849 moves the entity. Levelinit table 4065 and compound 3254 supply initial membership.

Operation GUID meanings and world-coordinate extraction were checked against [CKParameterOperations](https://github.com/doyaGu/CKParameterOperations/tree/66354cb5a31302a1d928402019afb2b70e941431), `ParameterOperationTypes.h` and `ParameterOperationFunctions.cpp`. The `GetBoundingBox(FALSE)` argument means world bounds, as declared by `CK3dEntity::GetBoundingBox(CKBOOL Local = FALSE)`; the reverse-engineered operator's nearby “Local bbox” comment is misleading. No upstream implementation source is copied into the web runtime.

Five tests verify cutoff geometry across all twelve levels, natural free fall and disabled collision, exact-boundary survival, exclusion of unregistered objects, repeated sector restoration and activation/reset membership across all nine lift placements. The complete suite passes 80 tests with the local pack available.

## Remaining differences

The source delays one script frame between full group sweeps. The web runtime currently runs one sweep per fixed physics tick, including during transformations, consistent with its other behavior adapters. Script-clock parity and the broader sector lifecycle remain outstanding. Rapier body disabling replaces original destruction/rephysicalization; internal IVP object allocation and solver state are not replicated. These tests do not prove full level playthroughs.
