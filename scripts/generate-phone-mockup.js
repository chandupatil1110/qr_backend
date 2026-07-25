// Phone mockup — the exact QR sticker we ship, composited inside a
// clean iPhone-style frame on a light background. Ready to drop into a
// website hero, product card, or press kit.
//
// The sticker inside the phone is produced by the real
// renderStickerPng() pipeline so any tweak to sticker.js (colors,
// layout, footer text) automatically flows into this mockup on the
// next run — no duplicated design source.
//
// Run:  node scripts/generate-phone-mockup.js
// Out:  scripts/phone-with-qr.png  (3× retina, portrait)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';
import { renderStickerPng } from '../src/utils/sticker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Sticker ──────────────────────────────────────────────────────────
// Render once and inline as base64 so the whole mockup is a single SVG
// rasterised in one shot (no intermediate PNG assembly).
const stickerPng = await renderStickerPng({
  alertUrl: 'https://qr4emergency.com/alert/preview',
  digits: '10001',
  isManual: true,
});
const stickerB64 = stickerPng.toString('base64');
const STICKER_ASPECT = 460 / 652;

// ── Canvas — portrait phone-hero aspect ──────────────────────────────
const W = 460;
const H = 940;

// ── Phone geometry ───────────────────────────────────────────────────
// Small canvas margin so the phone body has a tiny air-gap on all
// sides. Bezel is the dark frame between the phone body and the screen.
const CANVAS_MARGIN = 22;
const PHONE_W = W - 2 * CANVAS_MARGIN;
const PHONE_H = H - 2 * CANVAS_MARGIN;
const PHONE_RADIUS = 58;
const BEZEL = 10;
const SCREEN_X = CANVAS_MARGIN + BEZEL;
const SCREEN_Y = CANVAS_MARGIN + BEZEL;
const SCREEN_W = PHONE_W - 2 * BEZEL;
const SCREEN_H = PHONE_H - 2 * BEZEL;
const SCREEN_RADIUS = PHONE_RADIUS - BEZEL;

// Sticker sits centered on the screen with a tiny downward nudge so
// the dynamic-island notch has breathing room above it.
const STICKER_W = SCREEN_W - 40;
const STICKER_H = STICKER_W / STICKER_ASPECT;
const STICKER_X = SCREEN_X + (SCREEN_W - STICKER_W) / 2;
const STICKER_Y = SCREEN_Y + (SCREEN_H - STICKER_H) / 2 + 30;

const NOTCH_W = 110;
const NOTCH_H = 30;

// ── SVG composition ──────────────────────────────────────────────────
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"
     width="${W * 3}" height="${H * 3}">
  <defs>
    <!-- Light background — barely-there gradient so the phone reads as
         "floating on a page" without introducing color noise that
         fights the sticker's red header. -->
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#F5F7FB"/>
      <stop offset="100%" stop-color="#E8ECF3"/>
    </linearGradient>

    <!-- Matte-black phone body with a subtle two-tone so the bezel
         reads as a physical object, not a flat rectangle. -->
    <linearGradient id="phoneBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"  stop-color="#2A2A2E"/>
      <stop offset="100%" stop-color="#0E0E10"/>
    </linearGradient>

    <!-- Left-edge rim highlight (thin bright line as if catching light). -->
    <linearGradient id="phoneRim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"  stop-color="#FFFFFF" stop-opacity="0.32"/>
      <stop offset="6%"  stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>

    <!-- Grounded drop shadow under the phone. -->
    <filter id="phoneShadow" x="-15%" y="-8%" width="130%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
      <feOffset dx="0" dy="14" result="blur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.24"/></feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <!-- Sticker gets a whisper of shadow so it looks pressed into the
         screen glass, not glued on top of it. -->
    <filter id="stickerShadow" x="-8%" y="-8%" width="116%" height="116%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="0" dy="4" result="blur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.15"/></feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- Phone body + rim highlight -->
  <g filter="url(#phoneShadow)">
    <rect x="${CANVAS_MARGIN}" y="${CANVAS_MARGIN}"
          width="${PHONE_W}" height="${PHONE_H}"
          rx="${PHONE_RADIUS}" ry="${PHONE_RADIUS}"
          fill="url(#phoneBody)"/>
    <rect x="${CANVAS_MARGIN}" y="${CANVAS_MARGIN}"
          width="${PHONE_W}" height="${PHONE_H}"
          rx="${PHONE_RADIUS}" ry="${PHONE_RADIUS}"
          fill="url(#phoneRim)"/>
  </g>

  <!-- Screen (white) -->
  <rect x="${SCREEN_X}" y="${SCREEN_Y}"
        width="${SCREEN_W}" height="${SCREEN_H}"
        rx="${SCREEN_RADIUS}" ry="${SCREEN_RADIUS}"
        fill="#FFFFFF"/>

  <!-- Dynamic-island notch -->
  <rect x="${W / 2 - NOTCH_W / 2}" y="${SCREEN_Y + 18}"
        width="${NOTCH_W}" height="${NOTCH_H}"
        rx="${NOTCH_H / 2}" ry="${NOTCH_H / 2}"
        fill="#0A0A0C"/>

  <!-- Sticker inside the screen -->
  <image href="data:image/png;base64,${stickerB64}"
         x="${STICKER_X}" y="${STICKER_Y}"
         width="${STICKER_W}" height="${STICKER_H}"
         filter="url(#stickerShadow)"/>
</svg>`;

const png = new Resvg(svg, { background: '#F5F7FB' }).render().asPng();
const outPath = path.join(__dirname, 'phone-with-qr.png');
fs.writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes, ${W * 3}×${H * 3}px)`);
