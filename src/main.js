const { app, BrowserWindow, ipcMain, screen, shell, globalShortcut } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { ContentUpdater } = require('./content-updater');
const { autoUpdater } = require('electron-updater');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

let assistantWindow = null;
let panelWindow = null;
let generatorWindow = null;
let updateState = { status:'idle', version:null, percent:0, error:null };
let updateCheckRunning = false;
let contentUpdater = null;
let contentCheckRunning = false;
let panelOpen = false;
let avatarAnchor = null;
let panelMode = 'home';
let dragState = null;
let currentGenerator = null;
let dragMoved = false;

const AVATAR_SIZE = [90,90];
const AVATAR_VISUAL_SIZE = [78,78];
const PANEL_SIZE = [455,680];
// La imagen ocupa 78x78 dentro de una ventana transparente de 90x90 (inset 8px).
const AVATAR_CLOSED_OFFSET = { x: 8, y: 8 };
const CATALOG_SIZE = [620,780];
const POSITION_FILE = 'window-position.json';
const CONTENT_CHECK_MINUTES = 30;
const UPDATE_CHECK_MINUTES = 30;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on('checking-for-update',()=>setUpdateState({status:'checking',error:null}));
autoUpdater.on('update-available',info=>{
  setUpdateState({status:'available',version:info.version,percent:0,error:null});
  downloadUpdate();
});
autoUpdater.on('update-not-available',()=>setUpdateState({status:'up-to-date',version:app.getVersion(),percent:0,error:null}));
autoUpdater.on('download-progress',p=>setUpdateState({status:'downloading',percent:Math.round(p.percent),error:null}));
autoUpdater.on('update-downloaded',info=>setUpdateState({status:'downloaded',version:info.version,percent:100,error:null}));
autoUpdater.on('error',err=>{
  console.warn('[Vektolab] update:',err.message);
  setUpdateState({status:'error',error:err.message,percent:0});
});

function setUpdateState(next){
  updateState={...updateState,...next};
  if(panelWindow&&!panelWindow.isDestroyed()) panelWindow.webContents.send('update-state',updateState);
}
async function checkForUpdates(){
  if(!app.isPackaged){setUpdateState({status:'development',version:app.getVersion(),error:null});return;}
  if(updateCheckRunning||updateState.status==='downloading'||updateState.status==='downloaded')return;
  updateCheckRunning=true;
  try{await autoUpdater.checkForUpdates();}catch(error){setUpdateState({status:'error',error:error.message});}
  finally{updateCheckRunning=false;}
}
async function downloadUpdate(){
  if(!app.isPackaged||updateState.status==='downloading'||updateState.status==='downloaded')return;
  try{setUpdateState({status:'downloading',percent:0,error:null});await autoUpdater.downloadUpdate();}
  catch(error){setUpdateState({status:'error',error:error.message,percent:0});}
}
function installUpdate(){if(app.isPackaged)autoUpdater.quitAndInstall(false,true);}

const fallbackGenerators=[
  ['cartel-luna','Cartel Luna','imagenes/cartel-luna.webp','generadores/cartel-luna.html'],
  ['cortador-galletas','Cortador de galletas','imagenes/cortador-galletas.webp','generadores/cortador-galletas.html'],
  ['cuenco-figuras','Cuenco con figuras','imagenes/Figuras-huecas.png','generadores/cuenco-figuras.html'],
  ['identificador-lapiz','Identificador de lápiz','imagenes/identificador-lapiz.webp','generadores/identificador-lapiz.html'],
  ['letras-huecas','Letras huecas','imagenes/letras-huecas.webp','generadores/letras-huecas.html'],
  ['llavero','Llavero','imagenes/llavero.webp','generadores/llavero.html'],
  ['placa-nombre-3d','Placa de nombre 3D','imagenes/placa-nombre-3d.webp','generadores/placa-nombre-3d.html'],
  ['silueta-2d','Silueta 2D','imagenes/silueta-2d.webp','generadores/silueta-2d.html']
];

function getContentRoot(){return contentUpdater?contentUpdater.localRoot():path.join(app.getPath('userData'),'content');}
function prettifySlug(slug){return slug.replace(/[-_]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function loadGenerators(){
  const root=getContentRoot();
  try{
    const data=JSON.parse(fs.readFileSync(path.join(root,'generators.json'),'utf8'));
    if(Array.isArray(data.generators)&&data.generators.length)return data.generators;
  }catch(_){}
  const dir=path.join(root,'generadores');
  if(!fs.existsSync(dir))return fallbackGenerators.map(([slug,name,image,file])=>({slug,name,image,file}));
  return fs.readdirSync(dir).filter(n=>n.toLowerCase().endsWith('.html')).map(fileName=>{
    const slug=path.basename(fileName,'.html');
    let name=prettifySlug(slug);
    try{
      const html=fs.readFileSync(path.join(dir,fileName),'utf8');
      const m=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if(m)name=m[1].replace(/\s*[·|]\s*Vektolab.*$/i,'').replace(/\s*·\s*Generador 3D.*$/i,'').trim()||name;
    }catch(_){}
    const candidates=['webp','png','jpg','jpeg'].map(ext=>path.join(root,'imagenes',`${slug}.${ext}`));
    const image=candidates.find(p=>fs.existsSync(p));
    return {slug,name,file:`generadores/${fileName}`,image:image?`imagenes/${path.basename(image)}`:null};
  });
}
function sendGenerators(){
  if(!panelWindow||panelWindow.isDestroyed())return;
  const root=getContentRoot();
  panelWindow.webContents.send('generators',loadGenerators().map(g=>({
    slug:g.slug,name:g.name,file:g.file,
    image:g.image?pathToFileURL(path.join(root,g.image)).href:null
  })));
}
function loadDesigns(){
  try{
    const data=JSON.parse(fs.readFileSync(path.join(getContentRoot(),'disenos.json'),'utf8'));
    return Array.isArray(data.designs)?data.designs:[];
  }catch(_){return [];}
}
function sendDesigns(){
  if(!panelWindow||panelWindow.isDestroyed())return;
  const root=getContentRoot();
  panelWindow.webContents.send('designs',loadDesigns().map(d=>({
    slug:d.slug,name:d.name,file:d.file||null,url:d.url||null,
    image:d.image?pathToFileURL(path.join(root,d.image)).href:null
  })));
}

function getPositionFile(){return path.join(app.getPath('userData'),POSITION_FILE);}

// avatarAnchor es SIEMPRE la esquina superior izquierda del avatar visible
// (78x78), no la esquina de la ventana Electron (90x90). El menú puede
// cambiar el tamaño y origen de la ventana, pero jamás cambia avatarAnchor.
function getAvatarAreaAt(x,y){
  const [w,h]=AVATAR_VISUAL_SIZE;
  return screen.getDisplayNearestPoint({x:Math.round(x+w/2),y:Math.round(y+h/2)}).workArea;
}
function clampAvatarPosition(x,y,area=null){
  const [w,h]=AVATAR_VISUAL_SIZE;
  const a=area||getAvatarAreaAt(x,y);
  return {
    x:Math.max(a.x,Math.min(Math.round(x),a.x+a.width-w)),
    y:Math.max(a.y,Math.min(Math.round(y),a.y+a.height-h))
  };
}
function avatarWindowPosition(x,y){
  return {
    x:Math.round(x-AVATAR_CLOSED_OFFSET.x),
    y:Math.round(y-AVATAR_CLOSED_OFFSET.y)
  };
}
function loadSavedAvatarPosition(){
  const [w,h]=AVATAR_VISUAL_SIZE;
  try{
    const d=JSON.parse(fs.readFileSync(getPositionFile(),'utf8'));
    if(Number.isFinite(d.x)&&Number.isFinite(d.y)){
      // v2 guarda la esquina superior izquierda del avatar visible.
      // Las versiones anteriores guardaban el centro; las migramos una sola vez.
      const rawX=d.version===2?d.x:d.x-w/2;
      const rawY=d.version===2?d.y:d.y-h/2;
      return clampAvatarPosition(rawX,rawY);
    }
  }catch(_){ }
  const a=screen.getPrimaryDisplay().workArea;
  return {x:Math.round(a.x+a.width-w-8),y:Math.round(a.y+a.height-h-8)};
}
function ensureAvatarPosition(){
  if(!avatarAnchor){
    avatarAnchor=loadSavedAvatarPosition();
  }
  avatarAnchor=clampAvatarPosition(avatarAnchor.x,avatarAnchor.y);
  return avatarAnchor;
}
function setAvatarPosition(x,y,clamp=true){
  const p=clamp?clampAvatarPosition(x,y):{x:Math.round(x),y:Math.round(y)};
  avatarAnchor={x:p.x,y:p.y};
  if(assistantWindow&&!assistantWindow.isDestroyed()){
    const wp=avatarWindowPosition(p.x,p.y);
    assistantWindow.setPosition(wp.x,wp.y,false);
  }
  return avatarAnchor;
}
function saveAvatarPosition(p){
  const safe=clampAvatarPosition(p.x,p.y);
  avatarAnchor=safe;
  try{
    fs.mkdirSync(path.dirname(getPositionFile()),{recursive:true});
    // Guardamos una coordenada canónica del avatar visible.
    fs.writeFileSync(getPositionFile(),JSON.stringify({version:2,x:Math.round(safe.x),y:Math.round(safe.y)}));
  }catch(_){ }
}
function avatarTopLeft(){return ensureAvatarPosition();}

function positionPanelWindow(){
  if(!panelWindow||panelWindow.isDestroyed())return;
  const p=ensureAvatarPosition();
  const [pw,ph]=panelMode==='catalog'?CATALOG_SIZE:PANEL_SIZE;
  const area=getAvatarAreaAt(p.x,p.y);
  // El menú se ancla al avatar, pero nunca mueve al avatar.
  let x=Math.round(p.x + AVATAR_VISUAL_SIZE[0] - pw);
  let y=Math.round(p.y + AVATAR_VISUAL_SIZE[1] - ph);
  x=Math.max(area.x,Math.min(x,area.x+area.width-pw));
  y=Math.max(area.y,Math.min(y,area.y+area.height-ph));
  panelWindow.setSize(pw,ph,false);
  panelWindow.setPosition(x,y,false);
}
function createPanelWindow(mode='home'){
  if(panelWindow&&!panelWindow.isDestroyed()){
    panelMode=mode;
    positionPanelWindow();
    panelWindow.show();
    panelWindow.focus();
    return panelWindow;
  }
  panelMode=mode;
  panelWindow=new BrowserWindow({
    width:mode==='catalog'?CATALOG_SIZE[0]:PANEL_SIZE[0],
    height:mode==='catalog'?CATALOG_SIZE[1]:PANEL_SIZE[1],
    frame:false,transparent:true,resizable:false,movable:false,
    alwaysOnTop:true,skipTaskbar:true,show:false,hasShadow:false,
    backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  panelWindow.setAlwaysOnTop(true,'floating');
  panelWindow.setSkipTaskbar(true);
  panelWindow.on('closed',()=>{panelWindow=null;panelOpen=false;panelMode='home';});
  return panelWindow;
}
function setPanelOpen(open){
  const shouldOpen=!!open;
  if(shouldOpen){
    ensureAvatarPosition();
    panelOpen=true;
    if(!panelWindow||panelWindow.isDestroyed()){
      const w=createPanelWindow('home');
      w.loadFile(path.join(__dirname,'assistant.html')).then(()=>{
        if(!w||w.isDestroyed())return;
        w.webContents.send('update-state',updateState);
        w.webContents.send('app-version',app.getVersion());
        sendGenerators();sendDesigns();
        if(contentUpdater)w.webContents.send('content-state',contentUpdater.getState());
        positionPanelWindow();
        w.show();
        assistantWindow.setAlwaysOnTop(true,'floating');
        assistantWindow.moveTop();
      });
    }else{
      panelMode='home';
      positionPanelWindow();
      panelWindow.show();
      assistantWindow.setAlwaysOnTop(true,'floating');
      assistantWindow.moveTop();
    }
    return;
  }
  panelOpen=false;
  if(panelWindow&&!panelWindow.isDestroyed()){
    panelWindow.hide();
  }
}
function beginAvatarDrag(x,y){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const p=ensureAvatarPosition();
  dragState={startX:p.x,startY:p.y,pointerX:x,pointerY:y};
  dragMoved=false;
}
function moveAvatarDrag(x,y){
  if(!dragState||!assistantWindow||assistantWindow.isDestroyed())return;
  if(Math.abs(x-dragState.pointerX)+Math.abs(y-dragState.pointerY)>3)dragMoved=true;

  if(panelOpen&&dragMoved){
    setPanelOpen(false);
    const p=ensureAvatarPosition();
    dragState.startX=p.x;
    dragState.startY=p.y;
    dragState.pointerX=x;
    dragState.pointerY=y;
  }

  const [w,h]=AVATAR_VISUAL_SIZE;
  const area=getAvatarAreaAt(dragState.startX,dragState.startY);
  let nx=dragState.startX+x-dragState.pointerX;
  let ny=dragState.startY+y-dragState.pointerY;
  nx=Math.max(area.x,Math.min(nx,area.x+area.width-w));
  ny=Math.max(area.y,Math.min(ny,area.y+area.height-h));
  avatarAnchor={x:Math.round(nx),y:Math.round(ny)};
  {const wp=avatarWindowPosition(avatarAnchor.x,avatarAnchor.y);assistantWindow.setPosition(wp.x,wp.y,false);}
  if(panelOpen)positionPanelWindow();
}
function endAvatarDrag(){
  if(!dragState)return;
  dragState=null;
  saveAvatarPosition(avatarTopLeft());
}

function openGenerator(slug){
  const g=loadGenerators().find(x=>x.slug===slug);if(!g)return;
  const file=path.join(getContentRoot(),g.file);if(!fs.existsSync(file))return;
  setPanelOpen(false);
  currentGenerator=g;
  if(generatorWindow&&!generatorWindow.isDestroyed()){
    generatorWindow.loadFile(path.join(__dirname,'generator-view.html')).then(()=>{
      generatorWindow.webContents.send('generator-view',{title:g.name,url:pathToFileURL(file).href});
      generatorWindow.show();generatorWindow.focus();
    });
    return;
  }
  generatorWindow=new BrowserWindow({
    width:760,height:800,show:false,backgroundColor:'#f7f8fa',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  generatorWindow.loadFile(path.join(__dirname,'generator-view.html')).then(()=>{
    generatorWindow.webContents.send('generator-view',{title:g.name,url:pathToFileURL(file).href});
    generatorWindow.show();generatorWindow.focus();
  });
  generatorWindow.on('closed',()=>generatorWindow=null);
}
function openDesign(slug){
  const d=loadDesigns().find(x=>x.slug===slug);if(!d)return;
  if(d.url){shell.openExternal(d.url);return;}
  if(d.file)openGenerator(d.slug);
}
function openCatalog(){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  ensureAvatarPosition();
  panelOpen=true;
  panelMode='catalog';
  const w=createPanelWindow('catalog');
  const showCatalog=()=>{
    if(!w||w.isDestroyed())return;
    positionPanelWindow();
    w.webContents.send('catalog-mode');
    w.show();
    assistantWindow.setAlwaysOnTop(true,'floating');
    assistantWindow.moveTop();
  };
  if(w.webContents.getURL()) showCatalog();
  else w.loadFile(path.join(__dirname,'assistant.html')).then(()=>{
    if(w.isDestroyed())return;
    w.webContents.send('update-state',updateState);
    w.webContents.send('app-version',app.getVersion());
    sendGenerators();sendDesigns();
    if(contentUpdater)w.webContents.send('content-state',contentUpdater.getState());
    showCatalog();
  });
}
function closeCatalog(){setPanelOpen(false);}
function closeGeneratorView(){currentGenerator=null;if(generatorWindow&&!generatorWindow.isDestroyed())generatorWindow.close();setPanelOpen(false);}

async function syncContent(){
  if(!contentUpdater||contentCheckRunning)return;
  contentCheckRunning=true;
  try{
    await contentUpdater.sync();
    sendGenerators();sendDesigns();
    if(assistantWindow&&!assistantWindow.isDestroyed())assistantWindow.webContents.send('content-state',contentUpdater.getState());
  }finally{contentCheckRunning=false;}
}

function configureStartup(){
  if(!app.isPackaged)return;
  if(process.platform==='win32'||process.platform==='darwin')app.setLoginItemSettings({openAtLogin:true,openAsHidden:true});
}
function createAssistant(){
  assistantWindow=new BrowserWindow({
    width:AVATAR_SIZE[0],height:AVATAR_SIZE[1],frame:false,transparent:true,resizable:false,movable:false,
    alwaysOnTop:true,skipTaskbar:true,show:false,hasShadow:false,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  assistantWindow.setAlwaysOnTop(true,'floating');
  assistantWindow.setIgnoreMouseEvents(false);
  assistantWindow.setFocusable(true);
  assistantWindow.setSkipTaskbar(true);
  assistantWindow.loadFile(path.join(__dirname,'avatar.html'));
  assistantWindow.webContents.on('did-finish-load',()=>{
    avatarAnchor=loadSavedAvatarPosition();
    setAvatarPosition(avatarAnchor.x,avatarAnchor.y,true);
    assistantWindow.setSkipTaskbar(true);
    assistantWindow.showInactive();
  });
  assistantWindow.on('closed',()=>assistantWindow=null);
}

if(gotSingleInstanceLock){
  app.on('second-instance',()=>{
    if(assistantWindow&&!assistantWindow.isDestroyed()){assistantWindow.setSkipTaskbar(true);assistantWindow.show();assistantWindow.focus();}
  });
}

app.whenReady().then(()=>{
  app.setAppUserModelId('com.vektolab.assistant');
  ipcMain.on('open-generator',(_e,slug)=>openGenerator(slug));
  ipcMain.on('open-design',(_e,slug)=>openDesign(slug));
  ipcMain.on('open-catalog',()=>openCatalog());
  ipcMain.on('close-catalog',()=>closeCatalog());
  ipcMain.on('close-generator-view',()=>closeGeneratorView());
  ipcMain.on('open-site',()=>shell.openExternal('https://vektolab.com'));
  ipcMain.on('toggle-panel',()=>setPanelOpen(!panelOpen));
  ipcMain.on('close-panel',()=>setPanelOpen(false));
  ipcMain.on('set-panel-open',(_e,open)=>setPanelOpen(!!open));
  ipcMain.on('avatar-drag-start',(_e,d)=>beginAvatarDrag(d?.x||0,d?.y||0));
  ipcMain.on('avatar-drag-move',(_e,d)=>moveAvatarDrag(d?.x||0,d?.y||0));
  ipcMain.on('avatar-drag-end',()=>endAvatarDrag());
  ipcMain.on('quit-app',()=>app.quit());
  ipcMain.on('check-updates',()=>checkForUpdates());
  ipcMain.on('download-update',()=>downloadUpdate());
  ipcMain.on('install-update',()=>installUpdate());
  ipcMain.on('get-update-state',e=>e.sender.send('update-state',updateState));
  ipcMain.on('get-app-version',e=>e.sender.send('app-version',app.getVersion()));
  ipcMain.on('get-generators',()=>sendGenerators());
  ipcMain.on('get-designs',()=>sendDesigns());
  ipcMain.on('sync-content',()=>syncContent());
  ipcMain.on('get-content-state',e=>e.sender.send('content-state',contentUpdater?.getState()||{status:'idle'}));

  configureStartup();
  contentUpdater=new ContentUpdater(app);
  contentUpdater.onState=state=>{
    if(panelWindow&&!panelWindow.isDestroyed())panelWindow.webContents.send('content-state',state);
  };
  createAssistant();

  globalShortcut.unregisterAll();
  globalShortcut.register('CommandOrControl+Shift+V',()=>{
    if(assistantWindow&&!assistantWindow.isDestroyed())setPanelOpen(!panelOpen);
  });

  contentUpdater.ensureSeeded().then(()=>{sendGenerators();sendDesigns();syncContent();});
  screen.on('display-metrics-changed',()=>{
    if(!assistantWindow||assistantWindow.isDestroyed())return;
    const p=ensureAvatarPosition();
    avatarAnchor=clampAvatarPosition(p.x,p.y);
    {const wp=avatarWindowPosition(avatarAnchor.x,avatarAnchor.y);assistantWindow.setPosition(wp.x,wp.y,false);}
    saveAvatarPosition(avatarAnchor);
    if(panelOpen)positionPanelWindow();
  });
  setTimeout(()=>{checkForUpdates();syncContent();},7000);
  setInterval(checkForUpdates,UPDATE_CHECK_MINUTES*60*1000);
  setInterval(syncContent,CONTENT_CHECK_MINUTES*60*1000);
});

app.on('before-quit',()=>globalShortcut.unregisterAll());
app.on('window-all-closed',e=>e.preventDefault());
