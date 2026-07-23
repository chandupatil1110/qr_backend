// Print-ready sticker renderer — matches the target design 1:1
// (red header, black corner brackets around the QR, symmetric BE NAYAK +
// medical cross + extension pill + medical cross + BE NAYAK row, red
// footer with two icon rows). Rendered by generating an SVG and
// rasterising via @resvg/resvg-js. All icons are drawn as inline SVG
// primitives so no Material icon font needs to ship server-side.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';
import wawoff from 'wawoff2';
import opentype from 'opentype.js';

const RED = '#E51E25';
const INK = '#0F1115';
const WHITE = '#FFFFFF';

// ── Fonts ────────────────────────────────────────────────────────────
//
// resvg-js's prebuilt binary on Railway's build image was silently
// dropping every <text> node — probe PNGs came back as ~100-byte white
// blanks. We tried both WOFF and WOFF2 buffers and both failed. Whatever
// version of usvg the deployed resvg-js links against can't resolve
// text on that host.
//
// Rather than fight resvg's font engine, we PRE-RENDER every text node
// into an SVG <path> before handing the SVG to resvg. opentype.js reads
// the TTF (produced from WOFF2 via wawoff2's pure-WASM Brotli decoder),
// converts a string into glyph outlines, and emits <path d="..."/>.
// resvg then only has to render geometry, which it does perfectly on
// every platform. Zero runtime font lookups, no libc/musl edge cases,
// no reliance on defaultFontFamily fallbacks.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeModules = path.resolve(__dirname, '../../node_modules');

function loadFontBuffer(rel) {
  const abs = path.join(nodeModules, rel);
  if (!fs.existsSync(abs)) throw new Error(`font not found at ${abs}`);
  return fs.readFileSync(abs);
}

async function loadTtfFromWoff2(baseRel) {
  const woff2 = loadFontBuffer(`${baseRel}.woff2`);
  // wawoff.decompress returns a Uint8Array that is a VIEW into WASM
  // memory — a 16 MB shared pool that wawoff2 reuses across calls.
  // Later decompressions overwrite earlier views (silently: the length
  // field stays right, but the bytes get scrambled). Copy the region
  // into a fresh ArrayBuffer immediately so nothing else can touch it.
  const view = await wawoff.decompress(woff2);
  const owned = new Uint8Array(view.byteLength);
  owned.set(view);
  return owned;
}

// opentype.parse takes an ArrayBuffer of the exact font bytes. Our
// Uint8Arrays always own their whole ArrayBuffer here (see above), so
// we can hand the buffer over directly.
function parseOpentype(u8) {
  return opentype.parse(u8.buffer);
}

let FONT_HEADING = null; // Poppins 900 — headings, brackets, footer badges
let FONT_BODY = null;    // Poppins 600 — labels, website/email
let FONT_MONO = null;    // JetBrains Mono 700 — vehicle plate + digits
try {
  // Top-level await — Node 18 (Railway) supports this in ESM. It blocks
  // downstream importers (server.js → app.js → routes → services) so
  // the HTTP server never starts listening before fonts parse.
  //
  // Sequential (not Promise.all) because wawoff2's WASM instance holds
  // a single shared memory buffer; concurrent decompresses corrupt each
  // other's output even though the promises settle without error.
  const ttf900 = await loadTtfFromWoff2('@fontsource/poppins/files/poppins-latin-900-normal');
  const ttf600 = await loadTtfFromWoff2('@fontsource/poppins/files/poppins-latin-600-normal');
  const ttfMono = await loadTtfFromWoff2('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal');
  FONT_HEADING = parseOpentype(ttf900);
  FONT_BODY = parseOpentype(ttf600);
  FONT_MONO = parseOpentype(ttfMono);
  console.log(
    `[sticker] fonts decompressed + parsed: Poppins 900 (${ttf900.length}B), ` +
      `Poppins 600 (${ttf600.length}B), JetBrains Mono 700 (${ttfMono.length}B)`
  );
} catch (e) {
  console.error(
    '[sticker] FONT LOAD FAILED — stickers will render without text. ' +
      'Run `npm install` in backend/ so @fontsource/*, wawoff2, opentype.js ' +
      `land in node_modules. (${e.message})`
  );
}

// ── Text → SVG <path> ─────────────────────────────────────────────────
//
// opentype.js's font.getPath(text, x, y, size) draws text at the given
// left-baseline anchor without kerning-adjusted letter tracking, so we
// walk glyph-by-glyph to support letter-spacing (needed for the tracked
// "SCAN TO CALL OWNER" subhead and the mono digits inside the pill).
//
// - anchor: 'start' | 'middle' | 'end' — matches SVG text-anchor
// - letterSpacing: extra pixels between glyphs (SVG spec's default is 0)
// - y is the BASELINE, exactly as in <text y="…">
function textPath(text, x, y, {
  font, size, fill = INK, anchor = 'start', letterSpacing = 0,
}) {
  if (!font) return ''; // Fonts failed to load — degrade silently.
  const str = String(text ?? '');
  if (!str) return '';

  const scale = size / font.unitsPerEm;

  // Total advance width across every glyph (opentype exposes advance
  // in font units; multiply by scale for px). Kerning between adjacent
  // pairs is added to the running total so anchored placement is
  // pixel-accurate.
  const glyphs = font.stringToGlyphs(str);
  let advance = 0;
  for (let i = 0; i < glyphs.length; i++) {
    advance += glyphs[i].advanceWidth * scale;
    if (i < glyphs.length - 1) {
      const kern = font.getKerningValue
        ? font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale
        : 0;
      advance += kern + letterSpacing;
    }
  }

  let cursor = x;
  if (anchor === 'middle') cursor = x - advance / 2;
  else if (anchor === 'end') cursor = x - advance;

  let d = '';
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const p = g.getPath(cursor, y, size);
    d += p.toPathData(2) + ' ';
    cursor += g.advanceWidth * scale;
    if (i < glyphs.length - 1) {
      const kern = font.getKerningValue
        ? font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale
        : 0;
      cursor += kern + letterSpacing;
    }
  }
  return `<path d="${d.trim()}" fill="${fill}"/>`;
}

// Base coordinate space. Width is sized so "QR 4 EMERGENCY" at Poppins
// Black 40pt fits with ~15px of horizontal breathing room. resvg
// rasterises at 3× (width * 3 on the outer svg) for print-crisp PNGs.
const W = 460;

/**
 * Build the SVG for one sticker.
 *
 * @param {object} opts
 * @param {string} opts.qrPngB64 — base64 of the QR PNG (no data: prefix)
 * @param {string} opts.digits — extension number shown in the pill
 * @param {boolean} [opts.showVehicle] — auto-QR case, prints vehicle number
 * @param {string} [opts.vehicleNumber] — used only when showVehicle
 * @returns {string} SVG document
 */
function buildStickerSvg({ qrPngB64, digits, showVehicle, vehicleNumber }) {
  // Vertical layout — anchors declared top-down so the file reads in
  // the same order as the sticker.
  const HEADER_H = 108; // matches mobile Flutter Container height
  const VEHICLE_ROW_H = showVehicle ? 40 : 8; // small gap even when hidden
  const QR_FRAME_TOP = HEADER_H + VEHICLE_ROW_H;
  const QR_FRAME_W = 320;
  const QR_FRAME_H = 320;
  const QR_FRAME_X = (W - QR_FRAME_W) / 2;
  const QR_SIZE = 280;
  const QR_X = (W - QR_SIZE) / 2;
  const QR_Y = QR_FRAME_TOP + (QR_FRAME_H - QR_SIZE) / 2;

  const AFTER_QR_Y = QR_FRAME_TOP + QR_FRAME_H;
  const EXT_LABEL_Y = AFTER_QR_Y + 38; // +6 breathing room over previous
  const ROW_Y = EXT_LABEL_Y + 20;
  const ROW_H = 46;

  const FOOTER_TOP = ROW_Y + ROW_H + 24;
  const FOOTER_H = 88;
  const H = FOOTER_TOP + FOOTER_H;

  // Bracket arm length — bold Ls at every corner of the QR frame.
  // Thicker (8) balances better against the QR modules than 6.
  const ARM = 42;
  const BRACKET_W = 8;

  // Medical cross — two overlapping bars with a subtle darker underlay
  // for depth (matches the pill's lifted-off-the-surface feel) and a
  // faint highlight strip on top so it reads as raised enamel.
  const cross = (cx, cy, size) => {
    const bar = size * 0.32;
    return `
      <g filter="url(#lift)">
        <rect x="${cx - bar / 2}" y="${cy - size / 2}" width="${bar}" height="${size}" fill="${RED}"/>
        <rect x="${cx - size / 2}" y="${cy - bar / 2}" width="${size}" height="${bar}" fill="${RED}"/>
      </g>
      <!-- top highlight strip on each arm -->
      <rect x="${cx - bar / 2 + 0.6}" y="${cy - size / 2 + 0.6}" width="${bar - 1.2}" height="${size * 0.18}" fill="#FFFFFF" opacity="0.20"/>
      <rect x="${cx - size / 2 + 0.6}" y="${cy - bar / 2 + 0.6}" width="${size - 1.2}" height="${bar * 0.35}" fill="#FFFFFF" opacity="0.16"/>
    `;
  };

  // Extension pill — sized to give 5-digit extension numbers room to
  // breathe. Was 140×42; 150×44 gives ~5px more horizontal padding.
  const PILL_W = 150;
  const PILL_H = 44;
  const PILL_X = (W - PILL_W) / 2;
  const PILL_Y = ROW_Y + (ROW_H - PILL_H) / 2;

  // Bottom row horizontal layout: BE NAYAK ... cross ... pill ... cross ... BE NAYAK
  // Spacing budget (per side):
  //   left edge (14) → BE NAYAK label (~80wide at 16pt) → 12px gap →
  //   cross (28) → 8px gap → pill → 8px gap → cross → 12px gap → BE NAYAK
  // Adds up cleanly at W=460.
  const CROSS_SIZE = 28;
  const leftCrossCx = PILL_X - 20;
  const rightCrossCx = PILL_X + PILL_W + 20;
  const leftLabelX = 14;
  const rightLabelX = W - 14;
  const rowCy = ROW_Y + ROW_H / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 3}" height="${H * 3}">
  <defs>
    <clipPath id="card">
      <rect x="0" y="0" width="${W}" height="${H}" rx="22" ry="22"/>
    </clipPath>

    <!-- Gradients — subtle top-to-bottom variation gives the red bands
         a curved-plastic-badge feel instead of looking like a flat fill.
         The header runs light→red→deep, the footer stays a touch darker
         so the eye reads header as elevated, footer as base. -->
    <linearGradient id="headerGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#F26066"/>
      <stop offset="45%"  stop-color="#E51E25"/>
      <stop offset="100%" stop-color="#B71218"/>
    </linearGradient>
    <linearGradient id="footerGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#E51E25"/>
      <stop offset="100%" stop-color="#A61016"/>
    </linearGradient>
    <linearGradient id="pillGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#F04347"/>
      <stop offset="55%"  stop-color="#E51E25"/>
      <stop offset="100%" stop-color="#C11821"/>
    </linearGradient>

    <!-- Soft drop shadow used on lifted elements (crosses, brackets,
         pill). Kept subtle — anything stronger fights the sticker's
         printed-vinyl feel. -->
    <filter id="lift" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.4"/>
      <feOffset dx="0" dy="1.2" result="blur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <g clip-path="url(#card)">
    <!-- White base -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="${WHITE}"/>

    <!-- ── Red header band ─────────────────────────────────── -->
    <rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="url(#headerGrad)"/>
    <!-- Thin glossy highlight just below the top edge — sells the
         curved-plastic look without needing a full inner-shadow filter. -->
    <rect x="0" y="0" width="${W}" height="3" fill="#FFFFFF" opacity="0.22"/>
    ${textPath('QR 4 EMERGENCY', W / 2, 64, {
      font: FONT_HEADING, size: 40, fill: WHITE, anchor: 'middle', letterSpacing: -0.5,
    })}
    ${textPath('SCAN TO CALL OWNER', W / 2, 91, {
      font: FONT_BODY, size: 15, fill: WHITE, anchor: 'middle', letterSpacing: 2.4,
    })}

    <!-- ── Vehicle number (auto-QR only) — uses mono so plate reads
         cleanly and every character has the same width. ──────────── -->
    ${
      showVehicle
        ? textPath((vehicleNumber || '').toUpperCase(), W / 2, HEADER_H + 32, {
            font: FONT_MONO, size: 26, fill: RED, anchor: 'middle', letterSpacing: 1.5,
          })
        : ''
    }

    <!-- ── QR image ─────────────────────────────────────────── -->
    <image href="data:image/png;base64,${qrPngB64}"
           x="${QR_X}" y="${QR_Y}"
           width="${QR_SIZE}" height="${QR_SIZE}"
           preserveAspectRatio="none"/>

    <!-- ── Bold black corner brackets around the QR ─────────── -->
    <g fill="${INK}" filter="url(#lift)">
      <!-- top-left: horizontal + vertical arm -->
      <rect x="${QR_FRAME_X}" y="${QR_FRAME_TOP}" width="${ARM}" height="${BRACKET_W}"/>
      <rect x="${QR_FRAME_X}" y="${QR_FRAME_TOP}" width="${BRACKET_W}" height="${ARM}"/>
      <!-- top-right -->
      <rect x="${QR_FRAME_X + QR_FRAME_W - ARM}" y="${QR_FRAME_TOP}" width="${ARM}" height="${BRACKET_W}"/>
      <rect x="${QR_FRAME_X + QR_FRAME_W - BRACKET_W}" y="${QR_FRAME_TOP}" width="${BRACKET_W}" height="${ARM}"/>
      <!-- bottom-left -->
      <rect x="${QR_FRAME_X}" y="${QR_FRAME_TOP + QR_FRAME_H - BRACKET_W}" width="${ARM}" height="${BRACKET_W}"/>
      <rect x="${QR_FRAME_X}" y="${QR_FRAME_TOP + QR_FRAME_H - ARM}" width="${BRACKET_W}" height="${ARM}"/>
      <!-- bottom-right -->
      <rect x="${QR_FRAME_X + QR_FRAME_W - ARM}" y="${QR_FRAME_TOP + QR_FRAME_H - BRACKET_W}" width="${ARM}" height="${BRACKET_W}"/>
      <rect x="${QR_FRAME_X + QR_FRAME_W - BRACKET_W}" y="${QR_FRAME_TOP + QR_FRAME_H - ARM}" width="${BRACKET_W}" height="${ARM}"/>
    </g>

    <!-- ── "Extension Number" label ────────────────────────── -->
    ${textPath('Extension Number', W / 2, EXT_LABEL_Y, {
      font: FONT_BODY, size: 17, fill: INK, anchor: 'middle', letterSpacing: 0.3,
    })}

    <!-- ── Bottom row: BE NAYAK · cross · pill · cross · BE NAYAK ── -->
    ${textPath('BE NAYAK', leftLabelX, rowCy + 5, {
      font: FONT_HEADING, size: 16, fill: INK, anchor: 'start', letterSpacing: 0.5,
    })}
    ${cross(leftCrossCx, rowCy, CROSS_SIZE)}

    <!-- Red pill with black digits — gradient + drop shadow so it
         lifts off the white background like an inlaid enamel plate. -->
    <g filter="url(#lift)">
      <rect x="${PILL_X}" y="${PILL_Y}" width="${PILL_W}" height="${PILL_H}"
            rx="8" ry="8" fill="url(#pillGrad)"
            stroke="#8E0F16" stroke-width="0.8"/>
      <!-- Top gloss strip -->
      <rect x="${PILL_X + 2}" y="${PILL_Y + 2}" width="${PILL_W - 4}" height="${PILL_H * 0.42}"
            rx="6" ry="6" fill="#FFFFFF" opacity="0.14"/>
    </g>
    ${textPath(digits || '—', W / 2, PILL_Y + 32, {
      font: FONT_MONO, size: 26, fill: INK, anchor: 'middle', letterSpacing: 1.5,
    })}

    ${cross(rightCrossCx, rowCy, CROSS_SIZE)}
    ${textPath('BE NAYAK', rightLabelX, rowCy + 5, {
      font: FONT_HEADING, size: 16, fill: INK, anchor: 'end', letterSpacing: 0.5,
    })}

    <!-- ── Red footer with two icon rows ───────────────────── -->
    <rect x="0" y="${FOOTER_TOP}" width="${W}" height="${FOOTER_H}" fill="url(#footerGrad)"/>
    <!-- Subtle top-edge shadow so the footer sits below the white body
         instead of feeling glued to it. -->
    <rect x="0" y="${FOOTER_TOP}" width="${W}" height="1.5" fill="#000000" opacity="0.25"/>

    <!-- Row 1: globe + website | mail + email -->
    ${footerRow1(FOOTER_TOP + 20)}

    <!-- Row 2: warning + ACCIDENT | pin + TRACKING | P + NO PARKING,
         separated by thin white vertical dividers -->
    ${footerRow2(FOOTER_TOP + 60)}
  </g>
</svg>`;
}

// ── Footer helpers ────────────────────────────────────────────────

// Row 1 groups: globe icon + website on the left half, mail icon +
// email on the right half. Right-aligning the email against W-16 (with
// its icon just to the left) guarantees "support@qr4emergency.com" fits
// even at font-size 12 without running off the sticker edge.
function footerRow1(y) {
  const leftIconX = 14;
  const leftTextX = leftIconX + 20;
  const emailText = 'support@qr4emergency.com';
  // Email is right-anchored (text-anchor="end") so the closing ".com"
  // is guaranteed to sit against the right margin regardless of the
  // font's actual rendered width. The mail icon is positioned to the
  // left of an approximate 175px text extent so the icon-to-text gap
  // stays visually consistent; a small under-estimate here just means
  // the icon sits slightly closer to the text, never that text clips.
  const rightTextRight = W - 14;
  const estEmailWidth = 175;
  const rightIconX = rightTextRight - estEmailWidth - 20;
  return `
    ${iconGlobe(leftIconX, y - 10, 14, WHITE)}
    ${textPath('www.qr4emergency.com', leftTextX, y + 2, {
      font: FONT_BODY, size: 12, fill: WHITE, anchor: 'start',
    })}

    ${iconMail(rightIconX, y - 10, 14, WHITE)}
    ${textPath(emailText, rightTextRight, y + 2, {
      font: FONT_BODY, size: 12, fill: WHITE, anchor: 'end',
    })}
  `;
}

// Row 2: three feature badges with thin white dividers between them.
// Each [icon + gap + label] block is centred on the column's cx using
// an approximate label width — labels have very different widths
// ("NO PARKING" is ~30% wider than "TRACKING") so a single fixed
// offset like row 1's was pushing NO PARKING off the sticker edge.
function footerRow2(y) {
  const cols = [
    { cx: W * 0.18, icon: iconWarning, label: 'ACCIDENT',   textW: 76 },
    { cx: W * 0.50, icon: iconPin,     label: 'TRACKING',   textW: 74 },
    { cx: W * 0.82, icon: iconParking, label: 'NO PARKING', textW: 100 },
  ];
  const dividers = [W * 0.34, W * 0.66];
  const iconSize = 16;
  const gap = 6;

  let out = '';
  for (const c of cols) {
    const totalW = iconSize + gap + c.textW;
    const iconX = c.cx - totalW / 2;
    const textX = iconX + iconSize + gap;
    out += `
      ${c.icon(iconX, y - 12, iconSize, WHITE)}
      ${textPath(c.label, textX, y + 2, {
        font: FONT_HEADING, size: 13, fill: WHITE, anchor: 'start', letterSpacing: 0.4,
      })}
    `;
  }
  for (const dx of dividers) {
    out += `<line x1="${dx}" y1="${y - 14}" x2="${dx}" y2="${y + 8}"
                   stroke="${WHITE}" stroke-opacity="0.55" stroke-width="1"/>`;
  }
  return out;
}

// ── Inline icons (Material-style, drawn as SVG primitives) ────────
// All take (x, y, size, color) and render inside a size×size box.

function iconGlobe(x, y, s, c) {
  const r = s / 2;
  const cx = x + r;
  const cy = y + r;
  return `
    <g stroke="${c}" stroke-width="1.2" fill="none">
      <circle cx="${cx}" cy="${cy}" r="${r - 0.6}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${(r - 0.6) * 0.5}" ry="${r - 0.6}"/>
      <line x1="${x + 0.6}" y1="${cy}" x2="${x + s - 0.6}" y2="${cy}"/>
    </g>
  `;
}

function iconMail(x, y, s, c) {
  return `
    <g stroke="${c}" stroke-width="1.2" fill="none" stroke-linejoin="round">
      <rect x="${x + 0.6}" y="${y + s * 0.2}" width="${s - 1.2}" height="${s * 0.6}" rx="1"/>
      <path d="M${x + 0.6} ${y + s * 0.22} L${x + s / 2} ${y + s * 0.55} L${x + s - 0.6} ${y + s * 0.22}"/>
    </g>
  `;
}

function iconWarning(x, y, s, c) {
  // Filled red-orange triangle with a yellow interior "!".
  const midX = x + s / 2;
  const top = y + 1;
  const bot = y + s - 1;
  const left = x + 1;
  const right = x + s - 1;
  return `
    <g>
      <path d="M${midX} ${top} L${right} ${bot} L${left} ${bot} Z"
            fill="#F4B400" stroke="${c}" stroke-width="1"/>
      <rect x="${midX - 0.7}" y="${top + s * 0.28}" width="1.4" height="${s * 0.32}" fill="${c}"/>
      <rect x="${midX - 0.7}" y="${top + s * 0.68}" width="1.4" height="1.4" fill="${c}"/>
    </g>
  `;
}

function iconPin(x, y, s, c) {
  // Location pin: teardrop-ish shape.
  const cx = x + s / 2;
  const top = y + 1;
  const bot = y + s - 0.5;
  const r = s * 0.32;
  return `
    <g fill="${c}" stroke="${c}" stroke-width="0.8" stroke-linejoin="round">
      <path d="M${cx} ${top}
               C ${cx + r * 1.6} ${top} ${cx + r * 1.6} ${top + r * 2.1} ${cx} ${bot}
               C ${cx - r * 1.6} ${top + r * 2.1} ${cx - r * 1.6} ${top} ${cx} ${top} Z"/>
      <circle cx="${cx}" cy="${top + r * 0.9}" r="${r * 0.4}" fill="${RED}"/>
    </g>
  `;
}

function iconParking(x, y, s, c) {
  // Circle with the letter "P" inside — matches the "no parking" hint
  // in the reference without the diagonal slash (which would clash with
  // the actual value of the badge).
  const r = s / 2 - 0.6;
  const cx = x + s / 2;
  const cy = y + s / 2;
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="1.4"/>
      ${textPath('P', cx, cy + r * 0.7, {
        font: FONT_HEADING, size: s * 0.75, fill: c, anchor: 'middle',
      })}
    </g>
  `;
}

// XML escape for text nodes.
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Rasterise one printable sticker to a PNG buffer.
 *
 * @param {object} opts
 * @param {string} opts.alertUrl — URL encoded into the QR
 * @param {string|number} opts.digits — extension number shown in the pill
 * @param {boolean} [opts.isManual=true] — hides vehicle number when true
 * @param {string} [opts.vehicleNumber] — auto-QR case only
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function renderStickerPng({
  alertUrl,
  digits,
  isManual = true,
  vehicleNumber = '',
}) {
  // Error correction Q → ~25% redundancy, so a scratched sticker still
  // scans. QR has no logo overlay here, so we could get away with M,
  // but the sticker gets stuck on windshields — dust and abrasion
  // justify the extra safety.
  const qrBuffer = await QRCode.toBuffer(alertUrl, {
    type: 'png',
    width: 560,
    margin: 0,
    errorCorrectionLevel: 'Q',
    color: { dark: INK, light: WHITE },
  });

  const showVehicle =
    !isManual && vehicleNumber && vehicleNumber.trim().length > 0;

  const svg = buildStickerSvg({
    qrPngB64: qrBuffer.toString('base64'),
    digits: String(digits ?? ''),
    showVehicle,
    vehicleNumber,
  });

  // resvg only sees geometry now — every text node was already
  // converted to <path> via opentype.js in buildStickerSvg(). No font
  // config needed; resvg's font engine isn't involved. This is what
  // makes the sticker render identically on Windows, glibc, and musl.
  const resvg = new Resvg(svg, { background: WHITE });
  return resvg.render().asPng();
}

// Boot-time self-test — pre-renders the letter "A" via opentype.js
// (same path text takes on real stickers) and rasterises it. Confirms
// both the font parsed AND resvg can paint the resulting geometry.
// Logs LOUDLY so Railway logs immediately show whether stickers will
// have text or not.
try {
  const probePath = textPath('A', 0, 16, {
    font: FONT_HEADING, size: 16, fill: '#000000', anchor: 'start',
  });
  const probeSvg = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20" width="40" height="20">
  <rect width="40" height="20" fill="#ffffff"/>
  ${probePath}
</svg>`;
  const probe = new Resvg(probeSvg, { background: WHITE }).render().asPng();
  // A blank 40×20 white PNG is ~150 bytes; an 'A' glyph pushes it well
  // past 300. Not a bulletproof check but catches "no font loaded at
  // all" without needing pixel-level inspection.
  const hasText = probe.length > 300;
  if (hasText) {
    console.log(`[sticker] font self-test PASSED — probe png=${probe.length}B (opentype path rendered)`);
  } else {
    console.error(
      `[sticker] FONT SELF-TEST FAILED — probe png=${probe.length}B ` +
        `is suspiciously small, text likely won't render on stickers. ` +
        `Check @fontsource/* is installed and this resvg-js binary ` +
        `supports the font format we're passing.`
    );
  }
} catch (probeErr) {
  console.error('[sticker] font self-test threw:', probeErr.message);
}
