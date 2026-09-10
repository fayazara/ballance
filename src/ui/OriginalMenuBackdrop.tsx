import {useEffect,useRef} from 'react'
import * as THREE from 'three'
import {loadOriginal,originalGeometry,OriginalMaterials} from '../game/original-data'
import data from '../game/original-ui-data.json'

/** MenuLevel.nmo's scene, independent of the paused course. */
export function OriginalMenuBackdrop() {
  const host=useRef<HTMLDivElement>(null)
  useEffect(()=> {
    const target=host.current!,scene=new THREE.Scene(),resources=new OriginalMaterials()
    const renderer=new THREE.WebGLRenderer({antialias:true}),camera=new THREE.PerspectiveCamera(45,1,.25,300)
    renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,2))
    target.append(renderer.domElement)
    const eye=data.menuCamera.slice(9),look=data.menuTarget.slice(12,15)
    camera.position.set(eye[0]!*.25,eye[1]!*.25,-eye[2]!*.25)
    camera.lookAt(look[0]!*.25,look[1]!*.25,-look[2]!*.25)
    scene.add(new THREE.HemisphereLight(0xffffff,0x918462,2.2))
    const light=new THREE.DirectionalLight(0xffffff,1.4);light.position.set(-20,45,15);scene.add(light)
    let disposed=false,frame=0,sky:THREE.CubeTexture|undefined
    const resize=()=>{const w=target.clientWidth,h=target.clientHeight;camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();renderer.setSize(w,h)}
    const observer=new ResizeObserver(resize);observer.observe(target);resize()
    void (async()=> {
      const document=await loadOriginal('menulevel'),materials=await resources.create(document)
      sky=await new THREE.CubeTextureLoader().loadAsync(['Right','Left','Down','Down','Front','Back'].map(face=>`/original/sky/Sky_A_${face}.jpg`));sky.colorSpace=THREE.SRGBColorSpace
      if(disposed){resources.dispose();sky.dispose();return}
      scene.background=sky
      for(const object of document.objects) {
        const mesh=document.meshes.find(m=>m.id===object.mesh);if(!mesh||!object.visible)continue
        scene.add(new THREE.Mesh(originalGeometry(mesh,object.matrix),mesh.materials.map(id=>materials.get(id)!)))
      }
      const render=()=>{if(disposed)return;renderer.render(scene,camera);frame=requestAnimationFrame(render)};render()
    })().catch(()=>{if(!disposed){scene.background=new THREE.Color(0x77705f);renderer.render(scene,camera)}})
    return ()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()});resources.dispose();sky?.dispose();renderer.dispose();renderer.domElement.remove()}
  },[])
  return <div className="original-menu-scene" ref={host} aria-hidden="true"/>
}
