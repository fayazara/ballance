# Authored player death volumes

The native game now uses the 44 `DepthTestCubes` volumes authored across the twelve courses. It no longer kills the player at a fixed checkpoint-relative height. The old test was `player.y < reset.y - 22` in web units; it ignored the volumes' X/Z extents, different heights and orientations.

## Recovered behavior

`Gameplay.nmo` / `BallManager` contains Group Iterator 2929 and Box Box Intersection 2939. Initialization operation 1286 resolves `DepthTestCubes`; its output feeds the group parameter. The iterator's element and `ActiveBall` feed the intersection test. Both hierarchy flags are false.

The building block calls `CollisionManager::BoxBoxIntersection` with both local-box flags true. The manager constructs oriented boxes from each entity's local bounding box and world matrix, then calls `VxIntersect::OBBOBB`. The port reuses `original-box.ts`, retaining volume scale/orientation and the current ball material's mesh bounds and rotation. The touching-boundary comparison is inclusive. It does not substitute a sphere radius or an infinite plane.

Links 2942 and 2943 are zero-delay: the current iterator member is tested, and True starts Deactivate Ball. The False-to-next-member link 2944 delays one script frame. Iterator exhaustion has its own Out event; link 2945 waits one frame before restarting at member zero. Thus a group of N volumes has an N+1-frame cycle while no volume intersects. A hit remains latched until the player resets. Checkpoint sector changes and material changes do not restart this loop; a new ball does.

The native runtime samples before advancing the frame's physics interval, including when the player has been temporarily unphysicalized for a transformation. The engine consumes the hit, deducts one spare life and respawns, or enters the lost state when no spare life remains. The comparison Rapier path retains its earlier height test.

## Evidence and validation

```sh
python3 scripts/read-original-death.py .local/reference/chunks/Gameplay.tsv
node --test tests/original-death.test.ts
node --test --test-name-pattern='native falls|all six native arm' tests/original-ivp-runtime.test.ts
```

The extractor verifies the group parameter wiring, entity inputs, hierarchy flags and seven relevant graph links with their saved frame delays. The local-box behavior was checked in `Collision/Behaviors/BoxBoxIntersection.cpp` and `Collision/CKCollisionManager_AdvancedIntersectionFunctions.cpp`; iterator progression was checked in `Logics/Behaviors/GroupIterator.cpp`, all from the previously cited CKBuildingBlocks revision.

Tests cover group order independently of object-array order, the empty iterator frame, hit latching/restart, exact touching, rotated/scaled boxes, and rejection of points inside a world AABB but outside the actual oriented volume. Across all twelve levels, each of the 44 authored volumes detects each ball material; all 63 reset points are safe for every material, for 189 reset/material cases. A far-away low point remains safe because the original uses bounded volumes.

A native Level 1 regression naturally drops wood, stone and paper into the first volume. Each hit occurs above the old checkpoint-relative cutoff, then an actual reset clears the hit and restores native floor support. Existing arm routes additionally require that no death volume was touched during their approaches, passages or turns.

In the in-app browser, the development fall control dropped wood into the real first Level 1 volume. It respawned near original `(54.073, 16.033, -152.941)` on the start platform with native support, a cleared hit, and exactly two spare lives, down from three. Repeated browser falls then showed one spare life, zero spare lives, and finally the lost state on the next fall. The full suite passed 208 tests with zero skips; lint and production build also passed.

## Remaining limits

This ports death-volume selection and polling, not the complete Deactivate Ball/New Ball presentation graph. Respawn still happens immediately; the original fade and delayed reactivation sequence remains to be ported. Cross-script ordering and original float-boundary equivalence remain unverified. The existing oriented-box helper uses JavaScript double arithmetic. These tests and the targeted fall do not establish twelve uninterrupted level playthroughs.
