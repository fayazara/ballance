#!/usr/bin/env python3
"""Execute upstream SetDynamicPosition in its local coordinate frame.

Entity stubs supply positions already expressed in the coordinate system;
this oracle does not validate matrix inversion or hierarchy updates.
"""
from pathlib import Path
import hashlib,json,subprocess,tempfile
path=Path('.local/reference/buildingblocks/TT_Toolbox_RT/Behaviors/SetDynamicPosition.cpp')
raw=path.read_text();body=raw[raw.index('int SetDynamicPosition(const CKBehaviorContext &behcontext)\n{'):]
prefix='''#include <cmath>
#include <iostream>
#include <iomanip>
using CKBOOL=int;
constexpr int FALSE=0,TRUE=1,CKBR_OK=0,CKBR_OWNERERROR=-1,CKBR_ACTIVATENEXTFRAME=1;
struct VxVector {
 float x=0,y=0,z=0;
 VxVector(){} VxVector(float a,float b,float c):x(a),y(b),z(c){}
 static VxVector axis0(){return {};}
 VxVector operator-(VxVector b)const{return {x-b.x,y-b.y,z-b.z};}
 VxVector& operator-=(VxVector b){x-=b.x;y-=b.y;z-=b.z;return *this;}
 VxVector& operator*=(float f){x*=f;y*=f;z*=f;return *this;}
 bool operator==(VxVector b)const{return x==b.x&&y==b.y&&z==b.z;}
 bool operator!=(VxVector b)const{return !(*this==b);}
 float Magnitude()const{return std::sqrt(x*x+y*y+z*z);}
 void Normalize(){float n=Magnitude();if(n)*this*=1/n;}
};
struct CK3dEntity {
 VxVector position;
 void GetPosition(VxVector*p,CK3dEntity* ref=nullptr){*p=position;}
 void SetPosition(VxVector*p,CK3dEntity* ref=nullptr){position=*p;}
};
struct CKBehavior {
 CK3dEntity target,object;bool active[2]={true,false};int status=0;VxVector previous;
 CK3dEntity* GetTarget(){return &target;}
 CK3dEntity* GetInputParameterObject(int i){return i==0?&object:nullptr;}
 bool IsInputActive(int i){return active[i];}
 void ActivateInput(int i,int v){active[i]=v;}
 void ActivateOutput(int,int){}
 void SetLocalParameterValue(int,int*p){status=*p;}
 void SetLocalParameterValue(int,VxVector*p){previous=*p;}
 void GetLocalParameterValue(int,int*p){*p=status;}
 void GetLocalParameterValue(int,VxVector*p){*p=previous;}
 void GetInputParameterValue(int i,float*p){*p=i<=3?2.f:i<=6?.7f:i==8?-3.f:0.f;}
 void SetOutputParameterValue(int,VxVector*){}
};
struct CKBehaviorContext{CKBehavior* Behavior;float DeltaTime;};
'''
suffix='''
int main(){std::cout<<std::setprecision(9);
 for(float dt:{100.f,1000.f/30,1000.f/60,1000.f/144}){
  CKBehavior b;b.target.position={3.2f,3.2f,1.2f};
  for(int frame=0;frame<16;frame++){
   CKBehaviorContext ctx{&b,dt};SetDynamicPosition(ctx);
   std::cout<<dt<<" "<<frame<<" "<<b.target.position.x<<" "<<b.target.position.y<<" "<<b.target.position.z<<"\\n";
  }
 }
}
'''
with tempfile.TemporaryDirectory(prefix='ballance-spring-oracle-') as directory:
    cpp=Path(directory)/'oracle.cpp';binary=Path(directory)/'oracle';cpp.write_text(prefix+body+suffix)
    subprocess.run(['clang++','-O0','-ffp-contract=off',str(cpp),'-o',str(binary)],check=True)
    rows=[list(map(float,line.split())) for line in subprocess.check_output([str(binary)],text=True).splitlines()]
print(json.dumps(dict(source=str(path),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
    fields=['deltaMs','frame','x','y','z'],samples=rows),indent=2))
