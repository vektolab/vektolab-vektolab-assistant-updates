const app=document.getElementById('app'), search=document.getElementById('search'), designs=document.getElementById('designs');
const checkUpdatesButton=document.getElementById('checkUpdates'), versionLabel=document.getElementById('versionLabel');
const toastStack=document.getElementById('toastStack'), tabGenerators=document.getElementById('tabGenerators'), tabDesigns=document.getElementById('tabDesigns');
let items=[]; let staticDesigns=[]; let activeTab='generators'; let catalogMode=false; let toastTimers=[];

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function currentItems(){return activeTab==='designs'?staticDesigns:items}
function cardMarkup(i,type){return `<button class="card" type="button" data-slug="${escapeHtml(i.slug)}" data-type="${type}"><span class="thumb">${i.image?`<img src="${i.image}" alt="${escapeHtml(i.name)}">`:''}</span><span class="name">${escapeHtml(i.name)}</span></button>`}
function render(q=''){
 const query=q.toLowerCase().trim();
 if(catalogMode){
   const gens=items.filter(i=>(i.name||'').toLowerCase().includes(query));
   const des=staticDesigns.filter(i=>(i.name||'').toLowerCase().includes(query));
   const genCards=gens.length?gens.map(i=>cardMarkup(i,'generators')).join(''):`<div class="empty">No encontramos generadores.</div>`;
   const desCards=des.length?des.map(i=>cardMarkup(i,'designs')).join(''):`<div class="empty">Todavía no hay diseños disponibles.</div>`;
   designs.innerHTML=`<div class="catalog-group"><div class="catalog-title">Generadores <span>${gens.length}</span></div><div class="catalog-grid">${genCards}</div></div><div class="catalog-group"><div class="catalog-title">Diseños <span>${des.length}</span></div><div class="catalog-grid">${desCards}</div></div>`;
 }else{
   const list=currentItems().filter(i=>(i.name||'').toLowerCase().includes(query));
   const emptyText=activeTab==='designs'?'Todavía no hay diseños disponibles.':'No encontramos ese generador.';
   designs.innerHTML=list.length?list.map(i=>cardMarkup(i,activeTab)).join(''):`<div class="empty">${emptyText}</div>`;
 }
 designs.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=>{
   const type=c.dataset.type;
   if(type==='generators') window.vektolab.openGenerator(c.dataset.slug);
   else window.vektolab.openDesign(c.dataset.slug);
 }));
}
function selectTab(tab){activeTab=tab; tabGenerators.classList.toggle('active',tab==='generators'); tabDesigns.classList.toggle('active',tab==='designs'); search.placeholder=tab==='designs'?'Buscar diseños...':'Buscar generadores...'; render(search.value)}
function clearToasts(){toastTimers.forEach(t=>clearTimeout(t));toastTimers=[];toastStack.innerHTML=''}
function showToast(message,{kind='content',duration=5000,progress=null}={}){
 const el=document.createElement('div'); el.className=`toast ${kind==='update'?'update-toast':''}`; el.innerHTML=`<span>${message}</span>${progress!==null?`<div class="progress"><i style="width:${progress}%"></i></div>`:''}<button class="toast-close" type="button" aria-label="Cerrar">×</button>`;
 toastStack.appendChild(el);
 const close=()=>{el.remove(); if(timer)clearTimeout(timer)}; el.querySelector('.toast-close').addEventListener('click',close);
 const timer=setTimeout(close,duration); toastTimers.push(timer);
 return el;
}
function showUpdate(state){
 if(state?.status==='available') showToast(`✨ Nueva versión ${state.version}. Descargando…`,{kind:'update',duration:8000});
 else if(state?.status==='downloading') { clearToasts(); showToast(`⬇ Descargando actualización ${state.percent||0}%`,{kind:'update',duration:15000,progress:state.percent||0}); }
 else if(state?.status==='downloaded') showUpdateReady(state.version);
 else if(state?.status==='error') showToast('⚠ No se pudo comprobar la actualización.',{kind:'update',duration:5000});
 // Intencionalmente no mostramos "ya tienes la última versión".
}
function showUpdateReady(version){
 clearToasts();
 const el=showToast(`✓ ${version} está lista.`,{kind:'update',duration:5000});
 const button=document.createElement('button'); button.textContent='Reiniciar y actualizar'; button.style.cssText='margin:7px 0 0 0;border:0;border-radius:8px;background:#111827;color:#fff;padding:6px 9px;font-size:10px;cursor:pointer';
 el.appendChild(button); button.addEventListener('click',()=>window.vektolab.installUpdate());
}
function showContentUpdate(state){
 if(state?.status==='checking'||state?.status==='up-to-date') return;
 if(state?.status==='downloading') {clearToasts(); showToast(`Actualizando generadores… ${state.percent||0}%`,{duration:15000,progress:state.percent||0});}
 else if(state?.status==='updated') showToast(`✓ Generadores actualizados (${state.updated||0} archivos)`,{duration:5000});
 else if(state?.status==='offline') showToast('✓ Generadores disponibles. No se pudo comprobar si hay cambios ahora.',{duration:5000});
 else if(state?.status==='error') showToast('⚠ No se pudieron cargar los generadores.',{duration:5000});
}


window.vektolab.onGenerators(list=>{items=Array.isArray(list)?list:[]; render(search.value);});
window.vektolab.onDesigns(list=>{staticDesigns=Array.isArray(list)?list:[]; if(activeTab==='designs') render(search.value);});
window.vektolab.onCatalogMode(()=>{catalogMode=true; app.classList.add('catalog-mode','open'); render(search.value);});
window.vektolab.onAssistantBlur(()=>{if(catalogMode){catalogMode=false; app.classList.remove('catalog-mode','open'); window.vektolab.closeCatalog();}else closePanel();});
if(checkUpdatesButton){checkUpdatesButton.addEventListener('click',()=>{checkUpdatesButton.disabled=true;window.vektolab.checkUpdates();window.vektolab.syncContent();setTimeout(()=>checkUpdatesButton.disabled=false,2500);});}
window.vektolab.onAppVersion(v=>{if(versionLabel) versionLabel.textContent='v'+v;});
document.getElementById('close').addEventListener('click',closePanel);
document.getElementById('explore').addEventListener('click',()=>{window.vektolab.openCatalog();});
tabGenerators.addEventListener('click',()=>selectTab('generators')); tabDesigns.addEventListener('click',()=>selectTab('designs'));
search.addEventListener('input',()=>render(search.value));
document.getElementById('site').addEventListener('click',()=>window.vektolab.openSite());

const avatar=document.getElementById('avatar');
let dragging=false,pointerId=null,lastX=0,lastY=0,lastTime=0,moved=false,lastVx=0,lastVy=0,panelWasOpen=false;

function openPanel(){
  app.classList.add('open');
  window.vektolab.setPanelOpen?.(true);
  setTimeout(()=>search.focus(),80);
}
function closePanel(){
  app.classList.remove('open');
  window.vektolab.setPanelOpen?.(false);
}
function togglePanelFromAvatar(){
  if(panelWasOpen) closePanel();
  else openPanel();
}
function clampVelocity(v){return Math.max(-2200,Math.min(2200,v));}

avatar.addEventListener('pointerdown',e=>{
  if(e.button!==0||dragging)return;
  e.preventDefault();e.stopPropagation();
  dragging=true;pointerId=e.pointerId;moved=false;panelWasOpen=app.classList.contains('open');
  lastX=e.screenX;lastY=e.screenY;lastTime=performance.now();lastVx=0;lastVy=0;
  avatar.classList.add('dragging');
  try{avatar.setPointerCapture(e.pointerId)}catch(_){}
  window.vektolab.startAvatarDrag(e.screenX,e.screenY);
});
window.addEventListener('pointermove',e=>{
  if(!dragging||e.pointerId!==pointerId)return;
  e.preventDefault();
  const now=performance.now(),dt=Math.max(1,now-lastTime);
  const dx=e.screenX-lastX,dy=e.screenY-lastY;
  if(Math.abs(dx)+Math.abs(dy)>3)moved=true;
  const vx=clampVelocity(dx/(dt/1000)),vy=clampVelocity(dy/(dt/1000));
  lastVx=vx;lastVy=vy;
  const tilt=Math.max(-16,Math.min(16,vx*.012+dy*.01));
  avatar.style.setProperty('--tilt',`${tilt.toFixed(2)}deg`);
  window.vektolab.moveAvatarDrag(e.screenX,e.screenY,vx,vy);
  lastX=e.screenX;lastY=e.screenY;lastTime=now;
},{passive:false});
function finishAvatar(e){
  if(!dragging||e.pointerId!==pointerId)return;
  e.preventDefault();e.stopPropagation();
  const now=performance.now(),dt=Math.max(1,now-lastTime);
  const rvx=clampVelocity((e.screenX-lastX)/(dt/1000));
  const rvy=clampVelocity((e.screenY-lastY)/(dt/1000));
  const vx=Math.abs(rvx)>120?rvx:lastVx;
  const vy=Math.abs(rvy)>120?rvy:lastVy;
  const wasClick=!moved;
  dragging=false;pointerId=null;
  avatar.classList.remove('dragging');avatar.style.removeProperty('--tilt');
  try{avatar.releasePointerCapture?.(e.pointerId)}catch(_){}
  window.vektolab.endAvatarDrag(vx,vy);
  if(wasClick) setTimeout(togglePanelFromAvatar,0);
}
window.addEventListener('pointerup',finishAvatar);
window.addEventListener('pointercancel',finishAvatar);

window.vektolab.onAvatarEdgeBounce?.(()=>{
  avatar.classList.remove('edge-hit');
  void avatar.offsetWidth;
  avatar.classList.add('edge-hit');
  setTimeout(()=>avatar.classList.remove('edge-hit'),260);
});

document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});
window.vektolab.onUpdateState(showUpdate); window.vektolab.onContentState(showContentUpdate);
window.vektolab.getUpdateState(); window.vektolab.getContentState(); window.vektolab.getGenerators(); window.vektolab.getDesigns(); render();
