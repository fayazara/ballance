#!/usr/bin/env python3
"""Measure convex assemblies with a separately built IVP compact-surface probe.

Only numeric measurements/hashes are emitted; original geometry stays in the
local asset pack. Each compound is measured as one surface, including overlapping
ledges, just as CKIpionManager builds it.
"""
import argparse
import hashlib
import itertools
import json
import math
import struct
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('probe', type=Path)
parser.add_argument('ivp_source', type=Path)
parser.add_argument('--pack', type=Path, default=Path('.local/original'))
parser.add_argument('--fragments', action='store_true', help='Measure the broken-ball meshes instead of course mechanisms')
args = parser.parse_args()
revision = subprocess.check_output(['git', '-C', str(args.ivp_source), 'rev-parse', 'HEAD'], text=True).strip()
assert revision == '7579664996e68040dd0158081b04f612e6a2d515', revision
build = json.loads((args.probe.resolve().parent / 'build.json').read_text())
assert build['revision'] == revision and build['floatingPointContraction'] is False, 'Use the probe from build-ivp-simulation.py'
numeric_build = {key: build[key] for key in ['nativeMatrixKernel', 'floatingPointContraction']}
root = Path(__file__).resolve().parent.parent
meshes = {}
for file in sorted(args.pack.glob('*.json')):
    if file.name.startswith('level_'):
        continue
    for mesh in json.loads(file.read_text()).get('meshes', []):
        if mesh.get('name'):
            name = mesh['name']
            assert name not in meshes or meshes[name]['positions'] == mesh['positions'], name
            meshes[name] = mesh

cases = json.loads(subprocess.check_output(['node', str(root / 'scripts/list-original-inertia.ts'), str(args.pack)] + (['--fragments'] if args.fragments else []), text=True))

def points(mesh):
    return list(dict.fromkeys(zip(*[iter(mesh['positions'])] * 3)))

def case(name, hulls, scale=(1,1,1)):
    return f'{name} {len(hulls)} ' + ' '.join(str(len(hull)) + ' ' + ' '.join(
        str(struct.unpack('<f', struct.pack('<f', v * scale[axis]))[0])
        for point in hull for axis,v in enumerate(point)) for hull in hulls) + '\n'

cube = list(itertools.product([-1,1], repeat=3))
stdin = case('unitCube', [cube]) + case('rectangularControl', [cube], (2,3,4))
for index, item in enumerate(cases):
    stdin += case(f'body{index}', [points(meshes[name]) for name in item['hulls']], item['scale'])
process = subprocess.run([str(args.probe.resolve())], input=stdin, capture_output=True, text=True, check=True)
values = {value['name']: value for value in map(json.loads, process.stdout.splitlines())}
assert all(abs(a-b) < 1e-5 for a,b in zip(values['rectangularControl']['secondMoments'], [4/3,3,16/3]))
result = {}
for index, item in enumerate(cases):
    value = values[f'body{index}']
    hulls = [meshes[name] for name in item['hulls']]
    hashes = [hashlib.sha256(struct.pack('<'+'f'*len(m['positions']), *m['positions'])).hexdigest() for m in hulls]
    assert all(math.isfinite(v) and v > 0 for v in value['inertiaPerMass']), item['key']
    result[item['key']] = {k:v for k,v in value.items() if k != 'name'} | {
        'scale': item['scale'], 'positionsSha256': hashes, 'placements': item['placements']}
print(json.dumps({'revision': revision, 'numericBuild': numeric_build, 'minimumAxisFactor': .03,
    'controls': {k:values[k] for k in ['unitCube', 'rectangularControl']},
    'measurements': result}, indent=2))
