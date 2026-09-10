#!/usr/bin/env python3
"""Recover all six stationary red trail emitters from the user's original module."""
import hashlib
import json
import struct
from pathlib import Path
from original_chunks import ChunkDump, chunks

source=Path('.local/reference/chunks/P_Extra_Point.tsv')
dump=ChunkDump(source)
rows=[]
for index,(kind,name,_) in dump.rows.items():
    if kind!=8 or name!='TT_TimedependentPointParticlesystem':
        continue
    block=dump.definition(index)
    inputs={dump.rows[i][1]:i for i in block['inputs']}
    def value(name):
        return dump.value(inputs[name])
    def color(name):
        reference=struct.unpack_from('<I',dump.rows[inputs[name]][2],24)[0]
        data=dump.rows[reference][2]
        return list(struct.unpack_from('<4f',data,chunks(data)[0x40]+16))
    row={'emissionRate':value('Emission Delay'),'lifetimeMs':value('Lifespan'),
         'capacity':value('Maximum Number'),'startSize':value('Initial Size'),
         'endSize':value('Ending Size'),'startColor':color('Initial Color and Alpha'),
         'endColor':color('Ending Color and Alpha'),'texture':value('Texture')}
    assert value('Speed')==0
    rows.append((index,row))
assert len(rows)==6
assert all(row==rows[0][1] for _,row in rows)
result={'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'emitterBlocks':[index for index,_ in rows],**rows[0][1]}
motion=dump.definition(132)
assert dump.rows[132][1]=='TT Extra'
inputs={dump.rows[i][1]:i for i in motion['inputs']}
result['motion']={name:dump.value(i) for name,i in inputs.items() if name in [
    'Number of Smallballs','Activationdistance','Extra_Points CollDistance','Rotationspeed',
    'Awayforce','Awaydamping','Force','Damping','Forcewidth','Flyawaytime','Exactness Framedelay']}
assert result['motion']['Number of Smallballs']==6
assert all(link in dump.links for link in [(89,370),(371,234),(90,376),(377,235),(236,243),(244,301),(302,161),(162,172)])
root=dump.frame('P_Extra_Point_MF')[12:15]
result['satellitePositions']=[]
for n in range(1,7):
    raw=next(raw for kind,name,raw in dump.rows.values() if kind==37 and name==f'P_Extra_Point_Ball{n}')
    position=struct.unpack_from('<12f',raw,chunks(raw)[0x100000]+8)[9:]
    result['satellitePositions'].append([p-r for p,r in zip(position,root)])
result['activationPoints']=dump.value(238)
result['satellitePoints']=dump.value(240)
Path('src/game/original-point-trails-data.json').write_text(json.dumps(result,indent=2)+'\n')
print('Recovered six matching original point trail emitters.')
