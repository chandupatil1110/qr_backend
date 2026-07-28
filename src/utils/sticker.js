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

// Insert dashes between the segments of an Indian vehicle number to
// match the sticker artwork (MH12AE0786 → MH12-AE-0786, 22BH1234AA →
// 22-BH-1234-AA). Falls through unchanged for strings that don't match
// either format so free-form/legacy values still render.
function formatVehicleNumber(raw) {
  const s = String(raw || '').replace(/[\s-]+/g, '').toUpperCase();
  const std = s.match(/^([A-Z]{2})([0-9]{2})([A-Z]{1,2})([0-9]{4})$/);
  if (std) return `${std[1]}${std[2]}-${std[3]}-${std[4]}`;
  const bh = s.match(/^([0-9]{2})(BH)([0-9]{4})([A-Z]{1,2})$/);
  if (bh) return `${bh[1]}-${bh[2]}-${bh[3]}-${bh[4]}`;
  return s;
}

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

// Fonts are exported so marketing renderers (e.g. scripts/generate-phone-mockup.js)
// can reuse the exact same typography without independently decompressing
// WOFF2 → TTF and parsing again.
export let FONT_HEADING = null; // Poppins 900 — headings, brackets, footer badges
export let FONT_BODY = null;    // Poppins 600 — labels, website/email
export let FONT_MONO = null;    // JetBrains Mono 700 — vehicle plate + digits
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

// Measure the rendered width of a string in the given font at the given
// size, matching the exact glyph walk + kerning + letter-spacing that
// textPath() uses. Callers use this to place icons and neighbouring text
// with sub-pixel accuracy instead of relying on hardcoded estimates
// (which drift whenever fonts, sizes, or copy change).
export function measureTextWidth(text, { font, size, letterSpacing = 0 }) {
  if (!font || !text) return 0;
  const str = String(text);
  const scale = size / font.unitsPerEm;
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
  return advance;
}

// Serialise an opentype.js Path.commands array into an SVG `d`
// attribute value. Round every coordinate to `precision` decimals.
// This is a drop-in replacement for opentype's `.toPathData()` which
// occasionally emits "NaN" for coordinates that are effectively
// integers with tiny FP drift (e.g. 386.0000000000003) — see the
// long comment in textPath() for the details.
function commandsToPathData(commands, precision) {
  const r = (n) => n.toFixed(precision);
  let d = '';
  for (const c of commands) {
    switch (c.type) {
      case 'M': d += `M${r(c.x)} ${r(c.y)}`; break;
      case 'L': d += `L${r(c.x)} ${r(c.y)}`; break;
      case 'Q': d += `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`; break;
      case 'C': d += `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`; break;
      case 'Z': d += 'Z'; break;
    }
    d += ' ';
  }
  return d.trim();
}

// ── Text → SVG <path> ─────────────────────────────────────────────────
//
// opentype.js's font.getPath(text, x, y, size) draws text at the given
// left-baseline anchor without kerning-adjusted letter tracking, so we
// walk glyph-by-glyph to support letter-spacing (needed for the tracked
// "SCAN TO CALL OWNER" subhead and the mono digits inside the pill).
//
// Exported so marketing renderers can compose their own SVGs with the
// exact same typography — see scripts/generate-phone-mockup.js.
//
// - anchor: 'start' | 'middle' | 'end' — matches SVG text-anchor
// - letterSpacing: extra pixels between glyphs (SVG spec's default is 0)
// - y is the BASELINE, exactly as in <text y="…">
export function textPath(text, x, y, {
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

  // Emit ONE <path> per glyph rather than concatenating every glyph's
  // path commands into a single huge `d` attribute. resvg-js silently
  // truncates path data past a length threshold (~10K chars) — long
  // strings like "support@qr4emergency.com" produced ~13K-char paths
  // that rendered only their first ~16 glyphs, so the ".com" tail
  // disappeared. Individual glyph paths stay under 1K chars each and
  // render identically to one big path.
  //
  // We serialise the path COMMANDS ourselves rather than calling
  // opentype's `.toPathData(precision)` because that method has an
  // edge-case bug: when a glyph's transformed coordinate lands on
  // something like 386.0000000000003 (FP drift from accumulated cursor
  // scaling), it can emit "NaN" into the string even though the
  // commands array holds the correct number. That happened
  // reproducibly on the third 'e' in "emergency" — resvg then dropped
  // that glyph, leaving a visible gap. Our serializer just does
  // `n.toFixed(2)` per number and never introduces NaN.
  let out = '';
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    const d = commandsToPathData(g.getPath(cursor, y, size).commands, 2);
    if (d) out += `<path d="${d}" fill="${fill}"/>`;
    cursor += g.advanceWidth * scale;
    if (i < glyphs.length - 1) {
      const kern = font.getKerningValue
        ? font.getKerningValue(glyphs[i], glyphs[i + 1]) * scale
        : 0;
      cursor += kern + letterSpacing;
    }
  }
  return out;
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
  // the same order as the sticker. Bumped to match the reference art:
  // taller header for a much bigger "QR 4 EMERGENCY" wordmark, taller
  // footer for larger badges + icons, outer red border ring.
  const HEADER_H = 138;
  const VEHICLE_ROW_H = showVehicle ? 44 : 8;
  const QR_FRAME_TOP = HEADER_H + VEHICLE_ROW_H;
  const QR_FRAME_W = 320;
  const QR_FRAME_H = 320;
  const QR_FRAME_X = (W - QR_FRAME_W) / 2;
  const QR_SIZE = 280;
  const QR_X = (W - QR_SIZE) / 2;
  const QR_Y = QR_FRAME_TOP + (QR_FRAME_H - QR_SIZE) / 2;

  const AFTER_QR_Y = QR_FRAME_TOP + QR_FRAME_H;
  const EXT_LABEL_Y = AFTER_QR_Y + 42;
  const ROW_Y = EXT_LABEL_Y + 22;
  const ROW_H = 46;

  const FOOTER_TOP = ROW_Y + ROW_H + 26;
  const FOOTER_H = 118;
  const H = FOOTER_TOP + FOOTER_H;

  // Bracket arm length — bold Ls at every corner of the QR frame.
  // Thicker (8) balances better against the QR modules than 6.
  const ARM = 42;
  const BRACKET_W = 8;

  // Outer border ring — thin red stroke around the entire sticker.
  // Reference art shows this as part of the printed edge trim; sticker
  // vinyls also benefit from a visible cut-line for guillotine trimming.
  const BORDER_W = 3;

  // Medical cross — flat solid red plus sign. Matches the reference
  // artwork exactly: no gradient, no drop shadow, no enamel highlight.
  // Two overlapping rects (vertical bar + horizontal bar), same red as
  // the header and footer bands so the cross reads as part of the
  // brand system rather than a lifted-off-the-surface badge.
  const cross = (cx, cy, size) => {
    const bar = size * 0.32;
    return `
      <rect x="${cx - bar / 2}" y="${cy - size / 2}" width="${bar}" height="${size}" fill="${RED}"/>
      <rect x="${cx - size / 2}" y="${cy - bar / 2}" width="${size}" height="${bar}" fill="${RED}"/>
    `;
  };

  // Extension pill — sized to give 5-digit extension numbers room to
  // breathe. Was 140×42; 150×44 gives ~5px more horizontal padding.
  const PILL_W = 150;
  const PILL_H = 44;
  const PILL_X = (W - PILL_W) / 2;
  const PILL_Y = ROW_Y + (ROW_H - PILL_H) / 2;

  // Bottom row horizontal layout: BE NAYAK ... cross ... pill ... cross ... BE NAYAK
  // Every gap is computed from real measured widths so the row stays
  // perfectly symmetric — no hardcoded label-width guesses that drift
  // when font or copy changes.
  const CROSS_SIZE = 28;
  const CROSS_TO_PILL_GAP = 12;
  const leftCrossCx = PILL_X - CROSS_TO_PILL_GAP - CROSS_SIZE / 2;
  const rightCrossCx = PILL_X + PILL_W + CROSS_TO_PILL_GAP + CROSS_SIZE / 2;
  const leftLabelX = 14;
  const rightLabelX = W - 14;
  const rowCy = ROW_Y + ROW_H / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 3}" height="${H * 3}">
  <defs>
    <clipPath id="card">
      <rect x="0" y="0" width="${W}" height="${H}" rx="32" ry="32"/>
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
    <!-- "QR 4 EMERGENCY" wordmark — sized to fill ~90% of the sticker
         width, matching the reference art. Poppins Black at size 50
         with tighter tracking so it reads as one solid wordmark and
         stays inside the sticker edges (W=460 minus edge pad). -->
    ${textPath('QR 4 EMERGENCY', W / 2, 78, {
      font: FONT_HEADING, size: 50, fill: WHITE, anchor: 'middle', letterSpacing: -1.5,
    })}
    ${textPath('SCAN TO CALL OWNER', W / 2, 116, {
      font: FONT_BODY, size: 20, fill: WHITE, anchor: 'middle', letterSpacing: 3.0,
    })}

    <!-- ── Vehicle number — always shown when supplied (post-activation
         manual QRs and auto-QRs both carry a vehicle). Mono so every
         character has the same width; dashed formatting matches the
         printed sticker artwork. ─────────────────────────────────── -->
    ${
      showVehicle
        ? textPath(formatVehicleNumber(vehicleNumber), W / 2, HEADER_H + 36, {
            font: FONT_MONO, size: 30, fill: RED, anchor: 'middle', letterSpacing: 1.5,
          })
        : ''
    }

    <!-- ── QR image ─────────────────────────────────────────── -->
    <image href="data:image/png;base64,${qrPngB64}"
           x="${QR_X}" y="${QR_Y}"
           width="${QR_SIZE}" height="${QR_SIZE}"
           preserveAspectRatio="none"/>

    <!-- ── Bold black corner brackets around the QR ─────────── -->
    <!-- Each bracket is drawn as a single stroked path with rounded
         line caps + join, so the outer bend curves and the arm tips
         are semicircular rather than sharp squares. Matches the
         reference art's soft-cornered scanner frame. -->
    ${(() => {
      const t = BRACKET_W / 2;
      const x0 = QR_FRAME_X;
      const y0 = QR_FRAME_TOP;
      const x1 = QR_FRAME_X + QR_FRAME_W;
      const y1 = QR_FRAME_TOP + QR_FRAME_H;
      return `
    <g stroke="${INK}" stroke-width="${BRACKET_W}" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <!-- top-left: horizontal arm tip → bend → vertical arm tip -->
      <path d="M ${x0 + ARM} ${y0 + t} L ${x0 + t} ${y0 + t} L ${x0 + t} ${y0 + ARM}"/>
      <!-- top-right -->
      <path d="M ${x1 - ARM} ${y0 + t} L ${x1 - t} ${y0 + t} L ${x1 - t} ${y0 + ARM}"/>
      <!-- bottom-left -->
      <path d="M ${x0 + ARM} ${y1 - t} L ${x0 + t} ${y1 - t} L ${x0 + t} ${y1 - ARM}"/>
      <!-- bottom-right -->
      <path d="M ${x1 - ARM} ${y1 - t} L ${x1 - t} ${y1 - t} L ${x1 - t} ${y1 - ARM}"/>
    </g>`;
    })()}

    <!-- ── "Extension Number" label ────────────────────────── -->
    ${textPath('Extension Number', W / 2, EXT_LABEL_Y, {
      font: FONT_BODY, size: 17, fill: INK, anchor: 'middle', letterSpacing: 0.3,
    })}

    <!-- ── Bottom row: BE NAYAK · cross · pill · cross · BE NAYAK ── -->
    ${textPath('BE NAYAK', leftLabelX, rowCy + 5, {
      font: FONT_HEADING, size: 16, fill: INK, anchor: 'start', letterSpacing: 0.5,
    })}
    ${cross(leftCrossCx, rowCy, CROSS_SIZE)}

    <!-- White pill with red digits and a thin dark outline — matches the
         printed sticker artwork exactly. Kept flat (no gradient / gloss)
         so the digits pop crisply against the plain white body. -->
    <rect x="${PILL_X}" y="${PILL_Y}" width="${PILL_W}" height="${PILL_H}"
          rx="8" ry="8" fill="${WHITE}"
          stroke="${INK}" stroke-width="1.4"/>
    ${textPath(digits || '—', W / 2, PILL_Y + 32, {
      font: FONT_MONO, size: 26, fill: RED, anchor: 'middle', letterSpacing: 1.5,
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
    ${footerRow1(FOOTER_TOP + 26)}

    <!-- Row 2: warning + ACCIDENT | pin + TRACKING | P + NO PARKING,
         separated by thin white vertical dividers -->
    ${footerRow2(FOOTER_TOP + 82)}
  </g>

  <!-- ── Outer black border ring ──────────────────────────────
       Thin black stroke around the whole sticker. Painted OUTSIDE the
       clipPath so the rounded-rectangle stroke isn't cropped by the
       clip. Matches the reference art's printed edge trim. -->
  <rect x="${BORDER_W / 2}" y="${BORDER_W / 2}"
        width="${W - BORDER_W}" height="${H - BORDER_W}"
        rx="${32 - BORDER_W / 2}" ry="${32 - BORDER_W / 2}"
        fill="none" stroke="${INK}" stroke-width="${BORDER_W}"/>
</svg>`;
}

// ── Footer helpers ────────────────────────────────────────────────

// Row 1: globe + website chip on the left, mail + email chip on the
// right. Uses real measured text widths so the icon-to-text gap is
// EXACTLY the same on both sides, regardless of font metrics or copy
// changes. Left-anchored on the left, right-anchored on the right —
// gives symmetric visual weight against the sticker edges.
function footerRow1(y) {
  const ICON_SIZE = 14;
  const ICON_TEXT_GAP = 8; // px gap between icon's right edge and text's left edge
  const EDGE_PAD = 14;     // px from sticker edge to first/last element
  const font = FONT_BODY;
  const size = 12;

  // Left side: globe icon at EDGE_PAD, text follows.
  const leftIconX = EDGE_PAD;
  const leftTextX = leftIconX + ICON_SIZE + ICON_TEXT_GAP;

  // Right side: measure the email text FIRST, then place the icon just
  // to its left with the exact same gap. This is what was drifting
  // before — a hardcoded 175px estimate for a string that renders at
  // ~155px meant the icon sat 20px too far left.
  const emailText = 'support@qr4emergency.com';
  const emailWidth = measureTextWidth(emailText, { font, size });
  const rightTextRight = W - EDGE_PAD;
  const rightTextLeft = rightTextRight - emailWidth;
  const rightIconX = rightTextLeft - ICON_TEXT_GAP - ICON_SIZE;

  return `
    ${iconGlobe(leftIconX, y - 10, ICON_SIZE, WHITE)}
    ${textPath('www.qr4emergency.com', leftTextX, y + 2, {
      font, size, fill: WHITE, anchor: 'start',
    })}

    ${iconMail(rightIconX, y - 10, ICON_SIZE, WHITE)}
    ${textPath(emailText, rightTextRight, y + 2, {
      font, size, fill: WHITE, anchor: 'end',
    })}
  `;
}

// Row 2: three feature badges with thin white dividers between them.
// Each [icon + gap + label] block is centred on its column using the
// REAL measured label width so ACCIDENT (short) and NO PARKING (long)
// each sit dead-centre in their third. Dividers land halfway between
// adjacent columns.
function footerRow2(y) {
  const ICON_SIZE = 22;
  const ICON_TEXT_GAP = 8;
  const FONT_SIZE = 18;
  const LETTER_SPACING = 0.4;
  const font = FONT_HEADING;
  const opts = { font, size: FONT_SIZE, letterSpacing: LETTER_SPACING };

  const cols = [
    { cx: W * 0.18, icon: iconWarning, label: 'ACCIDENT' },
    { cx: W * 0.50, icon: iconPin,     label: 'TRACKING' },
    { cx: W * 0.82, icon: iconParking, label: 'NO PARKING' },
  ];

  let out = '';
  // Compute each badge's real horizontal extent so we can drop dividers
  // in the ACTUAL gap between adjacent badges (not the fixed column
  // midpoints). Prevents the previous collision where NO PARKING's (P)
  // circle came within ~4px of the divider hairline.
  const boxes = cols.map((c) => {
    const textW = measureTextWidth(c.label, opts);
    const totalW = ICON_SIZE + ICON_TEXT_GAP + textW;
    const iconX = c.cx - totalW / 2;
    const textX = iconX + ICON_SIZE + ICON_TEXT_GAP;
    return { c, iconX, textX, totalW, leftEdge: iconX, rightEdge: iconX + totalW };
  });
  for (const b of boxes) {
    out += `
      ${b.c.icon(b.iconX, y - 15, ICON_SIZE, WHITE)}
      ${textPath(b.c.label, b.textX, y + 4, {
        font, size: FONT_SIZE, fill: WHITE, anchor: 'start', letterSpacing: LETTER_SPACING,
      })}
    `;
  }
  // Dividers land at the midpoint of the actual gap between adjacent
  // badge boxes → guaranteed equal breathing room on both sides.
  const divs = [
    (boxes[0].rightEdge + boxes[1].leftEdge) / 2,
    (boxes[1].rightEdge + boxes[2].leftEdge) / 2,
  ];
  for (const dx of divs) {
    out += `<line x1="${dx}" y1="${y - 18}" x2="${dx}" y2="${y + 12}"
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
 * @param {boolean} [opts.isManual=true] — kept for backwards compat only;
 *   layout no longer switches on it. Vehicle number is shown whenever
 *   supplied and skipped when empty (which is the mint-time state for
 *   pre-activation manual stickers).
 * @param {string} [opts.vehicleNumber] — Indian vehicle plate, any format
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function renderStickerPng({
  alertUrl,
  digits,
  isManual = true, // eslint-disable-line no-unused-vars
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

  const showVehicle = Boolean(vehicleNumber && vehicleNumber.trim().length > 0);

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
