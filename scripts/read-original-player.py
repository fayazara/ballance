#!/usr/bin/env python3
"""Recover shape and mass-center settings on ActiveBall's creation paths."""
import argparse
import json
from original_chunks import ChunkDump

parser = argparse.ArgumentParser(); parser.add_argument('gameplay_dump')
d = ChunkDump(parser.parse_args().gameplay_dump)
result = {'source': 'Gameplay.nmo: ActiveBall creation', 'bodies': []}
for index, link in [(233,(172,201)), (262,(173,234)), (291,(174,263))]:
    b = d.behavior(index, 33); p = b['inputs']; local = [d.value(i) for i in b['locals']]
    assert b['target'] == 'ActiveBall' and link in d.links and b['inIO'][0] == link[1]
    row = dict(index=index, fixed=d.value(p[0]), startFrozen=d.value(p[5]), enableCollision=d.value(p[6]),
        automaticMassCenter=d.value(p[7]), massCenter=local[3], shape='convex' if local[0] else 'sphere')
    if row['shape'] == 'sphere': row.update(center=d.value(p[11]), radius=d.value(p[12]))
    assert local[:3] in [[1,0,0], [0,1,0]]
    result['bodies'].append(row)
wake = d.behavior(1653, 33)
assert wake['target'] == 'ActiveBall'
result['input'] = {'wakeBehavior': 1653, 'keys': []}
for name, key, force in [('right',1613,1589), ('left',1635,1627), ('backward',1605,1649), ('forward',1597,1667)]:
    event, controller = d.behavior(key), d.behavior(force, 33)
    assert controller['target'] == 'ActiveBall'
    assert all((a,b) in d.links for a,b in zip(event['outIO'],controller['inIO']))
    assert all((a,wake['inIO'][0]) in d.links for a in controller['outIO'])
    params = [d.value(p) for p in controller['inputs']]
    assert params[0] == [0,0,0] and params[1] == 'ActiveBall'
    assert params[3] == 'Cam_OrientRef Frame'
    result['input']['keys'].append(dict(name=name, keyBehavior=key, forceBehavior=force,
        direction=params[2], directionReference=params[3], wakeOnCreate=True, wakeOnShutdown=True))
print(json.dumps(result, indent=2))
