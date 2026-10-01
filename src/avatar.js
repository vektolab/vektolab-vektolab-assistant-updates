const avatar=document.getElementById('avatar');
let dragging=false,pointerId=null,last=null,lastTime=0,moved=false,lastVx=0,lastVy=0,finished=false;

function clamp(v){return Math.max(-2600,Math.min(2600,v));}

function begin(e){
  if(e.button!==0 || dragging)return;
  e.preventDefault();
  e.stopPropagation();
  dragging=true;
  finished=false;
  pointerId=e.pointerId;
  moved=false;
  last={x:e.screenX,y:e.screenY};
  lastTime=performance.now();
  lastVx=0;lastVy=0;
  avatar.classList.add('dragging');
  try{avatar.setPointerCapture(e.pointerId);}catch(_){}
  window.vektolab.startAvatarDrag(e.screenX,e.screenY);
}

function move(e){
  if(!dragging||e.pointerId!==pointerId)return;
  e.preventDefault();
  const now=performance.now(),dt=Math.max(1,now-lastTime);
  const dx=e.screenX-last.x,dy=e.screenY-last.y;
  if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
  const vx=clamp(dx/(dt/1000)),vy=clamp(dy/(dt/1000));
  lastVx=vx;lastVy=vy;
  const tilt=Math.max(-18,Math.min(18,vx*.012+dy*.01));
  avatar.style.setProperty('--tilt',`${tilt.toFixed(2)}deg`);
  window.vektolab.moveAvatarDrag(e.screenX,e.screenY,vx,vy);
  last={x:e.screenX,y:e.screenY};lastTime=now;
}

function finish(e){
  if(!dragging||e.pointerId!==pointerId||finished)return;
  finished=true;
  e.preventDefault();
  e.stopPropagation();
  const now=performance.now(),dt=Math.max(1,now-lastTime);
  const rvx=clamp((e.screenX-last.x)/(dt/1000)),rvy=clamp((e.screenY-last.y)/(dt/1000));
  const vx=Math.abs(rvx)>120?rvx:lastVx,vy=Math.abs(rvy)>120?rvy:lastVy;
  const wasClick=!moved;
  dragging=false;pointerId=null;
  try{avatar.releasePointerCapture?.(e.pointerId);}catch(_){}
  avatar.classList.remove('dragging');
  avatar.style.removeProperty('--tilt');
  window.vektolab.endAvatarDrag(vx,vy);
  if(wasClick){
    // Abrir el menú desde el propio gesto de puntero, sin depender del evento click.
    setTimeout(()=>window.vektolab.togglePanel(),0);
  }
}

avatar.addEventListener('pointerdown',begin);
avatar.addEventListener('pointerup',finish);
avatar.addEventListener('pointercancel',finish);
window.addEventListener('pointermove',move,{passive:false});
window.addEventListener('pointerup',finish);
window.addEventListener('pointercancel',finish);

avatar.addEventListener('contextmenu',e=>{
  e.preventDefault();e.stopPropagation();
  if(!dragging)window.vektolab.showAvatarMenu();
});
