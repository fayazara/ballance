#!/usr/bin/env python3
"""Verify actuator timer durations using the upstream TimerMini function.

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
suffix = r'''
int main(){
 float schedules[3][4]={{7,19,33,9},{8.333333f,16.666667f,25,12.5f},{0,100,350,10}};
 for(int schedule=0;schedule<3;schedule++)for(float wait:{500.f,1500.f}){
  CKBehavior b;b.wait=wait;int frame=0;
  do {CKBehaviorContext c{&b,schedules[schedule][frame%4]};TimerMini(c);frame++;}while(!b.out);
  std::cout<<schedule<<" "<<int(wait)<<" "<<frame<<"\n";
 }
 for(int schedule=0;schedule<3;schedule++)for(int kind=0;kind<2;kind++){
  CKBehavior timers[4];int count=kind?2:4,stage=0;bool pending=false;
  for(auto &timer:timers)timer.wait=kind?1500.f:500.f;
  for(int frame=0;frame<400;frame++){
   if(pending){stage=(stage+1)%count;timers[stage].active=true;timers[stage].out=false;pending=false;}
   for(int visited=0;visited<count;visited++){
    CKBehaviorContext c{&timers[stage],schedules[schedule][frame%4]};TimerMini(c);
    if(!timers[stage].out)break;
    if(kind){pending=true;break;}
    stage=(stage+1)%count;timers[stage].active=true;timers[stage].out=false;
   }
   std::cout<<"cycle "<<schedule<<" "<<kind<<" "<<frame<<" "<<stage<<"\n";
  }
 }
}
'''
with tempfile.TemporaryDirectory(prefix='ballance-actuator-clock-') as directory:
    cpp=Path(directory)/'oracle.cpp';binary=Path(directory)/'oracle'
    cpp.write_text(prefix+body+suffix)
    subprocess.run(['clang++','-O0','-ffp-contract=off',str(cpp),'-o',str(binary)],check=True)
    lines=subprocess.check_output([str(binary)],text=True).splitlines()
    rows=[list(map(int,line.split())) for line in lines if not line.startswith('cycle ')]
    cycles=[list(map(int,line.split()[1:])) for line in lines if line.startswith('cycle ')]
print(json.dumps(dict(source=str(source),sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
    schedules=[[7,19,33,9],[8.333333,16.666667,25,12.5],[0,100,350,10]],
    fields=['schedule','durationMs','activationFrames'],cases=rows,
    cycleFields=['schedule','kindZeroSwingOneSack','frame','stage'],
    cycleTransitions=[row for i,row in enumerate(cycles) if i==0 or row[:2]!=cycles[i-1][:2] or row[3]!=cycles[i-1][3]]),indent=2))
