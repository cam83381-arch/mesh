const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification, desktopCapturer } = require('electron')
const path = require('path')

// ── Variables globales ──
let mainWindow = null
let tray = null
let isQuitting = false

const fs = require('fs')
const _distExists = fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development' || (!app.isPackaged && !_distExists)

// Plus de serveur backend — architecture 100% P2P (Trystero WebRTC + localStore)

// ── Créer la fenêtre principale ──
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,            // frameless pour un look Discord
    backgroundColor: '#313338',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    },
    icon: path.join(__dirname, '..', 'public', 'icon.png')
  })

  // Charger l'app : Vite en dev, build compilée en prod
  const appUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`

  mainWindow.loadURL(appUrl)

  // DevTools : F12 en dev ET en prod pour debug
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools()
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' })
      }
    }
  })

  // Ouvrir les liens externes dans le navigateur système
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Masquer au lieu de fermer (tray)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  return mainWindow
}

// ── Créer l'icône tray ──
function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png')
  const trayIcon = nativeImage.createFromPath(iconPath)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir Mesh',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quitter',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('Mesh')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// ── Menu natif ──
function createAppMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Réduire dans la barre système',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow && mainWindow.hide()
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => { isQuitting = true; app.quit() }
        }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Forcer le rechargement' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom normal' },
        { role: 'zoomIn', label: 'Zoom +' },
        { role: 'zoomOut', label: 'Zoom -' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' }
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'À propos',
          click: () => {
            const { dialog } = require('electron')
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Mesh',
              message: 'Mesh',
              detail: `Version ${app.getVersion()}\nApp P2P maillée basée sur GunDB + WebRTC`
            })
          }
        }
      ]
    }
  ]

  if (isDev) {
    template[1].submenu.push(
      { type: 'separator' },
      { role: 'toggleDevTools', label: 'Outils développeur' }
    )
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── IPC : version app ──
ipcMain.handle('get-app-version', () => app.getVersion())

// ── IPC : contrôles fenêtre (boutons custom frameless) ──
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize())
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
})
ipcMain.on('window-close', () => mainWindow && mainWindow.hide())

// ── IPC : desktopCapturer — liste des sources d'écran/fenêtres ──
ipcMain.handle('get-desktop-sources', async (_event, opts = {}) => {
  const sources = await desktopCapturer.getSources({
    types: opts.types || ['screen', 'window'],
    thumbnailSize: { width: 320, height: 200 }
  })
  return sources.map(s => ({
    id: s.id,
    name: s.name,
    thumbnailDataURL: s.thumbnail.toDataURL(),
    type: s.id.startsWith('screen:') ? 'screen' : 'window'
  }))
})

// ── IPC : notifications natives ──
ipcMain.on('show-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({ title, body, silent: false, icon: path.join(__dirname, '..', 'public', 'icon.png') })
    notif.on('click', () => {
      if (mainWindow) { mainWindow.show(); mainWindow.focus() }
    })
    notif.show()
  }
})

// ── IPC : badge non-lu sur l'icône tray ──
ipcMain.on('set-badge-count', (_event, { count }) => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(count > 0 ? String(count) : '')
  }
  // Windows/Linux : mettre à jour le tooltip du tray
  if (tray) {
    tray.setToolTip(count > 0 ? `Mesh (${count} non lu${count > 1 ? 's' : ''})` : 'Mesh')
  }
})

// ── Deep links : mesh://invite/CODE ──
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('mesh', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('mesh')
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.show()
    mainWindow.webContents.send('deep-link', url)
  }
})

// Windows : deep link via second-instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (event, commandLine) => {
    const url = commandLine.find(arg => arg.startsWith('mesh://'))
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      if (url) mainWindow.webContents.send('deep-link', url)
    }
  })
}

// ── Démarrage app ──
app.whenReady().then(async () => {
  createAppMenu()
  createTray()
  createMainWindow()

  // ── Partage d'écran ──
  // On utilise getUserMedia avec chromeMediaSourceId via IPC (notre ScreenPicker React)
  // Pas besoin de setDisplayMediaRequestHandler — on passe directement le sourceId depuis le renderer.
  // On laisse quand même getDisplayMedia() fonctionner normalement en fallback web
  const { session } = require('electron')
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    // Fallback : si getDisplayMedia est appelé sans sourceId, montrer le 1er écran
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    callback({ video: sources[0] || null, audio: 'loopback' })
  })

})

app.on('window-all-closed', () => {
  // Sur macOS, on laisse l'app tourner en tray
  if (process.platform !== 'darwin') {
    // ne pas quitter si le tray est actif
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow()
  } else {
    mainWindow.show()
  }
})

app.on('before-quit', () => {
  isQuitting = true
})

// ── Auto-updater (electron-updater + GitHub Releases) ──
if (!isDev && app.isPackaged) {
  // Require CJS depuis un module ESM-comme main.js (Electron CJS context)
  let autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch (e) {
    console.warn('[Updater] electron-updater non disponible:', e.message)
  }

  if (autoUpdater) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Mise à jour disponible:', info.version)
      if (mainWindow) mainWindow.webContents.send('update-available', { version: info.version })
    })

    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] Aucune mise à jour disponible')
    })

    autoUpdater.on('download-progress', (progress) => {
      const pct = Math.round(progress.percent)
      if (mainWindow) mainWindow.webContents.send('update-progress', { percent: pct })
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Updater] Téléchargement terminé:', info.version)
      if (mainWindow) mainWindow.webContents.send('update-downloaded', { version: info.version })
    })

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Erreur:', err.message)
    })

    // Vérifier au démarrage (après 5s pour laisser l'app s'initialiser)
    app.whenReady().then(() => {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(e => console.warn('[Updater] Check failed:', e.message))
      }, 5000)
    })

    // Vérifier toutes les 4h
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(e => console.warn('[Updater] Check failed:', e.message))
    }, 4 * 60 * 60 * 1000)
  }
}

ipcMain.on('install-update', () => {
  if (!isDev && app.isPackaged) {
    try {
      const { autoUpdater } = require('electron-updater')
      autoUpdater.quitAndInstall(false, true)
    } catch (e) {
      console.warn('[Updater] quitAndInstall failed:', e.message)
    }
  }
})

// ── IPC : stockage local profil/serveurs (AppData) ──
const MESH_DATA_DIR = path.join(app.getPath('userData'), 'mesh-data')

function ensureDataDir() {
  if (!fs.existsSync(MESH_DATA_DIR)) fs.mkdirSync(MESH_DATA_DIR, { recursive: true })
}

ipcMain.handle('read-local-file', (_event, filename) => {
  try {
    ensureDataDir()
    const fp = path.join(MESH_DATA_DIR, filename)
    if (!fs.existsSync(fp)) return null
    return JSON.parse(fs.readFileSync(fp, 'utf8'))
  } catch { return null }
})

ipcMain.handle('write-local-file', (_event, filename, data) => {
  try {
    ensureDataDir()
    const fp = path.join(MESH_DATA_DIR, filename)
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch { return false }
})

ipcMain.handle('delete-local-file', (_event, filename) => {
  try {
    const fp = path.join(MESH_DATA_DIR, filename)
    if (fs.existsSync(fp)) fs.unlinkSync(fp)
    return true
  } catch { return false }
})

// ── IPC : WebTorrent P2P file transfer ──
let wt = null
const activeTorrents = {} // infoHash → { torrent, expiryTimer }
const TORRENT_TMP_DIR = path.join(app.getPath('userData'), 'torrent-tmp')
const TORRENT_DL_DIR = app.getPath('downloads')

function getWT() {
  if (!wt) {
    try {
      const WebTorrent = require('webtorrent')
      wt = new WebTorrent()
      wt.on('error', (err) => console.warn('[WebTorrent]', err.message))
    } catch (e) {
      console.error('[WebTorrent] Impossible de charger:', e.message)
    }
  }
  return wt
}

function ensureTorrentTmpDir() {
  if (!fs.existsSync(TORRENT_TMP_DIR)) fs.mkdirSync(TORRENT_TMP_DIR, { recursive: true })
}

// Seed un fichier déjà sur disque
ipcMain.handle('torrent-seed', async (_event, filePath, expiryMs) => {
  return new Promise((resolve, reject) => {
    const client = getWT()
    if (!client) return reject(new Error('WebTorrent non disponible'))
    client.seed(filePath, (torrent) => {
      const result = {
        magnetUri: torrent.magnetURI,
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.length,
      }
      // Expiration automatique du seeding
      let expiryTimer = null
      if (expiryMs > 0) {
        expiryTimer = setTimeout(() => {
          try { torrent.destroy() } catch {}
          delete activeTorrents[torrent.infoHash]
        }, expiryMs)
      }
      activeTorrents[torrent.infoHash] = { torrent, expiryTimer }
      resolve(result)
    })
  })
})

// Seed un fichier reçu comme buffer depuis le renderer (File browser object)
ipcMain.handle('torrent-seed-buffer', async (_event, { name, buffer, expiryMs }) => {
  return new Promise((resolve, reject) => {
    const client = getWT()
    if (!client) return reject(new Error('WebTorrent non disponible'))
    ensureTorrentTmpDir()
    // Écrire le buffer sur disque dans le dossier tmp
    const tmpPath = path.join(TORRENT_TMP_DIR, name)
    try {
      fs.writeFileSync(tmpPath, Buffer.from(buffer))
    } catch (e) {
      return reject(new Error('Impossible d\'écrire le fichier temporaire: ' + e.message))
    }
    client.seed(tmpPath, (torrent) => {
      const result = {
        magnetUri: torrent.magnetURI,
        infoHash: torrent.infoHash,
        name: torrent.name,
        size: torrent.length,
      }
      let expiryTimer = null
      if (expiryMs > 0) {
        expiryTimer = setTimeout(() => {
          try { torrent.destroy() } catch {}
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch {}
          delete activeTorrents[torrent.infoHash]
        }, expiryMs)
      }
      activeTorrents[torrent.infoHash] = { torrent, expiryTimer, tmpPath }
      resolve(result)
    })
  })
})

// Télécharger un torrent via magnet link
ipcMain.handle('torrent-download', async (_event, magnetUri) => {
  return new Promise((resolve, reject) => {
    const client = getWT()
    if (!client) return reject(new Error('WebTorrent non disponible'))
    // Vérifier si déjà en cours
    const existing = client.get(magnetUri)
    if (existing) {
      return resolve({
        progress: existing.progress,
        downloadSpeed: existing.downloadSpeed,
        uploadSpeed: existing.uploadSpeed,
        peers: existing.numPeers,
        done: existing.done,
        path: existing.done ? existing.files[0]?.path : undefined,
      })
    }
    client.add(magnetUri, { path: TORRENT_DL_DIR }, (torrent) => {
      activeTorrents[torrent.infoHash] = { torrent, expiryTimer: null }
      torrent.on('done', () => {
        // Ouvrir le dossier Downloads une fois terminé
        shell.showItemInFolder(torrent.files[0]?.path || TORRENT_DL_DIR)
      })
      resolve({
        progress: torrent.progress,
        downloadSpeed: torrent.downloadSpeed,
        uploadSpeed: torrent.uploadSpeed,
        peers: torrent.numPeers,
        done: torrent.done,
        path: torrent.done ? torrent.files[0]?.path : undefined,
      })
    })
  })
})

// Progression d'un torrent
ipcMain.handle('torrent-progress', (_event, infoHash) => {
  const entry = activeTorrents[infoHash]
  if (!entry) return null
  const t = entry.torrent
  return {
    progress: t.progress,
    downloadSpeed: t.downloadSpeed,
    uploadSpeed: t.uploadSpeed,
    peers: t.numPeers,
    done: t.done,
    path: t.done && t.files?.[0] ? t.files[0].path : undefined,
  }
})

// Arrêter un torrent
ipcMain.handle('torrent-stop', (_event, infoHash) => {
  const entry = activeTorrents[infoHash]
  if (!entry) return
  if (entry.expiryTimer) clearTimeout(entry.expiryTimer)
  try { entry.torrent.destroy() } catch {}
  if (entry.tmpPath) {
    try { if (fs.existsSync(entry.tmpPath)) fs.unlinkSync(entry.tmpPath) } catch {}
  }
  delete activeTorrents[infoHash]
})

// Arrêter tous les torrents (fermeture app)
ipcMain.handle('torrent-stop-all', () => {
  Object.values(activeTorrents).forEach(({ torrent, expiryTimer, tmpPath }) => {
    if (expiryTimer) clearTimeout(expiryTimer)
    try { torrent.destroy() } catch {}
    if (tmpPath) { try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch {} }
  })
  Object.keys(activeTorrents).forEach(k => delete activeTorrents[k])
  if (wt) { try { wt.destroy() } catch {}; wt = null }
})
