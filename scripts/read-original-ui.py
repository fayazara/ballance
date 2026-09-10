#!/usr/bin/env python3
"""Recover Ballance's menu rectangles, texture regions, font widths and labels."""
import argparse,hashlib,json,struct
from pathlib import Path
from original_chunks import ChunkDump,chunks,table
p=argparse.ArgumentParser();p.add_argument('dumps',type=Path);a=p.parse_args()
menu=ChunkDump(a.dumps/'Menu.tsv');language=ChunkDump(a.dumps/'Language.tsv');base=ChunkDump(a.dumps/'base.tsv');scene=ChunkDump(a.dumps/'MenuLevel.tsv')
sprites={}
for i,(kind,name,raw) in menu.rows.items():
    if kind!=27:continue
    o=chunks(raw)[0x10f000];flags,=struct.unpack_from('<I',raw,o)
    assert flags&0x200, name
    rect=list(struct.unpack_from('<4f',raw,o+4))
    uv=list(struct.unpack_from('<4f',raw,o+20)) if flags&0x10000 else [0,0,1,1]
    sprites[name]=dict(rect=rect,uv=uv,textOnly=0x200000 not in chunks(raw))
font=table(menu.rows[15362][2]);assert len(font)==255
assert round(font[48]['vstart']*16)==3
labels=[r['english'] for r in table(language.rows[0][2])]
assert labels[:5]==['Start','Highscore','Options','Exit','Credits']
print(json.dumps(dict(
 source='Menu.nmo, Language.nmo, MenuLevel.nmo and base.cmo',
 hashes={name:hashlib.sha256((a.dumps/(name+'.tsv')).read_bytes()).hexdigest() for name in ['Menu','Language','MenuLevel','base']},
 sprites=sprites,font=font,labels=labels,
 credits=table(menu.rows[15407][2]),
 highscores=[table(next(v[2] for v in base.rows.values() if v[1]==f'DB_Highscore_Lv{n:02}')) for n in range(1,13)],
 menuCamera=list(struct.unpack_from('<12f',scene.rows[497][2],chunks(scene.rows[497][2])[0x100000]+8)),
 menuTarget=scene.frame('Cam_MenuLevel_Target'),
),indent=2))
