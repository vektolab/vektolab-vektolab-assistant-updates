const { app, BrowserWindow, ipcMain, screen, shell, globalShortcut } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { ContentUpdater } = require('./content-updater');
const { autoUpdater } = require('electron-updater');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

let assistantWindow = null;
let generatorWindow = null;
let updateState = { status:'idle', version:null, percent:0, error:null };
let updateCheckRunning = false;
let contentUpdater = null;
let contentCheckRunning = false;
let panelOpen = false;
let panelMode = 'home';
let dragState = null;
let currentGenerator = null;
let physicsTimer = null;
let physicsBounceCount = 0;
let dragMoved = false;
const MAX_BOUNCES = 5;

const AVATAR_SIZE = [90,90];
const PANEL_SIZE = [430,640];
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
  if(assistantWindow&&!assistantWindow.isDestroyed()) assistantWindow.webContents.send('update-state',updateState);
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
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const root=getContentRoot();
  assistantWindow.webContents.send('generators',loadGenerators().map(g=>({
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
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const root=getContentRoot();
  assistantWindow.webContents.send('designs',loadDesigns().map(d=>({
    slug:d.slug,name:d.name,file:d.file||null,url:d.url||null,
    image:d.image?pathToFileURL(path.join(root,d.image)).href:null
  })));
}

function getPositionFile(){return path.join(app.getPath('userData'),POSITION_FILE);}
function clampAvatarPosition(x,y){
  const [w,h]=AVATAR_SIZE;
  const area=screen.getDisplayNearestPoint({x:Math.round(x+w/2),y:Math.round(y+h/2)}).workArea;
  return {
    x:Math.max(area.x,Math.min(Math.round(x),area.x+area.width-w)),
    y:Math.max(area.y,Math.min(Math.round(y),area.y+area.height-h))
  };
}
function loadSavedAvatarCenter(){
  const [w,h]=AVATAR_SIZE;
  try{
    const d=JSON.parse(fs.readFileSync(getPositionFile(),'utf8'));
    if(Number.isFinite(d.x)&&Number.isFinite(d.y)){
      const p=clampAvatarPosition(d.x-w/2,d.y-h/2);
      return{x:p.x+w/2,y:p.y+h/2};
    }
  }catch(_){}
  const a=screen.getPrimaryDisplay().workArea;
  return{x:Math.round(a.x+a.width-w/2-8),y:Math.round(a.y+a.height-h/2-8)};
}
function saveAvatarCenter(c){
  try{fs.mkdirSync(path.dirname(getPositionFile()),{recursive:true});fs.writeFileSync(getPositionFile(),JSON.stringify({x:Math.round(c.x),y:Math.round(c.y)}));}catch(_){}
}
function avatarCenter(){
  if(!assistantWindow||assistantWindow.isDestroyed())return loadSavedAvatarCenter();
  const [x,y]=assistantWindow.getPosition();
  // El avatar está en la esquina inferior derecha del panel.
  // Debe coincidir exactamente con .avatar-wrap de assistant.html: right 9px, bottom 7px, 78x78.
  if(panelOpen){
    const avatarW=78, avatarH=78;
    const panelW=panelMode==='catalog'?CATALOG_SIZE[0]:PANEL_SIZE[0];
    const panelH=panelMode==='catalog'?CATALOG_SIZE[1]:PANEL_SIZE[1];
    return{x:x+panelW-9-avatarW/2,y:y+panelH-7-avatarH/2};
  }
  return{x:x+45,y:y+45};
}

function stopAvatarPhysics(save=true){
  if(physicsTimer){clearInterval(physicsTimer);physicsTimer=null;}
  if(save && assistantWindow && !assistantWindow.isDestroyed()) saveAvatarCenter(avatarCenter());
}

function startAvatarPhysics(vx,vy){
  stopAvatarPhysics(false);
  if(!assistantWindow||assistantWindow.isDestroyed()||panelOpen)return;
  const speed=Math.hypot(vx,vy);
  const [w,h]=AVATAR_SIZE;
  // La física trabaja siempre sobre el área de trabajo que contiene a Vekto
  // cuando comienza el lanzamiento. No volvemos a cambiar de monitor/área
  // durante el rebote aunque la ventana quede momentáneamente cerca de un borde.
  const startPos=assistantWindow.getPosition();
  const startCenter={x:startPos[0]+w/2,y:startPos[1]+h/2};
  const area=screen.getDisplayNearestPoint({x:Math.round(startCenter.x),y:Math.round(startCenter.y)}).workArea;
  const minX=area.x;
  const maxX=area.x+area.width-w;
  const minY=area.y;
  const maxY=area.y+area.height-h;
  const clampX=Math.max(minX,Math.min(Math.round(startPos[0]),maxX));
  const clampY=Math.max(minY,Math.min(Math.round(startPos[1]),maxY));

  if(clampX!==startPos[0]||clampY!==startPos[1]){
    assistantWindow.setPosition(clampX,clampY,false);
  }

  if(speed<180){
    saveAvatarCenter({x:clampX+w/2,y:clampY+h/2});
    return;
  }

  physicsBounceCount=0;
  let last=Date.now();
  let pos=[clampX,clampY];
  let velocityX=Math.max(-2200,Math.min(2200,vx));
  let velocityY=Math.max(-2200,Math.min(2200,vy));
  const gravity=520;
  const friction=0.992;

  physicsTimer=setInterval(()=>{
    if(!assistantWindow||assistantWindow.isDestroyed()){stopAvatarPhysics(false);return;}
    const now=Date.now();
    const dt=Math.min(0.032,Math.max(0.008,(now-last)/1000));
    last=now;

    velocityY+=gravity*dt;
    velocityX*=Math.pow(friction,dt*60);
    velocityY*=Math.pow(friction,dt*60);
    pos[0]+=velocityX*dt;
    pos[1]+=velocityY*dt;

    let bounced=false;
    let direction=null;

    // Estos límites quedan fijados al comenzar el lanzamiento.
    // Abrir/cerrar el menú antes del lanzamiento no puede alterar la física.
    if(pos[0]<minX){
      pos[0]=minX; velocityX=Math.abs(velocityX)*0.72; bounced=true; direction='left';
    }else if(pos[0]>maxX){
      pos[0]=maxX; velocityX=-Math.abs(velocityX)*0.72; bounced=true; direction='right';
    }
    if(pos[1]<minY){
      pos[1]=minY; velocityY=Math.abs(velocityY)*0.72; bounced=true; direction=direction||'top';
    }else if(pos[1]>maxY){
      pos[1]=maxY; velocityY=-Math.abs(velocityY)*0.72; bounced=true; direction=direction||'bottom';
    }

    if(bounced){
      physicsBounceCount++;
      if(assistantWindow&&!assistantWindow.isDestroyed()) assistantWindow.webContents.send('avatar-edge-bounce',direction);
    }
    assistantWindow.setPosition(Math.round(pos[0]),Math.round(pos[1]),false);

    if(physicsBounceCount>=MAX_BOUNCES || Math.hypot(velocityX,velocityY)<75){
      // Guardamos exactamente la posición física, no una posición derivada del menú.
      saveAvatarCenter({x:pos[0]+w/2,y:pos[1]+h/2});
      stopAvatarPhysics(false);
    }
  },16);
}
function resizeForState(open,mode='home',centerOverride=null){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const c=centerOverride || avatarCenter();
  if(open){
    panelMode=mode;
    const [w,h]=mode==='catalog'?CATALOG_SIZE:PANEL_SIZE;
    const avatarW=78, avatarH=78;
    const ax=mode==='catalog'?CATALOG_SIZE[0]-9-avatarW/2:PANEL_SIZE[0]-9-avatarW/2;
    const ay=mode==='catalog'?CATALOG_SIZE[1]-7-avatarH/2:PANEL_SIZE[1]-7-avatarH/2;
    let x=Math.round(c.x-ax), y=Math.round(c.y-ay);
    const area=screen.getDisplayNearestPoint({x:Math.round(c.x),y:Math.round(c.y)}).workArea;
    x=Math.max(area.x+4,Math.min(x,area.x+area.width-w-4));
    y=Math.max(area.y+4,Math.min(y,area.y+area.height-h-4));
    assistantWindow.setSize(w,h,false);
    assistantWindow.setPosition(x,y,false);
  }else{
    panelMode='home';
    assistantWindow.setSize(AVATAR_SIZE[0],AVATAR_SIZE[1],false);
    const safe=clampAvatarPosition(c.x-AVATAR_SIZE[0]/2,c.y-AVATAR_SIZE[1]/2);
    assistantWindow.setPosition(safe.x,safe.y,false);
  }
}
function setPanelOpen(open){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  // Capturamos la posición REAL del avatar antes de cambiar el tamaño de la ventana.
  // Esto evita perderla al pasar de 90x90 a la ventana del menú y volver.
  const c=avatarCenter();
  panelOpen=!!open;
  if(panelOpen){
    resizeForState(true,'home',c);
    assistantWindow.setSkipTaskbar(true);assistantWindow.show();assistantWindow.focus();
  }else{
    resizeForState(false,'home',c);
    assistantWindow.setSkipTaskbar(true);
    assistantWindow.showInactive();
  }
}
function beginAvatarDrag(x,y){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  stopAvatarPhysics(false);
  const [wx,wy]=assistantWindow.getPosition();
  dragState={startX:wx,startY:wy,pointerX:x,pointerY:y};
  dragMoved=false;
}
function moveAvatarDrag(x,y){
  if(!dragState||!assistantWindow||assistantWindow.isDestroyed())return;
  if(Math.abs(x-dragState.pointerX)+Math.abs(y-dragState.pointerY)>3)dragMoved=true;

  // Si el usuario realmente arrastra con el menú abierto, primero lo minimizamos
  // manteniendo el avatar exactamente debajo del cursor. Un simple clic no lo mueve.
  if(panelOpen && dragMoved){
    // Guardamos la posición del avatar mientras todavía estamos en modo menú.
    // Después de cerrar el menú la ventana cambia de tamaño y no debemos recalcular
    // la posición usando las coordenadas de la ventana grande.
    const c=avatarCenter();
    setPanelOpen(false);
    dragState.startX=Math.round(c.x-AVATAR_SIZE[0]/2);
    dragState.startY=Math.round(c.y-AVATAR_SIZE[1]/2);
    dragState.pointerX=x;
    dragState.pointerY=y;
  }

  const [w,h]=AVATAR_SIZE;
  const area=screen.getDisplayNearestPoint({x,y}).workArea;
  let nx=dragState.startX+x-dragState.pointerX;
  let ny=dragState.startY+y-dragState.pointerY;
  nx=Math.max(area.x,Math.min(nx,area.x+area.width-w));
  ny=Math.max(area.y,Math.min(ny,area.y+area.height-h));
  assistantWindow.setPosition(Math.round(nx),Math.round(ny),false);
}
function endAvatarDrag(vx=0,vy=0){
  if(!dragState)return;
  dragState=null;
  if(Math.hypot(vx||0,vy||0)>=180 && dragMoved){
    startAvatarPhysics(vx||0,vy||0);
  }else{
    saveAvatarCenter(avatarCenter());
  }
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
  const c=avatarCenter();panelOpen=true;panelMode='catalog';
  assistantWindow.setSize(CATALOG_SIZE[0],CATALOG_SIZE[1],false);
  const area=screen.getDisplayNearestPoint({x:Math.round(c.x),y:Math.round(c.y)}).workArea;
  const avatarW=78, avatarH=78;
  const avatarCenterOffsetX=CATALOG_SIZE[0]-9-avatarW/2;
  const avatarCenterOffsetY=CATALOG_SIZE[1]-7-avatarH/2;
  const x=Math.max(area.x+4,Math.min(Math.round(c.x-avatarCenterOffsetX),area.x+area.width-CATALOG_SIZE[0]-4));
  const y=Math.max(area.y+4,Math.min(Math.round(c.y-avatarCenterOffsetY),area.y+area.height-CATALOG_SIZE[1]-4));
  assistantWindow.setPosition(x,y,false);
  assistantWindow.webContents.send('catalog-mode');
  assistantWindow.setSkipTaskbar(true);assistantWindow.show();assistantWindow.focus();
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
  assistantWindow.loadFile(path.join(__dirname,'assistant.html'));
  assistantWindow.webContents.on('did-finish-load',()=>{
    resizeForState(false);
    assistantWindow.setSkipTaskbar(true);
    assistantWindow.showInactive();
    assistantWindow.webContents.send('update-state',updateState);
    assistantWindow.webContents.send('app-version',app.getVersion());
    sendGenerators();sendDesigns();
    if(contentUpdater)assistantWindow.webContents.send('content-state',contentUpdater.getState());
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
  ipcMain.on('avatar-drag-end',(_e,d)=>endAvatarDrag(d?.vx||0,d?.vy||0));
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
    if(assistantWindow&&!assistantWindow.isDestroyed())assistantWindow.webContents.send('content-state',state);
  };
  createAssistant();

  globalShortcut.unregisterAll();
  globalShortcut.register('CommandOrControl+Shift+V',()=>{
    if(assistantWindow&&!assistantWindow.isDestroyed())setPanelOpen(!panelOpen);
  });

  contentUpdater.ensureSeeded().then(()=>{sendGenerators();sendDesigns();syncContent();});
  screen.on('display-metrics-changed',()=>{if(assistantWindow&&!assistantWindow.isDestroyed()&&!panelOpen)resizeForState(false);});
  setTimeout(()=>{checkForUpdates();syncContent();},7000);
  setInterval(checkForUpdates,UPDATE_CHECK_MINUTES*60*1000);
  setInterval(syncContent,CONTENT_CHECK_MINUTES*60*1000);
});

app.on('before-quit',()=>globalShortcut.unregisterAll());
app.on('window-all-closed',e=>e.preventDefault());
