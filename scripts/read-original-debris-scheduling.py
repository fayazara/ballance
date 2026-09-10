#!/usr/bin/env python3
"""Recover material pool timer flags, early restart exits, and fade dispatch."""
import argparse,hashlib,json,struct
from original_chunks import ChunkDump,chunks
p=argparse.ArgumentParser();p.add_argument('dump');a=p.parse_args();d=ChunkDump(a.dump)
rows=[]
for kind,timer,flag,setter,clear,idle,running,fade in [('wood',665,596,760,671,598,656,648),('paper',592,607,780,682,687,676,647),('stone',708,610,786,699,721,713,649)]:
    def inputref(i):return struct.unpack_from('<I',d.rows[i][2],24)[0]
    def outputrefs(i):
        raw=d.rows[i][2];o=chunks(raw)[0x20]
        count,=struct.unpack_from('<I',raw,o)
        return list(struct.unpack_from('<'+'I'*count,raw,o+4))
    setb=d.definition(setter);clearb=d.definition(clear)
    assert d.value(setb['inputs'][0]) is True and d.value(clearb['inputs'][0]) is False
    assert outputrefs(setb['outputs'][0])==outputrefs(clearb['outputs'][0])==[flag]
    assert inputref(d.definition(idle)['inputs'][0])==inputref(d.definition(running)['inputs'][0])==flag
    t=d.definition(timer);assert t['version']==0x10005 and d.value(t['inputs'][0])==20000
    rows.append(dict(material=kind,flag=flag,setFlag=setter,clearFlag=clear,timer=timer,idleSwitch=idle,runningSwitch=running,fadeInput=fade))
links=[]
for parent in [754,796]:
    for i in d.definition(parent)['links']:
        delay,duplicate,source,target=struct.unpack_from('<HHII',d.rows[i][2],16)
        assert delay==duplicate
        links.append(dict(index=i,delayFrames=delay,source=source,destination=target))
for i,expected in {862:(0,795,488),869:(0,489,832),872:(0,833,845),873:(2,846,479),859:(0,480,574)}.items():
    delay,source,target=expected
    assert struct.unpack_from('<HHII',d.rows[i][2],16)==(delay,delay,source,target)
    links.append(dict(index=i,delayFrames=delay,source=source,destination=target))
print(json.dumps(dict(source='Gameplay.nmo: Fadeout Manager 754 / set Piecesflag 796',dumpSha256=hashlib.sha256(open(a.dump,'rb').read()).hexdigest(),pools=rows,links=links),indent=2))
