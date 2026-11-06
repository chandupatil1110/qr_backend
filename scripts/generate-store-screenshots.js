// Play Store screenshot mockups for QR 4 Emergency.
//
// Renders 6 app screens (login, home, create-QR, QR success, profile,
// bystander alert page) at two tablet resolutions:
//   • 7-inch tablet: 1200×1920 portrait
//   • 10-inch tablet: 1600×2560 portrait
//
// Output: store-screenshots/{7inch,10inch}/*.png
//
// IMPORTANT: These are code-generated MOCKUPS, not screenshots of the
// running Flutter app. They match the app's visual language closely
// (orange/red gradient, dark login bg, ea_card layout) but if you ship
// them to Play Store, Google's reviewers may flag mismatches with the
// real UI. Use these as placeholders / marketing preview — replace with
// real `flutter run` screenshots before final production release.
//
// Run: node scripts/generate-store-screenshots.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, '..', 'store-screenshots');

// Logical canvas — 5:8 portrait. Every screen builds against this
// coordinate space; final PNG is rasterised at the target device size.
const W = 600;
const H = 960;

// ── Design tokens (match the Flutter theme) ─────────────────────────────
const C = {
  primary: '#FF7A00',
  primaryEnd: '#DC2626',
  bgDark: '#0F1119',
  bgDarker: '#080A11',
  card: '#1A1D29',
  cardBorder: '#252A3A',
  surface: '#FFFFFF',
  surfaceAlt: '#F5F7FB',
  textOnDark: '#FFFFFF',
  textOnDarkDim: '#94A3B8',
  textOnLight: '#111827',
  textOnLightDim: '#6B7280',
  divider: '#E5E7EB',
  dividerDark: '#252A3A',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

// ── SVG helpers ─────────────────────────────────────────────────────────
function statusBar(color = C.textOnDark, bgTransparent = true) {
  const bg = bgTransparent ? '' :
    `<rect x="0" y="0" width="${W}" height="28" fill="${C.bgDark}"/>`;
  return `
    ${bg}
    <text x="24" y="20" font-family="Inter, Segoe UI, Arial, sans-serif"
          font-size="12" font-weight="600" fill="${color}">9:41</text>
    <g transform="translate(${W - 90} 12)">
      <!-- signal bars -->
      <rect x="0" y="4" width="3" height="6" rx="1" fill="${color}"/>
      <rect x="5" y="2" width="3" height="8" rx="1" fill="${color}"/>
      <rect x="10" y="0" width="3" height="10" rx="1" fill="${color}"/>
      <!-- wifi -->
      <path d="M22 8 Q26 4 30 8" stroke="${color}" stroke-width="1.5" fill="none"/>
      <path d="M24 9 Q26 7 28 9" stroke="${color}" stroke-width="1.5" fill="none"/>
      <circle cx="26" cy="10" r="1" fill="${color}"/>
      <!-- battery -->
      <rect x="40" y="1" width="26" height="9" rx="2" stroke="${color}"
            stroke-width="1" fill="none"/>
      <rect x="42" y="3" width="20" height="5" fill="${color}"/>
      <rect x="66" y="4" width="2" height="3" fill="${color}"/>
    </g>`;
}

function iconPhone(x, y, size = 24, color = C.primary) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M5 4 Q5 2 7 2 L17 2 Q19 2 19 4 L19 20 Q19 22 17 22 L7 22 Q5 22 5 20 Z"
          stroke="${color}" stroke-width="1.8" fill="none"/>
    <circle cx="12" cy="19" r="1" fill="${color}"/>
    <line x1="9" y1="5" x2="15" y2="5" stroke="${color}" stroke-width="1.5"/>
  </g>`;
}

function iconShield(x, y, size = 24, color = C.primary) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M12 2 L20 5 L20 12 Q20 18 12 22 Q4 18 4 12 L4 5 Z"
          fill="${color}" opacity="0.15"/>
    <path d="M12 2 L20 5 L20 12 Q20 18 12 22 Q4 18 4 12 L4 5 Z"
          stroke="${color}" stroke-width="1.8" fill="none"/>
    <path d="M9 12 L11 14 L15 10" stroke="${color}" stroke-width="2"
          fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

function iconUser(x, y, size = 24, color = C.primary) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="12" cy="8" r="4" stroke="${color}" stroke-width="1.8" fill="none"/>
    <path d="M4 21 Q4 14 12 14 Q20 14 20 21" stroke="${color}"
          stroke-width="1.8" fill="none"/>
  </g>`;
}

function iconHome(x, y, size = 24, color = C.primary, filled = false) {
  const s = size / 24;
  const fill = filled ? color : 'none';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M3 11 L12 3 L21 11 L21 20 Q21 21 20 21 L15 21 L15 14 L9 14 L9 21 L4 21 Q3 21 3 20 Z"
          stroke="${color}" stroke-width="1.8" fill="${fill}"/>
  </g>`;
}

function iconQr(x, y, size = 24, color = C.primary, filled = false) {
  const s = size / 24;
  const fill = filled ? color : 'none';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="3" y="3" width="7" height="7" stroke="${color}"
          stroke-width="1.8" fill="${fill}"/>
    <rect x="14" y="3" width="7" height="7" stroke="${color}"
          stroke-width="1.8" fill="${fill}"/>
    <rect x="3" y="14" width="7" height="7" stroke="${color}"
          stroke-width="1.8" fill="${fill}"/>
    <rect x="15" y="15" width="3" height="3" fill="${color}"/>
    <rect x="20" y="15" width="1" height="3" fill="${color}"/>
    <rect x="15" y="20" width="6" height="1" fill="${color}"/>
  </g>`;
}

function iconBell(x, y, size = 24, color = C.textOnDark) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M6 8 Q6 3 12 3 Q18 3 18 8 L18 13 L20 17 L4 17 L6 13 Z"
          stroke="${color}" stroke-width="1.8" fill="none"
          stroke-linejoin="round"/>
    <circle cx="12" cy="20" r="1.8" fill="${color}"/>
  </g>`;
}

function iconHistory(x, y, size = 24, color = C.primary, filled = false) {
  const s = size / 24;
  const stroke = color;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <circle cx="12" cy="12" r="9" stroke="${stroke}" stroke-width="1.8"
            fill="${filled ? color : 'none'}"/>
    <path d="M12 7 L12 12 L15 14" stroke="${filled ? '#fff' : stroke}"
          stroke-width="1.8" fill="none" stroke-linecap="round"/>
  </g>`;
}

function iconAlert(x, y, size = 24, color = C.danger) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M12 3 L22 20 L2 20 Z" stroke="${color}" stroke-width="1.8"
          fill="${color}" fill-opacity="0.15" stroke-linejoin="round"/>
    <line x1="12" y1="10" x2="12" y2="15" stroke="${color}" stroke-width="1.8"
          stroke-linecap="round"/>
    <circle cx="12" cy="17.5" r="1" fill="${color}"/>
  </g>`;
}

function iconCar(x, y, size = 24, color = C.primary) {
  const s = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M3 15 L4 10 Q4.4 8 6 8 L18 8 Q19.6 8 20 10 L21 15 Z"
          stroke="${color}" stroke-width="1.8" fill="${color}" fill-opacity="0.15"/>
    <line x1="3" y1="15" x2="21" y2="15" stroke="${color}" stroke-width="1.8"/>
    <line x1="3" y1="18" x2="3" y2="15" stroke="${color}" stroke-width="1.8"/>
    <line x1="21" y1="18" x2="21" y2="15" stroke="${color}" stroke-width="1.8"/>
    <circle cx="7" cy="17.5" r="1.5" fill="${color}"/>
    <circle cx="17" cy="17.5" r="1.5" fill="${color}"/>
  </g>`;
}

// A mini fake QR (visual only — for mockups)
function fakeQr(x, y, size, color = '#111') {
  // Deterministic pseudo-random pattern that "looks like" a QR
  const cells = 21;
  const cell = size / cells;
  let rects = '';
  const seed = 42;
  function rand(i) {
    return ((i * 9301 + seed * 49297) % 233280) / 233280;
  }
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      // finder patterns (three corners)
      const inFinder =
        (r < 7 && c < 7) ||
        (r < 7 && c >= cells - 7) ||
        (r >= cells - 7 && c < 7);
      const inFinderBorder =
        (r === 0 || r === 6 || c === 0 || c === 6) && r < 7 && c < 7;
      const inTRBorder =
        (r === 0 || r === 6 || c === cells - 7 || c === cells - 1) &&
        r < 7 && c >= cells - 7;
      const inBLBorder =
        (r === cells - 7 || r === cells - 1 || c === 0 || c === 6) &&
        r >= cells - 7 && c < 7;
      const inFinderCenter =
        (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
        (r >= 2 && r <= 4 && c >= cells - 5 && c <= cells - 3) ||
        (r >= cells - 5 && r <= cells - 3 && c >= 2 && c <= 4);

      let on = false;
      if (inFinderBorder || inTRBorder || inBLBorder || inFinderCenter) {
        on = true;
      } else if (inFinder) {
        on = false;
      } else {
        on = rand(r * cells + c) > 0.55;
      }
      if (on) {
        rects += `<rect x="${x + c * cell}" y="${y + r * cell}"
                        width="${cell}" height="${cell}" fill="${color}"/>`;
      }
    }
  }
  return rects;
}

// ── Screen: Login ───────────────────────────────────────────────────────
function screenLogin() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1A1230"/>
        <stop offset="50%" stop-color="#0F1119"/>
        <stop offset="100%" stop-color="#080A11"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.8" cy="0.15" r="0.6">
        <stop offset="0%" stop-color="${C.primary}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${C.primary}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="cta" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.primary}"/>
        <stop offset="100%" stop-color="${C.primaryEnd}"/>
      </linearGradient>
      <linearGradient id="logoRing" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${C.primary}"/>
        <stop offset="100%" stop-color="${C.primaryEnd}"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    ${statusBar(C.textOnDark)}

    <!-- Logo circle -->
    <g transform="translate(${W / 2} 180)">
      <circle r="66" fill="#fff"/>
      <circle r="66" fill="none" stroke="url(#logoRing)" stroke-width="3"/>
      ${fakeQr(-24, -34, 48, '#111')}
      <text y="30" text-anchor="middle" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="800" fill="#DC2626"
            letter-spacing="1">QR4EMERGENCY</text>
    </g>

    <!-- Title -->
    <text x="${W / 2}" y="310" text-anchor="middle"
          font-family="Inter, Arial, sans-serif"
          font-size="34" font-weight="800" fill="${C.textOnDark}">
      QR 4 Emergency
    </text>
    <text x="${W / 2}" y="342" text-anchor="middle"
          font-family="Inter, Arial, sans-serif"
          font-size="14" font-weight="700" fill="${C.primary}"
          letter-spacing="4">BE NAYAK</text>

    <!-- Tagline -->
    <text x="${W / 2}" y="386" text-anchor="middle"
          font-family="Inter, Arial, sans-serif"
          font-size="15" fill="${C.textOnDarkDim}">
      Stay connected with your loved ones,
    </text>
    <text x="${W / 2}" y="406" text-anchor="middle"
          font-family="Inter, Arial, sans-serif"
          font-size="15" fill="${C.textOnDarkDim}">
      wherever you go.
    </text>

    <!-- Mobile input card -->
    <g transform="translate(48 470)">
      <rect width="${W - 96}" height="128" rx="18" fill="#181B27"
            stroke="#252A3A" stroke-width="1"/>
      <text x="20" y="30" font-family="Inter, Arial, sans-serif"
            font-size="11" font-weight="800" fill="${C.primary}"
            letter-spacing="2">MOBILE NUMBER</text>
      <rect x="16" y="46" width="${W - 128}" height="66" rx="14"
            fill="#0F1119" stroke="${C.primary}" stroke-width="1.5"/>
      <text x="40" y="86" font-family="Inter, Arial, sans-serif"
            font-size="20">🇮🇳</text>
      <text x="82" y="88" font-family="Inter, Arial, sans-serif"
            font-size="18" font-weight="700" fill="${C.textOnDark}">+91</text>
      <line x1="130" y1="60" x2="130" y2="100" stroke="#2A2F42"
            stroke-width="1"/>
      <text x="150" y="88" font-family="Inter, Arial, sans-serif"
            font-size="20" font-weight="600" fill="${C.textOnDark}">
        8857846064
      </text>
      <rect x="380" y="66" width="2" height="26" fill="${C.primary}">
        <animate attributeName="opacity" values="1;0;1" dur="1s"
                 repeatCount="indefinite"/>
      </rect>
    </g>

    <!-- CTA button -->
    <g transform="translate(48 640)">
      <rect width="${W - 96}" height="70" rx="18" fill="url(#cta)"/>
      <text x="${(W - 96) / 2}" y="44" text-anchor="middle"
            font-family="Inter, Arial, sans-serif"
            font-size="18" font-weight="700" fill="#fff">
        →   Verify &amp; Continue
      </text>
    </g>

    <!-- Info banner -->
    <g transform="translate(48 760)">
      <rect width="${W - 96}" height="84" rx="16" fill="#181B27"
            stroke="#252A3A" stroke-width="1"/>
      ${iconShield(20, 22, 40, C.warning)}
      <text x="80" y="42" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="${C.textOnDarkDim}">
        Your emergency contact details stay
      </text>
      <text x="80" y="60" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="${C.textOnDarkDim}">
        encrypted and are shared only when
      </text>
      <text x="80" y="78" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="${C.textOnDarkDim}">
        your QR code is scanned.
      </text>
    </g>
  </svg>`;
}

// ── Screen: Home dashboard ──────────────────────────────────────────────
function screenHome() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="heroCard" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${C.primary}"/>
        <stop offset="100%" stop-color="${C.primaryEnd}"/>
      </linearGradient>
      <linearGradient id="qrCard" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#FFF8F3"/>
        <stop offset="100%" stop-color="#FFEEDF"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="${C.surfaceAlt}"/>
    <rect width="${W}" height="34" fill="${C.bgDark}"/>
    ${statusBar(C.textOnDark, false)}

    <!-- Header -->
    <text x="32" y="80" font-family="Inter, Arial, sans-serif"
          font-size="14" fill="${C.textOnLightDim}">Welcome back,</text>
    <text x="32" y="110" font-family="Inter, Arial, sans-serif"
          font-size="26" font-weight="800" fill="${C.textOnLight}">
      Sahil Mankar
    </text>

    <!-- Bell + avatar -->
    <g transform="translate(${W - 130} 60)">
      <circle cx="20" cy="20" r="22" fill="#fff" stroke="${C.divider}"/>
      ${iconBell(8, 8, 24, C.textOnLight)}
      <circle cx="30" cy="10" r="4" fill="${C.danger}"/>
    </g>
    <g transform="translate(${W - 70} 60)">
      <circle cx="20" cy="20" r="22" fill="${C.primary}"/>
      <text x="20" y="26" text-anchor="middle"
            font-family="Inter, Arial, sans-serif"
            font-size="14" font-weight="800" fill="#fff">SM</text>
    </g>

    <!-- Hero card: How it works -->
    <g transform="translate(24 150)">
      <rect width="${W - 48}" height="140" rx="20" fill="url(#heroCard)"/>
      <text x="24" y="42" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="800" fill="#FFE0BC"
            letter-spacing="2">HOW IT WORKS</text>
      <text x="24" y="76" font-family="Inter, Arial, sans-serif"
            font-size="20" font-weight="800" fill="#fff">
        Scan · Connect · Save Lives
      </text>
      <text x="24" y="104" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="#FFE0BC">
        Any bystander can reach your family
      </text>
      <text x="24" y="122" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="#FFE0BC">
        instantly — no phone number visible.
      </text>
      ${iconShield(W - 130, 32, 80, '#fff')}
    </g>

    <!-- Section title -->
    <text x="32" y="336" font-family="Inter, Arial, sans-serif"
          font-size="16" font-weight="800" fill="${C.textOnLight}">
      Your QR Stickers
    </text>
    <text x="${W - 32}" y="336" text-anchor="end"
          font-family="Inter, Arial, sans-serif"
          font-size="13" font-weight="700" fill="${C.primary}">
      View all →
    </text>

    <!-- QR card 1 -->
    <g transform="translate(24 360)">
      <rect width="${W - 48}" height="180" rx="20" fill="url(#qrCard)"
            stroke="#FFD5B3"/>
      ${fakeQr(24, 22, 130, '#111')}
      <g transform="translate(180 30)">
        ${iconCar(0, 0, 20, C.primaryEnd)}
        <text x="30" y="16" font-family="Inter, Arial, sans-serif"
              font-size="13" font-weight="700" fill="${C.textOnLightDim}">
          VEHICLE
        </text>
        <text x="0" y="46" font-family="Inter, Arial, sans-serif"
              font-size="22" font-weight="800" fill="${C.textOnLight}"
              letter-spacing="1">MH40KR3448</text>

        <g transform="translate(0 62)">
          <rect width="80" height="26" rx="13" fill="${C.success}"
                fill-opacity="0.15"/>
          <circle cx="14" cy="13" r="4" fill="${C.success}"/>
          <text x="24" y="18" font-family="Inter, Arial, sans-serif"
                font-size="11" font-weight="700" fill="${C.success}">Active</text>
        </g>

        <text x="0" y="118" font-family="Inter, Arial, sans-serif"
              font-size="11" font-weight="700" fill="${C.textOnLightDim}"
              letter-spacing="1">EXTENSION CODE</text>
        <text x="0" y="142" font-family="Inter, Arial, sans-serif"
              font-size="22" font-weight="700" fill="${C.textOnLight}"
              font-family-monospace="true">70010</text>
      </g>
    </g>

    <!-- QR card 2 (smaller preview) -->
    <g transform="translate(24 560)">
      <rect width="${W - 48}" height="120" rx="20" fill="#fff"
            stroke="${C.divider}"/>
      ${fakeQr(20, 20, 80, '#111')}
      <g transform="translate(130 24)">
        ${iconCar(0, 0, 18, C.primary)}
        <text x="26" y="14" font-family="Inter, Arial, sans-serif"
              font-size="11" font-weight="700" fill="${C.textOnLightDim}">
          VEHICLE
        </text>
        <text x="0" y="42" font-family="Inter, Arial, sans-serif"
              font-size="18" font-weight="800" fill="${C.textOnLight}"
              letter-spacing="1">MH12AB7789</text>
        <g transform="translate(0 54)">
          <rect width="90" height="24" rx="12" fill="${C.warning}"
                fill-opacity="0.15"/>
          <circle cx="14" cy="12" r="4" fill="${C.warning}"/>
          <text x="24" y="17" font-family="Inter, Arial, sans-serif"
                font-size="10" font-weight="700" fill="${C.warning}">
            Renew Soon
          </text>
        </g>
      </g>
      <text x="${W - 78}" y="72" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="700" fill="${C.primary}">›</text>
    </g>

    <!-- Add new QR CTA -->
    <g transform="translate(24 704)">
      <rect width="${W - 48}" height="72" rx="20" fill="#fff"
            stroke-dasharray="6 4" stroke="${C.primary}" stroke-width="2"/>
      <g transform="translate(30 20)">
        <circle cx="16" cy="16" r="16" fill="${C.primary}"/>
        <line x1="16" y1="8" x2="16" y2="24" stroke="#fff" stroke-width="2.5"
              stroke-linecap="round"/>
        <line x1="8" y1="16" x2="24" y2="16" stroke="#fff" stroke-width="2.5"
              stroke-linecap="round"/>
      </g>
      <text x="88" y="46" font-family="Inter, Arial, sans-serif"
            font-size="16" font-weight="700" fill="${C.primary}">
        Add another vehicle
      </text>
    </g>

    <!-- Bottom nav -->
    <g transform="translate(0 ${H - 88})">
      <rect width="${W}" height="88" fill="#fff"/>
      <line x1="0" y1="0" x2="${W}" y2="0" stroke="${C.divider}"/>
      ${iconHome(60, 20, 28, C.primary, true)}
      <text x="74" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            font-weight="700" fill="${C.primary}">Home</text>

      ${iconQr(210, 20, 28, C.textOnLightDim)}
      <text x="224" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            fill="${C.textOnLightDim}">QR</text>

      ${iconHistory(360, 20, 28, C.textOnLightDim)}
      <text x="374" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            fill="${C.textOnLightDim}">History</text>

      ${iconUser(500, 20, 28, C.textOnLightDim)}
      <text x="514" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            fill="${C.textOnLightDim}">Profile</text>
    </g>
  </svg>`;
}

// ── Screen: Create QR form ─────────────────────────────────────────────
function screenCreateQr() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.surfaceAlt}"/>
    <rect width="${W}" height="34" fill="${C.surface}"/>
    ${statusBar(C.textOnLight, false)}

    <!-- Header -->
    <g transform="translate(0 44)">
      <rect width="${W}" height="68" fill="#fff"/>
      <line x1="0" y1="68" x2="${W}" y2="68" stroke="${C.divider}"/>
      <text x="24" y="42" font-family="Inter, Arial, sans-serif"
            font-size="24" font-weight="800" fill="${C.textOnLight}">←</text>
      <text x="60" y="42" font-family="Inter, Arial, sans-serif"
            font-size="19" font-weight="800" fill="${C.textOnLight}">
        Create Your QR
      </text>
    </g>

    <!-- Step indicator -->
    <g transform="translate(24 132)">
      <circle cx="14" cy="14" r="14" fill="${C.primary}"/>
      <text x="14" y="19" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="12"
            font-weight="800" fill="#fff">1</text>
      <line x1="28" y1="14" x2="120" y2="14" stroke="${C.primary}"
            stroke-width="2"/>
      <circle cx="134" cy="14" r="14" fill="${C.primary}"/>
      <text x="134" y="19" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="12"
            font-weight="800" fill="#fff">2</text>
      <line x1="148" y1="14" x2="240" y2="14" stroke="${C.divider}"
            stroke-width="2"/>
      <circle cx="254" cy="14" r="14" fill="${C.divider}"/>
      <text x="254" y="19" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="12"
            font-weight="800" fill="${C.textOnLightDim}">3</text>
      <text x="10" y="48" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="700" fill="${C.primary}">Vehicle</text>
      <text x="120" y="48" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="700" fill="${C.primary}">Contacts</text>
      <text x="230" y="48" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="700" fill="${C.textOnLightDim}">Review</text>
    </g>

    <!-- Vehicle card -->
    <g transform="translate(24 220)">
      <rect width="${W - 48}" height="230" rx="20" fill="#fff"/>
      <text x="20" y="34" font-family="Inter, Arial, sans-serif"
            font-size="11" font-weight="800" fill="${C.primary}"
            letter-spacing="2">VEHICLE NUMBER</text>
      <rect x="20" y="48" width="${W - 88}" height="56" rx="12"
            fill="${C.surfaceAlt}" stroke="${C.primary}" stroke-width="1.5"/>
      ${iconCar(36, 68, 22, C.primary)}
      <text x="76" y="84" font-family="Inter, Arial, sans-serif"
            font-size="22" font-weight="800" fill="${C.textOnLight}"
            letter-spacing="2">MH 40 KR 3448</text>

      <text x="20" y="146" font-family="Inter, Arial, sans-serif"
            font-size="11" font-weight="800" fill="${C.primary}"
            letter-spacing="2">BLOOD GROUP</text>
      <rect x="20" y="160" width="${W - 88}" height="54" rx="12"
            fill="${C.surfaceAlt}" stroke="${C.divider}"/>
      <circle cx="42" cy="187" r="12" fill="${C.danger}" fill-opacity="0.15"/>
      <text x="42" y="192" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="12"
            font-weight="800" fill="${C.danger}">B+</text>
      <text x="66" y="192" font-family="Inter, Arial, sans-serif"
            font-size="16" font-weight="600" fill="${C.textOnLight}">
        B Positive
      </text>
      <text x="${W - 88}" y="192" text-anchor="end"
            font-family="Inter, Arial, sans-serif" font-size="16"
            fill="${C.textOnLightDim}">▼</text>
    </g>

    <!-- Emergency contacts section -->
    <text x="32" y="484" font-family="Inter, Arial, sans-serif"
          font-size="16" font-weight="800" fill="${C.textOnLight}">
      Emergency Contacts
    </text>
    <text x="32" y="504" font-family="Inter, Arial, sans-serif"
          font-size="12" fill="${C.textOnLightDim}">
      Add up to 3 people bystanders can reach in an emergency.
    </text>

    <!-- Contact 1 -->
    <g transform="translate(24 528)">
      <rect width="${W - 48}" height="80" rx="16" fill="#fff"/>
      <circle cx="34" cy="40" r="20" fill="${C.primary}" fill-opacity="0.15"/>
      <text x="34" y="46" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="14"
            font-weight="800" fill="${C.primary}">RM</text>
      <text x="68" y="34" font-family="Inter, Arial, sans-serif"
            font-size="16" font-weight="700" fill="${C.textOnLight}">
        Rakesh Mankar
      </text>
      <text x="68" y="56" font-family="Inter, Arial, sans-serif"
            font-size="12" fill="${C.textOnLightDim}">
        Father · +91 98765 43210
      </text>
      <text x="${W - 72}" y="46" font-family="Inter, Arial, sans-serif"
            font-size="16" fill="${C.textOnLightDim}">⋮</text>
    </g>

    <!-- Contact 2 -->
    <g transform="translate(24 620)">
      <rect width="${W - 48}" height="80" rx="16" fill="#fff"/>
      <circle cx="34" cy="40" r="20" fill="${C.success}" fill-opacity="0.15"/>
      <text x="34" y="46" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="14"
            font-weight="800" fill="${C.success}">PM</text>
      <text x="68" y="34" font-family="Inter, Arial, sans-serif"
            font-size="16" font-weight="700" fill="${C.textOnLight}">
        Priya Mankar
      </text>
      <text x="68" y="56" font-family="Inter, Arial, sans-serif"
            font-size="12" fill="${C.textOnLightDim}">
        Mother · +91 98123 45678
      </text>
      <text x="${W - 72}" y="46" font-family="Inter, Arial, sans-serif"
            font-size="16" fill="${C.textOnLightDim}">⋮</text>
    </g>

    <!-- Add contact -->
    <g transform="translate(24 712)">
      <rect width="${W - 48}" height="56" rx="14" fill="#fff"
            stroke="${C.primary}" stroke-width="1.5" stroke-dasharray="6 4"/>
      <text x="${(W - 48) / 2}" y="36" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="14"
            font-weight="700" fill="${C.primary}">
        + Add another contact
      </text>
    </g>

    <!-- Continue -->
    <g transform="translate(24 ${H - 130})">
      <rect width="${W - 48}" height="64" rx="18" fill="${C.primary}"/>
      <text x="${(W - 48) / 2}" y="41" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="17"
            font-weight="700" fill="#fff">
        Continue to Payment  →
      </text>
    </g>
  </svg>`;
}

// ── Screen: QR success ─────────────────────────────────────────────────
function screenQrSuccess() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="successHero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${C.primary}"/>
        <stop offset="100%" stop-color="${C.primaryEnd}"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="${C.surfaceAlt}"/>
    <rect width="${W}" height="34" fill="${C.bgDark}"/>
    ${statusBar(C.textOnDark, false)}

    <!-- Hero band -->
    <rect x="0" y="34" width="${W}" height="240" fill="url(#successHero)"/>

    <!-- Big check -->
    <g transform="translate(${W / 2} 130)">
      <circle r="52" fill="#fff" fill-opacity="0.15"/>
      <circle r="36" fill="#fff"/>
      <path d="M -14 0 L -4 12 L 16 -12"
            stroke="${C.primaryEnd}" stroke-width="5" fill="none"
            stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <text x="${W / 2}" y="220" text-anchor="middle"
          font-family="Inter, Arial, sans-serif" font-size="24"
          font-weight="800" fill="#fff">Your QR is ready!</text>
    <text x="${W / 2}" y="248" text-anchor="middle"
          font-family="Inter, Arial, sans-serif" font-size="13"
          fill="#FFE0BC">
      Sticker ships to your address in 3-5 days
    </text>

    <!-- QR sticker preview card -->
    <g transform="translate(56 306)">
      <rect width="${W - 112}" height="360" rx="24" fill="#fff"
            stroke="${C.divider}"/>
      <!-- header bar -->
      <path d="M 0 24 A 24 24 0 0 1 24 0 L ${W - 136} 0 A 24 24 0 0 1 ${W - 112} 24 L ${W - 112} 60 L 0 60 Z"
            fill="url(#successHero)"/>
      <text x="${(W - 112) / 2}" y="26" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            font-weight="800" fill="#fff" letter-spacing="2.4">
        QR 4 EMERGENCY · BE NAYAK
      </text>
      <text x="${(W - 112) / 2}" y="48" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="13"
            font-weight="700" fill="#FFE0BC" letter-spacing="1">
        SCAN · CONNECT · SAVE LIVES
      </text>
      <!-- QR code -->
      ${fakeQr((W - 112) / 2 - 90, 90, 180, '#111')}
      <!-- vehicle plate -->
      <rect x="${(W - 112) / 2 - 90}" y="290" width="180" height="42" rx="8"
            fill="${C.textOnLight}"/>
      <text x="${(W - 112) / 2}" y="318" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="18"
            font-weight="800" fill="#fff" letter-spacing="3">MH40KR3448</text>
    </g>

    <!-- Extension code chip -->
    <g transform="translate(${W / 2 - 105} 692)">
      <rect width="210" height="60" rx="16" fill="#fff"
            stroke="${C.divider}"/>
      <text x="20" y="24" font-family="Inter, Arial, sans-serif"
            font-size="10" font-weight="700" fill="${C.textOnLightDim}"
            letter-spacing="1.5">EXTENSION CODE</text>
      <text x="20" y="48" font-family="Inter, Arial, sans-serif"
            font-size="22" font-weight="800" fill="${C.textOnLight}"
            letter-spacing="4">70010</text>
      ${iconPhone(160, 18, 28, C.primary)}
    </g>

    <!-- Action buttons -->
    <g transform="translate(24 780)">
      <rect width="${(W - 60) / 2}" height="60" rx="16" fill="#fff"
            stroke="${C.divider}"/>
      <text x="${(W - 60) / 4}" y="38" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="14"
            font-weight="700" fill="${C.textOnLight}">↓  Save</text>
    </g>
    <g transform="translate(${W / 2 + 6} 780)">
      <rect width="${(W - 60) / 2}" height="60" rx="16" fill="${C.primary}"/>
      <text x="${(W - 60) / 4}" y="38" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="14"
            font-weight="700" fill="#fff">↗  Share</text>
    </g>

    <!-- Done -->
    <g transform="translate(24 ${H - 120})">
      <rect width="${W - 48}" height="60" rx="18"
            fill="none" stroke="${C.textOnLightDim}"/>
      <text x="${(W - 48) / 2}" y="38" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="15"
            font-weight="700" fill="${C.textOnLight}">
        Continue to Dashboard
      </text>
    </g>
  </svg>`;
}

// ── Screen: Profile ────────────────────────────────────────────────────
function screenProfile() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="profHero" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${C.primary}"/>
        <stop offset="100%" stop-color="${C.primaryEnd}"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="${C.surfaceAlt}"/>
    <rect width="${W}" height="34" fill="${C.bgDark}"/>
    ${statusBar(C.textOnDark, false)}

    <!-- Hero -->
    <rect x="0" y="34" width="${W}" height="200" fill="url(#profHero)"/>
    <text x="24" y="76" font-family="Inter, Arial, sans-serif"
          font-size="14" font-weight="700" fill="#FFE0BC" letter-spacing="2">
      MY PROFILE
    </text>
    <text x="${W - 24}" y="76" text-anchor="end"
          font-family="Inter, Arial, sans-serif" font-size="22" fill="#fff">
      ✎
    </text>

    <!-- Avatar + name -->
    <g transform="translate(24 108)">
      <circle cx="40" cy="40" r="42" fill="#fff"/>
      <circle cx="40" cy="40" r="40" fill="${C.primary}"/>
      <text x="40" y="48" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="22"
            font-weight="800" fill="#fff">SM</text>
      <text x="100" y="34" font-family="Inter, Arial, sans-serif"
            font-size="20" font-weight="800" fill="#fff">Sahil Mankar</text>
      <text x="100" y="56" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="#FFE0BC">+91 88578 46064</text>
      <text x="100" y="76" font-family="Inter, Arial, sans-serif"
            font-size="13" fill="#FFE0BC">sahil.mankar@finkeep.in</text>
    </g>

    <!-- Stats row -->
    <g transform="translate(24 258)">
      <rect width="${W - 48}" height="90" rx="18" fill="#fff"/>
      <g transform="translate(0 0)">
        <text x="90" y="42" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="22"
              font-weight="800" fill="${C.textOnLight}">2</text>
        <text x="90" y="66" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="11"
              fill="${C.textOnLightDim}" letter-spacing="1">QR STICKERS</text>
      </g>
      <line x1="180" y1="18" x2="180" y2="72" stroke="${C.divider}"/>
      <g>
        <text x="276" y="42" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="22"
              font-weight="800" fill="${C.textOnLight}">4</text>
        <text x="276" y="66" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="11"
              fill="${C.textOnLightDim}" letter-spacing="1">CONTACTS</text>
      </g>
      <line x1="365" y1="18" x2="365" y2="72" stroke="${C.divider}"/>
      <g>
        <text x="462" y="42" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="22"
              font-weight="800" fill="${C.success}">3</text>
        <text x="462" y="66" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="11"
              fill="${C.textOnLightDim}" letter-spacing="1">CALLS RCVD</text>
      </g>
    </g>

    <!-- Emergency contacts section -->
    <text x="32" y="392" font-family="Inter, Arial, sans-serif"
          font-size="16" font-weight="800" fill="${C.textOnLight}">
      Emergency Contacts
    </text>
    <text x="${W - 32}" y="392" text-anchor="end"
          font-family="Inter, Arial, sans-serif" font-size="12"
          font-weight="700" fill="${C.primary}">Edit</text>

    ${[
      { name: 'Rakesh Mankar', rel: 'Father', phone: '+91 98765 43210', color: C.primary },
      { name: 'Priya Mankar', rel: 'Mother', phone: '+91 98123 45678', color: C.success },
      { name: 'Rohan Mankar', rel: 'Brother', phone: '+91 87654 32109', color: C.warning },
      { name: 'Anaya Mankar', rel: 'Sister', phone: '+91 76543 21098', color: '#8B5CF6' },
    ].map((c, i) => `
      <g transform="translate(24 ${412 + i * 78})">
        <rect width="${W - 48}" height="66" rx="16" fill="#fff"/>
        <circle cx="34" cy="33" r="20" fill="${c.color}" fill-opacity="0.15"/>
        <text x="34" y="39" text-anchor="middle"
              font-family="Inter, Arial, sans-serif" font-size="14"
              font-weight="800" fill="${c.color}">
          ${c.name.split(' ').map(w => w[0]).join('')}
        </text>
        <text x="68" y="30" font-family="Inter, Arial, sans-serif"
              font-size="15" font-weight="700" fill="${C.textOnLight}">
          ${c.name}
        </text>
        <text x="68" y="50" font-family="Inter, Arial, sans-serif"
              font-size="12" fill="${C.textOnLightDim}">
          ${c.rel} · ${c.phone}
        </text>
        ${iconPhone(W - 96, 20, 26, c.color)}
      </g>`).join('')}

    <!-- Settings row -->
    <g transform="translate(24 748)">
      <rect width="${W - 48}" height="60" rx="16" fill="#fff"/>
      ${iconShield(20, 18, 26, C.primary)}
      <text x="60" y="38" font-family="Inter, Arial, sans-serif"
            font-size="15" font-weight="600" fill="${C.textOnLight}">
        Privacy &amp; security
      </text>
      <text x="${W - 68}" y="38" font-family="Inter, Arial, sans-serif"
            font-size="18" fill="${C.textOnLightDim}">›</text>
    </g>

    <!-- Bottom nav -->
    <g transform="translate(0 ${H - 88})">
      <rect width="${W}" height="88" fill="#fff"/>
      <line x1="0" y1="0" x2="${W}" y2="0" stroke="${C.divider}"/>
      ${iconHome(60, 20, 28, C.textOnLightDim)}
      <text x="74" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            fill="${C.textOnLightDim}">Home</text>

      ${iconQr(210, 20, 28, C.textOnLightDim)}
      <text x="224" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            fill="${C.textOnLightDim}">QR</text>

      ${iconHistory(360, 20, 28, C.textOnLightDim)}
      <text x="374" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            fill="${C.textOnLightDim}">History</text>

      ${iconUser(500, 20, 28, C.primary)}
      <text x="514" y="70" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="11"
            font-weight="700" fill="${C.primary}">Profile</text>
    </g>
  </svg>`;
}

// ── Screen: Alert page (bystander view) ────────────────────────────────
function screenAlertPage() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="alertHeader" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${C.primary}"/>
        <stop offset="100%" stop-color="${C.primaryEnd}"/>
      </linearGradient>
      <linearGradient id="callBtn" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.success}"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>

    <rect width="${W}" height="${H}" fill="${C.surfaceAlt}"/>
    <rect width="${W}" height="34" fill="${C.bgDark}"/>
    ${statusBar(C.textOnDark, false)}

    <!-- Alert header -->
    <rect x="0" y="34" width="${W}" height="220" fill="url(#alertHeader)"/>
    <text x="${W / 2}" y="88" text-anchor="middle"
          font-family="Inter, Arial, sans-serif" font-size="11"
          font-weight="800" fill="#FFE0BC" letter-spacing="2.4">
      QR 4 EMERGENCY · BE NAYAK
    </text>

    ${iconAlert(W / 2 - 32, 100, 64, '#fff')}

    <text x="${W / 2}" y="212" text-anchor="middle"
          font-family="Inter, Arial, sans-serif" font-size="22"
          font-weight="800" fill="#fff">Emergency Alert</text>
    <text x="${W / 2}" y="238" text-anchor="middle"
          font-family="Inter, Arial, sans-serif" font-size="13"
          fill="#FFE0BC">
      Someone needs your help. Please call now.
    </text>

    <!-- Vehicle card -->
    <g transform="translate(40 288)">
      <rect width="${W - 80}" height="130" rx="20" fill="#fff"
            stroke="${C.divider}"/>
      <text x="24" y="34" font-family="Inter, Arial, sans-serif"
            font-size="11" font-weight="800" fill="${C.textOnLightDim}"
            letter-spacing="2">VEHICLE NUMBER</text>
      <rect x="24" y="46" width="200" height="52" rx="8" fill="${C.textOnLight}"/>
      <text x="124" y="80" text-anchor="middle"
            font-family="Inter, Arial, sans-serif" font-size="22"
            font-weight="800" fill="#fff" letter-spacing="3">MH40KR3448</text>

      <g transform="translate(260 30)">
        <text font-family="Inter, Arial, sans-serif" font-size="11"
              font-weight="800" fill="${C.textOnLightDim}"
              letter-spacing="2">OWNER</text>
        <text y="26" font-family="Inter, Arial, sans-serif" font-size="16"
              font-weight="700" fill="${C.textOnLight}">Sa*** Ma****r</text>
        <text y="46" font-family="Inter, Arial, sans-serif" font-size="12"
              fill="${C.textOnLightDim}">+91 88*** *6064</text>
        <g transform="translate(0 58)">
          <circle cx="6" cy="6" r="6" fill="${C.danger}" fill-opacity="0.15"/>
          <text x="4" y="10" font-family="Inter, Arial, sans-serif"
                font-size="9" font-weight="800" fill="${C.danger}">B+</text>
          <text x="18" y="10" font-family="Inter, Arial, sans-serif"
                font-size="12" fill="${C.textOnLightDim}">B Positive</text>
        </g>
      </g>
    </g>

    <!-- Contacts label -->
    <g transform="translate(0 452)">
      <text x="40" font-family="Inter, Arial, sans-serif" font-size="12"
            font-weight="800" fill="${C.primary}" letter-spacing="2">
        TAP TO CONNECT
      </text>
      <text x="${W - 40}" font-size="12" text-anchor="end"
            font-family="Inter, Arial, sans-serif"
            fill="${C.textOnLightDim}">Owner + 3 contacts</text>
    </g>

    <!-- Contact cards -->
    ${[
      { name: 'Call the Owner', sub: 'Vehicle owner · Sahil M.', mask: '+91 88*** *6064', primary: true },
      { name: 'Rakesh Mankar', sub: 'Father', mask: '+91 98*** *3210', primary: false },
      { name: 'Priya Mankar', sub: 'Mother', mask: '+91 98*** *5678', primary: false },
    ].map((c, i) => `
      <g transform="translate(24 ${478 + i * 96})">
        <rect width="${W - 48}" height="82" rx="18"
              fill="${c.primary ? C.primaryEnd : '#fff'}"
              stroke="${c.primary ? C.primaryEnd : C.divider}"/>
        <circle cx="40" cy="41" r="24"
                fill="${c.primary ? '#fff' : C.success}"
                fill-opacity="${c.primary ? '0.15' : '0.15'}"/>
        ${iconPhone(30, 30, 22, c.primary ? '#fff' : C.success)}
        <text x="78" y="34" font-family="Inter, Arial, sans-serif"
              font-size="16" font-weight="800"
              fill="${c.primary ? '#fff' : C.textOnLight}">${c.name}</text>
        <text x="78" y="54" font-family="Inter, Arial, sans-serif"
              font-size="12"
              fill="${c.primary ? '#FFE0BC' : C.textOnLightDim}">${c.sub}</text>
        <text x="78" y="72" font-family="Inter, Arial, sans-serif"
              font-size="12"
              fill="${c.primary ? '#FFE0BC' : C.textOnLightDim}">${c.mask}</text>
        <g transform="translate(${W - 96} 24)">
          <rect width="60" height="34" rx="17"
                fill="${c.primary ? '#fff' : C.success}"/>
          <text x="30" y="22" text-anchor="middle"
                font-family="Inter, Arial, sans-serif" font-size="12"
                font-weight="800"
                fill="${c.primary ? C.primaryEnd : '#fff'}">CALL</text>
        </g>
      </g>`).join('')}

    <!-- Footer info -->
    <g transform="translate(24 ${H - 108})">
      <rect width="${W - 48}" height="84" rx="18" fill="#FFF7ED"
            stroke="#FED7AA"/>
      ${iconShield(20, 22, 32, '#C2410C')}
      <text x="72" y="34" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="700" fill="#7C2D12">
        This alert was triggered by scanning
      </text>
      <text x="72" y="52" font-family="Inter, Arial, sans-serif"
            font-size="12" font-weight="700" fill="#7C2D12">
        a QR 4 Emergency vehicle sticker.
      </text>
      <text x="72" y="72" font-family="Inter, Arial, sans-serif"
            font-size="11" fill="#9A3412">
        All calls are masked — numbers stay private.
      </text>
    </g>
  </svg>`;
}

// ── Registry ────────────────────────────────────────────────────────────
const SCREENS = [
  { name: '01-login', build: screenLogin },
  { name: '02-home', build: screenHome },
  { name: '03-create-qr', build: screenCreateQr },
  { name: '04-qr-success', build: screenQrSuccess },
  { name: '05-profile', build: screenProfile },
  { name: '06-alert-page', build: screenAlertPage },
];

const SIZES = [
  { label: '7inch', width: 1200, height: 1920 },
  { label: '10inch', width: 1600, height: 2560 },
];

// ── Render ──────────────────────────────────────────────────────────────
for (const size of SIZES) {
  const outDir = path.join(OUT_ROOT, size.label);
  fs.mkdirSync(outDir, { recursive: true });
  for (const screen of SCREENS) {
    const svg = screen.build();
    const rasterised = new Resvg(svg, {
      fitTo: { mode: 'width', value: size.width },
      background: '#FFFFFF',
      font: { loadSystemFonts: true, defaultFontFamily: 'Arial' },
    }).render().asPng();
    const outFile = path.join(outDir, `${screen.name}.png`);
    fs.writeFileSync(outFile, rasterised);
    console.log(
      `${size.label}/${screen.name}.png  (${rasterised.length.toLocaleString()} bytes)`
    );
  }
}

console.log(`\nAll done. Output: ${OUT_ROOT}`);
