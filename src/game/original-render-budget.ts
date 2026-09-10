/** Render resolution adapts independently of the simulation clock. Change only
 * after sustained slow frames; recovering detail takes longer to avoid pumping. */
export class OriginalRenderBudget {
  ratio=1;maximum=1
  private minimum=1
  private elapsed=0
  private total=0
  private frames=0
  private recovery=0
  configure(width:number,height:number,dpr:number,high:boolean,coarse:boolean) {
    const pixels=coarse?1_200_000:4_000_000
    this.maximum=Math.max(.75,Math.min(dpr,high?(coarse?1.5:2):1,Math.sqrt(pixels/Math.max(1,width*height))))
    this.minimum=Math.min(this.maximum,coarse?.75:1)
    this.ratio=this.maximum;this.elapsed=this.total=this.frames=this.recovery=0
    return this.ratio
  }
  sample(ms:number) {
    if(ms<=0||ms>1000)return this.ratio // ignore long suspensions, but respond even below 10 FPS
    this.elapsed+=ms;this.total+=ms;this.frames++
    if(this.elapsed<2000)return this.ratio
    const mean=this.total/this.frames
    if(mean>22) {this.ratio=Math.max(this.minimum,this.ratio-.15);this.recovery=0}
    else if(mean<17.5) {
      this.recovery+=this.elapsed
      if(this.recovery>=8000){this.ratio=Math.min(this.maximum,this.ratio+.05);this.recovery=0}
    } else this.recovery=0
    this.elapsed=this.total=this.frames=0
    return this.ratio
  }
}
