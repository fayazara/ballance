"""Read selected Virtools parameters and primitive behaviors from dump-chunks TSV.

This is a read-only metadata reader, not an interpreter for original scripts.
Unsupported storage modes and behavior layouts fail instead of guessing values.
"""
import struct
from pathlib import Path

def chunks(data):
    result, offset = {}, 8
    while offset:
        tag, following = struct.unpack_from('<II', data, offset)
        result[tag] = offset + 8
        offset = 8 + following * 4 if following else 0
    return result

class ChunkDump:
    def __init__(self, path):
        self.rows = {int(p[0]): (int(p[2]), p[3], bytes.fromhex(p[4]))
                     for line in Path(path).read_text().splitlines() if len(p := line.split('\t')) == 5}
        self.links = [struct.unpack_from('<II', row[2], len(row[2]) - 8)
                      for row in self.rows.values() if row[0] == 6]

    def value(self, index):
        kind, name, data = self.rows[index]
        if kind == 2: return self.value(struct.unpack_from('<I', data, 24)[0])
        if kind not in [3, 45]: return name
        offset = chunks(data)[0x40]
        guid = data[offset:offset + 8].hex()
        mode, = struct.unpack_from('<I', data, offset + 8)
        if mode == 2:
            ref, = struct.unpack_from('<I', data, offset + 12)
            return self.rows[ref][1] if ref != 0xffffffff else name
        assert mode == 1, (index, name, mode)
        length, = struct.unpack_from('<I', data, offset + 12)
        raw = data[offset + 16:offset + 16 + length]
        if guid == 'e210d06bea175611': return raw.split(b'\0')[0].decode('windows-1252')
        if guid == '8e2ad51a2019745e': return bool(struct.unpack('<I', raw)[0])
        if guid in ['3f4c8847202c2c43', '2b42b4544f0f0f73']: return struct.unpack('<f', raw)[0]
        if len(raw) == 4: return struct.unpack('<i', raw)[0]
        if len(raw) == 12: return list(struct.unpack('<3f', raw))
        raise ValueError((index, name, guid))

    def behavior(self, index, target_class=None):
        data = self.rows[index][2]
        offset = chunks(data)[0x20]
        words = struct.unpack('<' + 'I' * ((len(data) - offset) // 4), data[offset:])
        # A non-default execution priority adds a word after the primitive's version.
        position = 4 + int(bool(words[0] & 4))
        result = {'version': words[3]}
        if target_class is not None:
            assert words[position] == target_class, (index, words)
            result['target'] = self.value(words[position + 1])
            position += 2
        mask = words[position]; position += 1
        for flag, name in [(0x200, 'inputs'), (0x400, 'outputs'), (0x20000, 'locals'), (0x800, 'inIO'), (0x1000, 'outIO')]:
            if mask & flag:
                count = words[position]
                result[name] = list(words[position + 1:position + 1 + count]); position += count + 1
        return result

    def frame(self, name):
        data = next(row[2] for row in self.rows.values() if row[0] == 33 and row[1] == name)
        floats = struct.unpack_from('<12f', data, chunks(data)[0x100000] + 8)
        return [c for i in range(4) for c in [*floats[i * 3:i * 3 + 3], 1 if i == 3 else 0]]

    def physicalize(self, index):
        b = self.behavior(index, 33)
        p = [self.value(i) for i in b['inputs']]
        local = [self.value(i) for i in b['locals']]
        assert local[1:3] == [0, 0], 'Only convex shapes are handled here'
        return dict(index=index, target=b['target'], fixed=p[0], friction=p[1], restitution=p[2], mass=p[3],
                    collisionGroup=p[4], startFrozen=p[5], enableCollision=p[6], automaticMassCenter=p[7],
                    linearDamping=p[8], angularDamping=p[9], hulls=p[11:11 + local[0]], massCenter=local[3])
