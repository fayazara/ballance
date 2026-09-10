#!/usr/bin/env python3
"""Recover Sound.nmo settings and authored contact attributes without execution."""
import argparse
import json
from pathlib import Path
import re
import struct
import subprocess
from original_chunks import ChunkDump, chunks, table

p=argparse.ArgumentParser();p.add_argument('dump_directory',type=Path);p.add_argument('game',type=Path);p.add_argument('reader',type=Path)
a=p.parse_args();d=ChunkDump(a.dump_directory/'sound-chunks.tsv')
def values(index):return [d.value(i) for i in d.definition(index).get('inputs',[])]

def attribute_names(raw):
    cursor=chunks(raw)[0x52]
    def uint():
        nonlocal cursor
        v=struct.unpack_from('<I',raw,cursor)[0];cursor+=4;return v
    def string():
        nonlocal cursor
        n=uint();s=raw[cursor:cursor+n].split(b'\0')[0].decode('windows-1252');cursor+=(n+3)//4*4;return s
    categories,count=uint(),uint()
    for _ in range(categories):
        exists=uint();assert exists in [0,1]
        if exists:string();uint()
    result={}
    for index in range(count):
        exists=uint();assert exists in [0,1]
        if exists:
            result[index]=string()
            for _ in range(5):uint() # parameter GUID, category and two attribute flags/class fields
    assert cursor==len(raw), (cursor,len(raw))
    return result

module_ids={}
for source in sorted((a.game/'3D_Entities/PH').glob('*.nmo')):
    if not re.fullmatch(r'(P_(Box|Dome|Ball_(Wood|Paper|Stone)|Modul_(01|03|08|17|18|19|25|26|29|30|34|37|41))|PE_Balloon)',source.stem,re.I):continue
    dump=a.dump_directory/(source.stem.lower()+'-audio-chunks.tsv')
    dump.write_bytes(subprocess.check_output([str(a.reader),str(source)]))
    module=ChunkDump(dump)
    managers=subprocess.check_output([str(a.reader),str(source),'--managers']).decode().splitlines()
    manager=next((bytes.fromhex(line.split('\t')[2]) for line in managers if line.startswith('1025778790\t0\t')),None)
    names=attribute_names(manager) if manager else {}
    result={}
    for index,(kind,name,raw) in module.rows.items():
        if kind not in [33,41] or 0x11 not in chunks(raw):continue
        offset=chunks(raw)[0x11];count=struct.unpack_from('<I',raw,offset)[0]
        refs=struct.unpack_from('<'+'I'*count,raw,offset+4)
        at=offset+4*(count+1)
        n,g1,g2=struct.unpack_from('<III',raw,at);assert (n,g1,g2)==(count,1025778790,0)
        ids=struct.unpack_from('<'+'I'*count,raw,at+12)
        contacts={}
        for ref,attribute in zip(refs,ids):
            if names[attribute] in ['Coll Detection ID','Continuous Contact ID']:
                contacts['hit' if names[attribute]=='Coll Detection ID' else 'roll']=module.value(ref)
        if contacts:result[name]=contacts
    module_ids[source.stem.lower()]=result

rows=table(d.rows[2093][2]);materials={row['Active Ball'].removeprefix('Ball_').lower():{k:v for k,v in row.items() if k!='Active Ball'} for row in rows}
assert values(392)==values(448)==[0.30000001192092896]*2
assert values(312)[0]=='0.5+(a*0.01)'
assert [d.value(i) for i in d.definition(342)['locals'][1:]]==[0x38996b85,0x334e35c2] # Multiplication
impacts=[]
for index,column in [(266,'HitStone'),(248,'HitWood'),(30,'HitMetal'),(49,'HitDome')]:
    minimum,maximum,cooldown,group=values(index)
    impacts.append(dict(index=index,minimum=minimum,maximum=maximum,cooldown=cooldown,group=group,column=column))
level=ChunkDump(a.dump_directory/'levelinit-chunks.tsv')
floor_groups={k:[level.value(i) for i in level.definition(index)['inputs']] for k,index in [('roll',3398),('hit',3409)]}
assert floor_groups=={k:[f'Sound_{k.title()}ID_{i:02}' for i in range(1,4)] for k in ['roll','hit']}
print(json.dumps(dict(source='Sound.nmo / Levelinit.nmo / PH object attributes',materials=materials,
                     rolling=dict(startDelay=values(392)[0],endDelay=values(392)[1],groupCount=3,gainMultiplier=values(342)[1],pitchBase=0.5,pitchMultiplier=0.01),
                     impacts=impacts,floorGroups=floor_groups,moduleIds=module_ids),indent=2))
