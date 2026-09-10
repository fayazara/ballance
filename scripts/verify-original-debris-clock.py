#!/usr/bin/env python3
"""Run upstream TimeTimer and BezierProgression bodies with parameter stubs.

Only the recovered zero-delay timer-to-fade connection is orchestrated here.
The elapsed-time arithmetic and endpoint comparisons execute upstream C++.
"""
import hashlib,json,subprocess,tempfile
from pathlib import Path
root=Path('.local/reference/buildingblocks/Logics/Behaviors')
def function(path,name):
    text=path.read_text();start=text.index('int '+name+'(const CKBehaviorContext &behcontext)\n{')
    opening=text.index('{',start);depth=1;end=opening+1
    while depth:
        if text[end]=='{':depth+=1
        elif text[end]=='}':depth-=1
        end+=1
    return text[start:end]
files=[root/'TimeTimer.cpp',root/'BezierProgression.cpp']
prefix='''#include <iostream>
#include <vector>
constexpr int FALSE=0,TRUE=1,CKBR_OK=0;
struct CK2dCurve {float GetY(float x){return x;}};
struct CKBehavior {
 bool active[2]={true,false},out[2]={false,false};float outputs[4]={},duration;CK2dCurve curve;
 CKBehavior(float d):duration(d){}
 bool IsInputActive(int i){return active[i];}
 void ActivateInput(int i,int state){active[i]=state;}
 void ActivateOutput(int i,int state=1){out[i]=state;}
 void SetOutputParameterValue(int i,const float*p){outputs[i]=*p;}
 void GetOutputParameterValue(int i,float*p){*p=outputs[i];}
 void GetInputParameterValue(int i,float*p){*p=i==0?duration:i==1?0.f:1.f;}
 void GetInputParameterValue(int,CK2dCurve**p){*p=&curve;}
};
struct CKBehaviorContext {CKBehavior* Behavior;float DeltaTime;};
'''
suffix='''
int main(){
 std::vector<std::vector<float>> schedules={{100.f},{1000.f/30},{1000.f/60},{1000.f/120},{1000.f/144},{7.f,19.f,33.f,9.f},{1000.f}};
 for(int i=0;i<schedules.size();i++){
  CKBehavior timer(20000.f),fade(2000.f);bool fading=false;int start=0;
  for(int frame=1;frame<100000;frame++){
   float dt=schedules[i][(frame-1)%schedules[i].size()];
   if(!fading){CKBehaviorContext ctx{&timer,dt};TimeTimer(ctx);timer.active[1]=true;if(timer.out[0]){fading=true;start=frame;}}
   if(fading){CKBehaviorContext ctx{&fade,dt};BezierProgressionTimeBased(ctx);fade.active[1]=true;if(fade.out[0]){std::cout<<i<<" "<<start<<" "<<frame<<"\\n";break;}}
  }
 }
}
'''
with tempfile.TemporaryDirectory(prefix='ballance-debris-oracle-') as directory:
    source=Path(directory)/'oracle.cpp';binary=Path(directory)/'oracle'
    source.write_text(prefix+function(files[0],'TimeTimer')+function(files[1],'BezierProgressionTimeBased')+suffix)
    subprocess.run(['clang++','-O0',str(source),'-o',str(binary)],check=True)
    rows=[list(map(int,line.split())) for line in subprocess.check_output([str(binary)],text=True).splitlines()]
print(json.dumps(dict(sources=[dict(path=str(p),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in files],
    schedulesMs=[[100],[1000/30],[1000/60],[1000/120],[1000/144],[7,19,33,9],[1000]],
    fields=['schedule','fadeStartFrame','removeFrame'],cases=rows),indent=2))
