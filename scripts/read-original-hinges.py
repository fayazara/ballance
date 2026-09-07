#!/usr/bin/env python3
"""Recover passive hinged module parameters from shallow NMO chunk dumps.

Usage: python3 scripts/read-original-hinges.py /tmp/ballance-original-audit
Writes JSON to stdout. Does not run the original executable or infer hinge limits.
"""
import argparse
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('dump_directory', type=Path)
args = parser.parse_args()

def chunks(data):
    result, offset = {}, 8
    while offset:
        tag, following = struct.unpack_from('<II', data, offset)
        result[tag] = offset + 8
        offset = 8 + following * 4 if following else 0
    return result

result = {}
for module in ['19', '25', '30', '37', '41']:
    rows = {}
    for line in (args.dump_directory / f'mod{module}-chunks.tsv').read_text().splitlines():
        row = line.split('\t')
        if len(row) == 5: rows[int(row[0])] = (int(row[2]), row[3], bytes.fromhex(row[4]))

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
        assert mode == 1, (module, index, mode)
        length, = struct.unpack_from('<I', data, offset + 12)
        raw = data[offset + 16:offset + 16 + length]
        if guid == 'e210d06bea175611': return raw.split(b'\0')[0].decode('windows-1252')
        if guid == '8e2ad51a2019745e': return bool(struct.unpack('<I', raw)[0])
        if guid == 'fd16575ad776e244': return struct.unpack('<i', raw)[0]
        if len(raw) == 4: return struct.unpack('<f', raw)[0]
        if len(raw) == 12: return list(struct.unpack('<3f', raw))
        raise ValueError((module, index, name, guid))

    def parameters(index):
        data = rows[index][2]
        offset = chunks(data)[0x20]
        words = struct.unpack('<' + 'I' * ((len(data) - offset) // 4), data[offset:])
        assert words[4] == 0x21, 'Expected a targetable entity behavior'
        target, count = value(words[5]), words[7]
        inputs = [value(i) for i in words[8:8 + count]]
        position = 8 + count
        locals_ = [value(i) for i in words[position + 1:position + 1 + words[position]]] if rows[index][1] == 'Physicalize' else []
        return target, inputs, locals_

    physical = next(i for i, row in rows.items() if row[0] == 8 and row[1] == 'Physicalize')
    hinge = next(i for i, row in rows.items() if row[0] == 8 and row[1] == 'Set Physics Hinge')
    target, inputs, locals_ = parameters(physical)
    hinge_target, joint_inputs, _ = parameters(hinge)
    assert target == hinge_target
    assert locals_[1:3] == [0, 0], 'Only convex passive mechanisms are supported here'
    frame = next(row[2] for row in rows.values() if row[1] == joint_inputs[1] and row[0] == 33)
    floats = struct.unpack_from('<12f', frame, chunks(frame)[0x100000] + 8)
    matrix = [component for i in range(4) for component in [*floats[i * 3:i * 3 + 3], 1 if i == 3 else 0]]
    result[f'P_Modul_{module}'] = {
        'source': f'P_Modul_{module}.nmo', 'physicalizeIndex': physical, 'hingeIndex': hinge,
        'target': target, 'fixed': inputs[0], 'friction': inputs[1], 'restitution': inputs[2],
        'mass': inputs[3], 'collisionGroup': inputs[4], 'startFrozen': inputs[5],
        'enableCollision': inputs[6], 'automaticMassCenter': inputs[7],
        'linearDamping': inputs[8], 'angularDamping': inputs[9],
        'hulls': inputs[11:11 + locals_[0]], 'massCenter': locals_[3],
        'anchorObject': joint_inputs[0], 'hingeFrame': matrix,
        'limitsEnabled': joint_inputs[2], 'lowerLimit': joint_inputs[3], 'upperLimit': joint_inputs[4],
        'wakeDistance': next((value(i) for i, row in rows.items() if row[0] == 45 and row[1] == 'Distance'), None) if any(row[0] == 8 and row[1] == 'Physics WakeUp' for row in rows.values()) else None,
    }
print(json.dumps(result, indent=2))
