#!/usr/bin/env python3
"""Measure the original paper convex with the separately built IVP probe."""
import argparse
import hashlib
import itertools
import json
import subprocess
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('probe', type=Path); parser.add_argument('ivp_source', type=Path)
parser.add_argument('--pack', type=Path, default=Path('.local/original'))
args = parser.parse_args()
revision = subprocess.check_output(['git', '-C', str(args.ivp_source), 'rev-parse', 'HEAD'], text=True).strip()
assert revision == '7579664996e68040dd0158081b04f612e6a2d515', revision
build = json.loads((args.probe.resolve().parent / 'build.json').read_text())
assert build['revision'] == revision and build['floatingPointContraction'] is False, 'Use the probe from build-ivp-simulation.py'
numeric_build = {key: build[key] for key in ['nativeMatrixKernel', 'floatingPointContraction']}
doc = json.loads((args.pack / 'balls.json').read_text())
obj = next(o for o in doc['objects'] if o['name'] == 'Ball_Paper')
assert obj['matrix'] == [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
mesh = next(m for m in doc['meshes'] if m['id'] == obj['mesh'])
points = list(dict.fromkeys(zip(*[iter(mesh['positions'])] * 3)))
cases = {'unitCube': list(itertools.product([-1,1], repeat=3)), 'paper': points}
stdin = ''.join(f'{name} 1 {len(pts)} ' + ' '.join(str(v) for p in pts for v in p) + '\n' for name,pts in cases.items())
process = subprocess.run([str(args.probe.resolve())], input=stdin, capture_output=True, text=True, check=True)
measurements = {r['name']: r for r in map(json.loads, process.stdout.splitlines())}
# IVP combines the two second moments with hypot, not their arithmetic sum.
assert all(abs(v - 2 ** .5 / 3) < 1e-6 for v in measurements['unitCube']['inertiaPerMass'])
result = {'source': 'IVP compact-surface builder, original-unit geometry', 'revision': revision,
    'numericBuild': numeric_build,
    'paperPositionsSha256': hashlib.sha256(struct.pack('<' + 'f' * len(mesh['positions']), *mesh['positions'])).hexdigest(),
    'minimumAxisFactor': .03, 'measurements': measurements}
print(json.dumps(result, indent=2))
