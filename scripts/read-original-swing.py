#!/usr/bin/env python3
"""Recover P_Modul_08's compound hinged platform and four-stage drive sequence.

Usage: python3 scripts/read-original-swing.py /tmp/ballance-original-audit/mod08-chunks.tsv
"""
import argparse
import json
import struct
from original_chunks import ChunkDump

parser = argparse.ArgumentParser()
parser.add_argument('dump')
args = parser.parse_args()
d = ChunkDump(args.dump)
body = d.physicalize(122)
assert len(body['hulls']) == 6 and body['startFrozen']
b = d.behavior(156, 33)
p = [d.value(i) for i in b['inputs']]
hinge = dict(index=156, target=b['target'], anchorObject=p[0], frameName=p[1], frame=d.frame(p[1]),
             limitsEnabled=p[2], lowerLimit=p[3], upperLimit=p[4])
forces = []
for index in [139, 77]:
    b = d.behavior(index, 33)
    p = [d.value(i) for i in b['inputs']]
    forces.append(dict(index=index, target=b['target'], position=p[0], positionFrame=p[1], direction=p[2], directionFrame=p[3], impulse=p[4]))
# Create/stop pairs prove there are two unpowered intervals, not a continuous alternating force.
for source, target in [(223, 78), (80, 140), (142, 48), (49, 123), (125, 195), (196, 54),
                       (55, 124), (55, 163), (164, 43), (44, 60), (62, 157),
                       (158, 61), (158, 169), (170, 175), (176, 123),
                       (224, 36), (37, 141), (143, 124), (126, 61), (63, 185), (187, 79)]:
    assert (source, target) in d.links, (source, target)
assert d.value(50) is True and d.value(38) is False
assert d.value(31) == 4 and d.value(29) == 0
stages = []
for delay, force in [(59, 0), (168, None), (162, 1), (174, None)]:
    timer = d.behavior(delay)
    stages.append(dict(timerIndex=delay, durationMs=d.value(timer['inputs'][0]), force=force))
link = struct.unpack_from('<I', d.rows[204][2], 16)[0]
assert link == 0x10001
print(json.dumps(dict(source='P_Modul_08.nmo', body=body, hinge=hinge, forces=forces, stages=stages,
                      startupDelayFrames=link & 0xffff, wakeTarget=d.behavior(199, 33)['target'], decoration='P_Modul_08_Fix'), indent=2))
