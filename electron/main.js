const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain, Notification, desktopCapturer } = require('electron')
const path = require('path')
const { spawn, fork } = require('child_process')
const http = require('http')

// ── Variables globales ──
let mainWindow = null
let tray = null
let serverProcess = null
let isQuitting = false

const fs = require('fs')
const _distExists = fs.existsSync(path.join(__dirname, '..', 'dist', 'index.html'))
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development' || (!app.isPackaged && !_distExists)

// ── Démarrer le serveur backend ──
function startBackendServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'index.js')
    : path.join(__dirname, '..', 'server', 'index.js')

  const uploadsDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'uploads')
    : path.join(__dirname, '..', 'server', 'uploads')

  const dataDir = app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(__dirname, '..', 'server')

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    UPLOADS_DIR: uploadsDir,
    DATA_DIR: dataDir,
    // Ajouter server/node_modules dans le PATH de recherche modules
    NODE_PATH: app.isPackaged
      ? path.join(process.resourcesPath, 'server', 'node_modules')
      : path.join(__dirname, '..', 'server', 'node_modules')
  }

  // Utiliser fork() d'Electron — exécute le script avec le Node.js embarqué
  // sans dépendre d'un `node` externe dans le PATH
  try {
    serverProcess = fork(serverPath, [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env,
      cwd: app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, '..', 'server')
    })
  } catch (e) {
    // Fallback : spawn avec node système
    console.error('fork() échoué, tentative spawn node:', e.message)
    const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node'
    serverProcess = spawn(nodeBin, [serverPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      cwd: app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, '..', 'server')
    })
  }

  serverProcess.stdout && serverProcess.stdout.on('data', (data) => {
    console.log('[Server]', data.toString().trim())
  })
  serverProcess.stderr && serverProcess.stderr.on('data', (data) => {
    console.error('[Server ERR]', data.toString().trim())
  })
  serverProcess.on('close', (code) => {
    console.log('[Server] Arrêté avec code :', code)
  })
  serverProcess.on('error', (err) => {
    console.error('[Server SPAWN ERR]', err.message)
  })
}

// ── Attendre que le serveur soit prêt ──
function waitForServer(url, retries = 20, delay = 500) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(url, (res) => {
        resolve()
      }).on('error', () => {
        if (retries-- > 0) {
          setTimeout(attempt, delay)
        } else {
          reject(new Error('Serveur non disponible'))
        }
      })
    }
    attempt()
  })
}

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
ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: false }).show()
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

  if (!isDev) {
    startBackendServer()
    try {
      await waitForServer('http://localhost:3001')
      console.log('[Electron] Backend prêt')
    } catch {
      console.warn('[Electron] Backend non disponible, on continue quand même')
    }
  }

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
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
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
