'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');

// Workaround for GPU/sandbox crash on Windows in certain environments
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
const path = require('path');
const fs = require('fs');
const { startPython, stopPython } = require('./python-bridge');

let mainWindow = null;
let apiBaseUrl = null;

function createWindow(port) {
  apiBaseUrl = `http://127.0.0.1:${port}`;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Docling 文档转换器',
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(
    path.join(__dirname, '..', 'renderer', 'index.html'),
    { query: { api: apiBaseUrl } }
  );

  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('get-base-url', () => apiBaseUrl);

app.whenReady().then(async () => {
  // In packaged mode, point output + model cache to writable userData dir
  const outDir = path.join(app.getPath('userData'), 'output');
  fs.mkdirSync(outDir, { recursive: true });
  process.env.DOCLING_OUT_DIR = outDir;
  process.env.HF_HOME = path.join(app.getPath('userData'), 'models');

  try {
    const port = await startPython();
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox(
      '后端启动失败',
      `无法启动 Python 后端：\n\n${err.message}\n\n请确认 Python 和全部依赖已安装。`
    );
    app.quit();
  }
});

app.on('window-all-closed', () => {
  stopPython();
  app.quit();
});

app.on('before-quit', () => {
  stopPython();
});
