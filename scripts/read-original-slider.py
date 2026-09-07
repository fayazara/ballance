#!/usr/bin/env python3
"""Recover P_Modul_34's crate, vertical slider and proximity activation."""
import argparse
import json
from original_chunks import ChunkDump
parser = argparse.ArgumentParser()
parser.add_argument('dump')
d = ChunkDump(parser.parse_args().dump)
parts = [d.physicalize(i) for i in [72, 142]]
b = d.behavior(171, 33); p = [d.value(i) for i in b['inputs']]
slider = dict(index=171, target=b['target'], anchorObject=p[0], frame1=d.frame(p[1]), frame2=d.frame(p[2]),
              limitsEnabled=p[3], lowerLimit=p[4], upperLimit=p[5])
b = d.behavior(97); p, local = ([d.value(i) for i in b[key]] for key in ['inputs','locals'])
wake = dict(index=97, distance=p[0], object=p[2], barycenter=p[3], exactnessMin=p[4], exactnessMax=p[5],
            minFrameDelay=p[6], maxFrameDelay=p[7], outputFlags=local[2], axes=local[3], squared=local[4])
for link in [(144,38),(40,108),(110,153),(155,73),(75,74),(75,172),(145,154),(156,74),(156,39),(41,109),(111,148)]:
    assert link in d.links, link
assert wake['outputFlags'] == 4 and wake['axes'] == 5 and wake['squared']
assert all(p['startFrozen'] and not p['fixed'] and len(p['hulls']) == 1 for p in parts)
print(json.dumps(dict(source='P_Modul_34.nmo', parts=parts, slider=slider, wake=wake, wakeTarget=d.behavior(176,33)['target']),indent=2))
