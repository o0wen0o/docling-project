'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getBaseUrl: () => ipcRenderer.invoke('get-base-url'),
});
