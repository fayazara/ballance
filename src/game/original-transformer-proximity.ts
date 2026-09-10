import data from './original-transformer-clock-data.json' with {type:'json'}
type Point={x:number;y:number;z:number}
/** Get Nearest In Group compares float32 squared distances before material
 * matching. Inputs are rendered coordinates at the game's 0.25 scale. */
export function nearestOriginalTransformer<T extends {position:Point}>(pads:readonly T[],player:Point):T|undefined {
  const f=Math.fround
  let nearest:T|undefined,min=3.4028234663852886e38
  for(const pad of pads) {
    const x=f(f(pad.position.x*4)-f(player.x*4)),y=f(f(pad.position.y*4)-f(player.y*4)),z=f(f(pad.position.z*4)-f(player.z*4))
    const distance=f(f(f(x*x)+f(y*y))+f(z*z))
    if(distance<min){min=distance;nearest=pad}
  }
  return f(Math.sqrt(min))<data.captureRadius?nearest:undefined
}
