#!/usr/bin/env python3
"""Recover P_Modul_17's compound rotating arm, hinge and offset spring."""
import argparse
import json
from original_chunks import ChunkDump

parser = argparse.ArgumentParser()
parser.add_argument('dump')
d = ChunkDump(parser.parse_args().dump)
body = d.physicalize(116)
assert len(body['hulls']) == 3 and not body['startFrozen']
b = d.behavior(67, 33)
p = [d.value(i) for i in b['inputs']]
hinge = dict(index=67, target=b['target'], anchorObject=p[0], frameName=p[1], frame=d.frame(p[1]),
             limitsEnabled=p[2], lowerLimit=p[3], upperLimit=p[4])
b = d.behavior(50, 33)
p = [d.value(i) for i in b['inputs']]
spring = dict(index=50, target=b['target'], anchorObject=p[0], position1=p[1], frame1=p[2],
              position2=p[3], frame2=p[4], length=p[5], constant=p[6], axialDamping=p[7], globalDamping=p[8])
assert spring['frame1'] == hinge['frameName'] and spring['frame2'] == body['target']
assert d.value(71) == 0 and d.value(73) == 4  # CurrentLevel activation flag
for link in [(69,117),(118,78),(80,51),(53,26),(119,52),(54,27),(29,79),(81,122)]:
    assert link in d.links, link
assert d.value(124) is True  # restore whole hierarchy on Off
print(json.dumps(dict(source='P_Modul_17.nmo', body=body, hinge=hinge, spring=spring), indent=2))
