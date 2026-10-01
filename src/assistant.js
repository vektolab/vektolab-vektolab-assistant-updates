const app=document.getElementById('app'), avatar=document.getElementById('avatar'), search=document.getElementById('search'), designs=document.getElementById('designs');
const checkUpdatesButton=document.getElementById('checkUpdates'), versionLabel=document.getElementById('versionLabel');
const toastStack=document.getElementById('toastStack'), tabGenerators=document.getElementById('tabGenerators'), tabDesigns=document.getElementById('tabDesigns');
let items=[]; let staticDesigns=[]; let activeTab='generators'; let catalogMode=false; let toastTimers=[];

function openPanel(){
 app.classList.add('open');
 window.vektolab.setPanelOpen(true);
 setTimeout(()=>search.focus(),80);
}
function closePanel(){
 app.classList.remove('open');
 window.vektolab.setPanelOpen(false);
}
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

// --- Movimiento físico de Vekto -------------------------------------------------
let avatarDragging=false;
let dragPointerId=null;
let lastPointer=null;
let wasPanelOpenAtDragStart=false;
let lastPointerTime=0;
let dragMoved=false;
let lastVelocityX=0;
let lastVelocityY=0;

function clampVelocity(value){
 return Math.max(-2200, Math.min(2200, value));
}

function edgeBounce(direction){
 avatar.classList.remove('edge-hit');
 // Force a new animation even when the user is holding the mouse.
 void avatar.offsetWidth;
 avatar.classList.add('edge-hit');
 setTimeout(()=>avatar.classList.remove('edge-hit'),260);
 if(direction==='left') avatar.style.setProperty('--tilt','-10deg');
 if(direction==='right') avatar.style.setProperty('--tilt','10deg');
}

avatar.addEventListener('pointerdown', e=>{
 if(e.button!==0) return;
 e.preventDefault();
 e.stopPropagation();

 wasPanelOpenAtDragStart=app.classList.contains('open');
 if(wasPanelOpenAtDragStart) closePanel();

 avatarDragging=true;
 dragPointerId=e.pointerId;
 dragMoved=false;
 lastVelocityX=0;
 lastVelocityY=0;
 lastPointer={x:e.screenX,y:e.screenY};
 lastPointerTime=performance.now();
 avatar.classList.add('dragging');
 avatar.setPointerCapture?.(e.pointerId);
 window.vektolab.startAvatarDrag(e.screenX,e.screenY);
});

window.addEventListener('pointermove', e=>{
 if(!avatarDragging || e.pointerId!==dragPointerId) return;
 e.preventDefault();

 const now=performance.now();
 const dt=Math.max(1,now-lastPointerTime);
 const dx=e.screenX-lastPointer.x;
 const dy=e.screenY-lastPointer.y;

 if(Math.abs(dx)+Math.abs(dy)>2) dragMoved=true;

 const vx=clampVelocity(dx/(dt/1000));
 const vy=clampVelocity(dy/(dt/1000));
 lastVelocityX=vx;
 lastVelocityY=vy;

 const tilt=Math.max(-16,Math.min(16,vx*0.012+dy*0.01));
 avatar.style.setProperty('--tilt',`${tilt.toFixed(2)}deg`);

 window.vektolab.moveAvatarDrag(e.screenX,e.screenY,vx,vy);

 lastPointer={x:e.screenX,y:e.screenY};
 lastPointerTime=now;
},{passive:false});

function finishAvatarDrag(e){
 if(!avatarDragging || e.pointerId!==dragPointerId) return;

 const now=performance.now();
 const dt=Math.max(1,now-lastPointerTime);
 const releaseVx=clampVelocity((e.screenX-lastPointer.x)/(dt/1000));
 const releaseVy=clampVelocity((e.screenY-lastPointer.y)/(dt/1000));

 const vx=Math.abs(releaseVx)>120 ? releaseVx : lastVelocityX;
 const vy=Math.abs(releaseVy)>120 ? releaseVy : lastVelocityY;

 avatarDragging=false;
 dragPointerId=null;
 avatar.classList.remove('dragging');
 avatar.classList.remove('edge-hit');
 avatar.style.removeProperty('--tilt');

 window.vektolab.endAvatarDrag(vx,vy);

 if(!dragMoved){
   wasPanelOpenAtDragStart ? closePanel() : openPanel();
 }
}
window.addEventListener('pointerup',finishAvatarDrag);
window.addEventListener('pointercancel',finishAvatarDrag);

window.vektolab.onPanelPlacement(placement=>{
 panel.classList.toggle('below', placement==='below');
});
window.vektolab.onAvatarEdgeBounce(direction=>{
 edgeBounce(direction);
});


window.vektolab.onGenerators(list=>{items=Array.isArray(list)?list:[]; render(search.value);});
window.vektolab.onDesigns(list=>{staticDesigns=Array.isArray(list)?list:[]; if(activeTab==='designs') render(search.value);});
window.vektolab.onCatalogMode(()=>{catalogMode=true; app.classList.add('catalog-mode','open'); render(search.value);});
window.vektolab.onAssistantBlur(()=>{if(catalogMode){catalogMode=false; app.classList.remove('catalog-mode','open'); window.vektolab.closeCatalog();}else closePanel();});
if(checkUpdatesButton){checkUpdatesButton.addEventListener('click',()=>{checkUpdatesButton.disabled=true;window.vektolab.checkUpdates();window.vektolab.syncContent();setTimeout(()=>checkUpdatesButton.disabled=false,2500);});}
window.vektolab.onAppVersion(v=>{if(versionLabel) versionLabel.textContent='v'+v;});
avatar.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
document.getElementById('close').addEventListener('click',closePanel);
document.getElementById('explore').addEventListener('click',()=>{window.vektolab.openCatalog();});
tabGenerators.addEventListener('click',()=>selectTab('generators')); tabDesigns.addEventListener('click',()=>selectTab('designs'));
search.addEventListener('input',()=>render(search.value));
document.getElementById('site').addEventListener('click',()=>window.vektolab.openSite());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});
window.vektolab.onUpdateState(showUpdate); window.vektolab.onContentState(showContentUpdate);
window.vektolab.getUpdateState(); window.vektolab.getContentState(); window.vektolab.getGenerators(); window.vektolab.getDesigns(); render();
