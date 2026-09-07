#!/usr/bin/env python3
"""Recover the suspended sack's physics and alternating drive from P_Modul_26.nmo.

Usage: python3 scripts/read-original-sack.py /tmp/ballance-original-audit/mod26-chunks.tsv
"""
import argparse
import json
import struct
from original_chunks import ChunkDump

parser = argparse.ArgumentParser()
parser.add_argument('dump')
args = parser.parse_args()
d = ChunkDump(args.dump)
parts = [d.physicalize(i) for i in [197, 247]]
joints = []
for index in [162, 212]:
    b = d.behavior(index, 33)
    p = [d.value(i) for i in b['inputs']]
    assert not d.value(b['locals'][1]), 'Two-point mode is not used'
    joints.append(dict(index=index, target=b['target'], anchorObject=p[0], position=p[1], frameName=p[2], frame=d.frame(p[2])))
forces = []
# Sequencer's first output creates 105 (+Z) and destroys 43 (-Z); the next reverses them.
for index in [105, 43]:
    b = d.behavior(index, 33)
    p = [d.value(i) for i in b['inputs']]
    forces.append(dict(index=index, target=b['target'], position=p[0], positionFrame=p[1], direction=p[2], directionFrame=p[3], impulse=p[4]))
for source, target in [(130, 62), (63, 74), (63, 56), (76, 89), (76, 27), (77, 90), (77, 26),
                       (57, 68), (69, 74), (69, 56), (131, 50), (51, 90), (51, 27), (91, 106),
                       (260, 130), (132, 259), (264, 258), (265, 131), (261, 134)]:
    assert (source, target) in d.links, (source, target)
assert d.value(64) is True and d.value(52) is False and d.value(47) is False
sequencer = d.behavior(79)
assert sequencer['version'] == 0x20000 and d.value(sequencer['outputs'][0]) == -1
assert d.value(142) == 0 and d.value(144) == 4, 'CurrentLevel physics-enabled flag'
delay = d.behavior(61)
# Behavior link 119 carries delay=1 plus its initial-delay flag in the high word.
link_delay = struct.unpack_from('<I', d.rows[119][2], 16)[0]
assert link_delay == 0x10001
print(json.dumps(dict(source='P_Modul_26.nmo', parts=parts, joints=joints, forces=forces,
                      intervalMs=d.value(delay['inputs'][0]), switchDelayFrames=link_delay & 0xffff,
                      initialForce=0, wakeTarget=d.behavior(110, 33)['target'], decoration='P_Modul_26_Halter'), indent=2))
