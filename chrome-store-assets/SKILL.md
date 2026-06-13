---
name: chrome-store-assets
description: Generate Chrome Web Store (and general app-store) graphics on macOS without any image library — store icon (128×128), small promo tile (440×280), marquee (1400×560), and framed 1280×800 screenshots — by designing in SVG and rasterizing with the built-in `sips` tool. Includes a reference for the CWS listing fields (permission justifications, privacy-practices answers, categories, character limits, and the "Title/Summary are locked to manifest" gotcha). Use when preparing a Chrome extension (or any app) for store submission, or whenever you need exact-dimension PNGs with text/gradients/embedded images on a Mac and ImageMagick/node-canvas are unavailable.
---

# Chrome Web Store assets (and exact-dimension PNGs on macOS)

## The core technique: SVG → PNG with `sips`

macOS ships `sips`, which **rasterizes SVG to PNG at exact pixel dimensions** — gradients, text, opacity, `<image>` embeds, `clipPath`, `feDropShadow` all render. This is the reliable way to produce store graphics when `node-canvas` fails (native dlopen) and ImageMagick/`rsvg-convert` aren't installed.

```bash
# The width/height on the <svg> element set the output pixel size exactly.
sips -s format png input.svg --out output.png
sips -g pixelWidth -g pixelHeight output.png   # verify dimensions
```

Always **render and visually verify** the PNG (open/Read it) before delivering — `sips` occasionally drops a glyph if a font is missing. Stick to `font-family="Helvetica, Arial, sans-serif"` (always present on macOS). Embed raster images in SVG as base64 data URIs (`href="data:image/png;base64,…"`) rather than file refs.

`sips` is also the no-dependency way to get image dimensions (`-g pixelWidth -g pixelHeight`) and to resize/pad/convert existing images.

## Required Chrome Web Store assets & sizes

| Asset | Size | Required? |
| --- | --- | --- |
| Store icon | 128×128 PNG | Yes |
| Screenshots | **1280×800** (or 640×400) PNG/JPEG, 1–5 | Yes (≥1) |
| Small promo tile | 440×280 PNG | Recommended |
| Marquee promo tile | 1400×560 PNG | Only if Google features you |

Design language that reads well at every size: a strong diagonal brand gradient, one clear product motif, white text with a hierarchy, generous rounding, and a soft drop shadow on any "card." Keep the icon to ONE bold idea — detail disappears at 16px.

## Scripts in this skill

- `scripts/frame-screenshots.mjs` — turns raw product screenshots into store-spec **1280×800** PNGs: branded background, the screenshot in a rounded frame with a shadow, and a caption across the top. Drop images in `<project>/store-assets/raw/` named `1.png, 2.png …`, set captions in `store-assets/captions.json` (array, Nth caption → Nth file), run `node scripts/frame-screenshots.mjs`. Output in `store-assets/screenshots/`. Run it from the target project root (it resolves `store-assets/` relative to CWD), or copy it into the project's `scripts/`.
- `scripts/make-promo-tiles.mjs` — writes branded SVGs for the icon / small tile / marquee from a small config (product name, tagline, colors) and rasterizes them with `sips`. Edit the config block at the top, run, verify the PNGs.

Both are pure Node + `sips`; no npm install. If the machine has no system Node, point them at whatever Node install is available (e.g. a user-local `~/.local/node*/bin`).

## Listing-field reference

See `references/listing-fields.md` for ready-to-paste:
- Permission justifications (activeTab, scripting, tabs, storage, downloads, offscreen, contextMenus, host permissions).
- Privacy-practices answers (single purpose, remote-code = No, data-collection declaration, the three certification checkboxes).
- Category guidance, the 132-char summary limit, and the gotcha that **Title and Summary are pulled from `manifest.json` (`name` / `description`) and are NOT editable in the dashboard** — change them in the manifest, rebuild, and re-upload the package.

## Hard-won gotchas

- **The CWS developer dashboard and the Stripe dashboard both BLOCK browser automation.** Don't try to drive them with a browser-control tool — guide the user click-by-click and supply copy-paste field values instead.
- Manifest `description` (= store Summary) and the store Summary field both cap at **132 chars**. A package over that is rejected at upload.
- Screenshots must be **exactly** 1280×800 or 640×400 — odd sizes are rejected or look bad; frame/pad them.
- For marketing screenshots, capture with the paid/clean state active so free-tier limitation banners don't appear in the hero shots (unless that's intentional upsell).
