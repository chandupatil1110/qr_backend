#!/usr/bin/env node
// Startup guardrail for @resvg/resvg-js on Linux.
//
// Problem: the lockfile was generated on Windows. npm on Windows silently
// drops incompatible-platform packages from the lockfile, so the Linux
// resvg binary is missing from `package-lock.json`. Railway's `npm ci`
// follows the lockfile strictly, so the binary never gets installed →
// `require('@resvg/resvg-js')` throws MODULE_NOT_FOUND at boot.
//
// Fix (runs from the `start` script before `node src/server.js`): if the
// correct Linux resvg binary isn't in node_modules, download and extract
// the tarball directly from the npm registry. No dependency on `npm`
// being available at runtime, no lockfile touches, no postinstall
// timing games. Idempotent — a warm restart with the binary already
// present is a no-op.
//
// No-op on Windows/macOS (their binaries are already in the lockfile
// because the lockfile was generated on that OS).

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { execSync } = require('child_process');

if (process.platform !== 'linux') {
  console.log('[ensure-native] Not Linux — skipping.');
  process.exit(0);
}

const isMusl = fs.existsSync('/etc/alpine-release');
const libc = isMusl ? 'musl' : 'gnu';
const arch = process.arch; // 'x64' or 'arm64'
const pkgName = `@resvg/resvg-js-linux-${arch}-${libc}`;
const version = '2.6.2';

const projectRoot = path.resolve(__dirname, '..');
const target = path.join(projectRoot, 'node_modules', pkgName);

if (fs.existsSync(target) && fs.existsSync(path.join(target, 'package.json'))) {
  console.log(`[ensure-native] ${pkgName} already present.`);
  process.exit(0);
}

console.log(`[ensure-native] Missing ${pkgName}@${version} — fetching tarball…`);

// Tarball URL from the public npm registry. Scoped packages URL-encode
// the slash as %2f.
const encodedName = pkgName.replace('@', '').replace('/', '%2f');
const tarballName = pkgName.split('/')[1]; // e.g. resvg-js-linux-x64-gnu
const url = `https://registry.npmjs.org/${pkgName}/-/${tarballName}-${version}.tgz`;

function download(u) {
  return new Promise((resolve, reject) => {
    https
      .get(u, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return resolve(download(res.headers.location));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  let tgz;
  try {
    tgz = await download(url);
  } catch (err) {
    console.error(`[ensure-native] Download failed: ${err.message}`);
    process.exit(1);
  }

  // Extract the tarball. Node has zlib built-in; use system `tar` for the
  // untar step (present on every Linux Node image). Write the .tgz to a
  // temp file, tar -xzf into node_modules/<pkg>, then delete the temp.
  const tmpDir = fs.mkdtempSync('/tmp/resvg-native-');
  const tgzPath = path.join(tmpDir, 'binary.tgz');
  fs.writeFileSync(tgzPath, tgz);

  fs.mkdirSync(target, { recursive: true });
  try {
    // npm tarballs have a `package/` prefix on every entry — strip it
    // with `--strip-components=1` so contents land directly in target.
    execSync(`tar -xzf "${tgzPath}" --strip-components=1 -C "${target}"`, {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(`[ensure-native] Extract failed: ${err.message}`);
    process.exit(1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`[ensure-native] Installed ${pkgName}@${version} into ${target}`);
}

main().catch((err) => {
  console.error('[ensure-native] Unexpected failure:', err);
  process.exit(1);
});
