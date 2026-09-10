#!/usr/bin/env python3
"""Verify transformer stage durations using the upstream TimerMini function.

The local CKBuildingBlocks checkout is the oracle. No replacement timer arithmetic
is implemented here; the harness only supplies its input/output parameter storage.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

source = Path('.local/reference/buildingblocks/Logics/Behaviors/TimerMini.cpp')
raw = source.read_text()
signature = 'int TimerMini(const CKBehaviorContext &behcontext)\n{'
body = raw[raw.index(signature):]
assert body.rstrip().endswith('}')
prefix = '''#include <iostream>
constexpr int FALSE=0, CKBR_OK=0, CKBR_ACTIVATENEXTFRAME=1;
struct CKBehavior {
 bool active=true,out=false; float elapsed=0,wait=0;
 bool IsInputActive(int){return active;}
 void ActivateInput(int,int){active=false;}
 void SetOutputParameterValue(int,float*p){elapsed=*p;}
 void GetInputParameterValue(int,float*p){*p=wait;}
 void GetOutputParameterValue(int,float*p){*p=elapsed;}
 void ActivateOutput(int){out=true;}
};
struct CKBehaviorContext {CKBehavior* Behavior;float DeltaTime;};
'''
suffix = '''
int main(){
 for(int hz: {10,30,60,120,144}) {
  std::cout<<hz;
  for(float wait: {1350.f,1000.f,150.f}) {
   CKBehavior behavior;behavior.wait=wait;
   CKBehaviorContext context{&behavior,1000.f/hz};int ticks=0;
   do {TimerMini(context);++ticks;}while(!behavior.out);
   std::cout<<" "<<ticks;
  }
  std::cout<<"\\n";
 }
}
'''
with tempfile.TemporaryDirectory(prefix='ballance-respawn-clock-') as directory:
    cpp = Path(directory) / 'oracle.cpp'
    binary = Path(directory) / 'oracle'
    cpp.write_text(prefix + body + suffix)
    subprocess.run(['clang++', '-O0', str(cpp), '-o', str(binary)], check=True)
    output = subprocess.check_output([str(binary)], text=True)
rows = [list(map(int, line.split())) for line in output.splitlines()]
assert rows == [[10,14,10,2],[30,41,31,5],[60,82,60,9],[120,162,121,18],[144,195,144,22]]
print(json.dumps({'source': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'fields': ['hz', 'captureTicks', 'explosionDelayTicks', 'replacementDelayTicks'], 'cases': rows}, indent=2))
