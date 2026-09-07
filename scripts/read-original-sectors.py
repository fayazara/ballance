#!/usr/bin/env python3
"""Recover sector lifecycle flags and the older modules' proximity watchers."""
import argparse
import json
from pathlib import Path
from original_chunks import ChunkDump, table

parser = argparse.ArgumentParser(); parser.add_argument('dump_directory', type=Path)
root = parser.parse_args().dump_directory
level = ChunkDump(root / 'levelinit-chunks.tsv')
groups = table(level.rows[4025][2])
result = {'source': 'Levelinit.nmo / Gameplay.nmo / P_Modul_*.nmo', 'groups': groups, 'wake': {}}
for module, index, on_off in [
    ('01',50,[(180,101),(103,61),(63,140),(142,26),(28,96),(181,102),(104,62),(64,141),(143,27),(143,184)]),
    ('19',145,[(56,61),(63,38),(40,121),(123,107),(57,39),(41,62),(41,122),(64,102)]),
    ('25',100,[(112,39),(41,116),(118,76),(78,138),(113,117),(119,40),(119,77),(42,133)]),
    ('30',72,[(111,73),(75,115),(117,48),(50,137),(112,116),(118,74),(118,49),(76,132)]),
    ('37',82,[(123,83),(85,127),(129,58),(60,43),(124,128),(130,84),(130,59),(86,38)]),
    ('41',None,[(27,63),(65,37),(28,38),(40,64),(66,32)]),
]:
    d = ChunkDump(root / f'mod{module}-chunks.tsv')
    group = next(g for g in groups if g['Group Names'] == f'P_Modul_{module}')
    assert group['Activation'] == group['Reset'] == 1
    for link in on_off: assert link in d.links, (module, link)
    if index is None: continue
    b = d.behavior(index); p = [d.value(i) for i in b['inputs']]; local = [d.value(i) for i in b['locals']]
    result['wake'][f'P_Modul_{module}'] = dict(index=index, distance=p[0], object=p[2], barycenter=p[3],
        exactnessMin=p[4], exactnessMax=p[5], minFrameDelay=p[6], maxFrameDelay=p[7],
        outputFlags=local[2], axes=local[3], squared=local[4])
    # Pusher uses its moving entity origin; other watchers use a fixed MF frame.
    if module != '01': result['wake'][f'P_Modul_{module}']['frame'] = d.frame(p[2])
game = ChunkDump(root / 'gameplay-chunks.tsv')
assert game.value(6134) is True and game.value(6351) is True  # reset script state on both paths
for link in [(6133,6145),(6124,6113),(6114,6132),(6144,6123),(6343,6366),(6367,6372),(6373,6357),(6358,6349),(6350,6400)]:
    assert link in game.links, link
print(json.dumps(result, indent=2))
