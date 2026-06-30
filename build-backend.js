#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const backend = path.join(root, 'backend');
const out = path.join(root, 'backend-dist');

function run(cmd, cwd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: cwd || root, stdio: 'inherit' });
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
}

run('pip install pyinstaller pyinstaller-hooks-contrib');
run('pyinstaller --clean backend.spec', backend);

const built = path.join(backend, 'dist', 'server');
console.log(`\nCopying ${built} → ${out}`);
copyDir(built, out);
console.log('\nDone — backend-dist is ready.');
console.log('Next: npm run dist  (or dist:win / dist:mac / dist:linux)');
