#!/usr/bin/env node
'use strict';

/**
 * Installs Git hooks from scripts/git-hooks/ into .git/hooks/.
 * Runs on npm install via the "prepare" script (only in a Git checkout).
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const gitDir = path.join(repoRoot, '.git');
const hooksSource = path.join(repoRoot, 'scripts', 'git-hooks');
const hooksTarget = path.join(gitDir, 'hooks');

if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
  process.exit(0);
}

if (!fs.existsSync(hooksSource)) {
  process.exit(0);
}

if (!fs.existsSync(hooksTarget)) {
  process.exit(0);
}

const hooks = fs.readdirSync(hooksSource);
for (const name of hooks) {
  const src = path.join(hooksSource, name);
  const dest = path.join(hooksTarget, name);
  if (!fs.statSync(src).isFile()) continue;
  const content = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dest, content, 'utf8');
  fs.chmodSync(dest, 0o755);
  console.log('Installed Git hook:', name);
}
