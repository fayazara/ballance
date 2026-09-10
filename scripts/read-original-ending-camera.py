#!/usr/bin/env python3
"""Recover the detached finish camera from original, read-only chunk dumps."""
import argparse
import hashlib
import json
import struct
from pathlib import Path
from original_chunks import ChunkDump, chunks

p=argparse.ArgumentParser()
p.add_argument('dumps',type=Path)
a=p.parse_args()
game=ChunkDump(a.dumps/'Gameplay.tsv')
camera=ChunkDump(a.dumps/'Camera.tsv')
balloon=ChunkDump(a.dumps/'PE_Balloon.tsv')

def values(d,index):
    return [d.value(i) for i in d.definition(index).get('inputs',[])]

# Message parameters use a manager-local ID. Gameplay's serialized message
# manager names ID 11 Level_Finish. Decode that mapping instead of relying on
# the generic parameter name "Message" or an ID from a different document.
manager_path=a.dumps/'Gameplay-managers.tsv'
manager=next(bytes.fromhex(line.split('\t')[2]) for line in manager_path.read_text().splitlines()
             if line.startswith('1181355948\t0\t'))
offset=chunks(manager)[0x53]
count=struct.unpack_from('<I',manager,offset)[0];offset+=4
names=[]
for _ in range(count):
    length=struct.unpack_from('<I',manager,offset)[0];offset+=4
    names.append(manager[offset:offset+length].split(b'\0')[0].decode('windows-1252'))
    offset+=(length+3)//4*4
assert names[11]=='Level_Finish'
parameter=game.rows[5310][2]
assert parameter[16:24].hex()=='121e88032b4ea35b'
assert struct.unpack_from('<4I',parameter,24)==(0x466a0fac,0,11,1)
parent=game.rows[5494][2]
assert struct.unpack_from('<II',parent,chunks(parent)[0x40]+8)==(2,0xffffffff)
assert game.definition(5497)['target']=='Cam_Pos Frame'

chain=[5312,5520,5388,5608,5419,5771,5497,5881]
links=[]
for previous,following in zip(chain,chain[1:]):
    pair=(game.definition(previous)['outIO'][0],game.definition(following)['inIO'][0])
    matches=[(i,r[2]) for i,r in game.rows.items() if r[0]==6 and struct.unpack_from('<II',r[2],20)==pair]
    assert len(matches)==1
    index,raw=matches[0]
    initial,current,source,destination=struct.unpack_from('<HHII',raw,16)
    assert initial==current==(2 if previous==5608 else 0)
    links.append(dict(index=index,source=source,destination=destination,delayFrames=initial))

def controller(index,target):
    params=values(game,index)
    assert params[0]==target and params[7:]==[0.,0.,0.,'Coordinate-System',0.]
    return dict(force=params[1:4],damping=params[4:7])

assert values(balloon,1309)==[[0.,-15.,0.],'Cam_Pos Frame',False]
payload=camera.rows[4][2]
assert camera.rows[4][:2]==(35,'InGameCam')
assert struct.unpack_from('<I',payload,chunks(payload)[0x10000000])[0]==3
assert camera.rows[3][1]=='Cam_Target'
print(json.dumps(dict(
    source='Gameplay.nmo, Camera.nmo, PE_Balloon.nmo',
    dumpSha256={name:hashlib.sha256((a.dumps/(name+'.tsv')).read_bytes()).hexdigest() for name in ['Gameplay','Camera','PE_Balloon','Gameplay-managers']},
    detachMessage='Level_Finish',detachParent=None,detachGraph=links,
    detachDelayFrames=sum(link['delayFrames'] for link in links),
    position=controller(2989,'Cam_Pos Frame'),target=controller(3025,'BallPos_Frame'),
    ufoPositionOffset=values(balloon,1309)[0],clipping=values(game,5881),
),indent=2))
