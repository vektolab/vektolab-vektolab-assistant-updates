const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { ContentUpdater } = require('./content-updater');
const { autoUpdater } = require('electron-updater');

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let assistantWindow = null;
let panelWindow = null;
let viewMode = 'home';
let currentGenerator = null;
let updateState = { status: 'idle', version: null, percent: 0, error: null };
let updateCheckRunning = false;
let contentUpdater = null;
let contentCheckRunning = false;
let tray = null;
let isQuitting = false;
let panelOpen = false;
let panelMode = 'home';
let dragState = null;
let physicsTimer = null;
let physicsBounceCount = 0;
const AVATAR_SIZE = [90, 90];
const PANEL_SIZE = [430, 650];
const CATALOG_SIZE = [620, 780];
const GENERATOR_SIZE = [760, 800];
const MAX_BOUNCES = 5;
const POSITION_FILE = 'window-position.json';

const CONTENT_CHECK_MINUTES = 30;

const UPDATE_CHECK_MINUTES = 30;
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking', error: null }));
autoUpdater.on('update-available', info => {
  setUpdateState({ status: 'available', version: info.version, percent: 0, error: null });
  // Once the user asks to check, download the new version automatically.
  downloadUpdate();
});
autoUpdater.on('update-not-available', () => setUpdateState({ status: 'up-to-date', version: app.getVersion(), percent: 0, error: null }));
autoUpdater.on('download-progress', p => setUpdateState({ status: 'downloading', percent: Math.round(p.percent), error: null }));
autoUpdater.on('update-downloaded', info => setUpdateState({ status: 'downloaded', version: info.version, percent: 100, error: null }));
autoUpdater.on('error', err => {
  console.warn('[Vektolab] update:', err.message);
  setUpdateState({ status: 'error', error: err.message, percent: 0 });
});

function setUpdateState(next) {
  updateState = { ...updateState, ...next };
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send('update-state', updateState);
  }
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    setUpdateState({ status: 'development', version: app.getVersion(), error: null });
    return;
  }
  if (updateCheckRunning || updateState.status === 'downloading' || updateState.status === 'downloaded') return;
  updateCheckRunning = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    setUpdateState({ status: 'error', error: error.message });
  } finally {
    updateCheckRunning = false;
  }
}

async function downloadUpdate() {
  if (!app.isPackaged) return;
  if (updateState.status === 'downloading' || updateState.status === 'downloaded') return;
  try {
    setUpdateState({ status: 'downloading', percent: 0, error: null });
    await autoUpdater.downloadUpdate();
  } catch (error) {
    setUpdateState({ status: 'error', error: error.message, percent: 0 });
  }
}

function installUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}

const fallbackGenerators = [
  ['cartel-luna','Cartel Luna','imagenes/cartel-luna.webp','generadores/cartel-luna.html'],
  ['cortador-galletas','Cortador de galletas','imagenes/cortador-galletas.webp','generadores/cortador-galletas.html'],
  ['cuenco-figuras','Cuenco con figuras','imagenes/Figuras-huecas.png','generadores/cuenco-figuras.html'],
  ['identificador-lapiz','Identificador de lápiz','imagenes/identificador-lapiz.webp','generadores/identificador-lapiz.html'],
  ['letras-huecas','Letras huecas','imagenes/letras-huecas.webp','generadores/letras-huecas.html'],
  ['llavero','Llavero','imagenes/llavero.webp','generadores/llavero.html'],
  ['placa-nombre-3d','Placa de nombre 3D','imagenes/placa-nombre-3d.webp','generadores/placa-nombre-3d.html'],
  ['silueta-2d','Silueta 2D','imagenes/silueta-2d.webp','generadores/silueta-2d.html']
];

function getContentRoot() {
  return contentUpdater ? contentUpdater.localRoot() : path.join(app.getPath('userData'), 'content');
}

function prettifySlug(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function loadGenerators() {
  const root = getContentRoot();
  try {
    const file = path.join(root, 'generators.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data.generators) && data.generators.length) return data.generators;
  } catch (_) {}

  const dir = path.join(root, 'generadores');
  if (!fs.existsSync(dir)) return fallbackGenerators.map(([slug, name, image, file]) => ({ slug, name, image, file }));
  return fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.html')).map(fileName => {
    const slug = path.basename(fileName, '.html');
    let name = prettifySlug(slug);
    try {
      const html = fs.readFileSync(path.join(dir, fileName), 'utf8');
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (match) name = match[1].replace(/\s*[·|]\s*Vektolab.*$/i, '').replace(/\s*·\s*Generador 3D.*$/i, '').trim() || name;
    } catch (_) {}
    const imageCandidates = [
      path.join(root, 'imagenes', `${slug}.webp`),
      path.join(root, 'imagenes', `${slug}.png`),
      path.join(root, 'imagenes', `${slug}.jpg`),
      path.join(root, 'imagenes', `${slug}.jpeg`)
    ];
    const image = imageCandidates.find(p => fs.existsSync(p));
    return { slug, name, file: `generadores/${fileName}`, image: image ? `imagenes/${path.basename(image)}` : null };
  });
}

function sendGenerators() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const root = getContentRoot();
  const generators = loadGenerators().map(g => ({
    slug: g.slug,
    name: g.name,
    file: g.file,
    image: g.image ? pathToFileURL(path.join(root, g.image)).href : null
  }));
  panelWindow.webContents.send('generators', generators);
}

function loadDesigns() {
  const root = getContentRoot();
  try {
    const file = path.join(root, 'disenos.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(data.designs)) return data.designs;
  } catch (_) {}
  return [];
}

function sendDesigns() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const root = getContentRoot();
  const designs = loadDesigns().map(d => ({
    slug: d.slug,
    name: d.name,
    file: d.file || null,
    url: d.url || null,
    image: d.image ? pathToFileURL(path.join(root, d.image)).href : null
  }));
  panelWindow.webContents.send('designs', designs);
}

function openDesign(slug) {
  const design = loadDesigns().find(d => d.slug === slug);
  if (!design) return;
  if (design.url) { shell.openExternal(design.url); return; }
  if (!design.file) return;
  const designPath = path.join(getContentRoot(), design.file);
  if (!fs.existsSync(designPath)) return;
  currentGenerator = design;
  applyAssistantMode('generator');
  assistantWindow.loadFile(path.join(__dirname, 'generator-view.html'));
  assistantWindow.webContents.once('did-finish-load', () => {
    if (!assistantWindow || assistantWindow.isDestroyed()) return;
    assistantWindow.webContents.send('generator-view', {
      title: design.name || 'Diseño',
      url: pathToFileURL(designPath).href
    });
    assistantWindow.show();
    assistantWindow.focus();
  });
}


function getPositionFile() {
  return path.join(app.getPath('userData'), POSITION_FILE);
}
function loadSavedAvatarCenter() {
  try {
    const data = JSON.parse(fs.readFileSync(getPositionFile(), 'utf8'));
    if (Number.isFinite(data.x) && Number.isFinite(data.y)) return {x:data.x,y:data.y};
  } catch (_) {}
  const area=screen.getPrimaryDisplay().workArea;
  return {x:Math.round(area.x+area.width-55),y:Math.round(area.y+area.height-55)};
}
function saveAvatarCenter(center) {
  try { fs.mkdirSync(path.dirname(getPositionFile()),{recursive:true}); fs.writeFileSync(getPositionFile(),JSON.stringify({x:Math.round(center.x),y:Math.round(center.y)})); } catch(_){}
}
function avatarCenter(){ return assistantWindow && !assistantWindow.isDestroyed() ? (()=>{const [x,y]=assistantWindow.getPosition();return{x:x+45,y:y+45}})() : loadSavedAvatarCenter(); }
function getWorkAreaForPoint(x,y){ return screen.getDisplayNearestPoint({x:Math.round(x),y:Math.round(y)}).workArea; }

function stopAvatarPhysics(save=true){
  if(physicsTimer){clearInterval(physicsTimer);physicsTimer=null;}
  if(save&&assistantWindow&&!assistantWindow.isDestroyed())saveAvatarCenter(avatarCenter());
}
function startAvatarPhysics(vx,vy){
  stopAvatarPhysics(false);
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const speed=Math.hypot(vx,vy);
  if(speed<180){saveAvatarCenter(avatarCenter());return;}
  physicsBounceCount=0;
  let last=Date.now(),pos=assistantWindow.getPosition();
  let velocityX=Math.max(-2600,Math.min(2600,vx)),velocityY=Math.max(-2600,Math.min(2600,vy));
  const gravity=720, friction=.994, restitution=.72;
  physicsTimer=setInterval(()=>{
    if(!assistantWindow||assistantWindow.isDestroyed()){stopAvatarPhysics(false);return;}
    const now=Date.now(),dt=Math.min(.032,Math.max(.008,(now-last)/1000));last=now;
    velocityY+=gravity*dt;
    velocityX*=Math.pow(friction,dt*60); velocityY*=Math.pow(friction,dt*60);
    pos[0]+=velocityX*dt; pos[1]+=velocityY*dt;
    const [w,h]=AVATAR_SIZE, area=getWorkAreaForPoint(pos[0]+w/2,pos[1]+h/2);
    let hit=null;
    if(pos[0]<=area.x){pos[0]=area.x;velocityX=Math.abs(velocityX)*restitution;hit='left'}
    else if(pos[0]+w>=area.x+area.width){pos[0]=area.x+area.width-w;velocityX=-Math.abs(velocityX)*restitution;hit='right'}
    if(pos[1]<=area.y){pos[1]=area.y;velocityY=Math.abs(velocityY)*restitution;hit=hit||'top'}
    else if(pos[1]+h>=area.y+area.height){pos[1]=area.y+area.height-h;velocityY=-Math.abs(velocityY)*restitution;hit=hit||'bottom'}
    if(hit){physicsBounceCount++;if(panelWindow&&!panelWindow.isDestroyed())panelWindow.webContents.send('avatar-edge-bounce',hit);assistantWindow.webContents.send('avatar-edge-bounce',hit);}
    assistantWindow.setPosition(Math.round(pos[0]),Math.round(pos[1]),false);
    if(physicsBounceCount>=MAX_BOUNCES||Math.hypot(velocityX,velocityY)<75)stopAvatarPhysics(true);
  },16);
}
function beginAvatarDrag(x,y){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  stopAvatarPhysics(false);
  const [wx,wy]=assistantWindow.getPosition();
  dragState={startX:wx,startY:wy,pointerX:x,pointerY:y,lastEdgeHit:0};
}
function moveAvatarDrag(x,y){
  if(!dragState||!assistantWindow||assistantWindow.isDestroyed())return;
  const [w,h]=AVATAR_SIZE,area=getWorkAreaForPoint(x,y);
  let nx=dragState.startX+x-dragState.pointerX,ny=dragState.startY+y-dragState.pointerY,hit=null;
  if(nx<area.x){nx=area.x;hit='left'} else if(nx+w>area.x+area.width){nx=area.x+area.width-w;hit='right'}
  if(ny<area.y){ny=area.y;hit=hit||'top'} else if(ny+h>area.y+area.height){ny=area.y+area.height-h;hit=hit||'bottom'}
  if(hit){const now=Date.now();if(now-dragState.lastEdgeHit>150){dragState.lastEdgeHit=now;assistantWindow.webContents.send('avatar-edge-bounce',hit);}}
  assistantWindow.setPosition(Math.round(nx),Math.round(ny),false);
}
function endAvatarDrag(vx,vy){
  if(!dragState)return;dragState=null;
  if(Math.hypot(vx||0,vy||0)<180){saveAvatarCenter(avatarCenter());return;}
  startAvatarPhysics(vx||0,vy||0);
}

function positionPanelWindow(){
  if(!panelWindow||panelWindow.isDestroyed())return;
  const center=avatarCenter(), area=getWorkAreaForPoint(center.x,center.y);
  const [w,h]=panelMode==='catalog'?CATALOG_SIZE:panelMode==='generator'?GENERATOR_SIZE:PANEL_SIZE;
  const gap=10;
  const aboveY=Math.round(center.y-h-gap), belowY=Math.round(center.y+gap);
  let x=Math.round(center.x-w/2);
  x=Math.max(area.x+6,Math.min(x,area.x+area.width-w-6));
  let y;
  if(aboveY>=area.y+6)y=aboveY;
  else if(belowY+h<=area.y+area.height-6)y=belowY;
  else y=Math.max(area.y+6,Math.min(aboveY,area.y+area.height-h-6));
  panelWindow.setPosition(x,y,false);
}
function sendToUI(channel,payload){
  if(panelWindow&&!panelWindow.isDestroyed())panelWindow.webContents.send(channel,payload);
}
function closePanelWindow(){
  panelOpen=false;
  panelMode='home';
  if(panelWindow&&!panelWindow.isDestroyed()){panelWindow.close();panelWindow=null;}
}
function createPanelWindow(mode='home'){
  if(panelWindow&&!panelWindow.isDestroyed()){
    panelMode=mode;
    const size=mode==='catalog'?CATALOG_SIZE:mode==='generator'?GENERATOR_SIZE:PANEL_SIZE;
    panelWindow.setSize(size[0],size[1],false);
    positionPanelWindow();
    panelWindow.focus();
    return panelWindow;
  }
  panelMode=mode; panelOpen=true;
  const size=mode==='catalog'?CATALOG_SIZE:mode==='generator'?GENERATOR_SIZE:PANEL_SIZE;
  panelWindow=new BrowserWindow({
    width:size[0],height:size[1],frame:false,transparent:true,resizable:false,movable:false,
    alwaysOnTop:true,skipTaskbar:true,show:false,hasShadow:false,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  panelWindow.setAlwaysOnTop(true,'floating');
  panelWindow.on('blur',()=>{ if(panelMode==='home'||panelMode==='catalog') closePanelWindow(); });
  panelWindow.on('closed',()=>{panelWindow=null;panelOpen=false;panelMode='home';});
  positionPanelWindow();
  return panelWindow;
}

function createAssistant() {
  assistantWindow = new BrowserWindow({
    width:AVATAR_SIZE[0],height:AVATAR_SIZE[1],frame:false,transparent:true,resizable:false,movable:false,
    alwaysOnTop:true,skipTaskbar:true,show:false,hasShadow:false,backgroundColor:'#00000000',
    webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false}
  });
  assistantWindow.setAlwaysOnTop(true,'floating');
  assistantWindow.loadFile(path.join(__dirname,'avatar.html'));
  assistantWindow.webContents.on('did-finish-load',()=>{positionAvatar();assistantWindow.showInactive();});
  assistantWindow.on('closed',()=>assistantWindow=null);
}
function positionAvatar(){
  if(!assistantWindow||assistantWindow.isDestroyed())return;
  const c=loadSavedAvatarCenter();
  assistantWindow.setPosition(Math.round(c.x-45),Math.round(c.y-45),false);
}
function togglePanel(){
  if(panelWindow&&!panelWindow.isDestroyed()){closePanelWindow();return;}
  const w=createPanelWindow('home');
  w.loadFile(path.join(__dirname,'assistant.html'));
  w.webContents.once('did-finish-load',()=>{
    if(!w||w.isDestroyed())return;
    w.webContents.send('update-state',updateState);w.webContents.send('app-version',app.getVersion());
    sendGenerators();sendDesigns();
    if(contentUpdater)w.webContents.send('content-state',contentUpdater.getState());
    w.show();w.focus();
  });
}


function openGenerator(slug){
  stopAvatarPhysics(false);
  const generator=loadGenerators().find(g=>g.slug===slug); if(!generator)return;
  const generatorPath=path.join(getContentRoot(),generator.file); if(!fs.existsSync(generatorPath))return;
  currentGenerator=generator;
  const w=createPanelWindow('generator');
  w.loadFile(path.join(__dirname,'generator-view.html'));
  w.webContents.once('did-finish-load',()=>{
    if(!w||w.isDestroyed())return;
    w.webContents.send('generator-view',{title:generator.name,url:pathToFileURL(generatorPath).href});
    positionPanelWindow();w.show();w.focus();
  });
}
function openDesign(slug){
  const design=loadDesigns().find(d=>d.slug===slug);if(!design)return;
  if(design.url){shell.openExternal(design.url);return;}
  if(!design.file)return;
  const designPath=path.join(getContentRoot(),design.file);if(!fs.existsSync(designPath))return;
  currentGenerator=design;
  const w=createPanelWindow('generator');
  w.loadFile(path.join(__dirname,'generator-view.html'));
  w.webContents.once('did-finish-load',()=>{
    if(!w||w.isDestroyed())return;
    w.webContents.send('generator-view',{title:design.name||'Diseño',url:pathToFileURL(designPath).href});
    positionPanelWindow();w.show();w.focus();
  });
}
function openCatalog(){
  stopAvatarPhysics(false);
  const w=createPanelWindow('catalog');
  w.loadFile(path.join(__dirname,'assistant.html'));
  w.webContents.once('did-finish-load',()=>{
    if(!w||w.isDestroyed())return;
    w.webContents.send('catalog-mode');w.webContents.send('update-state',updateState);
    w.webContents.send('app-version',app.getVersion());sendGenerators();sendDesigns();
    positionPanelWindow();w.show();w.focus();
  });
}
function closeCatalog(){closePanelWindow();}
function closeGeneratorView(){
  currentGenerator=null;
  closePanelWindow();
}

async function syncContent() {
  if (!contentUpdater || contentCheckRunning) return;
  contentCheckRunning = true;
  try {
    await contentUpdater.sync();
    sendGenerators();
    sendDesigns();
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send('content-state', contentUpdater.getState());
  } finally {
    contentCheckRunning = false;
  }
}

function configureStartup() {
  if (!app.isPackaged) return;
  if (process.platform === 'win32' || process.platform === 'darwin') {
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });
  }
}

function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'assets', 'icon-192.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Vekto — Vektolab Assistant');
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Vekto', click: () => { if (assistantWindow) { assistantWindow.show(); assistantWindow.focus(); togglePanel(); } } },
    { label: 'Buscar actualizaciones', click: () => { checkForUpdates(); syncContent(); } },
    { type: 'separator' },
    { label: 'Abrir Vektolab.com', click: () => shell.openExternal('https://vektolab.com') },
    { type: 'separator' },
    { label: 'Salir de Vekto', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!assistantWindow) return;
    if (assistantWindow.isVisible()) assistantWindow.hide();
    else { positionAvatar(); assistantWindow.show(); assistantWindow.focus(); }
  });
}


if (gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      assistantWindow.show();
      assistantWindow.focus();
    }
    if (panelWindow && !panelWindow.isDestroyed()) {
      panelWindow.show();
      panelWindow.focus();
    } else {
      togglePanel();
    }
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.vektolab.assistant');

  ipcMain.on('open-generator', (_event, slug) => openGenerator(slug));
  ipcMain.on('open-design', (_event, slug) => openDesign(slug));
  ipcMain.on('open-catalog', () => openCatalog());
  ipcMain.on('close-catalog', () => closeCatalog());
  ipcMain.on('close-generator-view', () => closeGeneratorView());
  ipcMain.on('open-site', () => shell.openExternal('https://vektolab.com'));
  ipcMain.on('toggle-panel', () => togglePanel());
  ipcMain.on('close-panel', () => closePanelWindow());
  ipcMain.on('avatar-drag-start', (_event, data) => beginAvatarDrag(data?.x || 0, data?.y || 0));
  ipcMain.on('avatar-drag-move', (_event, data) => moveAvatarDrag(data?.x || 0, data?.y || 0));
  ipcMain.on('avatar-drag-end', (_event, data) => endAvatarDrag(data?.vx || 0, data?.vy || 0));
  ipcMain.on('quit-app', () => app.quit());
  ipcMain.on('check-updates', () => checkForUpdates());
  ipcMain.on('download-update', () => downloadUpdate());
  ipcMain.on('install-update', () => installUpdate());
  ipcMain.on('get-update-state', event => event.sender.send('update-state', updateState));
  ipcMain.on('get-app-version', event => event.sender.send('app-version', app.getVersion()));
  ipcMain.on('get-generators', () => sendGenerators());
  ipcMain.on('get-designs', () => sendDesigns());
  ipcMain.on('sync-content', () => syncContent());
  ipcMain.on('get-content-state', event => event.sender.send('content-state', contentUpdater?.getState() || { status: 'idle' }));

  configureStartup();
  contentUpdater = new ContentUpdater(app);
  contentUpdater.onState = state => {
    if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send('content-state', state);
  };
  createTray();
  createAssistant();
  contentUpdater.ensureSeeded().then(() => { sendGenerators(); sendDesigns(); syncContent(); });

  screen.on('display-metrics-changed', () => { if (assistantWindow && !assistantWindow.isDestroyed()) { const c=loadSavedAvatarCenter(); const area=screen.getDisplayNearestPoint(c).workArea; const x=Math.max(area.x,Math.min(c.x,area.x+area.width)); const y=Math.max(area.y,Math.min(c.y,area.y+area.height)); assistantWindow.setPosition(Math.round(x-45),Math.round(y-45),false); } });

  // Primera comprobación poco después de iniciar y luego cada 30 minutos.
  setTimeout(() => { checkForUpdates(); syncContent(); }, 7000);
  setInterval(checkForUpdates, UPDATE_CHECK_MINUTES * 60 * 1000);
  setInterval(syncContent, CONTENT_CHECK_MINUTES * 60 * 1000);
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', event => event.preventDefault());
