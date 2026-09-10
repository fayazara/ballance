#!/usr/bin/env python3
"""Validate the first/next checkpoint activation links in Gameplay.nmo."""
import hashlib,json,struct
from pathlib import Path
from original_chunks import ChunkDump
path=Path('.local/reference/chunks/Gameplay.tsv')
d=ChunkDump(path)
graphs=[]
for index,name in [(5258,'activate next Checkpoint'),(5476,'set first Checkpoint')]:
    assert d.rows[index][1]==name
    definition=d.definition(index)
    links=[]
    for link in definition['links']:
        initial,current,source,destination=struct.unpack_from('<HHII',d.rows[link][2],16)
        assert initial==current
        assert initial==(2 if link==5250 else 0)
        links.append(dict(index=link,delayFrames=initial,source=source,destination=destination))
    graphs.append(dict(index=index,name=name,links=links))
assert d.definition(5173)['outIO']==[5168]
assert d.definition(5220)['inIO']==[5214]
assert d.rows[5173][1]=='Activate Script' and d.rows[5220][1]=='Set World Matrix'
assert d.value(5163) is False and d.value(5199) is True
assert next(l for l in graphs[0]['links'] if l['index']==5250)==dict(index=5250,delayFrames=2,source=5168,destination=5214)
print(json.dumps(dict(source=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),nextActivationFrames=2,firstActivationFrames=0,graphs=graphs),indent=2))
