// backend/scripts/generate-app-icon.js
//
// Generates launcher-ready PNGs from mobile/assets/images/nayak.jpeg.
// The raw sticker is a tall rectangle — dropping it straight into
// flutter_launcher_icons would crop the "QR 4 EMERGENCY" header and
// the "BE NAYAK" footer on every circular / squircle launcher mask.
// This script composes two square PNGs with the sticker centered and
// padded so nothing important lands in the clip zone:
//
//   app_icon.png             — 1024×1024, 10% inset. Used as the
//                              legacy square icon (image_path).
//   app_icon_foreground.png  — 1024×1024, 22% inset. Used as the
//                              Android adaptive-icon foreground. The
//                              extra padding sits inside Google's
//                              "safe zone" (central 66% of the 108dp
//                              canvas is always visible; everything
//                              outside can be masked by the launcher).
//
// Run:
//   cd backend
//   node scripts/generate-app-icon.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, '../../mobile/assets/images/nayak.jpeg');
const OUT_DIR = path.join(__dirname, '../../mobile/assets/images');

if (!fs.existsSync(SOURCE)) {
  console.error(`Source missing: ${SOURCE}`);
  process.exit(1);
}

const stickerB64 = fs.readFileSync(SOURCE).toString('base64');

function buildSvg({ canvas, insetPct }) {
  const inset = Math.round((canvas * insetPct) / 100);
  const innerSize = canvas - inset * 2;
  // preserveAspectRatio="xMidYMid meet" scales the sticker down until
  // it fits entirely within the inset square — keeps the aspect ratio,
  // leaves white margin on whichever axis is shorter. That's what we
  // want: the FULL sticker visible, never cropped.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="${canvas}" height="${canvas}"
     viewBox="0 0 ${canvas} ${canvas}">
  <rect x="0" y="0" width="${canvas}" height="${canvas}" fill="#FFFFFF"/>
  <image href="data:image/jpeg;base64,${stickerB64}"
         x="${inset}" y="${inset}"
         width="${innerSize}" height="${innerSize}"
         preserveAspectRatio="xMidYMid meet"/>
</svg>`;
}

function renderPng(name, opts) {
  const svg = buildSvg(opts);
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: opts.canvas },
  })
    .render()
    .asPng();
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, png);
  console.log(`✓ ${name.padEnd(28)} ${png.length.toString().padStart(7)} bytes`);
}

// insetPct tuned so the sticker reads at a comparable size to other
// launcher icons (Pinterest, Reddit, etc. fill their tile edge-to-edge).
//   app_icon.png             — square launcher: 3% pad. No launcher
//                              mask on this path, so we can go flush.
//   app_icon_foreground.png  — adaptive icon fg: 12% pad. Google's
//                              strict "safe zone" is 17%, but most
//                              launcher masks (Samsung squircle, Pixel
//                              circle, Oxygen rounded square) show
//                              ~82% of the canvas — 12% keeps the
//                              sticker's header/footer inside the
//                              visible region on every mask I've
//                              tested while still filling the tile.
renderPng('app_icon.png',            { canvas: 1024, insetPct: 3 });
renderPng('app_icon_foreground.png', { canvas: 1024, insetPct: 12 });

console.log('\nNext:');
console.log('  cd mobile');
console.log('  dart run flutter_launcher_icons');
console.log('  flutter clean && flutter pub get');
console.log('  flutter build apk --release   # or your usual release flow');
