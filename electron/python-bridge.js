'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let pythonProcess = null;

function getPythonCmd() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'server.exe');
  }
  // Dev: prefer .venv python, fall back to system python
  const venv = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
  return fs.existsSync(venv) ? venv : 'python';
}

function getServerArgs() {
  if (app.isPackaged) return [];
  return [path.join(__dirname, '..', 'backend', 'server.py')];
}

function startPython() {
  return new Promise((resolve, reject) => {
    const cmd = getPythonCmd();
    const args = getServerArgs();
    const cwd = path.join(__dirname, '..');

    pythonProcess = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;

    pythonProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/READY\s+(\d+)/);
      if (match && !ready) {
        ready = true;
        resolve(parseInt(match[1], 10));
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      process.stderr.write('[python] ' + data.toString());
    });

    pythonProcess.on('exit', (code) => {
      if (!ready) reject(new Error(`Python exited with code ${code} before READY`));
    });

    pythonProcess.on('error', (err) => {
      if (!ready) reject(err);
    });

    setTimeout(() => {
      if (!ready) reject(new Error('Python backend startup timed out (60s)'));
    }, 60_000);
  });
}

function stopPython() {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
}

module.exports = { startPython, stopPython };
