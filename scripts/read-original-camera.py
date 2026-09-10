#!/usr/bin/env python3
"""Recover the original camera rig and its gameplay navigation parameters."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
from original_chunks import ChunkDump,chunks

p=argparse.ArgumentParser();p.add_argument('dumps',type=Path);a=p.parse_args()
game=ChunkDump(a.dumps/'Gameplay.tsv');camera=ChunkDump(a.dumps/'Camera.tsv')
def values(index):return [game.value(i) for i in game.definition(index).get('inputs',[])]
def edge(index,source,destination,delay):
    raw=game.rows[index][2]
    assert game.rows[index][0]==6
    assert struct.unpack_from('<HHII',raw,16)==(delay,delay,source,destination)
    return dict(index=index,source=source,destination=destination,delayFrames=delay)

frames={}
for index in range(6):
    kind,name,raw=camera.rows[index];offset=chunks(raw)[0x100000]
    assert kind in [33,35]
    flags=struct.unpack_from('<I',raw,offset)[0]
    parent=struct.unpack_from('<I',raw,offset+56)[0] if flags&0x20000 else None
    v=struct.unpack_from('<12f',raw,offset+8)
    frames[name]=dict(parent=camera.rows[parent][1] if parent is not None else None,
        matrix=[value for i in range(4) for value in [*v[3*i:3*i+3],1 if i==3 else 0]])
assert {name:data['parent'] for name,data in frames.items()}=={
    'Cam_OrientRef':'Cam_Target','Cam_Pos':'Cam_Orient','Cam_Orient':'Cam_Target',
    'Cam_Target':'Cam_MF','InGameCam':'Cam_MF','Cam_MF':None}
raw=camera.rows[4][2]
assert struct.unpack_from('<I',raw,chunks(raw)[0x10000000])[0]==3
projection,fov,zoom,aspect,near,far=struct.unpack_from('<IffIff',raw,chunks(raw)[0xfc00000])
assert projection==1 and zoom==1 and aspect==0x30004 and near==3 and far==1200

def motion(index,target):
    d=game.definition(index);v=values(index)
    assert d['target']==target and v[7:]==[0.,0.,0.,'Coordinate-System',0.]
    return dict(target=target,reference=v[0],force=v[1:4],damping=v[4:7])
assert values(2506)==[True] and game.value(game.definition(2728)['inputs'][1]) is True
assert game.definition(2506)['target']==game.definition(2728)['target']=='Cam_MF Frame'
assert struct.unpack_from('<I',game.rows[2724][2],24)[0]==2534
assert struct.unpack_from('<I',game.rows[2738][2],24)[0]==2534

assert [game.value(i) for i in game.definition(1991)['inputs'][:3]]==[250.,0.,1.] and game.definition(1991)['version']==0x10005
assert values(1963)==[[0.,1.5707963705062866,0.],[0.,-1.5707963705062866,0.]]
assert values(1973)==[[0.,0.,0.],False,'Cam_Orient Frame']
assert values(1954)[1:]==[True,'Cam_OrientRef Frame']
for parameter,name in [(2050,'Cam Left'),(2095,'Cam Right')]:
    assert game.rows[struct.unpack_from('<I',game.rows[parameter][2],24)[0]][1]==name
assert values(2034)==[-50.,0.] and values(2044)==[2.,0.800000011920929]
# The selectors write shared parameters consumed by the camera's Y controller.
for output,shared,input_ in [(2033,2032,2975),(2043,2042,2964)]:
    assert struct.unpack_from('<I',game.rows[output][2],len(game.rows[output][2])-4)[0]==shared
    assert struct.unpack_from('<I',game.rows[input_][2],24)[0]==shared

raw=game.rows[1984][2]
assert raw[16:24].hex()=='5d34ad20b125fb1a'
assert struct.unpack_from('<III',raw,100)==(0x100,0,2)
assert struct.unpack_from('<III',raw,112)==(0,0,0)
curve=[]
for index in range(2):
    flags,*v=struct.unpack_from('<I11f',raw,124+48*index)
    assert flags==0x10000003 and v[2:7]==[0]*5
    curve.append(dict(flags=flags&~0x10000000,position=v[:2],incoming=v[7:9],outgoing=v[9:11]))
assert [point['position'] for point in curve]==[[0.,0.],[1.,1.]]

links=[edge(2140,1976,1964,1),edge(2141,2001,1944,0),edge(2142,1977,2000,0),
    edge(2143,1976,2000,0),edge(2144,1977,1975,1),edge(2162,1957,1974,0),
    edge(2165,2132,1956,0),edge(2180,2087,1955,0)]
children=game.definition(3136)['children']
assert children.index(1758)<children.index(2189)<children.index(2989)<children.index(3025)
print(json.dumps(dict(source='Camera.nmo and Gameplay.nmo',
    dumpSha256={name:hashlib.sha256((a.dumps/(name+'.tsv')).read_bytes()).hexdigest() for name in ['Camera','Gameplay']},
    frames=frames,projection=dict(horizontalFov=fov,aspectWidth=aspect&65535,aspectHeight=aspect>>16,near=near,far=far),
    position=motion(2989,'InGameCam'),target=motion(3025,'Cam_Target Frame'),
    turn=dict(durationMs=250.,angles=[values(1963)[0][1],values(1963)[1][1]],curve=curve,commitDelayFrames=1,links=links),
    highView=dict(offsetY=values(2034)[0],forceY=values(2044)[0]),
    reset=dict(restoreHierarchy=2506,applyMatrix=2728,sharedPlayerMatrix=2534),
),indent=2))
