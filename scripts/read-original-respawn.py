#!/usr/bin/env python3
"""Read Deactivate Ball / New Ball timing and flash data from Gameplay.nmo."""
import argparse,hashlib,json,struct
from original_chunks import ChunkDump,chunks
p=argparse.ArgumentParser();p.add_argument('dump');a=p.parse_args();d=ChunkDump(a.dump)
def value(index,slot):return d.value(d.definition(index)['inputs'][slot])
assert d.rows[2499][1]=='Deactivate Ball' and d.rows[2921][1]=='New Ball'
assert value(2326,0)==1000 and value(2512,0)==3000
assert value(2218,0)==2000 and d.definition(2218)['version']==0x10005
assert value(2286,0)==5 and value(2286,2)==0
expected={2488:(2,2455,2437),2495:(0,2279,2405),2478:(0,2280,2498),
  2480:(0,2406,2258),2475:(0,2259,2321),2474:(0,2322,2288),
  2477:(0,2290,2327),2476:(0,2328,2261),2489:(0,2262,2426),
  2482:(0,2352,2497),2941:(1,2497,2919),
  2900:(0,2514,2507),2915:(0,2508,2719),2701:(1,2587,2617),
  2255:(1,2204,2202),2257:(0,2220,2259)}
for i,e in expected.items():
 delay,source,target=e
 assert struct.unpack_from('<HHII',d.rows[i][2],16)==(delay,delay,source,target)
raw=d.rows[2211][2]
assert raw[16:24].hex()=='5d34ad20b125fb1a'
assert struct.unpack_from('<III',raw,100)==(0x100,0,4)
assert struct.unpack_from('<5I',raw,112)==(0,)*5
curve=[]
for i in range(4):
 flags,*v=struct.unpack_from('<I11f',raw,132+48*i)
 assert v[2:7]==[0]*5
 curve.append(dict(flags=flags&~0x10000000,position=v[:2],incoming=v[7:9],outgoing=v[9:11]))
def color(i):
 raw=d.rows[i][2];offset=chunks(raw)[0x40]
 assert struct.unpack_from('<II',raw,offset+8)==(1,16)
 return list(struct.unpack_from('<4f',raw,offset+16))
assert value(2240,3)==5 and value(2240,4)==6 # source alpha / inverse source alpha
print(json.dumps(dict(source='Gameplay.nmo: Deactivate Ball 2499 / New Ball 2921',
 dumpSha256=hashlib.sha256(open(a.dump,'rb').read()).hexdigest(),
 lifeCheckDelayFrames=2,removeBallDelayMs=value(2326,0),newBallDelayFrames=1,
 physicalizeDelayMs=value(2512,0),wakeDelayFrames=1,
 flash=dict(durationMs=value(2218,0),curve=curve,fromColor=color(2243),toColor=color(2245)),
 links=[dict(index=i,delayFrames=e[0],source=e[1],destination=e[2]) for i,e in expected.items()]),indent=2))
