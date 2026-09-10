#!/usr/bin/env python3
"""Recover the ending assembly and its activation graph without executing NMO code."""
import argparse
import json
import struct
from original_chunks import ChunkDump

parser = argparse.ArgumentParser()
parser.add_argument('dump')
parser.add_argument('gameplay_dump')
args = parser.parse_args()
d = ChunkDump(args.dump)

def values(index):
    return [d.value(p) for p in d.definition(index).get('inputs', [])]

def chain(compound):
    """Follow the compound's create path, preserving authored insertion order."""
    root = d.definition(compound)
    children = {d.definition(i)['inIO'][0]: i for i in root['children']}
    links = {a: b for a, b in (struct.unpack_from('<II', d.rows[i][2], len(d.rows[i][2])-8) for i in root['links'])}
    current = root['inIO'][0]; result = []
    while links[current] != root['outIO'][0]:
        child = children[links[current]]
        assert child not in result
        result.append(child); current = d.definition(child)['outIO'][0]
    return result

def part(index, target=None):
    b = d.definition(index)
    p = [d.value(x) for x in b['inputs'][:10]]
    local = [d.value(x) for x in b['locals']]
    assert local[1:3] == [0, 0]
    result = dict(index=index, target=target or b['target'], fixed=p[0], friction=p[1], restitution=p[2], mass=p[3],
                  collisionGroup=p[4], startFrozen=p[5], enableCollision=p[6], automaticMassCenter=p[7],
                  linearDamping=p[8], angularDamping=p[9], massCenter=local[3])
    if target is None: result['hulls'] = [d.value(x) for x in b['inputs'][11:11+local[0]]]
    else: assert local[0] == 1 # Parameter selector -> Get Mesh supplies each selected object's own convex hull.
    return result

plates = values(699); balloon_parts = values(898)
assert plates == [f'PE_Balloon_Platte{i:02}' for i in range(1,9)]
assert balloon_parts == [f'PE_Balloon_Ballon_Seil{i:02}' for i in range(1,5)] + [f'PE_Balloon_Ballon{i:02}' for i in range(1,5)]
parts = [part(952), part(832)] + [part(872, p) for p in balloon_parts] + [part(733, p) for p in plates]

hinges = []
for index in chain(381) + chain(576):
    anchor, frame, enabled, lower, upper = values(index)
    hinges.append(dict(index=index, target=d.definition(index)['target'], anchorObject=anchor, frame=d.frame(frame),
                       limitsEnabled=enabled, lowerLimit=lower, upperLimit=upper))
sliders = []
for index in [639,659]:
    anchor, a, b, enabled, lower, upper = values(index)
    sliders.append(dict(index=index, target=d.definition(index)['target'], anchorObject=anchor, frame1=d.frame(a), frame2=d.frame(b),
                        limitsEnabled=enabled, lowerLimit=lower, upperLimit=upper))
anchor, p1, f1, p2, f2, length, constant, axial, damping = values(620)
spring = dict(target=d.definition(620)['target'], anchorObject=anchor, position1=p1, frame1=d.frame(f1), position2=p2, frame2=d.frame(f2),
              length=length, constant=constant, axialDamping=axial, globalDamping=damping)

def force(index):
    position, pf, direction, df, impulse = values(index)
    return dict(index=index, target=d.definition(index)['target'], position=position, positionFrameName=pf,
                positionFrame=d.frame(pf), direction=direction, directionFrame=d.frame(df), impulse=impulse)

def proximity(index):
    p=values(index); b=d.definition(index); local=[d.value(x) for x in b['locals']]
    assert p[1:4] == ['Ball_Pos_Frame Frame','PE_Balloon_Platform',False] and local[2] == 4
    return dict(distance=p[0], axes=local[3], exactnessMin=p[4], exactnessMax=p[5], minFrameDelay=p[6], maxFrameDelay=p[7])

# The source wires approach -> wake -> balloon forces -> boarding -> departure
# -> two messages -> removal of the platform/first-plate hinge (524 only).
for edge in [(1205,1167),(1168,1140),(1142,1172),(1174,577),(579,1228),(1229,1197),(1198,573),(573,508)]:
    assert edge in d.links, edge
assert d.definition(1171)['target'] == 'PE_Balloon_Platform'
assert chain(672) == [639,659,620]
result = dict(source='PE_Balloon.nmo', parts=parts, hinges=hinges, sliders=sliders, spring=spring,
              forces=[force(i) for i in chain(1144)], departureForce=force(594), approach=proximity(1227), boarding=proximity(1196),
              wakeTarget='PE_Balloon_Platform', releaseHinge=524)
gameplay = ChunkDump(args.gameplay_dump)
def gameplay_values(index):
    return [gameplay.value(p) for p in gameplay.definition(index)['inputs']]
assert gameplay_values(5800) == [3000.0, 0.0, 1.0]
assert gameplay_values(5726) == [10000.0, 23000.0]
assert [gameplay_values(i) for i in gameplay.definition(5664)['children']] == [[1], [28], [57]]
result['presentation'] = dict(source='Gameplay.nmo', skyFadeMs=gameplay_values(5800)[0],
                              waitMs=gameplay_values(5726)[0], lastLevelWaitMs=gameplay_values(5726)[1],
                              skipKeys=['Escape','Enter','Space'])
print(json.dumps(result, indent=2))
