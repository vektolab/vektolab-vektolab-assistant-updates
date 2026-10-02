const { app, BrowserWindow, ipcMain, screen, shell, Menu } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { ContentUpdater } = require('./content-updater');

const APP_VERSION = require('../package.json').version;
const AVATAR_SIZE = 92;
const PANEL_SIZE = { width: 455, height: 680 };
const CATALOG_SIZE = { width: 720, height: 790 };
const GENERATOR_SIZE = { width: 1120, height: 800 };
const SITE_URL = 'https://vektolab.pages.dev/';

let avatarWindow = null;
let panelWindow = null;
let generatorWindow = null;
let panelMode = 'home';
let avatarDragging = false;
let dragOffset = { x: 0, y: 0 };
let avatarPosition = null;
let contentUpdater = null;
let updateState = { status: 'idle' };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

function positionFile() {
  return path.join(app.getPath('userData'), 'avatar-position.json');
}

function saveAvatarPosition() {
  if (!avatarPosition) return;
  try {
    fs.mkdirSync(path.dirname(positionFile()), { recursive: true });
    fs.writeFileSync(positionFile(), JSON.stringify(avatarPosition));
  } catch (_) {}
}

function readAvatarPosition() {
  try {
    const value = JSON.parse(fs.readFileSync(positionFile(), 'utf8'));
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) return value;
  } catch (_) {}
  return null;
}

function workAreaForPoint(x, y) {
  const displays = screen.getAllDisplays();
  let best = displays[0];
  let bestDistance = Infinity;
  for (const display of displays) {
    const a = display.workArea;
    if (x >= a.x && x <= a.x + a.width && y >= a.y && y <= a.y + a.height) return a;
    const cx = a.x + a.width / 2;
    const cy = a.y + a.height / 2;
    const d = (cx - x) ** 2 + (cy - y) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = display;
    }
  }
  return best.workArea;
}

function clampAvatar(x, y) {
  const area = workAreaForPoint(x + AVATAR_SIZE / 2, y + AVATAR_SIZE / 2);
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - AVATAR_SIZE))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - AVATAR_SIZE)))
  };
}

function defaultAvatarPosition() {
  const area = screen.getPrimaryDisplay().workArea;
  return clampAvatar(area.x + area.width - AVATAR_SIZE - 18, area.y + area.height - AVATAR_SIZE - 18);
}

function ensureAvatarPosition() {
  if (!avatarPosition) avatarPosition = clampAvatar(
    readAvatarPosition()?.x ?? defaultAvatarPosition().x,
    readAvatarPosition()?.y ?? defaultAvatarPosition().y
  );
  return avatarPosition;
}

function moveAvatar(x, y, { persist = true } = {}) {
  const next = clampAvatar(x, y);
  avatarPosition = next;
  if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.setPosition(next.x, next.y, false);
  if (persist) saveAvatarPosition();
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) positionPanel();
}

function positionPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const p = ensureAvatarPosition();
  const size = panelMode === 'catalog' ? CATALOG_SIZE : PANEL_SIZE;
  const area = workAreaForPoint(p.x + AVATAR_SIZE / 2, p.y + AVATAR_SIZE / 2);

  // El panel termina exactamente en la zona del avatar. El avatar está en su propia ventana,
  // por encima del panel, por lo que nunca es movido ni redimensionado al abrir el menú.
  let x = p.x + AVATAR_SIZE - size.width;
  let y = p.y + AVATAR_SIZE - size.height;

  x = Math.max(area.x + 8, Math.min(x, area.x + area.width - size.width - 8));
  y = Math.max(area.y + 8, Math.min(y, area.y + area.height - size.height - 8));

  panelWindow.setSize(size.width, size.height, false);
  panelWindow.setPosition(Math.round(x), Math.round(y), false);
}

function sendPanel(channel, data) {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send(channel, data);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(contentUpdater.localRoot(), name), 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function getGenerators() {
  const data = readJson('generators.json', { generators: [] });
  return Array.isArray(data.generators) ? data.generators : [];
}

function getDesigns() {
  const data = readJson('disenos.json', { designs: [] });
  return Array.isArray(data.designs) ? data.designs : [];
}

function fileUrl(rel) {
  const absolute = path.join(contentUpdater.localRoot(), rel);
  return pathToFileURL(absolute).toString();
}

function createAvatar() {
  if (avatarWindow && !avatarWindow.isDestroyed()) return avatarWindow;
  ensureAvatarPosition();
  avatarWindow = new BrowserWindow({
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    x: avatarPosition.x,
    y: avatarPosition.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  avatarWindow.setAlwaysOnTop(true, 'floating');
  avatarWindow.setSkipTaskbar(true);
  avatarWindow.loadFile(path.join(__dirname, 'avatar.html'));
  avatarWindow.once('ready-to-show', () => avatarWindow.showInactive());
  avatarWindow.on('closed', () => { avatarWindow = null; });
  return avatarWindow;
}

function createPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) return panelWindow;
  panelWindow = new BrowserWindow({
    ...PANEL_SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  panelWindow.setAlwaysOnTop(true, 'floating');
  panelWindow.setSkipTaskbar(true);
  panelWindow.loadFile(path.join(__dirname, 'assistant.html'));
  panelWindow.on('blur', () => {
    if (!panelWindow || panelWindow.isDestroyed() || !panelWindow.isVisible()) return;
    // Si el cursor está sobre Vekto, no cierres el panel antes de que el clic del avatar
    // llegue a su propio proceso. El clic del avatar se encarga de alternarlo.
    if (avatarWindow && !avatarWindow.isDestroyed()) {
      const cursor = screen.getCursorScreenPoint();
      const [ax, ay] = avatarWindow.getPosition();
      if (cursor.x >= ax && cursor.x <= ax + AVATAR_SIZE && cursor.y >= ay && cursor.y <= ay + AVATAR_SIZE) return;
    }
    hidePanel();
  });
  panelWindow.on('closed', () => { panelWindow = null; });
  return panelWindow;
}

function showPanel(mode = 'home') {
  panelMode = mode;
  const p = createPanel();
  positionPanel();
  p.webContents.once('did-finish-load', () => {
    sendPanel('panel-mode', panelMode);
    sendPanel('generators', getGenerators());
    sendPanel('designs', getDesigns());
    sendPanel('update-state', updateState);
    sendPanel('content-state', contentUpdater.getState());
  });
  sendPanel('panel-mode', panelMode);
  sendPanel('generators', getGenerators());
  sendPanel('designs', getDesigns());
  sendPanel('update-state', updateState);
  sendPanel('content-state', contentUpdater.getState());
  p.show();
  p.focus();
  positionPanel();
}

function hidePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.hide();
}

function togglePanel() {
  if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) hidePanel();
  else showPanel('home');
}

function openGenerator(slug) {
  const item = getGenerators().find(g => g.slug === slug);
  if (!item) return;
  hidePanel();
  if (!generatorWindow || generatorWindow.isDestroyed()) {
    generatorWindow = new BrowserWindow({
      ...GENERATOR_SIZE,
      minWidth: 900,
      minHeight: 650,
      frame: true,
      title: 'Vektolab · ' + item.name,
      backgroundColor: '#f6f7f9',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    generatorWindow.loadFile(path.join(__dirname, 'generator-view.html'));
    generatorWindow.on('closed', () => { generatorWindow = null; });
    generatorWindow.webContents.once('did-finish-load', () => {
      generatorWindow.webContents.send('generator-view', {
        title: item.name,
        url: fileUrl(item.file)
      });
    });
  } else {
    generatorWindow.show();
    generatorWindow.focus();
    generatorWindow.webContents.send('generator-view', {
      title: item.name,
      url: fileUrl(item.file)
    });
  }
}

function openDesign(slug) {
  const item = getDesigns().find(d => d.slug === slug);
  if (!item) return;
  shell.openExternal(item.url || SITE_URL);
}

function setupIpc() {
  ipcMain.on('toggle-panel', togglePanel);
  ipcMain.on('close-panel', hidePanel);
  ipcMain.on('open-catalog', () => showPanel('catalog'));
  ipcMain.on('close-catalog', hidePanel);
  ipcMain.on('open-generator', (_e, slug) => openGenerator(slug));
  ipcMain.on('open-design', (_e, slug) => openDesign(slug));
  ipcMain.on('open-site', () => shell.openExternal(SITE_URL));
  ipcMain.on('quit-app', () => app.quit());
  ipcMain.on('get-app-version', e => e.sender.send('app-version', APP_VERSION));
  ipcMain.on('get-generators', e => e.sender.send('generators', getGenerators()));
  ipcMain.on('get-designs', e => e.sender.send('designs', getDesigns()));
  ipcMain.on('get-content-state', e => e.sender.send('content-state', contentUpdater.getState()));
  ipcMain.on('get-update-state', e => e.sender.send('update-state', updateState));
  ipcMain.on('check-updates', () => checkForAppUpdate());
  ipcMain.on('sync-content', async () => {
    await contentUpdater.sync();
    sendPanel('generators', getGenerators());
    sendPanel('designs', getDesigns());
  });
  ipcMain.on('install-update', () => autoUpdater.quitAndInstall());

  ipcMain.on('avatar-drag-start', (event, point) => {
    if (!avatarWindow || avatarWindow.isDestroyed()) return;
    hidePanel();
    const [wx, wy] = avatarWindow.getPosition();
    const px = Number(point?.x);
    const py = Number(point?.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    dragOffset = { x: px - wx, y: py - wy };
    avatarDragging = true;
    avatarWindow.webContents.send('avatar-dragging', true);
  });

  ipcMain.on('avatar-drag-move', (_event, point) => {
    if (!avatarDragging || !avatarWindow || avatarWindow.isDestroyed()) return;
    const x = Number(point?.x) - dragOffset.x;
    const y = Number(point?.y) - dragOffset.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    moveAvatar(x, y, { persist: false });
  });

  ipcMain.on('avatar-drag-end', () => {
    if (!avatarDragging) return;
    avatarDragging = false;
    saveAvatarPosition();
    if (avatarWindow && !avatarWindow.isDestroyed()) avatarWindow.webContents.send('avatar-dragging', false);
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.on('checking-for-update', () => setUpdateState({ status: 'checking' }));
  autoUpdater.on('update-available', info => setUpdateState({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => setUpdateState({ status: 'up-to-date' }));
  autoUpdater.on('download-progress', p => setUpdateState({ status: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', () => setUpdateState({ status: 'ready', percent: 100 }));
  autoUpdater.on('error', err => setUpdateState({ status: 'error', error: err.message }));
}

function setUpdateState(next) {
  updateState = { ...updateState, ...next };
  sendPanel('update-state', updateState);
}

async function checkForAppUpdate() {
  if (!app.isPackaged) {
    setUpdateState({ status: 'dev' });
    return;
  }
  try { await autoUpdater.checkForUpdates(); } catch (error) { setUpdateState({ status: 'error', error: error.message }); }
}

app.on('second-instance', () => {
  if (avatarWindow && !avatarWindow.isDestroyed()) {
    avatarWindow.showInactive();
    avatarWindow.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if (process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: true });
  }
  contentUpdater = new ContentUpdater(app);
  contentUpdater.onState = state => sendPanel('content-state', state);
  await contentUpdater.ensureSeeded();
  setupIpc();
  setupAutoUpdater();
  createAvatar();
  // Actualización de contenido silenciosa; el asistente sigue funcionando aunque no haya internet.
  contentUpdater.sync();
  if (app.isPackaged) setTimeout(() => checkForAppUpdate(), 4000);

  screen.on('display-metrics-changed', () => {
    if (!avatarWindow || avatarWindow.isDestroyed()) return;
    const p = ensureAvatarPosition();
    moveAvatar(p.x, p.y, { persist: true });
    if (panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible()) positionPanel();
  });
});

app.on('window-all-closed', event => event.preventDefault());
app.on('before-quit', () => saveAvatarPosition());
