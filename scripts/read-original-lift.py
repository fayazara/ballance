#!/usr/bin/env python3
"""Recover P_Modul_03: weighted spring lift, seven walls and compound doorway."""
import argparse,json
from original_chunks import ChunkDump
parser=argparse.ArgumentParser();parser.add_argument('dump');d=ChunkDump(parser.parse_args().dump)
parts=[d.physicalize(i) for i in [321,251,107,216,286,72,142,181,379]]
b=d.behavior(468,33);p=[d.value(i) for i in b['inputs']]
slider=dict(index=468,target=b['target'],anchorObject=p[0],frame1=d.frame(p[1]),frame2=d.frame(p[2]),limitsEnabled=p[3],lowerLimit=p[4],upperLimit=p[5])
b=d.behavior(410,33);p=[d.value(i) for i in b['inputs']]
spring=dict(index=410,target=b['target'],anchorObject=p[0],position1=p[1],frame1=d.frame(p[2]),position2=p[3],frame2=d.frame(p[4]),length=p[5],constant=p[6],axialDamping=p[7],globalDamping=p[8])
b=d.behavior(440);p,local=([d.value(i) for i in b[k]] for k in ['inputs','locals'])
wake=dict(index=440,distance=p[0],object=p[2],barycenter=p[3],exactnessMin=p[4],exactnessMax=p[5],minFrameDelay=p[6],maxFrameDelay=p[7],outputFlags=local[2],axes=local[3],squared=local[4])
for link in [(381,340),(340,143),(145,287),(289,217),(219,73),(75,182),(184,252),(254,38),(40,108),(110,342),(342,345),(347,450),(452,386),(388,416),(418,411),(418,417),(382,451),(453,387),(389,341),(389,417),(343,346),(348,469),(412,474),(475,488),(491,484),(485,489)]:assert link in d.links,link
assert all(p['startFrozen'] and not p['fixed'] for p in parts)
assert wake['axes']==5 and wake['outputFlags']==4
print(json.dumps(dict(source='P_Modul_03.nmo',parts=parts,slider=slider,spring=spring,wake=wake,wakeFrame=d.frame(wake['object']),wakeTarget=d.behavior(415,33)['target'],fallingGroup='P_Modul_03_FallingParts',depthGroup='DepthTest'),indent=2))
