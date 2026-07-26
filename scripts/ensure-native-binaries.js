#!/usr/bin/env node
// postinstall guardrail for @resvg/resvg-js on Linux.
//
// Problem: the lockfile was generated on Windows. npm on Windows silently
// drops incompatible-platform packages from the lockfile (because Windows
// can't fetch them), so the Linux resvg binary is missing from
// `package-lock.json`. Railway's `npm ci` follows the lockfile strictly,
// so the binary never gets installed → the app boots, `require('@resvg/
// resvg-js')` runs, that package `require()`s its platform binary, and
// crashes with `Cannot find module '@resvg/resvg-js-linux-x64-gnu'`.
//
// Fix (runs from package.json "postinstall"): detect Linux at install time
// and manually install the correct resvg binary directly into node_modules
// with `--no-save --no-package-lock`. Purely additive — the lockfile is
// not touched, no other packages are affected.
//
// No-op on Windows/macOS (their platform binaries are already in the
// lockfile from when it was generated).

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

if (process.platform !== 'linux') {
  process.exit(0);
}

// glibc vs musl: Alpine images ship /etc/alpine-release and use musl.
// Railway's nixpacks images are Debian-based (glibc), so the default
// path is gnu.
const isMusl = existsSync('/etc/alpine-release');
const libc = isMusl ? 'musl' : 'gnu';
const arch = process.arch; // 'x64' | 'arm64'
const pkg = `@resvg/resvg-js-linux-${arch}-${libc}`;
const version = '2.6.2';

// Locate the project root — one level up from scripts/. Node scripts run
// with cwd set by the invoker, so we can't trust process.cwd().
const projectRoot = path.resolve(__dirname, '..');
const target = path.join(projectRoot, 'node_modules', pkg);

if (existsSync(target)) {
  console.log(`[ensure-native] ${pkg} already present — nothing to do.`);
  process.exit(0);
}

console.log(`[ensure-native] Missing platform binary ${pkg} — installing…`);
try {
  execSync(
    // --no-save          → don't touch package.json
    // --no-package-lock  → don't touch package-lock.json
    // --ignore-scripts   → don't recurse into this postinstall again
    // --no-audit --no-fund → keep output clean
    `npm install --no-save --no-package-lock --ignore-scripts --no-audit --no-fund ${pkg}@${version}`,
    { stdio: 'inherit', cwd: projectRoot }
  );
  console.log(`[ensure-native] Installed ${pkg}@${version}.`);
} catch (err) {
  console.error(`[ensure-native] Install failed:`, err.message);
  // Don't crash the deploy — if this failed, resvg will still throw on
  // first use, but we want the rest of the app (auth, alert page, etc.)
  // to remain reachable. sticker generation will 500; nothing else will.
  process.exit(0);
}
