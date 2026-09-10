#!/usr/bin/env python3
"""Generate numeric fixtures by interpreting the recovered x87 arithmetic only.

Consumes objdump's Intel disassembly of TT_Toolbox_RT.dll. This never loads or
executes the DLL. It models 64-bit x87 significands, nearest-even rounding and
single-precision stores, not the game runtime or its FPU control-word setup.
"""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import struct

parser=argparse.ArgumentParser()
parser.add_argument('disassembly')
parser.add_argument('dll')
args=parser.parse_args()
binary=Path(args.dll).read_bytes()
pe=struct.unpack_from('<I',binary,0x3c)[0]
section_count=struct.unpack_from('<H',binary,pe+6)[0]
optional_size=struct.unpack_from('<H',binary,pe+20)[0]
image_base=struct.unpack_from('<I',binary,pe+24+28)[0]
sections=[struct.unpack_from('<8sIIIIIIHHI',binary,pe+24+optional_size+40*i) for i in range(section_count)]
def at(address,size):
    rva=address-image_base
    for _,virtual_size,virtual_address,raw_size,raw_address,*_ in sections:
        if virtual_address<=rva and rva+size<=virtual_address+raw_size:
            return binary[raw_address+rva-virtual_address:raw_address+rva-virtual_address+size]
    raise ValueError(hex(address))

instructions=[]
for line in Path(args.disassembly).read_text().splitlines():
    match=re.match(r'^([0-9a-f]+):\s+((?:[0-9a-f]{2}\s+)+)\s*(\w+)\s*(.*)$',line)
    if not match: continue
    address=int(match[1],16)
    if 0x10004c14<=address<=0x10004c67 or 0x10004d18<=address<=0x10004da5:
        code=bytes.fromhex(match[2]);assert at(address,len(code))==code
        instructions.append((address,match[3],match[4].strip()))
assert instructions[0][0]==0x10004c14 and instructions[-1][0]==0x10004da5
assert len([i for i in instructions if i[1]=='fstp'])==12

def quantize(value,bits):
    """Round a normal finite binary rational to a significand, ties to even."""
    if not value: return Fraction(0)
    sign=-1 if value<0 else 1
    value=abs(value)
    exponent=value.numerator.bit_length()-value.denominator.bit_length()
    power=lambda e:Fraction(2**e) if e>=0 else Fraction(1,2**-e)
    if value<power(exponent): exponent-=1
    unit=power(exponent-bits+1)
    scaled=value/unit
    quotient,remainder=divmod(scaled.numerator,scaled.denominator)
    if 2*remainder>scaled.denominator or (2*remainder==scaled.denominator and quotient%2):quotient+=1
    return sign*quotient*unit

def single(value):return quantize(Fraction(value),24)

def execute(case):
    memory={}
    for base,key in [(0x48,'current'),(0x60,'target'),(0x78,'previous'),(0x18,'force')]:
        for axis,value in enumerate(case[key]):memory[base+axis*4]=single(value)
    for addresses,key in [([0x28,0x30,0x38],'damping'),([0x24,0x2c,0x34],'offset')]:
        for address,value in zip(addresses,case[key]):memory[address]=single(value)
    stack=[];esp=0
    def location(operand):
        match=re.fullmatch(r'dword ptr \[esp \+ (0x[0-9a-f]+)\]',operand)
        assert match,operand
        return esp+int(match[1],16)
    def read(operand):
        if operand=='st(0)':return stack[0]
        if operand=='dword ptr [eax + 0x4]':return single(case['deltaMs'])
        if operand=='dword ptr [0x10040024]':return Fraction(struct.unpack('<f',at(0x10040024,4))[0])
        return memory[location(operand)]
    for address,op,operand in instructions:
        if address==0x10004d18:esp=0 # parameter calls have returned and popped their arguments
        if op=='push':esp-=4
        elif op in ['lea','mov']:pass # integer bookkeeping outside this arithmetic block
        elif op=='fld':stack.insert(0,read(operand))
        elif op=='fstp':memory[location(operand)]=quantize(stack.pop(0),24)
        elif op=='fmul':stack[0]=quantize(stack[0]*read(operand),64)
        elif op=='fsub':stack[0]=quantize(stack[0]-read(operand),64)
        elif op=='fadd':stack[0]=quantize(stack[0]+read(operand),64)
        elif op=='faddp':
            assert operand=='st(1), st'
            value=stack.pop(0);stack[0]=quantize(stack[0]+value,64)
        else:raise ValueError((hex(address),op,operand))
    assert not stack
    return [float(memory[0x48+axis*4]) for axis in range(3)]

rows=json.loads(Path('src/game/original-ufo-data.json').read_text())['rows']
cases=[]
for index,row in enumerate(rows):
    for delta in [1000/120,1000/60,1000/30,50]:
        case=dict(row=index,current=[-498.123+index*33,97.7-index*5,89.321-index*17],
                  previous=[-499.37+index*33,98.8-index*5,89.29-index*17],
                  target=row['position'],force=[row['force']]*3,damping=[row['damping']]*3,
                  offset=[0,0,0],deltaMs=delta)
        case['expected']=execute(case);cases.append(case)
# Independent XYZ coefficients catch accidental sharing or swapped stack slots.
case=dict(row=None,current=[1,2,3],previous=[-1,5,2],target=[7,-5,13],
          force=[.2,.7,3],damping=[.9,.5,.1],offset=[.5,-.25,2],deltaMs=17)
case['expected']=execute(case);cases.append(case)
print(json.dumps(dict(dllSha256=hashlib.sha256(binary).hexdigest(),
                     arithmeticRanges=['0x10004c14-0x10004c67','0x10004d18-0x10004da5'],cases=cases),indent=2))
