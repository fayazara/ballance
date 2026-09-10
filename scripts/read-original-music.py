#!/usr/bin/env python3
"""Recover music selection and timing from read-only Virtools chunk dumps."""
import argparse,json,re
from pathlib import Path
from original_chunks import ChunkDump,table
p=argparse.ArgumentParser();p.add_argument('dumps',type=Path);a=p.parse_args()
d=ChunkDump(a.dumps/'sound-chunks.tsv');level=ChunkDump(a.dumps/'levelinit-chunks.tsv')
def values(i):return [d.value(j) for j in d.definition(i).get('inputs',[])]
assert [level.value(j) for j in level.definition(69)['inputs']][1]==7
levels=table(level.rows[4055][2]);assert len(levels)==12
assert values(1373)==values(1485)==[1.0]*3
assert values(1344)==values(1472)==[0.0,0.0,False]
assert values(1649)==[0.0,0.0,True]
files=ChunkDump(a.dumps/'musicfiles-chunks.tsv')
recordings={name:re.search(rb'([A-Za-z_0-9]+)\.wav',raw)[1].decode() for kind,name,raw in files.rows.values() if kind==25}
assert all(recordings[f'Music_Atmo_{i}']==f'Music_Atmo_{i}' for i in range(1,4))
print(json.dumps(dict(source='Sound.nmo, Levelinit.nmo AllLevel column 7, Musicfiles.nmo',
 levelThemes=[row['Music'] for row in levels],ambient=[recordings[f'Music_Atmo_{i}'] for i in range(1,4)],
 themeSuffixes=[level.value(j) for j in level.definition(41)['inputs']],
 ambientDelayMs=values(1329),themeDelayMs=values(1441),themeStartDelayMs=values(1899)[0],
 musicFadeMs=values(1575)[0],checkpointStart=values(1764),checkpointApproach=values(1773),checkpointFinish=values(1806),
 resetDelayMs=values(1755)[0],proximity=dict(distance=values(1680)[0],axes=d.value(d.definition(1680)['locals'][3]),
 exactnessMin=values(1680)[4],exactnessMax=values(1680)[5],minFrameDelay=values(1680)[6],maxFrameDelay=values(1680)[7])),indent=2))
