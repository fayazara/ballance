#!/usr/bin/env python3
"""Recover no-collision identifiers without executing original binaries."""
import argparse
import json
from pathlib import Path
from original_chunks import ChunkDump, table

parser = argparse.ArgumentParser(); parser.add_argument('dump_directory', type=Path)
root = parser.parse_args().dump_directory
level = ChunkDump(root / 'levelinit-chunks.tsv'); balls = ChunkDump(root / 'balls-chunks.tsv')
floors = table(level.rows[4002][2]); players = table(balls.rows[2260][2])
result = {'source': 'Levelinit.nmo / Balls.nmo / P_Modul_*.nmo',
          'floors': {r['Group_Name']: r['Col Group'] for r in floors},
          'players': {r['Ballname']: r['CollGroup'] for r in players}, 'modules': {}, 'fragments': {}}
for row in floors: assert level.value(row['Enable Col?']['parameterIndex']) is True
for kind, index, link in [('wood',501,(456,468)), ('stone',756,(717,723)), ('paper',627,(629,595))]:
    b = balls.behavior(index, 33)
    assert link in balls.links and link[1] == b['inIO'][0], 'must follow creation, not Unphysicalize cleanup'
    result['fragments'][kind] = {'index': index, 'group': balls.value(b['inputs'][4]), 'enabled': balls.value(b['inputs'][6])}
    assert result['fragments'][kind]['enabled'] is True
# The otherwise plausible empty group fields in these nodes are unused: only
# their destruction inputs are wired. Never treat them as fragment creation.
for index, link in [(857,(861,824)), (970,(974,937)), (1169,(1173,1136))]:
    b = balls.behavior(index, 33)
    assert link in balls.links and link[1] == b['inIO'][1]
    assert not any(target == b['inIO'][0] for _, target in balls.links)
for module in ['01','03','08','17','18','19','25','26','29','30','34','37','41']:
    d = ChunkDump(root / f'mod{module}-chunks.tsv')
    result['modules'][f'P_Modul_{module}'] = sorted({d.value(i) for i,(c,n,_) in d.rows.items() if c == 45 and n == 'Collision Group'})
names = set(result['floors'].values()) | set(result['players'].values())
names.update(r['group'] for r in result['fragments'].values())
for values in result['modules'].values(): names.update(values)
result['identifiers'] = sorted(names)
assert names == {'', 'Ball', 'Floor', 'Modul29'}, names
print(json.dumps(result, indent=2))
