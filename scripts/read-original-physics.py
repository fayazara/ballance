#!/usr/bin/env python3
"""Read numerical physics evidence from LibCmo shallow chunk dumps (no game executable)."""
import argparse
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('dump_directory', type=Path)
args = parser.parse_args()
def rows(name):
    result = []
    for line in (args.dump_directory / (name + '-chunks.tsv')).read_text().splitlines():
        row = line.split('\t')
        if len(row) == 5: result.append((int(row[0]), int(row[2]), row[3], bytes.fromhex(row[4])))
    return result

def table(data):
    chunks = {}; offset = 8
    while offset:
        key, next_word = struct.unpack_from('<II', data, offset)
        chunks[key] = offset + 8
        offset = 8 + next_word * 4 if next_word else 0
    position = chunks[0x1000]
    def integer():
        nonlocal position
        value = struct.unpack_from('<I', data, position)[0]; position += 4; return value
    def string():
        nonlocal position
        length = integer(); value = data[position:position + length].split(b'\0')[0].decode('windows-1252')
        position += (length + 3) // 4 * 4; return value
    columns = []
    for _ in range(integer()):
        name = string(); kind = integer()
        if kind == 5: position += 8  # Parameter GUID; each row holds an object reference.
        columns.append((name, kind))
    position = chunks[0x2000]; result = []
    for _ in range(integer()):
        entry = {}
        for name, kind in columns:
            if kind == 3: value = string()
            elif kind == 2:
                value = round(struct.unpack_from('<f', data, position)[0], 6); position += 4
            elif kind == 5: value = {'parameterIndex': integer()}
            else: value = integer()
            entry[name] = value
        result.append(entry)
    return result

result = {'tables': {}}
for filename in ['balls', 'levelinit']:
    for _, kind, name, data in rows(filename):
        if kind == 52 and name in ['Physicalize_GameBall', 'Physicalize_Balls', 'Physicalize_Convex', 'Physicalize_Floors']:
            result['tables'][name] = {'source': filename + '.nmo', 'rows': table(data)}
result['globals'] = {}
for _, kind, name, data in rows('gameplay'):
    if kind == 45 and name in ['Gravity', 'Physic Time Factor'] and name not in result['globals']:
        result['globals'][name] = list(struct.unpack('<' + 'f' * ((len(data) - 32) // 4), data[32:]))
result['flames'] = {}
for _, kind, name, data in rows('fire'):
    if kind == 45 and name in ['Emission Delay', 'Speed', 'Speed Variance', 'Lifespan', 'Lifespan Variance', 'Initial Size', 'Initial Size Variance', 'Ending Size'] and name not in result['flames']:
        result['flames'][name] = round(struct.unpack_from('<f', data, 32)[0], 6)
print(json.dumps(result, indent=2))
