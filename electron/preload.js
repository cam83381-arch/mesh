const { contextBridge, ipcRenderer } = require('electron')

// ── API exposée au renderer (React) via window.electron ──
contextBridge.exposeInMainWorld('electron', {
  // Contrôles fenêtre
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Notifications natives
  showNotification: (title, body) =>
    ipcRenderer.send('show-notification', { title, body }),

  // Deep links
  onDeepLink: (callback) =>
    ipcRenderer.on('deep-link', (event, url) => callback(url)),

  // Auto-updater
  onUpdateAvailable: (callback) =>
    ipcRenderer.on('update-available', (_e, info) => callback(info)),
  onUpdateDownloaded: (callback) =>
    ipcRenderer.on('update-downloaded', (_e, info) => callback(info)),
  onUpdateProgress: (callback) =>
    ipcRenderer.on('update-progress', (_e, info) => callback(info)),
  installUpdate: () => ipcRenderer.send('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Screen/window capture sources (desktopCapturer)
  getDesktopSources: (opts) => ipcRenderer.invoke('get-desktop-sources', opts),

  // Stockage local (AppData/Roaming/Mesh/mesh-data/)
  readLocalFile: (filename) => ipcRenderer.invoke('read-local-file', filename),
  writeLocalFile: (filename, data) => ipcRenderer.invoke('write-local-file', filename, data),
  deleteLocalFile: (filename) => ipcRenderer.invoke('delete-local-file', filename),

  // Utilitaire
  isElectron: true
})
