'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBaseUrl: () => ipcRenderer.invoke('get-base-url'),

  // Lifecycle handshake
  rendererReady: () => ipcRenderer.invoke('renderer-ready'),
  installDeps: () => ipcRenderer.invoke('install-deps'),

  // Main → renderer events
  onSetupNeeded: (cb) => ipcRenderer.on('setup-needed', (_e, p) => cb(p)),
  onStatus: (cb) => ipcRenderer.on('status', (_e, p) => cb(p)),
  onInstallLog: (cb) => ipcRenderer.on('install-log', (_e, text) => cb(text)),
  onInstallFailed: (cb) => ipcRenderer.on('install-failed', (_e, p) => cb(p)),
  onBackendReady: (cb) => ipcRenderer.on('backend-ready', (_e, p) => cb(p)),
  onBackendError: (cb) => ipcRenderer.on('backend-error', (_e, p) => cb(p)),
});
