#!/usr/bin/env python3
"""Recover global DepthTest selection, cutoff and cleanup from the supplied dumps."""
import argparse
import json
import struct
from pathlib import Path
from original_chunks import ChunkDump, chunks, table

parser = argparse.ArgumentParser()
parser.add_argument('dump_directory', type=Path)
root = parser.parse_args().dump_directory
d = ChunkDump(root / 'gameplay-chunks.tsv')
level = ChunkDump(root / 'levelinit-chunks.tsv')

def source(index):
    return struct.unpack_from('<I', d.rows[index][2], 24)[0]

def destinations(index):
    data = d.rows[index][2]
    offset = chunks(data)[0x20]
    count, = struct.unpack_from('<I', data, offset)
    return list(struct.unpack_from('<' + 'I' * count, data, offset + 4))

# Operation GUIDs: Get Bounding Box -> Min -> Get Y; then minDepth - 200.
for index, guid in [(1808, (0x31a7649f, 0x305e5164)), (1795, (0x6ea214cb, 0x43be6b56)),
                    (1778, (0x389f72bd, 0x7aef3482)), (1917, (0x389f72bd, 0x7aef3482)),
                    (1927, (0x67641171, 0x6499077a))]:
    assert tuple(d.value(i) for i in d.behavior(index)['locals'][1:]) == guid
assert source(1814) == 1774 and source(1815) == 881
assert source(1836) == 1835 and source(1837) == 881
assert d.value(1813) == d.value(1834) == 3  # strict less-than
assert destinations(1799) == destinations(1923) == [881]
assert destinations(1906) == [1847]
assert source(1920) == 881 and source(1922) == 1921
assert d.value(1842) == [0, 0, 0] and d.value(1846) is True
assert d.value(1853) is False
for link in [(1827,1759),(1760,1779),(1782,1801),(1802,1787),(1788,1769),(1770,1809),
             (1810,1796),(1797,1780),(1811,1780),(1781,1828),(1828,1939),
             (1939,1918),(1919,1856),(1857,1901),(1904,1909),(1910,1830),
             (1831,1868),(1870,1850),(1851,1839),(1840,1902),(1832,1902),(1903,1901)]:
    assert link in d.links, link
# 1868 is Physicalize's Destroy input, followed by Hide and Set Position.
assert d.behavior(1900,33)['inIO'][1] == 1868
assert d.behavior(1900,33)['target'] == 'Object'
assert struct.unpack_from('<I', d.rows[1932][2], 16)[0] == 0x10001
for link in [(3205,3230),(3233,3213),(3214,3223),(3226,3197),(3198,3224),(3225,3231)]:
    assert link in level.links, link
groups = [row['Groupname'] for row in table(level.rows[4065][2])]
print(json.dumps(dict(source='Gameplay.nmo / Levelinit.nmo', boundsGroup=d.value(1761),
                     depthGroup=d.value(1858), initialDepth=d.value(881), margin=d.value(1921),
                     groups=groups, comparison='less-than', position=d.value(1842),
                     hideHierarchy=d.value(1853), moveHierarchy=d.value(1846), sweepDelayFrames=1), indent=2))
