/**
 * Generate Chrome Web Store promo graphics (store icon 128x128, small tile
 * 440x280, marquee 1400x560) from SVG, rasterized with macOS `sips`.
 *
 * Edit the CONFIG block, then run:  node scripts/make-promo-tiles.mjs
 * Output: ./store-assets/{store-icon,small-tile,marquee}.{svg,png}
 *
 * Pure Node + sips — no npm install. ALWAYS open the PNGs to visually verify
 * (sips can drop a glyph if a font is missing; Helvetica is always safe).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------ CONFIG ------------------------------ */
const CONFIG = {
  name: 'Readable Capture PDF',
  headlineTop: 'Turn any page into a',
  headlineBottom: 'searchable PDF', // last word is accented
  subhead: ['Real, selectable text on every page —', 'AI-ready, not just screenshots.'],
  pills: ['Free — up to 30 pages', 'Full license $10'],
  smallHeadline: ['Capture →', 'searchable PDF'],
  colors: {
    g1: '#4338ca', // gradient start (indigo)
    g2: '#7c3aed', // gradient end (violet)
    accent: '#67e8f9', // cyan accent
    subtext: '#c7d2fe',
  },
  outDir: 'store-assets',
};
/* -------------------------------------------------------------------- */

const C = CONFIG.colors;
mkdirSync(CONFIG.outDir, { recursive: true });

const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.g1}"/><stop offset="1" stop-color="${C.g2}"/>
  </linearGradient>
  <linearGradient id="logo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/>
  </linearGradient>
  <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#1e1b4b" flood-opacity="0.45"/>
  </filter>`;

// A reusable "selection capturing text lines" logo mark, scalable.
const logoMark = (x, y, s, stroke = 2.5) => `
  <g transform="translate(${x},${y}) scale(${s})">
    <rect width="46" height="46" rx="11" fill="url(#logo)"/>
    <rect x="9" y="9" width="28" height="28" rx="4" fill="none" stroke="#fff" stroke-width="${stroke}" stroke-dasharray="5 3"/>
    <rect x="14" y="16" width="18" height="2.6" rx="1.3" fill="#fff"/>
    <rect x="14" y="22" width="18" height="2.6" rx="1.3" fill="#fff"/>
    <rect x="14" y="28" width="11" height="2.6" rx="1.3" fill="#fff"/>
  </g>`;

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgDoc(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica, Arial, sans-serif"><defs>${defs}</defs>${body}</svg>`;
}

const storeIcon = svgDoc(
  128,
  128,
  `<rect width="128" height="128" rx="28" fill="url(#bg)"/>
   <g fill="#fff" opacity="0.9">
     <rect x="30" y="34" width="50" height="6" rx="3"/><rect x="30" y="48" width="68" height="6" rx="3"/>
     <rect x="30" y="62" width="62" height="6" rx="3"/><rect x="30" y="76" width="68" height="6" rx="3"/>
     <rect x="30" y="90" width="44" height="6" rx="3"/>
   </g>
   <rect x="22" y="42" width="84" height="60" rx="8" fill="#fff" opacity="0.10"/>
   <rect x="22" y="42" width="84" height="60" rx="8" fill="none" stroke="${C.accent}" stroke-width="5" stroke-dasharray="11 7"/>
   <g fill="#fff"><rect x="15" y="35" width="14" height="14" rx="3"/><rect x="99" y="35" width="14" height="14" rx="3"/><rect x="15" y="95" width="14" height="14" rx="3"/><rect x="99" y="95" width="14" height="14" rx="3"/></g>`,
);

const smallTile = svgDoc(
  440,
  280,
  `<rect width="440" height="280" fill="url(#bg)"/>
   <circle cx="400" cy="40" r="120" fill="#fff" opacity="0.06"/>
   ${logoMark(28, 26, 0.82, 2.2)}
   <text x="86" y="51" font-size="17" font-weight="bold" fill="#fff">${esc(CONFIG.name)}</text>
   <text x="28" y="128" font-size="36" font-weight="bold" fill="#fff">${esc(CONFIG.smallHeadline[0])}</text>
   <text x="28" y="170" font-size="36" font-weight="bold" fill="#fff">${esc(CONFIG.smallHeadline[1])}</text>
   <text x="28" y="208" font-size="16.5" fill="${C.subtext}">${esc(CONFIG.subhead[0])}</text>
   <text x="28" y="230" font-size="16.5" fill="${C.subtext}">${esc(CONFIG.subhead[1])}</text>
   <rect x="28" y="244" width="160" height="26" rx="13" fill="#fff" opacity="0.16"/>
   <text x="44" y="261" font-size="13" font-weight="bold" fill="#fff">${esc(CONFIG.pills[0])}</text>`,
);

const marquee = svgDoc(
  1400,
  560,
  `<rect width="1400" height="560" fill="url(#bg)"/>
   <circle cx="1230" cy="120" r="240" fill="#fff" opacity="0.06"/>
   <circle cx="120" cy="540" r="220" fill="#fff" opacity="0.05"/>
   ${logoMark(70, 60, 1)}
   <text x="132" y="91" font-size="23" font-weight="bold" fill="#fff">${esc(CONFIG.name)}</text>
   <text x="70" y="220" font-size="62" font-weight="bold" fill="#fff">${esc(CONFIG.headlineTop)}</text>
   <text x="70" y="292" font-size="62" font-weight="bold" fill="#fff">${esc(CONFIG.headlineBottom)}</text>
   <text x="72" y="350" font-size="25" fill="${C.subtext}">${esc(CONFIG.subhead[0])}</text>
   <text x="72" y="384" font-size="25" fill="${C.subtext}">${esc(CONFIG.subhead[1])}</text>
   <g transform="translate(72,430)">
     <rect width="232" height="48" rx="24" fill="#fff" opacity="0.14"/>
     <text x="26" y="31" font-size="20" font-weight="bold" fill="#fff">${esc(CONFIG.pills[0])}</text>
     <rect x="252" width="186" height="48" rx="24" fill="${C.accent}"/>
     <text x="278" y="31" font-size="20" font-weight="bold" fill="#1e1b4b">${esc(CONFIG.pills[1])}</text>
   </g>
   <g transform="translate(820,150)" filter="url(#sh)">
     <rect width="470" height="300" rx="18" fill="#fff"/>
     <rect width="470" height="42" rx="18" fill="#eef2ff"/><rect y="26" width="470" height="16" fill="#eef2ff"/>
     <circle cx="24" cy="21" r="6" fill="#f87171"/><circle cx="46" cy="21" r="6" fill="#fbbf24"/><circle cx="68" cy="21" r="6" fill="#34d399"/>
     <rect x="26" y="120" width="418" height="150" rx="6" fill="#22d3ee" opacity="0.12"/>
     <rect x="26" y="120" width="418" height="150" rx="6" fill="none" stroke="#06b6d4" stroke-width="3" stroke-dasharray="8 5"/>
     <g fill="#94a3b8"><rect x="46" y="140" width="230" height="10" rx="5"/><rect x="46" y="164" width="380" height="9" rx="4.5"/><rect x="46" y="184" width="360" height="9" rx="4.5"/><rect x="46" y="204" width="384" height="9" rx="4.5"/><rect x="46" y="224" width="300" height="9" rx="4.5"/></g>
   </g>`,
);

for (const [name, svg] of [
  ['store-icon', storeIcon],
  ['small-tile', smallTile],
  ['marquee', marquee],
]) {
  const svgPath = join(CONFIG.outDir, `${name}.svg`);
  const pngPath = join(CONFIG.outDir, `${name}.png`);
  writeFileSync(svgPath, svg);
  execSync(`sips -s format png ${JSON.stringify(svgPath)} --out ${JSON.stringify(pngPath)}`, {
    stdio: 'ignore',
  });
  const dims = execSync(`sips -g pixelWidth -g pixelHeight ${JSON.stringify(pngPath)}`).toString();
  const w = dims.match(/pixelWidth:\s*(\d+)/)?.[1];
  const h = dims.match(/pixelHeight:\s*(\d+)/)?.[1];
  console.log(`  ✅ ${pngPath}  ${w}x${h}`);
}
console.log('\nDone. Open each PNG to verify text rendered correctly.');
