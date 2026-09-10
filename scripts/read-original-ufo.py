#!/usr/bin/env python3
"""Recover final-level UFO motion parameters from PE_Balloon's chunk dump.

This exports data and graph links, not an executable behavior interpreter.
Includes authored claw tracks, progression curves and flash render state.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path
from original_chunks import ChunkDump, chunks, table

parser = argparse.ArgumentParser()
parser.add_argument('dump')
args = parser.parse_args()
d = ChunkDump(args.dump)

def values(index):
    return [d.value(p) for p in d.definition(index).get('inputs', [])]

def link(index):
    data = d.rows[index][2]
    assert d.rows[index][0] == 6 and len(data) == 28
    initial, current, source, destination = struct.unpack_from('<HHII', data, 16)
    return dict(index=index, initialDelayFrames=initial, currentDelayFrames=current,
                source=source, destination=destination)

def edges(compound):
    return [link(i) for i in d.definition(compound)['links']]

def assert_edge(index, source, destination, delay):
    assert link(index) == dict(index=index, initialDelayFrames=delay, currentDelayFrames=delay,
                              source=source, destination=destination)

raw = table(d.rows[1839][2])
assert d.rows[1839][1] == 'PE_UFO_Pos&Time' and len(raw) == 13
rows = []
for row in raw:
    def cell(name):
        value = row[name]
        return d.value(value['parameterIndex']) if isinstance(value, dict) else value
    assert cell('Referential') in [0, 1]
    rows.append(dict(position=cell('Target Position'), force=cell('Force'), damping=cell('Damping'),
                     waitMs=cell('Waiting Time'), reference='ball' if cell('Referential') else 'finish',
                     startGrab=cell('Start Anim?')))
assert values(1300) == ['PE_UFO_BallPosRef', 'PE_Balloon_MF']
assert_edge(1610, 1386, 1291, 0)  # true -> ball reference
assert_edge(1611, 1387, 1292, 0)  # false -> finish reference
assert sum(row['waitMs'] for row in rows) == 18800
assert [i for i, row in enumerate(rows) if row['startGrab']] == [5]
assert values(1326) == [[-500., 100., 100.], 'PE_Balloon_MF', True]
assert values(1420)[0] == 'PE_UFO_TargetPosRef'
assert values(1420)[7:] == [0., 0., 0., 'Coordinate-System', 0.]
behavior = d.rows[1420][2]
guid = struct.unpack_from('<II', behavior, chunks(behavior)[0x20] + 4)
assert guid == (0x0fd4755f, 0x7de22dc8)

# Boarding's message output -> last-level gate -> UFO, each delayed one frame.
assert_edge(1757, 1198, 1265, 1)
assert_edge(1758, 1266, 1640, 1)
assert_edge(1609, 1285, 1390, 1)  # Show -> start dynamic-position controller
assert_edge(1613, 1279, 1366, 1)  # completed wait -> next row
assert_edge(1636, 1586, 1337, 1)  # top rotation -> next target update
assert_edge(1760, 1641, 1726, 0)  # all rows exhausted -> hyperspace
for i, a, b, delay in [(1499,1477,1436,0),(1500,1438,1469,0),(1501,1470,1489,1)]:
    assert_edge(i, a, b, delay)  # grab completion -> remove physics -> parent -> delayed position
assert values(1474) == ['PE_UFO_Body']
assert values(1498) == [[0., 0., 0.], 'PE_UFO_Body', False]
assert values(1358)[2:] == ['PE_UFO_Body', True]
assert values(1597)[2:] == ['PE_UFO_Top', False]

def input_value(index, slot):
    return d.value(d.definition(index)['inputs'][slot])

def rotation_track(index):
    payload=d.rows[index][2]
    assert d.rows[index][0]==15 and chunks(payload)=={0x4000000:16}
    assert struct.unpack_from('<8I',payload,16)==(0,)*8
    entity,length,kind,words,count=struct.unpack_from('<IfIII',payload,48)
    assert length==100 and kind==0x45b52a02 and words==61 and count==6
    keys=[]
    for offset in range(68,308,40):
        time,*values=struct.unpack_from('<10f',payload,offset)
        rotation=values[:4];tension,continuity,bias,ease_to,ease_from=values[4:]
        assert abs(sum(v*v for v in rotation)-1)<1e-5
        assert continuity==bias==ease_to==ease_from==0
        keys.append(dict(time=time,rotation=rotation,tension=tension))
    assert [key['time'] for key in keys]==[0,35,59,70,75,100]
    assert struct.unpack_from('<III',payload,308)==(0x654a3a04,5,1)
    assert struct.unpack_from('<f',payload,320)[0]==0 and struct.unpack_from('<I',payload,336)[0]==0
    return dict(name=d.rows[entity][1],length=length,keys=keys,scale=list(struct.unpack_from('<3f',payload,324)))

def hierarchy():
    result=[]
    for index,(kind,name,payload) in d.rows.items():
        if kind!=41 or not name.startswith('PE_UFO_') or name=='PE_UFO_Flash':continue
        offset=chunks(payload)[0x100000]
        flags=struct.unpack_from('<I',payload,offset)[0]
        parent=struct.unpack_from('<I',payload,offset+56)[0] if flags&0x20000 else None
        result.append(dict(name=name,parent=d.rows[parent][1] if parent is not None else None,matrix=d.frame(name)))
    return result

def curve(index):
    # CK2dCurve::Dump: nested state chunk, identifier 0x100, null object array,
    # fitting coefficient, then flags and eleven floats per control point.
    payload=d.rows[index][2]
    assert payload[16:24].hex()=='5d34ad20b125fb1a' and struct.unpack_from('<I',payload,24)[0]==0
    assert struct.unpack_from('<II',payload,100)==(0x100,0)
    count=struct.unpack_from('<I',payload,108)[0]
    assert count in [2,3] and struct.unpack_from('<'+'I'*count,payload,112)==(0,)*count
    offset=112+count*4
    assert struct.unpack_from('<f',payload,offset)[0]==0
    points=[]
    for i in range(count):
        flags,*p=struct.unpack_from('<I11f',payload,offset+4+i*48)
        assert flags&0x10000000 and p[2:7]==[0]*5
        points.append(dict(flags=flags&~0x10000000,position=p[:2],incoming=p[7:9],outgoing=p[9:11]))
    return points

flash_material=d.rows[1764][2]
assert d.rows[1764][:2]==(30,'PE_UFO_Flash')
packed=struct.unpack_from('<I',flash_material,chunks(flash_material)[0x1000]+28)[0]
assert (packed>>12)&15==2 and (packed>>16)&15==2  # VXBLEND_ONE + VXBLEND_ONE
result = dict(source='PE_Balloon.nmo', dumpSha256=hashlib.sha256(Path(args.dump).read_bytes()).hexdigest(),
    initialPosition=values(1326)[0], referenceFrame='PE_Balloon_MF', rows=rows,
    dynamicPosition=dict(guid=[hex(v) for v in guid], offset=values(1420)[7:10], distanceLimit=values(1420)[11]),
    spin=dict(radiansPerSecond=input_value(1315,0), bodyAxis=values(1358)[0], topAxis=values(1597)[0],
              topMultiplier=values(1606)[1]),
    grab=dict(animation=input_value(1488,0), durationMs=input_value(1488,1), loop=input_value(1488,3),
              parent=values(1474)[0], position=values(1498)[0],curve=curve(1482),
              tracks=[rotation_track(i) for i in [1788,1789,1792,1793,1779,1781,1784,1785]]),
    flash=dict(durationMs=input_value(1665,0), position=values(1716)[0],
               scaleFrom=input_value(1705,0), scaleTo=input_value(1705,1),curve=curve(1658),
               matrix=d.frame('PE_UFO_Flash'),sourceBlend=(packed>>12)&15,destinationBlend=(packed>>16)&15),
    hierarchy=hierarchy(),
    graph={d.rows[i][1]:edges(i) for i in [1762,1267,1642,1505,1727]})
print(json.dumps(result, indent=2))
