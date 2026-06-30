'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');

// Workaround for GPU/sandbox crash on Windows in certain environments
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
const path = require('path');
const fs = require('fs');
const bridge = require('./python-bridge');

let mainWindow = null;
let apiBaseUrl = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Docling Document Converter',
    backgroundColor: '#f8fafc',
    icon: path.join(__dirname, '..', 'renderer', 'icons',
      process.platform === 'darwin' ? 'mac/icon.icns' : 'win/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

// Start the backend (assumes deps satisfied). Emits backend-ready / backend-error.
async function launchBackend() {
  try {
    const port = await bridge.startServer();
    apiBaseUrl = `http://127.0.0.1:${port}`;
    send('backend-ready', { baseUrl: apiBaseUrl });
  } catch (err) {
    send('backend-error', { message: err.message });
  }
}

// Decide what to show: converter (deps OK) or setup screen.
// reason distinguishes screens the renderer shows:
//   no-python / too-old   → cannot install; tell user to install Python first
//   venv-missing / deps-missing → install button can build the venv + deps
async function evaluateAndProceed() {
  const probe = bridge.preflight();
  if (probe.ok) {
    send('status', { phase: 'starting' });
    await launchBackend();
  } else {
    const reason = probe.fatal
      || ((probe.missing && probe.missing.length) ? 'deps-missing' : 'unknown');
    send('setup-needed', {
      missing: probe.missing || [],
      reason,
      // Can the user proceed by clicking Install? Only when Python itself is fine.
      canInstall: reason !== 'no-python' && reason !== 'too-old',
      python: probe.python || null,
    });
  }
}

// ── IPC ────────────────────────────────────────────────────────────────────────

ipcMain.handle('get-base-url', () => apiBaseUrl);

// Renderer signals it's loaded and ready to receive status.
ipcMain.handle('renderer-ready', async () => {
  await evaluateAndProceed();
  return true;
});

// Renderer pressed "Install". Stream log, then re-check + launch.
ipcMain.handle('install-deps', async () => {
  try {
    send('install-log', '\n=== Installing dependencies (this can take several minutes) ===\n');
    await bridge.installDeps((text) => send('install-log', text));
    send('install-log', '\n=== Verifying… ===\n');

    const probe = bridge.preflight();
    if (!probe.ok) {
      const detail = (probe.missing || []).map((m) => m.label).join(', ') || probe.fatal || 'unknown';
      send('install-failed', { message: `Still missing after install: ${detail}` });
      return { ok: false };
    }
    send('install-log', '\nAll dependencies present. Starting backend…\n');
    send('status', { phase: 'starting' });
    await launchBackend();
    return { ok: true };
  } catch (err) {
    send('install-failed', { message: err.message });
    return { ok: false };
  }
});

// ── App lifecycle ──────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Writable locations for output + model cache.
  const outDir = path.join(app.getPath('userData'), 'output');
  fs.mkdirSync(outDir, { recursive: true });
  process.env.DOCLING_OUT_DIR = outDir;
  process.env.HF_HOME = path.join(app.getPath('userData'), 'models');

  createWindow();
  // evaluateAndProceed runs once the renderer reports ready (renderer-ready IPC).
});

app.on('window-all-closed', () => {
  bridge.stopPython();
  app.quit();
});

app.on('before-quit', () => {
  bridge.stopPython();
});
