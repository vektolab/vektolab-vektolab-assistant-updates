const app=document.getElementById('app'), avatar=document.getElementById('avatar'), search=document.getElementById('search'), designs=document.getElementById('designs');
const update=document.getElementById('update'), contentUpdate=document.getElementById('contentUpdate');
const checkUpdatesButton=document.getElementById('checkUpdates'), versionLabel=document.getElementById('versionLabel');
let items=[];
function openPanel(){app.classList.add('open'); setTimeout(()=>search.focus(),80)}
function closePanel(){app.classList.remove('open')}
function render(q=''){
 const query=q.toLowerCase().trim();
 const list=items.filter(i=>(i.name||'').toLowerCase().includes(query));
 designs.innerHTML=list.length?list.map(i=>`<button class="card" type="button" data-slug="${i.slug}"><span class="thumb">${i.image?`<img src="${i.image}" alt="${i.name}">`:''}</span><span class="name">${i.name}</span></button>`).join(''):'<div class="empty">No encontramos ese generador.</div>';
 designs.querySelectorAll('.card').forEach(c=>c.addEventListener('click',()=>window.vektolab.openGenerator(c.dataset.slug)));
}
function showUpdate(state){
 if(!update) return;
 update.className='update '+(state?.status||'idle');
 if(state?.status==='available') update.innerHTML=`<span>✨ Nueva versión ${state.version}. Descargando…</span>`;
 else if(state?.status==='downloading') update.innerHTML=`<span>⬇ Descargando actualización ${state.percent||0}%</span><div class="progress"><i style="width:${state.percent||0}%"></i></div>`;
 else if(state?.status==='downloaded') update.innerHTML=`<span>✓ ${state.version} está lista.</span><button id="updateAction">Reiniciar y actualizar</button>`;
 else if(state?.status==='checking') update.innerHTML='<span>Buscando actualizaciones…</span>';
 else if(state?.status==='up-to-date') update.innerHTML='<span>✓ Ya tienes la última versión.</span>';
 else if(state?.status==='error') update.innerHTML='<span>⚠ No se pudo comprobar la actualización.</span>';
 else update.innerHTML='';
 const action=document.getElementById('updateAction'); if(action) action.addEventListener('click',()=>window.vektolab.installUpdate());
}
function showContentUpdate(state){
 if(!contentUpdate) return;
 if(state?.status==='checking') contentUpdate.textContent='Buscando cambios en tus generadores…';
 else if(state?.status==='downloading') contentUpdate.textContent=`Actualizando generadores… ${state.percent||0}%`;
 else if(state?.status==='updated') contentUpdate.textContent=`✓ Generadores actualizados (${state.updated||0} archivos)`;
 else if(state?.status==='up-to-date') contentUpdate.textContent='✓ Generadores actualizados';
 else if(state?.status==='error') contentUpdate.textContent='⚠ No se pudieron actualizar los generadores';
 else contentUpdate.textContent='';
}
window.vektolab.onGenerators(list=>{items=Array.isArray(list)?list:[]; render(search.value);});
if(checkUpdatesButton){checkUpdatesButton.addEventListener('click',()=>{checkUpdatesButton.disabled=true;window.vektolab.checkUpdates();window.vektolab.syncContent();setTimeout(()=>checkUpdatesButton.disabled=false,2500);});}
window.vektolab.onAppVersion(v=>{if(versionLabel) versionLabel.textContent='v'+v;});
avatar.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();app.classList.contains('open')?closePanel():openPanel()});
document.getElementById('close').addEventListener('click',closePanel);
document.getElementById('explore').addEventListener('click',()=>{search.value='';render();search.focus()});
search.addEventListener('input',()=>render(search.value));
document.getElementById('site').addEventListener('click',()=>window.vektolab.openSite());
document.addEventListener('keydown',e=>{if(e.key==='Escape')closePanel()});
window.vektolab.onUpdateState(showUpdate); window.vektolab.onContentState(showContentUpdate);
window.vektolab.getUpdateState(); window.vektolab.getContentState(); window.vektolab.getGenerators(); render();
