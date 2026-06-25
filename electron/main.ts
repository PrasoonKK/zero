import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { registerLLMHandlers } from './ipc/llm'
import { registerSystemHandlers } from './ipc/system'
import { registerVoiceHandlers } from './ipc/voice'
import { registerCacheHandlers, initCache } from './ipc/cache'
import { registerAgentHandlers } from './ipc/agent'
import { registerPluginHandlers, loadPlugins } from './ipc/plugins'
import { registerGitHandlers } from './ipc/git'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100, height: 720, minWidth: 900, minHeight: 600,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false },
    backgroundColor: '#0d0e12', show: false, title: 'Zero',
  })
  mainWindow.once('ready-to-show', () => { mainWindow?.show(); mainWindow?.center() })
  mainWindow.on('close', (e) => { e.preventDefault(); mainWindow?.hide() })
  const devServerUrl = process.env['VITE_DEV_SERVER_URL']
  if (devServerUrl) { mainWindow.loadURL(devServerUrl) }
  else if (process.env['NODE_ENV'] === 'development') { mainWindow.loadURL('http://localhost:5173') }
  else { mainWindow.loadFile(join(__dirname, '../renderer/index.html')) }
}

function createTray(): void {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Zero', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.exit(0) } },
  ])
  tray.setToolTip('Zero AI Assistant')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => { if (mainWindow?.isVisible()) { mainWindow.hide() } else { mainWindow?.show(); mainWindow?.focus() } })
}

app.whenReady().then(async () => {
  await initCache()
  createWindow()
  createTray()

  // Grant microphone permission for Web Speech API
  const { session } = await import('electron')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'microphone' || permission === 'audio-capture')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media' || permission === 'microphone' || permission === 'audio-capture'
  })
  globalShortcut.register('Ctrl+Shift+A', () => {
    if (mainWindow?.isVisible()) { mainWindow.hide() } else { mainWindow?.show(); mainWindow?.focus() }
  })
  registerLLMHandlers(ipcMain)
  registerSystemHandlers(ipcMain)
  registerVoiceHandlers(ipcMain)
  registerCacheHandlers(ipcMain)
  registerAgentHandlers(ipcMain)
  registerPluginHandlers(ipcMain)
  registerGitHandlers(ipcMain)
  await loadPlugins()
})

app.on('window-all-closed', () => {})
app.on('will-quit', () => { globalShortcut.unregisterAll() })

// Auto-updater — only runs in packaged production builds
if (app.isPackaged) {
  import('electron-updater').then(({ autoUpdater }) => {
    autoUpdater.checkForUpdatesAndNotify()
    autoUpdater.on('update-available', () => {
      mainWindow?.webContents.send('update:available')
    })
    autoUpdater.on('update-downloaded', () => {
      mainWindow?.webContents.send('update:ready')
    })
  }).catch(() => { /* updater optional */ })
}
