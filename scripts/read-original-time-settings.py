#!/usr/bin/env python3
"""Recover both Menu.nmo timing branches; no original code is executed."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
from original_chunks import ChunkDump

parser=argparse.ArgumentParser()
parser.add_argument('menu_dump',type=Path)
args=parser.parse_args()
dump=ChunkDump(args.menu_dump)
parent=dump.definition(11762)
assert dump.rows[11762][1]=='Update Settings'
switch=dump.definition(11512)
branches=[]
for index,link,output in [(11538,11748,0),(11565,11749,1)]:
    assert index in parent['children'] and link in parent['links']
    behavior=dump.definition(index)
    assert dump.rows[index][1]=='Time Settings'
    assert bytes.fromhex('8c0f0a065f3b2009') in dump.rows[index][2]
    delay,current,source,destination=struct.unpack_from('<HHII',dump.rows[link][2],16)
    assert delay==current==0
    assert (source,destination)==(switch['outIO'][output],behavior['inIO'][0])
    values=[dump.value(i) for i in behavior['inputs']]
    assert values==[2 if output==0 else 3,60,1.,1,60,1.,1000.]
    branches.append(dict(behavior=index,link=link,frameMode=values[0],frameLimit=values[1],
        timeScale=values[2],behaviorMode=values[3],behaviorLimit=values[4],
        minimumDeltaMs=values[5],maximumDeltaMs=values[6]))
print(json.dumps(dict(source='Menu.nmo: Update Settings / Time Settings',
    dumpSha256=hashlib.sha256(args.menu_dump.read_bytes()).hexdigest(),branches=branches),indent=2))
