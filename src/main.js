const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');
const { ContentUpdater } = require('./content-updater');
const { autoUpdater } = require('electron-updater');

let assistantWindow = null;
let generatorWindow = null;
let updateState = { status: 'idle', version: null, percent: 0, error: null };
let updateCheckRunning = false;
let contentUpdater = null;
let contentCheckRunning = false;
let tray = null;
let isQuitting = false;

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


function positionAssistant() {
  if (!assistantWindow || assistantWindow.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const [w, h] = assistantWindow.getSize();
  assistantWindow.setPosition(
    Math.round(area.x + area.width - w - 12),
    Math.round(area.y + area.height - h - 10)
  );
}

function createAssistant() {
  assistantWindow = new BrowserWindow({
    width: 430,
    height: 650,
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
    positionAssistant();
    assistantWindow.showInactive();
    assistantWindow.webContents.send('update-state', updateState);
    assistantWindow.webContents.send('app-version', app.getVersion());
  });
  assistantWindow.on('closed', () => assistantWindow = null);
}

function openGenerator(slug) {
  const generator = loadGenerators().find(g => g.slug === slug);
  if (!generator) return;
  const generatorPath = path.join(getContentRoot(), generator.file);
  if (!fs.existsSync(generatorPath)) return;
  if (generatorWindow && !generatorWindow.isDestroyed()) {
    generatorWindow.loadFile(generatorPath);
    generatorWindow.focus();
    return;
  }
  generatorWindow = new BrowserWindow({
    width: 1450,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    title: 'Vektolab Generator',
    backgroundColor: '#f7f8fa',
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  generatorWindow.loadFile(generatorPath);
  generatorWindow.on('closed', () => generatorWindow = null);
}

async function syncContent() {
  if (!contentUpdater || contentCheckRunning) return;
  contentCheckRunning = true;
  try {
    await contentUpdater.sync();
    sendGenerators();
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
  const iconPath = path.join(__dirname, '..', 'web', 'icon-192.png');
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
  ipcMain.on('open-site', () => shell.openExternal('https://vektolab.com'));
  ipcMain.on('quit-app', () => app.quit());
  ipcMain.on('check-updates', () => checkForUpdates());
  ipcMain.on('download-update', () => downloadUpdate());
  ipcMain.on('install-update', () => installUpdate());
  ipcMain.on('get-update-state', event => event.sender.send('update-state', updateState));
  ipcMain.on('get-app-version', event => event.sender.send('app-version', app.getVersion()));
  ipcMain.on('get-generators', () => sendGenerators());
  ipcMain.on('sync-content', () => syncContent());
  ipcMain.on('get-content-state', event => event.sender.send('content-state', contentUpdater?.getState() || { status: 'idle' }));

  configureStartup();
  contentUpdater = new ContentUpdater(app);
  contentUpdater.onState = state => {
    if (assistantWindow && !assistantWindow.isDestroyed()) assistantWindow.webContents.send('content-state', state);
  };
  createTray();
  createAssistant();
  contentUpdater.ensureSeeded().then(() => { sendGenerators(); syncContent(); });

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
