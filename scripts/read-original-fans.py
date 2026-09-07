#!/usr/bin/env python3
"""Recover fan controllers and their proximity/lifecycle links (read-only)."""
import argparse
import json
from pathlib import Path
from original_chunks import ChunkDump, table

parser = argparse.ArgumentParser(); parser.add_argument('dump_directory', type=Path)
root = parser.parse_args().dump_directory
d = ChunkDump(root / 'mod18-chunks.tsv')
level = ChunkDump(root / 'levelinit-chunks.tsv')
group = next(g for g in table(level.rows[4025][2]) if g['Group Names'] == 'P_Modul_18')
assert group['Activation'] == group['Reset'] == 1
result = {'source': 'P_Modul_18.nmo / Levelinit.nmo', 'sector': group}
for name, index in [('outer', 340), ('force', 387), ('sound', 498)]:
    b = d.behavior(index); p = [d.value(i) for i in b['inputs']]; local = [d.value(i) for i in b['locals']]
    result[name] = dict(index=index, distance=p[0], object=p[2], barycenter=p[3], frame=d.frame(p[2]),
        exactnessMin=p[4], exactnessMax=p[5], minFrameDelay=p[6], maxFrameDelay=p[7],
        outputFlags=local[2], axes=local[3], squared=local[4])
    assert p[3] is False and local[4] is True
result['forceValue'] = d.value(429)
result['direction'] = d.value(425)
result['rotorRadiansPerSecond'] = d.value(284)
# Resolve through behavior inputs rather than depending on display names.
volume = [d.value(i) for i in d.behavior(573)['inputs']]
result['soundNear'], result['soundFar'] = volume[2:4]
assert [d.value(i) for i in d.behavior(314)['inputs']] == [True, 'P_Modul_18_Particle Script']
assert [d.value(i) for i in d.behavior(458, 52)['inputs']] == [0, 4]
# Outer enter starts particle, force and sound scripts; exit stops polling.
# Force EnterRange fetches the current ball, InRange checks its oriented bounds.
# Sector-off explicitly destroys the force controller and stops sound.
for link in [(317,307),(308,446),(317,639),(318,459),(460,447),(318,640),
             (365,341),(364,388),(389,413),(414,404),(405,418),
             (390,399),(400,351),(352,419),(446,351),
             (303,463),(464,468),(469,316),(469,641),(469,448),
             (475,582),(476,598),(613,562),(564,536)]:
    assert link in d.links, link
print(json.dumps(result, indent=2))
