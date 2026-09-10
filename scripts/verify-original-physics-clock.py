#!/usr/bin/env python3
"""Read-only x87 arithmetic check for physics_RT.dll's PostProcess clock."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import struct

p=argparse.ArgumentParser();p.add_argument('disassembly');p.add_argument('dll');a=p.parse_args()
binary=Path(a.dll).read_bytes()
pe=struct.unpack_from('<I',binary,60)[0]
count=struct.unpack_from('<H',binary,pe+6)[0];size=struct.unpack_from('<H',binary,pe+20)[0]
base=struct.unpack_from('<I',binary,pe+52)[0]
sections=[struct.unpack_from('<8sIIIIIIHHI',binary,pe+24+size+40*i) for i in range(count)]
def read(address,size):
    for _,_,va,raw_size,raw,*_ in sections:
        if va<=address-base and address-base+size<=va+raw_size:
            return binary[raw+address-base-va:raw+address-base-va+size]
    raise ValueError(hex(address))
instructions=[]
for line in Path(a.disassembly).read_text().splitlines():
    m=re.match(r'^([0-9a-f]+):\s+((?:[0-9a-f]{2}\s+)+)\s*(\w+)\s*(.*)$',line)
    if m and 0x10007cef<=int(m[1],16)<=0x10007d1a:
        code=bytes.fromhex(m[2]);assert read(int(m[1],16),len(code))==code
        instructions.append((int(m[1],16),m[3],m[4].strip()))
assert len(instructions)==10
constants={address:Fraction(struct.unpack('<f',read(address,4))[0]) for address in [0x10063378,0x10063374,0x100632a8]}
assert constants[0x10063378]==3 and constants[0x10063374]==Fraction(1,4)
def rounded(value,bits):
    if not value:return Fraction(0)
    sign=-1 if value<0 else 1;value=abs(value)
    exponent=value.numerator.bit_length()-value.denominator.bit_length()
    power=lambda e:Fraction(2)**e
    if value<power(exponent):exponent-=1
    unit=power(exponent-bits+1);ratio=value/unit
    q,r=divmod(ratio.numerator,ratio.denominator)
    if 2*r>ratio.denominator or (2*r==ratio.denominator and q%2):q+=1
    return sign*q*unit
def execute(previous,delta,factor):
    memory={'dword ptr [eax + 0x38]':rounded(Fraction(delta),24),
            'dword ptr [ebx + 0xc8]':Fraction(previous),'dword ptr [ebx + 0xd0]':factor}
    memory.update({f'dword ptr [{hex(address)}]':value for address,value in constants.items()})
    stack=[]
    for _,op,arg in instructions:
        if op in ['mov','test']:continue
        if op=='fld':stack.insert(0,memory[arg])
        elif op=='fmul':stack[0]=rounded(stack[0]*memory[arg],64)
        elif op=='faddp':
            assert arg=='st(1), st';value=stack.pop(0);stack[0]=rounded(stack[0]+value,64)
        elif op=='fst':memory[arg]=rounded(stack[0],24) # FST does not round the retained x87 value.
        elif op=='fstp':memory[arg]=rounded(stack.pop(0),24)
        else:raise ValueError((op,arg))
    assert not stack
    return memory['dword ptr [ebx + 0xc8]'],memory['dword ptr [ebx + 0xcc]']

cases=[]
for hz in [30,60,90,120,132,144]:
    previous=Fraction(0);factor=rounded(constants[0x100632a8]*2,24)
    deltas=[1000/hz]*12+[50,4,33,0,16,8,20,10]
    for delta in deltas:
        filtered,seconds=execute(previous,delta,factor)
        cases.append(dict(previousMs=float(previous),deltaMs=delta,timeFactor=2,
                          filteredMs=float(filtered),physicsSeconds=float(seconds)))
        previous=filtered
previous=Fraction(0)
for delta in [1000,1000,1000,1000,1000/60]:
    filtered,seconds=execute(previous,delta,factor)
    cases.append(dict(previousMs=float(previous),deltaMs=delta,timeFactor=2,
                      filteredMs=float(filtered),physicsSeconds=float(seconds)))
    previous=filtered
print(json.dumps(dict(dllSha256=hashlib.sha256(binary).hexdigest(),
    instructionRange=['0x10007cef','0x10007d1a'],cases=cases),indent=2))
