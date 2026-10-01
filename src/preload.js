const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vektolab', {
  openGenerator: slug => ipcRenderer.send('open-generator', slug),
  openSite: () => ipcRenderer.send('open-site'),
  quit: () => ipcRenderer.send('quit-app'),
  checkUpdates: () => ipcRenderer.send('check-updates'),
  syncContent: () => ipcRenderer.send('sync-content'),
  installUpdate: () => ipcRenderer.send('install-update'),
  onUpdateState: callback => ipcRenderer.on('update-state', (_event, state) => callback(state)),
  getUpdateState: () => ipcRenderer.send('get-update-state'),
  getContentState: () => ipcRenderer.send('get-content-state'),
  onContentState: callback => ipcRenderer.on('content-state', (_event, state) => callback(state)),
  getGenerators: () => ipcRenderer.send('get-generators'),
  onGenerators: callback => ipcRenderer.on('generators', (_event, list) => callback(list)),
  getAppVersion: () => ipcRenderer.send('get-app-version'),
  onAppVersion: callback => ipcRenderer.on('app-version', (_event, version) => callback(version))
});
