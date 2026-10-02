const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const search = document.getElementById('search');
const status = document.getElementById('status');
const tabs = [...document.querySelectorAll('.tab[data-tab]')];
let generators = [];
let designs = [];
let current = 'generators';
let mode = 'home';

function normalize(v){ return String(v||'').toLocaleLowerCase('es'); }
function itemImage(item){
  if (!item?.image) return '';
  return item.image.startsWith('http') ? item.image : `../content/${item.image}`;
}
function render(){
  const source = current === 'generators' ? generators : designs;
  const q = normalize(search.value).trim();
  const filtered = source.filter(item => !q || normalize([item.name,item.title,item.description,item.keywords,item.slug].join(' ')).includes(q));
  grid.innerHTML = '';
  empty.hidden = filtered.length !== 0;
  filtered.forEach(item => {
    const card = document.createElement('article');
    card.className = 'card';
    const image = itemImage(item);
    card.innerHTML = `<div class="thumb">${image ? `<img src="${image}" alt="">` : ''}</div><div class="ctitle">${item.name || item.title || 'Diseño'}</div>`;
    card.addEventListener('click', () => current === 'generators' ? window.vektolab.openGenerator(item.slug) : window.vektolab.openDesign(item.slug));
    grid.appendChild(card);
  });
}
function setTab(tab){
  current = tab;
  tabs.forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  search.placeholder = tab === 'generators' ? 'Buscar generadores...' : 'Buscar diseños...';
  render();
}

document.getElementById('close').onclick = () => window.vektolab.closePanel();
document.getElementById('all').onclick = () => window.vektolab.openCatalog();
document.getElementById('site').onclick = () => window.vektolab.openSite();
document.getElementById('updates').onclick = () => { status.textContent='Buscando actualizaciones...'; window.vektolab.checkUpdates(); window.vektolab.syncContent(); };
search.addEventListener('input', render);
tabs.forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

window.vektolab.onGenerators(list=>{generators=Array.isArray(list)?list:[]; if(current==='generators')render();});
window.vektolab.onDesigns(list=>{designs=Array.isArray(list)?list:[]; if(current==='designs')render();});
window.vektolab.onUpdateState(s=>{ if(!s)return; if(s.status==='available')status.textContent=`Nueva versión ${s.version} disponible`; else if(s.status==='ready')status.textContent='Actualización lista'; else if(s.status==='downloading')status.textContent=`Actualizando… ${s.percent||0}%`; else if(s.status==='up-to-date')status.textContent='Vekto está actualizado'; else if(s.status==='error')status.textContent='No se pudo comprobar ahora'; });
window.vektolab.onContentState(s=>{ if(!s)return; if(s.status==='updated')status.textContent=`Contenido actualizado · ${s.version||''}`; else if(s.status==='offline')status.textContent='Contenido local disponible'; });
window.vektolab.onPanelMode(m=>{mode=m||'home'; if(mode==='catalog'){document.getElementById('all').style.display='none';} else document.getElementById('all').style.display='';});
window.vektolab.getGenerators();
window.vektolab.getDesigns();
