'use strict';
// Direct launcher to bypass pnpm's cli.js wrapper which causes V8 snapshot crash
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const pathFile = path.join(__dirname, 'node_modules', 'electron', 'path.txt');
const electronExe = fs.readFileSync(pathFile, 'utf-8').trim();
const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', electronExe);

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  env,
  cwd: __dirname,
});
child.on('close', code => process.exit(code ?? 0));
child.on('error', err => { console.error(err); process.exit(1); });
