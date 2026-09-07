#!/usr/bin/env python3
"""Recover shape and mass-center settings on ActiveBall's creation paths."""
import argparse
import json
from original_chunks import ChunkDump

parser = argparse.ArgumentParser(); parser.add_argument('gameplay_dump')
d = ChunkDump(parser.parse_args().gameplay_dump)
result = {'source': 'Gameplay.nmo: ActiveBall creation', 'bodies': []}
for index, link in [(233,(172,201)), (262,(173,234)), (291,(174,263))]:
    b = d.behavior(index, 33); p = b['inputs']; local = [d.value(i) for i in b['locals']]
    assert b['target'] == 'ActiveBall' and link in d.links and b['inIO'][0] == link[1]
    row = dict(index=index, fixed=d.value(p[0]), startFrozen=d.value(p[5]), enableCollision=d.value(p[6]),
        automaticMassCenter=d.value(p[7]), massCenter=local[3], shape='convex' if local[0] else 'sphere')
    if row['shape'] == 'sphere': row.update(center=d.value(p[11]), radius=d.value(p[12]))
    assert local[:3] in [[1,0,0], [0,1,0]]
    result['bodies'].append(row)
print(json.dumps(result, indent=2))
