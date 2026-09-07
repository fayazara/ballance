#!/usr/bin/env python3
"""Recover P_Modul_29 physics and its stone-triggered broken hinge from an NMO dump.

Usage: python3 scripts/read-original-chain.py /tmp/ballance-original-audit/mod29-chunks.tsv
The executable is never run. File indices identify the original behavior graph.
"""
import argparse
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('dump', type=Path)
args = parser.parse_args()
rows = {int(p[0]): (int(p[2]), p[3], bytes.fromhex(p[4]))
        for line in args.dump.read_text().splitlines() if len(p := line.split('\t')) == 5}

def chunks(data):
    result, offset = {}, 8
    while offset:
        tag, following = struct.unpack_from('<II', data, offset)
        result[tag] = offset + 8
        offset = 8 + following * 4 if following else 0
    return result

def value(index):
    kind, name, data = rows[index]
    if kind == 2: return value(struct.unpack_from('<I', data, 24)[0])
    if kind not in [3, 45]: return name
    offset = chunks(data)[0x40]
    guid = data[offset:offset + 8].hex()
    mode, = struct.unpack_from('<I', data, offset + 8)
    if mode == 2:
        ref, = struct.unpack_from('<I', data, offset + 12)
        return rows[ref][1] if ref != 0xffffffff else name
    assert mode == 1, (index, mode)
    length, = struct.unpack_from('<I', data, offset + 12)
    raw = data[offset + 16:offset + 16 + length]
    if guid == 'e210d06bea175611': return raw.split(b'\0')[0].decode('windows-1252')
    if guid == '8e2ad51a2019745e': return bool(struct.unpack('<I', raw)[0])
    if guid == '3f4c8847202c2c43': return struct.unpack('<f', raw)[0]
    if len(raw) == 4: return struct.unpack('<i', raw)[0]
    if len(raw) == 12: return list(struct.unpack('<3f', raw))
    raise ValueError((index, name, guid))

def behavior(index, targetable=False):
    data = rows[index][2]
    offset = chunks(data)[0x20]
    words = struct.unpack('<' + 'I' * ((len(data) - offset) // 4), data[offset:])
    if targetable: assert words[4] == 33
    position = 7 if targetable else 5
    mask = words[position - 1]
    result = {'target': value(words[5])} if targetable else {}
    for flag, name in [(0x200, 'inputs'), (0x400, 'outputs'), (0x20000, 'locals'), (0x800, 'inIO'), (0x1000, 'outIO')]:
        if mask & flag:
            count = words[position]
            result[name] = list(words[position + 1:position + 1 + count])
            position += count + 1
    return result

def frame(name):
    data = next(row[2] for row in rows.values() if row[0] == 33 and row[1] == name)
    floats = struct.unpack_from('<12f', data, chunks(data)[0x100000] + 8)
    return [c for i in range(4) for c in [*floats[i * 3:i * 3 + 3], 1 if i == 3 else 0]]

parts, joints = [], []
for index, (kind, name, _) in rows.items():
    if kind != 8 or name not in ['Physicalize', 'Set Physics Hinge']: continue
    b = behavior(index, True)
    p = [value(i) for i in b['inputs']]
    if name == 'Physicalize':
        local = [value(i) for i in b['locals']]
        assert local[:3] == [1, 0, 0]
        parts.append(dict(index=index, target=b['target'], fixed=p[0], friction=p[1], restitution=p[2], mass=p[3],
                          collisionGroup=p[4], startFrozen=p[5], enableCollision=p[6], automaticMassCenter=p[7],
                          linearDamping=p[8], angularDamping=p[9], hulls=p[11:], massCenter=local[3]))
    else:
        joints.append(dict(index=index, target=b['target'], anchorObject=p[0], frameName=p[1], hingeFrame=frame(p[1]),
                           limitsEnabled=p[2], lowerLimit=p[3], upperLimit=p[4]))

def proximity(index):
    b = behavior(index)
    p, local = ([value(i) for i in b[key]] for key in ['inputs', 'locals'])
    return dict(index=index, distance=p[0], object=p[2], barycenter=p[3], exactnessMin=p[4], exactnessMax=p[5],
                minFrameDelay=p[6], maxFrameDelay=p[7], outputFlags=local[2], axes=local[3], squared=local[4])

# Trace the Test's True output through the compound's third input to Hinge 187's Destroy input.
links = [struct.unpack_from('<II', row[2], len(row[2]) - 8) for row in rows.values() if row[0] == 6]
test = behavior(699)
assert value(test['inputs'][0]) == 1, 'Test.cpp: comparison operator 1 is Equal'
assert (test['outIO'][0], 302) in links
broken = next(j for j in joints if (302, behavior(j['index'], True)['inIO'][1]) in links)
assert (test['outIO'][0], 306) in links, 'The break also plays the rope tearing sound'
assert (77, 345) in links and (346, 320) in links, 'Outer proximity wakes the bridge and arms the inner trigger'
assert (322, 65) in links and (66, test['inIO'][0]) in links
assert len(parts) == 9 and len(joints) == 10
print(json.dumps(dict(source='P_Modul_29.nmo', parts=parts, joints=joints,
                      wake=proximity(99), wakeFrame=frame(value(81)), wakeTarget=behavior(349, True)['target'],
                      release=proximity(344), releaseBall=value(test['inputs'][2]), releaseHinge=broken['index'],
                      sound=value(2)), indent=2))
