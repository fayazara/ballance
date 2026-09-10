#!/usr/bin/env python3
"""Recover transformer timer stages and frame links; fail on graph drift."""
import argparse,hashlib,json,struct
from original_chunks import ChunkDump,chunks
p=argparse.ArgumentParser();p.add_argument('dump');a=p.parse_args();d=ChunkDump(a.dump)
timers=[]
for index,expected in [(568,1350),(5,1000),(487,150)]:
    b=d.definition(index);raw=d.rows[index][2];offset=chunks(raw)[0x20]
    assert struct.unpack_from('<III',raw,offset+4)==(0x15d472a5,0x3bea409f,0x20000)
    duration=d.value(b['inputs'][0]);assert duration==expected
    timers.append(dict(index=index,durationMs=duration))
links={3112:(0,1572,875),857:(0,875,6),569:(0,564,496),573:(0,497,563),859:(0,480,574),860:(0,575,0),
       874:(0,1,401),855:(0,402,482),854:(0,483,167),
       164:(2,135,168),858:(0,168,339),871:(2,840,804),865:(1,805,6),873:(2,846,479)}
for i,(delay,source,target) in links.items():
    assert struct.unpack_from('<HHII',d.rows[i][2],16)==(delay,delay,source,target)
assert d.definition(576)['children']==[528,562,568]
assert [d.value(i) for i in d.definition(17)['inputs']]==['Trafo Group',[0,0,0],'ActiveBall']
radius=d.value(d.definition(446)['inputs'][2]);assert radius==4.300000190734863
print(json.dumps(dict(source='Gameplay.nmo: Trafo Manager 876',
    dumpSha256=hashlib.sha256(open(a.dump,'rb').read()).hexdigest(),
    timers=timers,captureRadius=radius,physicalizeDelayFrames=links[164][0],entryDelayFrames=links[873][0],rearmDelayFrames=links[871][0]+links[865][0],
    links=[dict(index=i,delayFrames=v[0],source=v[1],destination=v[2]) for i,v in links.items()]),indent=2))
