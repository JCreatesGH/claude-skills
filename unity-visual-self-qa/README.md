# unity-visual-self-qa

> Let an agent **see its own Unity game** — render every scene and popup to exact-resolution PNGs headlessly (HUD included), then review by reading the shots and cropping/colour-probing the details.

This is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills). Claude loads it automatically when you want to verify how a Unity game actually *looks* without a human screenshotting. Full instructions in [`SKILL.md`](SKILL.md).

## What it gives you

- **One PNG per scene, headlessly** — a PlayMode test renders the camera **plus the screen-space HUD** (which a naive camera render misses) to an off-screen RenderTexture in `-batchmode`.
- **Popup/menu coverage** — reuse the public `Capture()` to shoot a shop/inventory/settings panel after opening it (by reflection if needed).
- **Review with intent** — a Pillow-only probe to confirm dimensions, zoom HUD corners with nearest-neighbour scaling, and measure real region colours so "black void vs dark backdrop" is a measurement, not a guess.

## Quick start

```bash
# 1. Copy scripts/VisualAuditCapture.cs into a PlayMode test assembly; set Scenes[] and Width/Height.

# 2. Capture (batchmode, WITHOUT -nographics — the capture needs the GPU path):
ME_AUDIT_DIR=/tmp/shots "$UNITY_PATH/Unity.app/Contents/MacOS/Unity" -batchmode -projectPath "$PWD" \
  -runTests -testPlatform PlayMode -testFilter VisualAuditCapture \
  -testResults /tmp/audit.xml -logFile /tmp/audit.log

# 3. Review:
python3 scripts/probe_image.py dims  /tmp/shots/Level1.png
python3 scripts/probe_image.py crop  /tmp/shots/Level1.png 0 0 700 280      # zoom top-left HUD
python3 scripts/probe_image.py color /tmp/shots/Level1.png 0 0 1170 600     # is the top a void?
```

Pairs naturally with [`unity-headless-validation`](../unity-headless-validation/) — capture a freshly-baked scene on the clone while your editor stays open.

## Files

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The capture + review loop, the two harness tricks, and operating principles. |
| `scripts/VisualAuditCapture.cs` | PlayMode capture harness (camera + HUD → PNG per scene); `Capture()` is public/static for popup tests. |
| `scripts/probe_image.py` | Pillow-only probe: `dims`, `crop` (nearest-neighbour zoom), `color` (mean/min/max RGB). |
| `references/review-loop.md` | Capture command, popup coverage, the look→crop→measure→fix loop, and gotchas (-nographics black frames, capture-order state leaks, debug-UI contamination). |
