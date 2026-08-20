// Chutki Desktop — Electron main process
// Always-on-top AI assistant with screen reading

const { app, BrowserWindow, ipcMain, desktopCapturer, screen, shell } = require('electron');
const path = require('path');

let mainWindow = null;
let PORTAL_URL = process.env.PORTAL_URL || 'https://kendra-portal.onrender.com';

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 420,
    height: 650,
    x: screenW - 440,
    y: screenH - 670,
    frame: false, // frameless for custom title bar
    transparent: false,
    alwaysOnTop: true, // ← ALWAYS ON TOP
    skipTaskbar: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, 'icon.png'),
    title: 'Chutki AI Assistant',
  });

  // Load Chutki assistant page
  mainWindow.loadURL(`${PORTAL_URL}/assistant.html`);

  // Always on top — guarantee
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Dev tools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---- IPC Handlers ----

// Window controls
ipcMain.on('chutki-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('chutki-close', () => {
  if (mainWindow) mainWindow.hide(); // hide instead of close
});

ipcMain.on('chutki-restore', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
});

// Toggle always on top
ipcMain.handle('chutki-toggle-top', () => {
  if (mainWindow) {
    const isOnTop = mainWindow.isAlwaysOnTop();
    mainWindow.setAlwaysOnTop(!isOnTop, 'screen-saver');
    return !isOnTop;
  }
  return false;
});

// Screen capture
ipcMain.handle('chutki-capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (sources.length > 0) {
      const thumbnail = sources[0].thumbnail;
      return thumbnail.toDataURL(); // base64 image
    }
    return null;
  } catch (err) {
    console.error('Screen capture failed:', err);
    return null;
  }
});

// Get window info
ipcMain.handle('chutki-get-info', () => {
  return {
    isOnTop: mainWindow?.isAlwaysOnTop() || false,
    portalUrl: PORTAL_URL,
    version: app.getVersion(),
  };
});
