const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { ContentUpdater } = require('./content-updater');
const { autoUpdater } = require('electron-updater');

let assistantWindow = null;
let viewMode = 'home';
let currentGenerator = null;
let updateState = { status: 'idle', version: null, percent: 0, error: null };
let updateCheckRunning = false;
let contentUpdater = null;
let contentCheckRunning = false;
let tray = null;
let isQuitting = false;
let panelOpen = false;
let dragState = null;
let physicsTimer = null;
let physicsBounceCount = 0;
const COMPACT_SIZE = [90, 90];
const HOME_SIZE = [430, 650];
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
  if (assistantWindow && !assistantWindow.isDestroyed()) {
    assistantWindow.webContents.send('update-state', updateState);
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
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  const root = getContentRoot();
  const generators = loadGenerators().map(g => ({
    slug: g.slug,
    name: g.name,
    file: g.file,
    image: g.image ? pathToFileURL(path.join(root, g.image)).href : null
  }));
  assistantWindow.webContents.send('generators', generators);
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
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  const root = getContentRoot();
  const designs = loadDesigns().map(d => ({
    slug: d.slug,
    name: d.name,
    file: d.file || null,
    url: d.url || null,
    image: d.image ? pathToFileURL(path.join(root, d.image)).href : null
  }));
  assistantWindow.webContents.send('designs', designs);
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
    if (Number.isFinite(data.x) && Number.isFinite(data.y)) return { x: data.x, y: data.y };
  } catch (_) {}
  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: Math.round(area.x + area.width - COMPACT_SIZE[0] / 2 - 18),
    y: Math.round(area.y + area.height - COMPACT_SIZE[1] / 2 - 18)
  };
}

function saveAvatarCenter(center) {
  try {
    fs.mkdirSync(path.dirname(getPositionFile()), { recursive: true });
    fs.writeFileSync(getPositionFile(), JSON.stringify({ x: Math.round(center.x), y: Math.round(center.y) }));
  } catch (_) {}
}

function compactWindowCenter() {
  if (!assistantWindow || assistantWindow.isDestroyed()) return { x: 0, y: 0 };
  const [x, y] = assistantWindow.getPosition();
  const [w, h] = assistantWindow.getSize();
  return { x: x + w / 2, y: y + h / 2 };
}

function expandedWindowAvatarCenter() {
  if (!assistantWindow || assistantWindow.isDestroyed()) return { x: 0, y: 0 };
  const [x, y] = assistantWindow.getPosition();
  return { x: x + 47, y: y + 605 };
}

function moveWindowKeepingAvatar(center, size) {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  assistantWindow.setSize(size[0], size[1], false);
  const offset = size[0] === COMPACT_SIZE[0]
    ? { x: size[0] / 2, y: size[1] / 2 }
    : { x: 47, y: 605 };
  assistantWindow.setPosition(Math.round(center.x - offset.x), Math.round(center.y - offset.y), false);
}

function setHomePanelOpen(open) {
  if (!assistantWindow || assistantWindow.isDestroyed() || viewMode !== 'home') return;
  const next = !!open;
  if (panelOpen === next) return;
  const center = panelOpen ? expandedWindowAvatarCenter() : compactWindowCenter();
  panelOpen = next;
  moveWindowKeepingAvatar(center, next ? HOME_SIZE : COMPACT_SIZE);
}

function getWorkAreaForPoint(x, y) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  return display.workArea;
}

function clampWindowPosition(x, y) {
  if (!assistantWindow || assistantWindow.isDestroyed()) return { x, y };
  const [w, h] = assistantWindow.getSize();
  const area = getWorkAreaForPoint(x + w / 2, y + h / 2);
  return {
    x: Math.max(area.x, Math.min(Math.round(x), area.x + area.width - w)),
    y: Math.max(area.y, Math.min(Math.round(y), area.y + area.height - h))
  };
}

function stopAvatarPhysics(save = true) {
  if (physicsTimer) {
    clearInterval(physicsTimer);
    physicsTimer = null;
  }
  if (save && assistantWindow && !assistantWindow.isDestroyed()) saveAvatarCenter(compactWindowCenter());
}

function startAvatarPhysics(vx, vy) {
  stopAvatarPhysics(false);
  if (!assistantWindow || assistantWindow.isDestroyed() || viewMode !== 'home') return;

  const speed = Math.hypot(vx, vy);
  if (speed < 180) {
    saveAvatarCenter(compactWindowCenter());
    return;
  }

  physicsBounceCount = 0;
  let last = Date.now();
  let pos = assistantWindow.getPosition();
  let velocityX = Math.max(-2200, Math.min(2200, vx));
  let velocityY = Math.max(-2200, Math.min(2200, vy));
  const gravity = 520;
  const friction = 0.992;

  physicsTimer = setInterval(() => {
    if (!assistantWindow || assistantWindow.isDestroyed()) {
      stopAvatarPhysics(false);
      return;
    }

    const now = Date.now();
    const dt = Math.min(0.032, Math.max(0.008, (now - last) / 1000));
    last = now;

    velocityY += gravity * dt;
    velocityX *= Math.pow(friction, dt * 60);
    velocityY *= Math.pow(friction, dt * 60);

    pos[0] += velocityX * dt;
    pos[1] += velocityY * dt;

    const [w, h] = assistantWindow.getSize();
    const area = getWorkAreaForPoint(pos[0] + w / 2, pos[1] + h / 2);
    let bounced = false;

    if (pos[0] <= area.x) {
      pos[0] = area.x;
      velocityX = Math.abs(velocityX) * 0.72;
      bounced = true;
    } else if (pos[0] + w >= area.x + area.width) {
      pos[0] = area.x + area.width - w;
      velocityX = -Math.abs(velocityX) * 0.72;
      bounced = true;
    }

    if (pos[1] <= area.y) {
      pos[1] = area.y;
      velocityY = Math.abs(velocityY) * 0.72;
      bounced = true;
    } else if (pos[1] + h >= area.y + area.height) {
      pos[1] = area.y + area.height - h;
      velocityY = -Math.abs(velocityY) * 0.72;
      bounced = true;
    }

    if (bounced) physicsBounceCount++;

    assistantWindow.setPosition(Math.round(pos[0]), Math.round(pos[1]), false);

    const currentSpeed = Math.hypot(velocityX, velocityY);
    if (physicsBounceCount >= MAX_BOUNCES || currentSpeed < 75) {
      stopAvatarPhysics(true);
    }
  }, 16);
}

function beginAvatarDrag(screenX, screenY) {
  if (!assistantWindow || assistantWindow.isDestroyed() || viewMode !== 'home') return;
  stopAvatarPhysics(false);

  if (panelOpen) {
    const center = expandedWindowAvatarCenter();
    panelOpen = false;
    moveWindowKeepingAvatar(center, COMPACT_SIZE);
  }

  const [wx, wy] = assistantWindow.getPosition();
  dragState = {
    startX: wx,
    startY: wy,
    pointerX: screenX,
    pointerY: screenY
  };
}

function moveAvatarDrag(screenX, screenY) {
  if (!dragState || !assistantWindow || assistantWindow.isDestroyed()) return;
  const next = clampWindowPosition(
    dragState.startX + screenX - dragState.pointerX,
    dragState.startY + screenY - dragState.pointerY
  );
  assistantWindow.setPosition(next.x, next.y, false);
}

function endAvatarDrag(vx, vy) {
  if (!dragState || !assistantWindow || assistantWindow.isDestroyed()) return;
  dragState = null;
  const speed = Math.hypot(vx || 0, vy || 0);
  if (speed < 180) {
    saveAvatarCenter(compactWindowCenter());
    return;
  }
  startAvatarPhysics(vx || 0, vy || 0);
}

function getWindowSizeForMode(mode = viewMode) {
  if (mode === 'generator') return [760, 800];
  if (mode === 'catalog') return [620, 780];
  return panelOpen ? HOME_SIZE : COMPACT_SIZE;
}

function applyAssistantMode(mode) {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  viewMode = mode;
  const [w, h] = getWindowSizeForMode(mode);
  assistantWindow.setResizable(false);
  assistantWindow.setSize(w, h, true);
  positionAssistant();
}

function positionAssistant() {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  if (viewMode === 'home') {
    if (panelOpen) {
      const center = expandedWindowAvatarCenter();
      moveWindowKeepingAvatar(center, HOME_SIZE);
    } else {
      const center = loadSavedAvatarCenter();
      moveWindowKeepingAvatar(center, COMPACT_SIZE);
    }
    return;
  }
  const area = screen.getPrimaryDisplay().workArea;
  const [w, h] = assistantWindow.getSize();
  assistantWindow.setPosition(
    Math.round(area.x + area.width - w - 12),
    Math.round(area.y + area.height - h - 10)
  );
}

function createAssistant() {
  assistantWindow = new BrowserWindow({
    width: 90,
    height: 90,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  assistantWindow.setAlwaysOnTop(true, 'floating');
  assistantWindow.loadFile(path.join(__dirname, 'assistant.html'));
  assistantWindow.webContents.on('did-finish-load', () => {
    panelOpen = false;
    positionAssistant();
    assistantWindow.showInactive();
    assistantWindow.webContents.send('update-state', updateState);
    assistantWindow.webContents.send('app-version', app.getVersion());
    sendGenerators();
    sendDesigns();
    if (contentUpdater) assistantWindow.webContents.send('content-state', contentUpdater.getState());
  });
  assistantWindow.on('blur', () => {
    if (viewMode === 'home' || viewMode === 'catalog') {
      assistantWindow.webContents.send('assistant-blur');
    }
  });
  assistantWindow.on('closed', () => assistantWindow = null);
}

function openGenerator(slug) {
  stopAvatarPhysics(false);
  panelOpen = false;
  const generator = loadGenerators().find(g => g.slug === slug);
  if (!generator) return;
  const generatorPath = path.join(getContentRoot(), generator.file);
  if (!fs.existsSync(generatorPath)) return;
  currentGenerator = generator;
  applyAssistantMode('generator');
  assistantWindow.loadFile(path.join(__dirname, 'generator-view.html'));
  assistantWindow.webContents.once('did-finish-load', () => {
    if (!assistantWindow || assistantWindow.isDestroyed()) return;
    assistantWindow.webContents.send('generator-view', {
      title: generator.name,
      url: pathToFileURL(generatorPath).href
    });
    assistantWindow.show();
    assistantWindow.focus();
  });
}

function openCatalog() {
  stopAvatarPhysics(false);
  panelOpen = false;
  currentGenerator = null;
  applyAssistantMode('catalog');
  assistantWindow.loadFile(path.join(__dirname, 'assistant.html'));
  assistantWindow.webContents.once('did-finish-load', () => {
    if (!assistantWindow || assistantWindow.isDestroyed()) return;
    assistantWindow.webContents.send('catalog-mode');
    assistantWindow.show();
    assistantWindow.focus();
  });
}

function closeCatalog() {
  stopAvatarPhysics(false);
  panelOpen = false;
  currentGenerator = null;
  applyAssistantMode('home');
  assistantWindow.loadFile(path.join(__dirname, 'assistant.html'));
}

function closeGeneratorView() {
  stopAvatarPhysics(false);
  panelOpen = false;
  currentGenerator = null;
  applyAssistantMode('home');
  assistantWindow.loadFile(path.join(__dirname, 'assistant.html'));
  assistantWindow.webContents.once('did-finish-load', () => {
    if (!assistantWindow || assistantWindow.isDestroyed()) return;
    assistantWindow.webContents.send('update-state', updateState);
    assistantWindow.webContents.send('app-version', app.getVersion());
    sendGenerators();
    sendDesigns();
    if (contentUpdater) assistantWindow.webContents.send('content-state', contentUpdater.getState());
    assistantWindow.showInactive();
  });
}

async function syncContent() {
  if (!contentUpdater || contentCheckRunning) return;
  contentCheckRunning = true;
  try {
    await contentUpdater.sync();
    sendGenerators();
    sendDesigns();
    if (assistantWindow && !assistantWindow.isDestroyed()) {
      assistantWindow.webContents.send('content-state', contentUpdater.getState());
    }
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
    { label: 'Abrir Vekto', click: () => { if (assistantWindow) { assistantWindow.show(); assistantWindow.focus(); } } },
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
    else { positionAssistant(); assistantWindow.show(); assistantWindow.focus(); }
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
  ipcMain.on('set-panel-open', (_event, open) => setHomePanelOpen(!!open));
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
    if (assistantWindow && !assistantWindow.isDestroyed()) assistantWindow.webContents.send('content-state', state);
  };
  createTray();
  createAssistant();
  contentUpdater.ensureSeeded().then(() => { sendGenerators(); sendDesigns(); syncContent(); });

  screen.on('display-metrics-changed', positionAssistant);
  screen.on('display-added', positionAssistant);
  screen.on('display-removed', positionAssistant);

  // Primera comprobación poco después de iniciar y luego cada 30 minutos.
  setTimeout(() => { checkForUpdates(); syncContent(); }, 7000);
  setInterval(checkForUpdates, UPDATE_CHECK_MINUTES * 60 * 1000);
  setInterval(syncContent, CONTENT_CHECK_MINUTES * 60 * 1000);
});

app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', event => event.preventDefault());
