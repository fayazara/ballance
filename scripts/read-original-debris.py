#!/usr/bin/env python3
"""Recover fragment creation, burst impulses and paper wind from Balls.nmo."""
import argparse
import json
import struct
from pathlib import Path
from original_chunks import ChunkDump, chunks

parser = argparse.ArgumentParser(); parser.add_argument('balls_dump', type=Path)
parser.add_argument('--gameplay-dump', type=Path)
args = parser.parse_args()
d = ChunkDump(args.balls_dump)
gameplay = ChunkDump(args.gameplay_dump or args.balls_dump.with_name('gameplay-chunks.tsv'))

def reference(index):
    kind, name, data = d.rows[index]
    if kind == 2:
        return reference(struct.unpack_from('<I', data, 24)[0])
    offset = chunks(data)[0x40]
    mode, value = struct.unpack_from('<II', data, offset + 8)
    assert mode == 2, (index, name, mode)
    return None if value == 0xffffffff else d.rows[value][1]

def random_range(index):
    b = d.behavior(index)
    return [d.value(p) for p in b['inputs']]

result = {'source': 'Balls.nmo: fragment creation and Ball_PaperWind', 'materials': {}, 'wind': []}
for kind, index, impulse_index, random_index, position_index, link in [
    ('wood', 501, 452, 467, 527, (456,468)),
    ('stone',756,769,713,795,(717,723)),
    ('paper',627,586,641,675,(629,595)),
]:
    b = d.behavior(index, 33); p = b['inputs']; local = [d.value(i) for i in b['locals']]
    assert link in d.links and b['inIO'][0] == link[1]
    assert local[:3] == [1,0,0]
    impulse = d.behavior(impulse_index, 33)
    assert impulse['target'] == 'Element'
    assert all(d.value(i) is False for i in impulse['locals'])
    assert d.value(impulse['inputs'][1]) == d.value(impulse['inputs'][3]) == 'Element'
    assert struct.unpack_from('<I', d.rows[impulse['inputs'][1]][2], 24)[0] == struct.unpack_from('<I', d.rows[impulse['inputs'][3]][2], 24)[0]
    position = d.behavior(position_index, 33)
    assert d.value(position['inputs'][0]) == [0,0,0]
    assert reference(position['inputs'][1]) == 'Ball_Pos_Frame'
    assert d.value(position['inputs'][2]) is True
    row = dict(index=index, fixed=d.value(p[0]), friction=random_range(634) if kind == 'paper' else [d.value(p[1])]*2,
        restitution=d.value(p[2]), mass=random_range(571) if kind == 'paper' else [d.value(p[3])]*2,
        collisionGroup=d.value(p[4]), startFrozen=d.value(p[5]), enableCollision=d.value(p[6]),
        automaticMassCenter=d.value(p[7]), linearDamping=d.value(p[8]), angularDamping=d.value(p[9]),
        massCenter=local[3], impulse=random_range(random_index), impulseIndex=impulse_index,
        impulsePosition=d.value(impulse['inputs'][0]), impulseDirection=d.value(impulse['inputs'][2]),
        positionFrame=position['target'])
    assert row['automaticMassCenter'] is False and row['massCenter'] == [0,0,0]
    result['materials'][kind] = row

for index in range(1225, 1498, 16):
    b = d.behavior(index, 33); p = b['inputs']
    assert reference(p[1]) == b['target'] and reference(p[3]) is None
    result['wind'].append(dict(index=index, target=b['target'], position=d.value(p[0]), direction=d.value(p[2]), impulse=d.value(p[4])))
assert len(result['wind']) == len({r['target'] for r in result['wind']}) == 18
# Paper creation enables the shared switch after Physicalize/Impulse; reset
# disables it before invoking the same wind script. Both enter/exit controller
# chains are wired through all eighteen pieces.
assert d.value(d.behavior(690)['inputs'][0]) is True
assert d.value(d.behavior(991)['inputs'][0]) is False
assert (657,684) in d.links and (685,556) in d.links and (987,1049) in d.links
assert reference(d.behavior(563)['inputs'][1]) == reference(d.behavior(1056)['inputs'][1]) == 'Ball_PaperWind'

def color(index):
    kind, name, data = d.rows[index]
    if kind == 2: return color(struct.unpack_from('<I', data, 24)[0])
    offset = chunks(data)[0x40]
    assert data[offset:offset+8].hex() == 'ee2fd457913bbb7c'
    assert struct.unpack_from('<II', data, offset+8) == (1,16)
    return list(struct.unpack_from('<4f', data, offset+16))

def fade_curve(index):
    # The three curves share this embedded v10 CKStateChunk layout. Read() in
    # the supplied CK2.dll (0x240013e4) reads flags followed by eleven floats;
    # IsLinear/GetY test flag 2. Reject other encodings rather than guessing.
    data = d.rows[index][2]
    assert len(data) == 240 and data[16:24].hex() == '5d34ad20b125fb1a'
    assert struct.unpack_from('<II',data,24) == (0,50)
    assert struct.unpack_from('<7I',data,72) == (14,0x7000a,30,0,2,0,0)
    assert struct.unpack_from('<6I',data,100) == (0x100,0,2,0,0,0)
    points = []
    for offset in [124,172]:
        assert struct.unpack_from('<I',data,offset)[0] == 0x10000002
        points.append(list(struct.unpack_from('<2f',data,offset+4)))
    assert points == [[0,0],[1,1]]
    return {'linear': True, 'points': points}

result['lifecycle'] = {}
for kind, timer, curve, curve_param, interpolators in [
    ('wood',665,911,904,[(920,893)]),
    ('paper',592,1025,1018,[(1034,1007)]),
    ('stone',708,1091,1084,[(1109,1073),(1118,1100)]),
]:
    progression = d.behavior(curve)
    assert d.value(progression['locals'][0]) is True
    materials = {}
    for interpolate, diffuse in interpolators:
        mix = d.behavior(interpolate); setter = d.behavior(diffuse,30)
        assert setter['version'] == 0x20000 and d.value(setter['inputs'][1]) is False
        assert d.value(mix['locals'][0]) is False
        materials[setter['target']] = {'from': color(mix['inputs'][0]), 'to': color(mix['inputs'][1])}
    result['lifecycle'][kind] = {'timer': timer, 'waitMs': gameplay.value(gameplay.behavior(timer)['inputs'][0]),
        'fadeMs': d.value(progression['inputs'][0]), 'curve': fade_curve(curve_param), 'materials': materials}
assert all(row['waitMs'] == 20000 and row['fadeMs'] == 2000 for row in result['lifecycle'].values())
# Fade exits reach the Unphysicalize iterators; wind is disabled at fade entry.
assert all(link in d.links for link in [(928,870),(1042,983),(1128,1182),(1050,1041)])
print(json.dumps(result, indent=2))
