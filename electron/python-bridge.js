'use strict';

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

let pythonProcess = null;
let cachedSystemPython = null; // {cmd, args, version} once discovered

const MIN_PY = [3, 10]; // minimum supported (major, minor)

// ── System Python discovery ──────────────────────────────────────────────────

// Candidate launchers, in preference order. On Windows the `py` launcher can
// pin a version; elsewhere we try python3/python on PATH.
function pythonCandidates() {
  if (process.platform === 'win32') {
    return [
      { cmd: 'py', args: ['-3'] },
      { cmd: 'python', args: [] },
      { cmd: 'python3', args: [] },
    ];
  }
  return [
    { cmd: 'python3', args: [] },
    { cmd: 'python', args: [] },
  ];
}

function parseVersion(out) {
  // "Python 3.12.4" → [3, 12, 4]
  const m = (out || '').match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function meetsMin(ver) {
  if (!ver) return false;
  if (ver[0] !== MIN_PY[0]) return ver[0] > MIN_PY[0];
  return ver[1] >= MIN_PY[1];
}

/**
 * Locate a usable system Python on PATH.
 * Returns {found:true, cmd, args, version:"3.12.4"} or
 *         {found:false, reason:'no-python'|'too-old', version?, min}.
 * Result is cached for the process lifetime.
 */
function findSystemPython() {
  if (cachedSystemPython) return cachedSystemPython;

  let sawAny = false;
  let bestTooOld = null;

  for (const cand of pythonCandidates()) {
    const res = spawnSync(cand.cmd, [...cand.args, '--version'], { encoding: 'utf8' });
    if (res.error || res.status !== 0) continue;
    // Python prints version to stdout (3.4+) or stderr (older); check both.
    const ver = parseVersion(res.stdout) || parseVersion(res.stderr);
    if (!ver) continue;
    sawAny = true;
    if (meetsMin(ver)) {
      cachedSystemPython = {
        found: true,
        cmd: cand.cmd,
        args: cand.args,
        version: ver.join('.'),
      };
      return cachedSystemPython;
    }
    bestTooOld = bestTooOld || ver.join('.');
  }

  const minStr = MIN_PY.join('.');
  cachedSystemPython = sawAny
    ? { found: false, reason: 'too-old', version: bestTooOld, min: minStr }
    : { found: false, reason: 'no-python', min: minStr };
  return cachedSystemPython;
}

// ── Paths ────────────────────────────────────────────────────────────────────

// backend/ source (server.py, converter.py, preflight.py)
function backendDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
}

function requirementsFile() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'requirements.txt')
    : path.join(__dirname, '..', 'requirements.txt');
}

// The user's managed venv lives in writable userData, not in the install dir.
function venvDir() {
  return path.join(app.getPath('userData'), 'venv');
}

function venvPython() {
  const v = venvDir();
  return process.platform === 'win32'
    ? path.join(v, 'Scripts', 'python.exe')
    : path.join(v, 'bin', 'python');
}

// ── Venv lifecycle ─────────────────────────────────────────────────────────────

function venvExists() {
  return fs.existsSync(venvPython());
}

/**
 * Create the managed venv from the discovered system Python. Returns {ok, error}.
 * Cheap no-op if it already exists.
 */
function createVenv() {
  if (venvExists()) return { ok: true };
  const py = findSystemPython();
  if (!py.found) {
    return {
      ok: false,
      error: py.reason === 'too-old'
        ? `System Python ${py.version} is too old (need ${py.min}+).`
        : `No system Python found on PATH (need ${py.min}+).`,
    };
  }
  const res = spawnSync(py.cmd, [...py.args, '-m', 'venv', venvDir()], { encoding: 'utf8' });
  if (res.status !== 0) {
    return { ok: false, error: `venv creation failed: ${res.stderr || res.stdout || res.error}` };
  }
  return { ok: true };
}

// ── Preflight ───────────────────────────────────────────────────────────────────

/**
 * Decide what the app can do right now.
 *  - No usable system Python    → {ok:false, fatal:'no-python'|'too-old', python:{...}}
 *  - Python OK but no venv yet   → {ok:false, missing:[], fatal:'venv-missing', python:{...}}
 *  - Venv present, deps probed   → parsed probe object ({ok, missing, ...})
 * The `python` field carries discovery info so the UI can show what to install.
 */
function preflight() {
  const py = findSystemPython();
  if (!py.found) {
    return { ok: false, missing: [], fatal: py.reason, python: py };
  }
  if (!venvExists()) {
    return { ok: false, missing: [], fatal: 'venv-missing', python: py };
  }
  const probe = path.join(backendDir(), 'preflight.py');
  const res = spawnSync(venvPython(), [probe], { encoding: 'utf8' });
  const out = (res.stdout || '').trim();
  try {
    const line = out.split('\n').filter(Boolean).pop();
    const parsed = JSON.parse(line);
    parsed.python = py;
    return parsed;
  } catch {
    return { ok: false, missing: [], fatal: res.stderr || out || 'preflight failed to run', python: py };
  }
}

// ── Install ──────────────────────────────────────────────────────────────────────

/**
 * pip-install the requirements into the venv, streaming output line-by-line.
 * onLog(text) receives stdout/stderr chunks. Resolves {ok} / rejects on failure.
 */
function installDeps(onLog) {
  return new Promise((resolve, reject) => {
    const created = createVenv();
    if (!created.ok) {
      reject(new Error(created.error));
      return;
    }

    const py = venvPython();
    const args = [
      '-m', 'pip', 'install',
      '--no-input',
      '--retries', '3',
      '-r', requirementsFile(),
      '--extra-index-url', 'https://download.pytorch.org/whl/cpu',
    ];

    onLog && onLog(`> ${path.basename(py)} ${args.join(' ')}\n`);

    const proc = spawn(py, args, {
      env: { ...process.env, PYTHONUNBUFFERED: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' },
    });

    proc.stdout.on('data', (d) => onLog && onLog(d.toString()));
    proc.stderr.on('data', (d) => onLog && onLog(d.toString()));

    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`pip install exited with code ${code}`));
    });
  });
}

// ── Server ──────────────────────────────────────────────────────────────────────

/**
 * Spawn the FastAPI server with the venv python and resolve with the port it
 * prints (READY <port>). Assumes preflight already passed.
 */
function startServer() {
  return new Promise((resolve, reject) => {
    const py = venvPython();
    const serverPy = path.join(backendDir(), 'server.py');

    pythonProcess = spawn(py, [serverPy], {
      cwd: backendDir(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let ready = false;

    pythonProcess.stdout.on('data', (data) => {
      const match = data.toString().match(/READY\s+(\d+)/);
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
      if (!ready) reject(new Error('Python backend startup timed out (120s)'));
    }, 120_000);
  });
}

function stopPython() {
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill('SIGTERM');
    pythonProcess = null;
  }
}

module.exports = {
  findSystemPython,
  venvExists,
  createVenv,
  preflight,
  installDeps,
  startServer,
  stopPython,
};
