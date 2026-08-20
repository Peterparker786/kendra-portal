// Chutki Desktop — Preload script
// Exposes safe APIs to renderer process

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chutki', {
  // Window controls
  minimize: () => ipcRenderer.send('chutki-minimize'),
  close: () => ipcRenderer.send('chutki-close'),
  restore: () => ipcRenderer.send('chutki-restore'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('chutki-toggle-top'),
  
  // Screen capture
  captureScreen: () => ipcRenderer.invoke('chutki-capture-screen'),
  
  // Info
  getInfo: () => ipcRenderer.invoke('chutki-get-info'),
  
  // Platform info
  isElectron: true,
  platform: process.platform,
});
