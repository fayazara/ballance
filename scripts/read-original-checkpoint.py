#!/usr/bin/env python3
"""Extract checkpoint activation ranges, target frame and controlling links."""
import argparse
import hashlib
import json
import struct
from original_chunks import ChunkDump
p=argparse.ArgumentParser();p.add_argument('checkpoint_dump');a=p.parse_args()
d=ChunkDump(a.checkpoint_dump)
def proximity(index):
    b=d.definition(index);values=[d.value(i) if j not in [1,2] else None for j,i in enumerate(b['inputs'])];local=[d.value(i) for i in b['locals']]
    assert d.rows[index][1]=='TT Scaleable Proximity'
    assert values[3] is False and local[4] is True and local[1]==1
    return dict(distance=values[0],axes=local[3],exactnessMin=values[4],exactnessMax=values[5],minFrameDelay=values[6],maxFrameDelay=values[7],outputs=local[2])
trigger=proximity(276);gate=proximity(315);smallGate=proximity(345)
assert trigger['outputs']==4 and gate['outputs']==12
assert d.value(259)=='PC_TwoFlames_Flame_Big'
# Zero-delay activation of the center flame starts the inner trigger. The hit
# stops both watchers before sending the checkpoint and sound messages.
links={394:(292,277),395:(293,316),396:(278,252),397:(317,253),
       398:(245,346),399:(322,244),400:(323,354),401:(355,358),
       402:(286,362),411:(254,285),412:(254,253),413:(254,291),414:(363,388),
       415:(389,320),416:(389,244)}
for i,(source,destination) in links.items():
    assert struct.unpack_from('<HHII',d.rows[i][2],16)==(0,0,source,destination)
assert d.rows[367][1]==d.rows[393][1]=='Send Message'
assert d.value(374)==4
def particles(index):
    b=d.definition(index);p=[d.value(i) for i in b['inputs'][:17]]
    assert d.rows[index][1]=='Point Particle System' and p[10]==50
    return dict(emissionDelay=p[0]/1000,lifespan=p[8]/1000,lifespanVariance=p[9]/1000,
        speed=p[4]*1000,speedVariance=p[5]*1000,initialSize=p[13],sizeVariance=p[14],endingSize=p[15])
print(json.dumps(dict(source='PC_TwoFlames.nmo: PC_TwoFlames_MF Script',
    dumpSha256=hashlib.sha256(open(a.checkpoint_dump,'rb').read()).hexdigest(),
    trigger=trigger,gate=gate,smallGate=smallGate,frame=d.frame('PC_TwoFlames_Flame_Big'),
    smallFrames=[d.frame('PC_TwoFlames_Flame_SmallA'),d.frame('PC_TwoFlames_Flame_SmallB')],
    centerParticles=particles(511),smallParticles=particles(239),
    links=[dict(index=i,source=v[0],destination=v[1],delayFrames=0) for i,v in links.items()]),indent=2))
