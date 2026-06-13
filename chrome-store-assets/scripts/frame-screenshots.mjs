/**
 * Turn raw product screenshots into Chrome-Web-Store-spec 1280x800 PNGs:
 * a branded gradient background, the screenshot in a rounded frame with a
 * soft shadow, and a caption across the top.
 *
 * Usage:
 *   1. Drop your screenshots into  store-assets/raw/  named  1.png, 2.png, …
 *      (any image format sips can read; order = filename order).
 *   2. Optionally edit captions in  store-assets/captions.json
 *      (an array; the Nth caption applies to the Nth file).
 *   3. Run:  node scripts/frame-screenshots.mjs
 *   -> framed PNGs land in  store-assets/screenshots/
 *
 * No external dependencies — rasterizes via macOS `sips`.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'store-assets', 'raw');
const outDir = join(root, 'store-assets', 'screenshots');
const captionsPath = join(root, 'store-assets', 'captions.json');

const W = 1280;
const H = 800;

if (!existsSync(rawDir)) {
  mkdirSync(rawDir, { recursive: true });
  console.log(`Created ${rawDir}. Drop your screenshots in there (1.png, 2.png, …) and re-run.`);
  process.exit(0);
}
mkdirSync(outDir, { recursive: true });

const captions = existsSync(captionsPath)
  ? JSON.parse(readFileSync(captionsPath, 'utf8'))
  : [];

const files = readdirSync(rawDir)
  .filter((f) => /\.(png|jpe?g|webp|gif|tiff?)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (files.length === 0) {
  console.log(`No images found in ${rawDir}. Add 1.png, 2.png, … and re-run.`);
  process.exit(0);
}

function dimensions(file) {
  const out = execSync(`sips -g pixelWidth -g pixelHeight ${JSON.stringify(file)}`).toString();
  const w = Number(out.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = Number(out.match(/pixelHeight:\s*(\d+)/)?.[1]);
  return { w, h };
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mime(file) {
  const ext = extname(file).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/png';
}

files.forEach((file, i) => {
  const src = join(rawDir, file);
  const caption = captions[i] ?? '';
  const { w: iw, h: ih } = dimensions(src);
  const b64 = readFileSync(src).toString('base64');

  // Frame area: leave room for the caption at the top.
  const hasCaption = caption.trim().length > 0;
  const frameTop = hasCaption ? 132 : 56;
  const margin = 56;
  const areaW = W - margin * 2;
  const areaH = H - frameTop - margin;
  const scale = Math.min(areaW / iw, areaH / ih);
  const dw = Math.round(iw * scale);
  const dh = Math.round(ih * scale);
  const dx = Math.round((W - dw) / 2);
  const dy = Math.round(frameTop + (areaH - dh) / 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4338ca"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="22" flood-color="#1e1b4b" flood-opacity="0.5"/>
    </filter>
    <clipPath id="round"><rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="14"/></clipPath>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 120}" cy="90" r="230" fill="#ffffff" opacity="0.05"/>
  ${
    hasCaption
      ? `<text x="${W / 2}" y="80" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">${escapeXml(caption)}</text>`
      : ''
  }
  <rect x="${dx - 1}" y="${dy - 1}" width="${dw + 2}" height="${dh + 2}" rx="15" fill="#ffffff" filter="url(#sh)"/>
  <image x="${dx}" y="${dy}" width="${dw}" height="${dh}" clip-path="url(#round)" preserveAspectRatio="xMidYMid slice" href="data:${mime(file)};base64,${b64}"/>
  <rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="14" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1.5"/>
</svg>`;

  const base = `screenshot-${String(i + 1).padStart(2, '0')}`;
  const svgPath = join(outDir, `${base}.svg`);
  const pngPath = join(outDir, `${base}.png`);
  writeFileSync(svgPath, svg);
  execSync(`sips -s format png ${JSON.stringify(svgPath)} --out ${JSON.stringify(pngPath)}`, {
    stdio: 'ignore',
  });
  console.log(`  ✅ ${base}.png  ${hasCaption ? `“${caption}”` : '(no caption)'}  <- ${file}`);
});

console.log(`\nDone. Store-ready 1280x800 PNGs are in store-assets/screenshots/`);
