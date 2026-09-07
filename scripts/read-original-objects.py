#!/usr/bin/env python3
"""Recover the original sector-managed convex and spherical objects."""
import argparse
import json
import struct
from pathlib import Path
from original_chunks import ChunkDump, table

parser = argparse.ArgumentParser(); parser.add_argument('dump_directory', type=Path)
root = parser.parse_args().dump_directory
level = ChunkDump(root / 'levelinit-chunks.tsv'); game = ChunkDump(root / 'gameplay-chunks.tsv')
groups = table(level.rows[4025][2])
result = {}
for index, activation, shape in [(4015, 2, 'convex'), (4024, 3, 'sphere')]:
    for row in table(level.rows[index][2]):
        row = {k: level.value(v['parameterIndex']) if isinstance(v, dict) else v for k, v in row.items()}
        name = row['Group Name']; flags = next(g for g in groups if g['Group Names'] == name)
        assert flags['Activation'] == activation and flags['Reset'] == 2
        result[name] = dict(source='Levelinit.nmo', activation=activation, reset=2, shape=shape,
            fixed=row['Fixed?'], friction=row['Friction'], restitution=row['Elasticity'], mass=row['Mass'],
            collisionGroup=row['Col Group'], startFrozen=row['Frozen?'], enableCollision=row['Enable Col?'],
            automaticMassCenter=row['autm. Mass Center?'], linearDamping=row['Linear Damp'], angularDamping=row['Rot Damp'],
            massCenter=game.value(6248 if activation == 2 else 6457))
        if activation == 3:
            result[name]['radius'] = row['Radius']; result[name]['ballCenter'] = game.value(6451)
        assert row['Col Group'] == '' and not row['Frozen?'] and not row['autm. Mass Center?']
# Type 2/3: restore matrix -> show -> lookup material -> get mesh -> physicalize.
for link in [(6252,6194),(6195,6201),(6202,6219),(6220,6228),(6230,6281),
             (6461,6402),(6403,6408),(6409,6426),(6427,6435),(6437,6488),
             (6110,6068),(6070,6101),(6102,6111)]:
    assert link in game.links, link
assert game.behavior(6100,33)['inIO'][1] == 6068  # Destroy -> Hide hierarchy
assert game.value(6103) is True
for behavior, outputs, first_input in [(6218,list(range(6207,6217)),6232),(6425,list(range(6413,6423)),6439)]:
    assert game.behavior(behavior,52)['outputs'][1:11] == outputs
    for i, output in enumerate(outputs):
        assert struct.unpack_from('<I', game.rows[first_input + i][2], 24)[0] == output
assert [game.value(i) for i in game.behavior(6250,33)['locals'][:3]] == [1,0,0]
assert [game.value(i) for i in game.behavior(6459,33)['locals'][:3]] == [0,1,0]
print(json.dumps(result, indent=2))
