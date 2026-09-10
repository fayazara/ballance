#!/usr/bin/env python3
"""Recover the BallManager death-volume loop and its explicit frame delays."""
import argparse
import hashlib
import json
import struct
from original_chunks import ChunkDump, chunks

parser=argparse.ArgumentParser()
parser.add_argument('gameplay_dump')
args=parser.parse_args()
d=ChunkDump(args.gameplay_dump)
iterator=d.definition(2929)
intersection=d.definition(2939)
assert d.rows[2929][1]=='Group Iterator'
assert d.rows[2939][1]=='Box Box Intersection'
assert d.rows[2499][1]=='Deactivate Ball'
assert d.value(intersection['inputs'][2]) is False
assert d.value(intersection['inputs'][3]) is False
assert struct.unpack_from('<I',d.rows[2933][2],24)[0]==iterator['outputs'][0]
assert struct.unpack_from('<I',d.rows[2934][2],24)[0]==12
assert d.rows[12][1]=='ActiveBall'
assert struct.unpack_from('<I',d.rows[2926][2],24)[0]==1281
dest=d.rows[1282][2]
assert struct.unpack_from('<II',dest,chunks(dest)[0x20])==(1,1281)
assert d.value(1279)=='DepthTestCubes'
expected={2940:(0,2949,2919),2941:(1,2497,2919),2942:(0,2925,2930),
          2943:(0,2931,2496),2944:(1,2932,2923),2945:(1,2924,2922),2946:(0,2920,2922)}
for index,(delay,source,destination) in expected.items():
    saved,current,a,b=struct.unpack_from('<HHII',d.rows[index][2],16)
    assert (saved,current,a,b)==(delay,delay,source,destination)
print(json.dumps(dict(source='Gameplay.nmo: BallManager / Box Box Intersection',
    dumpSha256=hashlib.sha256(open(args.gameplay_dump,'rb').read()).hexdigest(),
    group=d.value(1279),hierarchy=[False,False],localBoxes=[True,True],
    nextVolumeDelayFrames=1,restartSweepDelayFrames=1,intersectionOutput='True',
    links=[dict(index=i,delayFrames=v[0],source=v[1],destination=v[2]) for i,v in expected.items()]),indent=2))
