#!/usr/bin/env node
'use strict';

/**
 * Launch the freshly built Windows installer from dist/.
 * Run automatically by the `postdist:win` npm script after electron-builder.
 * Picks the newest "*Setup*.exe" so it works across version bumps.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(distDir)) {
  console.error('run-installer: dist/ not found — did the build succeed?');
  process.exit(1);
}

const installer = fs
  .readdirSync(distDir)
  .filter((f) => /setup.*\.exe$/i.test(f))
  .map((f) => ({ f, mtime: fs.statSync(path.join(distDir, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0];

if (!installer) {
  console.error('run-installer: no "*Setup*.exe" found in dist/.');
  process.exit(1);
}

const exe = path.join(distDir, installer.f);
console.log(`run-installer: launching ${installer.f}`);

// Detach so npm exits cleanly while the installer UI stays open.
const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
child.unref();
