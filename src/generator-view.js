const frame=document.getElementById('frame'); const title=document.getElementById('title');
window.vektolab.onGeneratorView(data=>{if(!data)return;title.textContent=data.title||'Generador';frame.src=data.url||''});
document.getElementById('back').addEventListener('click',()=>window.vektolab.closeGeneratorView());
