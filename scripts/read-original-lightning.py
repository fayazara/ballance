#!/usr/bin/env python3
"""Extract the supplied Balls.nmo lightning-sphere presentation graph."""
import argparse, hashlib, json, struct
from pathlib import Path
from original_chunks import ChunkDump, chunks
p=argparse.ArgumentParser();p.add_argument('dump');a=p.parse_args();d=ChunkDump(a.dump)
def value(node,slot):return d.value(d.definition(node)['inputs'][slot])
def color(index):
 raw=d.rows[index][2];offset=chunks(raw)[0x40]
 assert struct.unpack_from('<II',raw,offset+8)==(1,16)
 return list(struct.unpack_from('<4f',raw,offset+16))
def curve(index):
 raw=d.rows[index][2]
 assert raw[16:24].hex()=='5d34ad20b125fb1a'
 assert struct.unpack_from('<II',raw,100)==(0x100,0)
 count=struct.unpack_from('<I',raw,108)[0];assert 2<=count<=32
 assert struct.unpack_from('<'+'I'*count,raw,112)==(0,)*count
 offset=112+count*4;assert struct.unpack_from('<f',raw,offset)[0]==0
 points=[]
 for i in range(count):
  flags,*v=struct.unpack_from('<I11f',raw,offset+4+i*48)
  assert v[2:7]==[0]*5
  points.append(dict(flags=flags&~0x10000000,position=v[:2],incoming=v[7:9],outgoing=v[9:11]))
 return points
expected={
 428:(0,355,242),429:(0,243,341),430:(0,355,418),431:(0,355,339),432:(0,355,361),433:(0,436,354),434:(0,355,348),435:(0,349,420),
 232:(0,184,193),233:(1,194,204),234:(0,206,175),235:(0,213,225),236:(0,176,212),237:(0,242,203),238:(0,205,243),239:(0,227,181),240:(0,228,182),241:(0,229,183),
 327:(0,287,245),328:(0,313,286),329:(0,312,286),330:(0,297,310),331:(0,271,252),332:(0,272,252),333:(0,253,263),334:(0,312,269),335:(0,271,303),336:(1,313,311),337:(1,272,270),338:(0,339,296),
 413:(0,399,386),414:(0,398,386),415:(1,399,397),416:(0,387,375),417:(0,418,396)}
for i,(delay,source,target) in expected.items():assert struct.unpack_from('<HHII',d.rows[i][2],16)==(delay,delay,source,target)
assert d.definition(231)['version']==0x20000 and d.value(230)==-1
assert value(385,1) is False and value(385,2) is True
assert value(223,0)==[0,1,0] and value(223,2)=='Ball_LightningSphere'
assert d.definition(374)['target']=='Misc_Lightning Sound' and value(374,2) is False
assert value(427,0) is True and value(427,1)=='BallParticle_Frame script'
light=d.rows[2150][2];lc=chunks(light)
flags,packed,a0,a1,a2,range_=struct.unpack_from('<II4f',light,lc[0x400000])
assert flags&255==1 and (a0,a1,a2)==(0,1,0)
assert struct.unpack_from('<I',light,lc[0x100000]+56)[0]==2253
shell=d.rows[2252][2]
assert struct.unpack_from('<I',shell,chunks(shell)[0x100000]+56)[0]==2253
assert d.rows[2253][1]=='Ball_Pos_Frame'
light_position=list(struct.unpack_from('<3f',light,lc[0x100000]+44))
material=d.rows[2250][2];offset=chunks(material)[0x1000]
blend=struct.unpack_from('<I',material,offset+28)[0]
assert (blend>>12)&15==2 and (blend>>16)&15==2
result=dict(source='Balls.nmo: Ball_LightningSphere 437',dumpSha256=hashlib.sha256(Path(a.dump).read_bytes()).hexdigest(),
 sphereDurationMs=value(211,0),radiansPerSecond=value(180,0),textureNames=[value(192,i) for i in range(3)],
 scale=dict(durationMs=value(412,0),fromScale=value(395,0),toScale=value(395,1),curve=curve(406)),
 light=dict(position=light_position,range=range_,attenuation=[a0,a1,a2],stages=[
  dict(durationMs=value(326,0),fromColor=color(288),toColor=color(290),curve=curve(320)),
  dict(durationMs=value(285,0),fromColor=color(254),toColor=color(256),curve=curve(279))]),
 particleBurstDelayMs=value(353,0),links=[dict(index=i,delayFrames=e[0],source=e[1],destination=e[2]) for i,e in expected.items()])
print(json.dumps(result,indent=2))
