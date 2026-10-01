const avatar=document.getElementById('avatar');
let dragging=false,pointerId=null,last=null,lastTime=0,moved=false,lastVx=0,lastVy=0,wasPanelOpen=false;

function clamp(v){return Math.max(-2600,Math.min(2600,v));}
function hit(direction){
  avatar.classList.remove('edge-hit');
  void avatar.offsetWidth;
  avatar.classList.add('edge-hit');
  setTimeout(()=>avatar.classList.remove('edge-hit'),260);
}

avatar.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  dragging=true;pointerId=e.pointerId;moved=false;
  last={x:e.screenX,y:e.screenY};lastTime=performance.now();
  lastVx=0;lastVy=0;
  avatar.classList.add('dragging');
  avatar.setPointerCapture?.(e.pointerId);
  window.vektolab.startAvatarDrag(e.screenX,e.screenY);
});

window.addEventListener('pointermove',e=>{
  if(!dragging||e.pointerId!==pointerId)return;
  e.preventDefault();
  const now=performance.now(),dt=Math.max(1,now-lastTime);
  const dx=e.screenX-last.x,dy=e.screenY-last.y;
  if(Math.abs(dx)+Math.abs(dy)>2)moved=true;
  const vx=clamp(dx/(dt/1000)),vy=clamp(dy/(dt/1000));
  lastVx=vx;lastVy=vy;
  const tilt=Math.max(-18,Math.min(18,vx*.012+dy*.01));
  avatar.style.setProperty('--tilt',`${tilt.toFixed(2)}deg`);
  window.vektolab.moveAvatarDrag(e.screenX,e.screenY,vx,vy);
  last={x:e.screenX,y:e.screenY};lastTime=now;
},{passive:false});

function finish(e){
  if(!dragging||e.pointerId!==pointerId)return;
  const now=performance.now(),dt=Math.max(1,now-lastTime);
  const rvx=clamp((e.screenX-last.x)/(dt/1000)),rvy=clamp((e.screenY-last.y)/(dt/1000));
  const vx=Math.abs(rvx)>120?rvx:lastVx,vy=Math.abs(rvy)>120?rvy:lastVy;
  dragging=false;pointerId=null;
  avatar.classList.remove('dragging','edge-hit');avatar.style.removeProperty('--tilt');
  window.vektolab.endAvatarDrag(vx,vy);
  if(!moved)window.vektolab.togglePanel();
}
window.addEventListener('pointerup',finish);
window.addEventListener('pointercancel',finish);
window.vektolab.onAvatarEdgeBounce(hit);
