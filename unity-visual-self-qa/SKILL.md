---
name: unity-visual-self-qa
description: >-
  Let an agent SEE its own Unity game — render every scene and UI popup to exact-resolution PNGs
  headlessly (in -batchmode via a PlayMode test), including the screen-space HUD, then review the
  shots by reading them and cropping/colour-probing the fiddly regions. Use WHENEVER you want to
  verify how a Unity game actually LOOKS without a human screenshotting — triggers include
  "screenshot every scene", "does the HUD look right", "capture the game headlessly", "visual QA /
  visual regression for my Unity game", "review my game's UI", "audit the menus/popups", or
  checking art/layout after a change. Pairs with headless-validation to capture freshly-baked scenes
  while the editor stays open. Needs the GPU render path (run batchmode WITHOUT -nographics).
---

# Unity visual self-QA (headless screenshots + review)

## What this does and why

You can't judge a game's look from code, and asking a human to screenshot every screen every build
doesn't scale. This skill renders your game to PNGs from the command line — **including the HUD**,
which a naive camera render misses — so an agent or CI job can look at the actual frames, zoom into
the corners, measure colours, and turn what it sees into concrete fixes.

It's two halves:
1. **Capture** — a PlayMode test (`VisualAuditCapture.cs`) that loads each scene, settles, and
   renders the camera + every screen-space-overlay canvas into an off-screen RenderTexture → one
   PNG per scene (and per popup, if you drive the UI).
2. **Review** — read the PNGs, crop into HUD/text/alignment details with nearest-neighbour zoom,
   and probe real region colours so "black void vs dark backdrop" is a measurement, not a guess.

## Inputs

- A Unity project with a PlayMode test assembly (just `UnityEngine.TestRunner` + `nunit`).
- The list of scene names to capture and your target resolution.
- `python3` + Pillow for the crop/colour probe (`python3 -m pip install pillow`).

## The workflow

Read [`references/review-loop.md`](references/review-loop.md) for the full loop; the essentials:

### 1. Wire and capture

Copy `scripts/VisualAuditCapture.cs` into your test assembly; set `Scenes[]` and `Width/Height`.
Run in batchmode **without `-nographics`** (the capture needs the GPU path):

```bash
ME_AUDIT_DIR=/tmp/shots "$UNITY_EXE" -batchmode -projectPath <project> \
  -runTests -testPlatform PlayMode -testFilter VisualAuditCapture \
  -testResults /tmp/audit.xml -logFile /tmp/audit.log
```

### 2. Review with intent

```bash
python3 scripts/probe_image.py dims  /tmp/shots/Level1.png
python3 scripts/probe_image.py crop  /tmp/shots/Level1.png 0 0 700 280   # zoom the top-left HUD
python3 scripts/probe_image.py color /tmp/shots/Level1.png 0 0 1170 600  # is the top a void?
```

Open each PNG and look; crop the small stuff; measure colour claims. Then write findings with a
severity, the object + where it sits in frame, and a concrete change.

## Two tricks that make this work (encoded in the harness)

- **The HUD doesn't render from a camera.** `ScreenSpaceOverlay` canvases are composited after the
  camera, so they're absent from a plain `cam.Render()`. The harness temporarily flips each overlay
  canvas to `ScreenSpaceCamera` parented to the capture camera, shoots, then restores it.
- **Settle on wall-clock, not a frame count.** Frame-count waits are unreliable in batchmode; the
  harness waits ~2.5s of real time for bootstrap/animation/UI binding before the shot.

## Operating principles

- **Look before you assert.** Read the actual PNG and crop the region in question — don't reason
  about what the screen "should" show. Most visual bugs are obvious once you actually view the shot.
- **Measure colour and dimensions** instead of describing them — it's the difference between a
  vague note and an actionable fix.
- **Capture popups too,** not just spawn views — load the scene, open the panel (by reflection if
  the test assembly can't reference UI), then `Capture(...)`.
- **Suppress editor-only debug UI** in the capture: a PlayMode test runs in the editor, so
  `Application.isEditor` debug overlays pollute every shot — also gate them on
  `Application.isBatchMode`.
- **Re-check findings against the pixels** before acting — visual reviews tend to inflate severity
  and invent issues a second look at the crop disproves.

## Files

- `scripts/VisualAuditCapture.cs` — the PlayMode capture harness (camera + HUD → PNG per scene;
  `Capture()` is public/static so popup tests can reuse it).
- `scripts/probe_image.py` — Pillow-only screenshot probe: `dims`, `crop` (nearest-neighbour zoom),
  `color` (mean/min/max RGB of a region).
- `references/review-loop.md` — capture command, popup coverage, the look→crop→measure→fix loop,
  and the gotchas (-nographics black frames, capture-order state leaks, debug-UI contamination).
