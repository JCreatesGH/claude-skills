# Visual self-QA — capture and review loop

The point: an agent (or a CI job) can *see its own game* without a human screenshotting. You render
every scene and every important popup to PNGs headlessly, then actually look at them, crop into the
fiddly bits, and turn what you find into fixes.

## 1. Wire the harness

Copy `scripts/VisualAuditCapture.cs` into a PlayMode test assembly. Edit `Scenes[]` to your scene
names and `Width/Height` to your target resolution. The test assembly only needs
`UnityEngine.TestRunner` + `nunit.framework` — it does **not** need a reference to your gameplay
assemblies (reach anything you must drive via reflection; see "popups" below).

## 2. Capture headlessly

Run in `-batchmode` **without `-nographics`** (the GPU render path is required to capture pixels):

```bash
ME_AUDIT_DIR=/tmp/shots "$UNITY_EXE" -batchmode -projectPath <project> \
  -runTests -testPlatform PlayMode -testFilter VisualAuditCapture \
  -testResults /tmp/audit.xml -logFile /tmp/audit.log
```

Combine this with the **unity-headless-validation** skill's clone script to capture while your
editor stays open, and to capture a freshly-baked scene on the clone before adopting it.

## 3. Two tricks the harness encodes

- **HUD won't render from a camera.** `ScreenSpaceOverlay` canvases are composited by Unity after
  the camera, so a plain `cam.Render()` misses your whole HUD. The harness flips each overlay
  canvas to `ScreenSpaceCamera` parented to the capture camera for the shot, then restores it.
- **Settle on wall-clock, not frames.** Bootstrap passes, animations, and UI binding take a beat;
  waiting a fixed frame count is unreliable in batchmode. The harness waits ~2.5s of
  `Time.realtimeSinceStartup`. Bump it if your scenes stream in slowly.

## 4. Capturing popups / menus (not just scene spawn)

The scene-load shot shows the gameplay view. To audit a shop/inventory/settings popup, add a
second PlayMode test that loads the scene, **opens the panel**, then calls
`VisualAuditCapture.Capture("Level1_ShopPanel", outDir)`. If your test assembly can't reference the
UI code, drive it by reflection (find the panel component by type name, invoke its `Open()`; fire a
uGUI `Button.onClick` by reflection). This is how you get coverage of the screens a spawn-point
capture never reaches.

## 5. Review the PNGs — look, don't assume

- **Open/read each PNG.** Most issues (floating sprites, clashing palettes, text overflowing a
  frame, a HUD element off-screen) are obvious at a glance.
- **Crop into the corners.** HUD text and bar-fill alignment are too small to judge in a full
  portrait frame. Use `scripts/probe_image.py crop SHOT.png x1 y1 x2 y2` to zoom a region with
  nearest-neighbour scaling and read it.
- **Measure, don't eyeball, colour claims.** "The top third is a black void" vs "a dark-navy
  backdrop" is a real distinction for a fix. `probe_image.py color SHOT.png x1 y1 x2 y2` gives the
  mean/min/max RGB so you grade the actual pixels.
- **Confirm dimensions** with `probe_image.py dims` — a capture at the wrong size means the camera
  or canvas setup is off, not the art.

## 6. Make findings durable

Severity-tag what you find (P0 looks broken to any player → P3 nitpick), name the object and where
it sits in frame, and write a concrete change ("inset the HP bar fill 26px so it stops bleeding
past the painted frame"), not a vibe. If you have several reviewers (or several agents), have each
finding **independently re-checked against the pixels** before you act — visual reviews inflate
severity and hallucinate issues that a second look at the crop disproves.

## Gotchas

- **Editor-only debug UI leaks into captures.** A PlayMode test runs *in the editor*, so any HUD
  gated on `Application.isEditor` (debug toggles, gizmo overlays) shows up in every shot and skews
  your read of ship quality. Also gate it off when `Application.isBatchMode`, or hide it in the
  harness before the shot.
- **`-nographics` gives you black/empty PNGs.** The capture needs the GPU path; drop `-nographics`.
- **Capture order can leak state.** Each scene loads `Single`, but DontDestroyOnLoad singletons and
  static state persist across captures — a scene shot late in the run can inherit state (a dead
  player, a spent currency) from an earlier one. Reset relevant statics between captures if a shot
  looks wrong for reasons unrelated to that scene.
