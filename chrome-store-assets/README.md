# chrome-store-assets

> Generate exact-dimension Chrome Web Store graphics on macOS with **no image library** — design in SVG, rasterize with the built-in `sips`.

This is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills). Claude loads it automatically when you ask for store graphics or exact-size PNGs on a Mac. The full instructions are in [`SKILL.md`](SKILL.md).

## What it produces

- **Store icon** — 128×128 PNG
- **Small promo tile** — 440×280 PNG
- **Marquee promo tile** — 1400×560 PNG
- **Screenshots** — store-spec 1280×800 PNGs, framed and captioned

…all without ImageMagick, `node-canvas`, `rsvg-convert`, or any `npm install`. The trick: macOS `sips` rasterizes SVG (gradients, text, opacity, embedded base64 images, drop shadows) to PNG at exact pixel dimensions.

## Quick start

```bash
# Branded icon + promo tiles — edit the CONFIG block at the top first
node scripts/make-promo-tiles.mjs

# Framed 1280×800 screenshots — drop images in store-assets/raw/ (1.png, 2.png, …)
# and optionally set captions in store-assets/captions.json
node scripts/frame-screenshots.mjs
```

Output lands in `store-assets/`. Always open the PNGs to confirm text rendered (sips can drop a glyph if a font is missing — stick to Helvetica/Arial).

## Files

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The core technique, required asset sizes, and submission gotchas. |
| `scripts/make-promo-tiles.mjs` | Icon / small tile / marquee from a small config block. |
| `scripts/frame-screenshots.mjs` | Raw screenshots → framed 1280×800 store PNGs. |
| `references/listing-fields.md` | Copy-paste answers for the Chrome Web Store listing & Privacy-practices fields. |
