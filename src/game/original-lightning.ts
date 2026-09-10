import * as THREE from 'three'
import data from './original-lightning-data.json' with {type:'json'}
import {originalGeometry,SCALE,type OriginalDocument} from './original-data.ts'
import {ufoCurve} from './original-ufo-animation.ts'

/** Balls.nmo script 437. Timer/Bezier activation consumes the current frame;
 * Sequencer advances once per script frame, not at an invented texture FPS. */
export class OriginalLightningState {
  active=false;sphereVisible=false;lightVisible=false;age=0;angle=0;scale=0;texture=-1
  lightColor=[0,0,0]
  private lightStage=0
  private lightAge=0
  reset(){this.active=this.sphereVisible=this.lightVisible=false;this.age=this.angle=this.scale=this.lightAge=this.lightStage=0;this.texture=-1;this.lightColor=[0,0,0]}
  start(deltaMs:number){this.reset();this.active=this.sphereVisible=this.lightVisible=true;this.step(deltaMs)}
  step(deltaMs:number) {
    if(!this.active)return
    if(!Number.isFinite(deltaMs)||deltaMs<0)throw new Error('Invalid lightning frame duration')
    const dt=Math.fround(deltaMs)
    this.age=Math.fround(this.age+dt)
    this.sphereVisible=this.age<data.sphereDurationMs
    if(this.sphereVisible) {
      this.angle-=Math.fround(data.radiansPerSecond*Math.fround(dt*.001))
      this.texture=(this.texture+1)%data.textureNames.length
    }
    this.scale=ufoCurve(data.scale.curve,Math.fround(Math.min(1,this.age/data.scale.durationMs)))
    if(this.lightVisible) {
      let stage=data.light.stages[this.lightStage]!
      this.lightAge=Math.fround(this.lightAge+dt)
      if(this.lightStage===0&&this.lightAge>=stage.durationMs) {
        // The first Out starts the next distinct progression through a zero-frame
        // link: discard overshoot, then count this frame on its In as well.
        this.lightStage=1;this.lightAge=dt;stage=data.light.stages[1]!
      }
      const t=ufoCurve(stage.curve,Math.fround(Math.min(1,this.lightAge/stage.durationMs)))
      this.lightColor=stage.fromColor.slice(0,3).map((v,i)=>v+(stage.toColor[i]!-v)*t)
      if(this.lightStage===1&&this.lightAge>=stage.durationMs)this.lightVisible=false
    }
    this.active=this.sphereVisible||this.lightVisible
  }
}

export class OriginalLightning {
  state=new OriginalLightningState()
  group=new THREE.Group()
  mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>
  // Keep the light in the scene with zero intensity when idle, avoiding a shader
  // permutation change during the respawn itself. It never casts extra shadows.
  light=new THREE.PointLight(0,0,data.light.range*SCALE,1)
  private textures:THREE.Texture[]
  constructor(document:OriginalDocument,textures:readonly THREE.Texture[]) {
    const object=document.objects.find(o=>o.name==='Ball_LightningSphere')!
    const source=document.meshes.find(m=>m.id===object.mesh)!
    this.textures=data.textureNames.map(name=> {
      const file=document.textures.find(t=>t.file.endsWith(`/${name}.png`))!.file
      const texture=textures.find(t=>t.name===file)
      if(!texture)throw new Error(`Missing original lightning texture ${name}`)
      return texture
    })
    const material=new THREE.MeshBasicMaterial({map:this.textures[0],transparent:true,depthWrite:false,
      blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneFactor,blendEquation:THREE.AddEquation})
    this.mesh=new THREE.Mesh(originalGeometry(source,object.matrix,true),material)
    this.mesh.name='Ball_LightningSphere';this.group.add(this.mesh);this.reset()
  }
  start(position:THREE.Vector3,deltaMs:number) {
    this.follow(position)
    this.state.start(deltaMs);this.sync()
  }
  follow(position:THREE.Vector3) {
    this.group.position.copy(position)
    this.light.position.set(position.x+data.light.position[0]!*SCALE,position.y+data.light.position[1]!*SCALE,position.z-data.light.position[2]!*SCALE)
  }
  step(deltaMs:number){if(this.state.active){this.state.step(deltaMs);this.sync()}}
  private sync() {
    this.mesh.visible=this.state.sphereVisible
    this.mesh.scale.setScalar(this.state.scale);this.mesh.rotation.y=this.state.angle
    if(this.state.texture>=0)this.mesh.material.map=this.textures[this.state.texture]!
    this.light.color.setRGB(this.state.lightColor[0]!,this.state.lightColor[1]!,this.state.lightColor[2]!)
    this.light.intensity=this.state.lightVisible?SCALE:0
  }
  reset(){this.state.reset();this.sync()}
  dispose(){this.group.removeFromParent();this.light.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose()}
}
