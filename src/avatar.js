const avatar=document.getElementById('avatar');
let dragging=false,pointerId=null,last=null,moved=false,finished=false;

function begin(e){
  if(e.button!==0 || dragging)return;
  e.preventDefault();
  e.stopPropagation();
  dragging=true;
  finished=false;
  pointerId=e.pointerId;
  moved=false;
  last={x:e.screenX,y:e.screenY};
  avatar.classList.add('dragging');
  try{avatar.setPointerCapture(e.pointerId);}catch(_){}
  window.vektolab.startAvatarDrag(e.screenX,e.screenY);
}

function move(e){
  if(!dragging||e.pointerId!==pointerId)return;
  e.preventDefault();
  const dx=e.screenX-last.x,dy=e.screenY-last.y;
  if(Math.abs(dx)+Math.abs(dy)>4)moved=true;
  const tilt=Math.max(-18,Math.min(18,dx*0.12+dy*0.06));
  avatar.style.setProperty('--tilt',`${tilt.toFixed(2)}deg`);
  window.vektolab.moveAvatarDrag(e.screenX,e.screenY);
  last={x:e.screenX,y:e.screenY};
}

function finish(e){
  if(!dragging||e.pointerId!==pointerId||finished)return;
  finished=true;
  e.preventDefault();
  e.stopPropagation();
  const wasClick=!moved;
  dragging=false;pointerId=null;
  try{avatar.releasePointerCapture?.(e.pointerId);}catch(_){}
  avatar.classList.remove('dragging');
  avatar.style.removeProperty('--tilt');
  window.vektolab.endAvatarDrag();
  if(wasClick){
    setTimeout(()=>window.vektolab.togglePanel(),0);
  }
}

avatar.addEventListener('pointerdown',begin);
avatar.addEventListener('pointerup',finish);
avatar.addEventListener('pointercancel',finish);
window.addEventListener('pointermove',move,{passive:false});
window.addEventListener('pointerup',finish);
window.addEventListener('pointercancel',finish);

