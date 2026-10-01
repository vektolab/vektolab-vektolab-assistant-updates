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

const AVATAR_SIZE = [90,90];
const PANEL_SIZE = [430,650];
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
function loadSavedAvatarCenter(){
  try{
    const d=JSON.parse(fs.readFileSync(getPositionFile(),'utf8'));
    if(Number.isFinite(d.x)&&Number.isFinite(d.y))return{x:d.x,y:d.y};
  }catch(_){}
  const a=screen.getPrimaryDisplay().workArea;
  return{x:Math.round(a.x+a.width-55),y:Math.round(a.y+a.height-55)};
}
function saveAvatarCenter(c){
  try{fs.mkdirSync(path.dirname(getPositionFile()),{recursive:true});fs.writeFileSync(getPositionFile(),JSON.stringify({x:Math.round(c.x),y:Math.round(c.y)}));}catch(_){}
}
function avatarCenter(){
  if(!assistantWindow||assistantWindow.isDestroyed())return loadSavedAvatarCenter();
  const [x,y]=assistantWindow.getPosition();
  if(panelOpen)return{x:x+382,y:y+594};
  return{x:x+45,y:y+45};
}
function resizeForState(open,mode='home'){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const c=avatarCenter();
  if(open){
    panelMode=mode;
    const [w,h]=mode==='catalog'?CATALOG_SIZE:PANEL_SIZE;
    const ax=mode==='catalog'?CATALOG_SIZE[0]-9-34:430-9-39;
    const ay=mode==='catalog'?CATALOG_SIZE[1]-7-34:650-7-39;
    let x=Math.round(c.x-ax), y=Math.round(c.y-ay);
    const area=screen.getDisplayNearestPoint({x:Math.round(c.x),y:Math.round(c.y)}).workArea;
    x=Math.max(area.x+4,Math.min(x,area.x+area.width-w-4));
    y=Math.max(area.y+4,Math.min(y,area.y+area.height-h-4));
    assistantWindow.setSize(w,h,false);
    assistantWindow.setPosition(x,y,false);
  }else{
    panelMode='home';
    assistantWindow.setSize(AVATAR_SIZE[0],AVATAR_SIZE[1],false);
    assistantWindow.setPosition(Math.round(c.x-45),Math.round(c.y-45),false);
  }
}
function setPanelOpen(open){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  panelOpen=!!open;
  if(panelOpen){
    resizeForState(true,'home');
    assistantWindow.show();assistantWindow.focus();
  }else{
    resizeForState(false);
    assistantWindow.showInactive();
  }
}
function beginAvatarDrag(x,y){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  if(panelOpen)setPanelOpen(false);
  const [wx,wy]=assistantWindow.getPosition();
  dragState={startX:wx,startY:wy,pointerX:x,pointerY:y};
}
function moveAvatarDrag(x,y){
  if(!dragState||!assistantWindow||assistantWindow.isDestroyed())return;
  const [w,h]=AVATAR_SIZE;
  const area=screen.getDisplayNearestPoint({x,y}).workArea;
  let nx=dragState.startX+x-dragState.pointerX;
  let ny=dragState.startY+y-dragState.pointerY;
  nx=Math.max(area.x,Math.min(nx,area.x+area.width-w));
  ny=Math.max(area.y,Math.min(ny,area.y+area.height-h));
  assistantWindow.setPosition(Math.round(nx),Math.round(ny),false);
}
function endAvatarDrag(){
  if(!dragState)return;
  dragState=null;
  saveAvatarCenter(avatarCenter());
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
  const x=Math.max(area.x+4,Math.min(Math.round(c.x-(CATALOG_SIZE[0]-43)),area.x+area.width-CATALOG_SIZE[0]-4));
  const y=Math.max(area.y+4,Math.min(Math.round(c.y-(CATALOG_SIZE[1]-41)),area.y+area.height-CATALOG_SIZE[1]-4));
  assistantWindow.setPosition(x,y,false);
  assistantWindow.webContents.send('catalog-mode');
  assistantWindow.show();assistantWindow.focus();
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
  assistantWindow.loadFile(path.join(__dirname,'assistant.html'));
  assistantWindow.webContents.on('did-finish-load',()=>{
    resizeForState(false);
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
    if(assistantWindow&&!assistantWindow.isDestroyed()){assistantWindow.show();assistantWindow.focus();}
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
