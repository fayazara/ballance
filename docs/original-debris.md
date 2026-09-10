# Broken-ball physics

`scripts/read-original-debris.py` reads the creation paths in `Balls.nmo`:
wood Physicalize 501 / Physics Impulse 452, stone 756 / 769, and paper 627 / 586.
The creation inputs are checked against the actual behavior links; the later
Unphysicalize cleanup nodes are not treated as creation settings.

All pieces disable automatic mass-center calculation and use `(0,0,0)` as their
authored center. Each uses its own convex mesh, the `Ball` no-collision identifier,
and the recovered material settings. Mass and friction ranges remain unchanged:
wood .2 and 2; stone .8 and 2; paper .02–.09 and 1–5. Random impulse strengths are
wood 1.5–3, stone 4–9 and paper .5–1.3 in original units. Constant parameters do
not consume a random draw.

The original Physics Impulse block normalizes the piece's transformed local Y
direction. Its position is expressed in the same piece's coordinates:

| Material | Impulse position |
| --- | --- |
| Wood | `(0,1,0)` |
| Stone | `(-.05,1,.05)` |
| Paper | `(-.03,1,.02)` |

Those lateral offsets give stone and paper an initial spin. The old implementation
used `(0,1,0)` for every material and Rapier's calculated mass center/inertia.
The current implementation uses each recovered position, explicit center and
[native compact-surface inertia](original-inertia.md). It applies the corresponding
linear impulse and `r × J` angular impulse directly, matching the reference's
self-referential core-space path and avoiding cancellation between rounded world
positions far from the origin.

The explosion scripts translate `Ball_*Pieces_Frame` to `Ball_Pos_Frame` with
Hierarchy enabled. They do not copy the rolling ball's rotation. The runtime now
preserves the authored fragment layout/orientations when placing a burst. The
existing template-pool replacement and expiration remain bounded to 16 wood,
17 stone and 18 paper pieces.

## Paper wind

The 18 SetPhysicsForce nodes, 1225 through 1497, each apply .03 original impulse
per IVP tick at the paper piece's origin. Their direction is `(-1,0,1)` in world
coordinates; the direction referential is null. Creation enables the shared wind
switch after the burst, while paper reset disables it before invoking the same
controller chain. The inspected links in these activation chains have zero
frame delay.

The web direction is normalized `(-1,0,-1)`. The continuous equivalent is
`.03 * 66 * .25 * 2² = 1.98` force units, distributed over the simulation's fixed
steps. It is applied before physics during both transformer animation and normal
play. Rotation does not rotate the wind, and its application at the authored
center produces no wind torque. Disabled or removed fragments receive no force;
repeated transformations replace the previous material pool and its wind state.

## Reproduction and verification

```sh
python3 scripts/read-original-debris.py /path/to/balls-chunks.tsv > /tmp/debris-data.json
python3 scripts/measure-original-object-inertia.py /tmp/ballance-measure-inertia /path/to/ivp --fragments > /tmp/fragment-inertia.json
node --test tests/original-debris.test.ts
```

The separate native probe is built as documented in [original-inertia.md](original-inertia.md).
It measures all 51 fragment hulls using their imported scales and records hashes
of the original float32 vertex bytes. Four additional tests check the recovered
settings, all fragments' native launch response and explicit centers, world-space
wind and cleanup, and invariant burst velocities/spins after translation far
across a course. Existing fragment contact and lifecycle tests also pass.
The full suite passes 106 tests; lint and production build pass with the existing
bundle-size warning.

Browser verification of this update is pending because the local server is not
listening on port 5174. Existing fade timing, collision sounds, exact SDK-versus-
Rapier contact response and complete transformation visuals still require parity
work. The update is local, after deployed version
`0a78e6d5-1420-451b-ad9c-de7f97645dc8`.
