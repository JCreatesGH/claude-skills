// VisualAuditCapture.cs — headless screenshot harness for a Unity game.
//
// Drop this into a PlayMode test assembly. It loads each scene you list, lets the runtime settle,
// then renders the main camera PLUS the screen-space HUD into an off-screen RenderTexture and
// writes one PNG per scene. Run it in -batchmode (WITHOUT -nographics, so the GPU path works) and
// you get a folder of exact-resolution screenshots of your own game with zero clicking — review
// them yourself, diff them across builds, or hand them to reviewers.
//
// Output dir: the ME_AUDIT_DIR environment variable if set, else <project>/../visual_audit/.
//
// Run:
//   Unity -batchmode -projectPath <proj> -runTests -testPlatform PlayMode \
//     -testFilter VisualAuditCapture -testResults <xml> -logFile <log>
//   (set ME_AUDIT_DIR to choose where PNGs land)
//
// SETUP: the test assembly only needs UnityEngine.TestRunner + nunit. Put your real scene names
// in Scenes[] and your portrait/landscape resolution in Width/Height.

using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace YourGame.Tests
{
    public class VisualAuditCapture
    {
        // EDIT: your scenes (must be in Build Settings or addressable to LoadScene).
        private static readonly string[] Scenes =
        {
            "MainMenu",
            "Level1",
            "Level2",
        };

        // EDIT: target capture resolution (this example is iPhone-ish portrait).
        private const int Width = 1170;
        private const int Height = 2532;

        [UnityTest]
        public IEnumerator CaptureAllScenes()
        {
            // This is an audit, not an assertion pass — gameplay warnings must not fail it.
            LogAssert.ignoreFailingMessages = true;

            string outDir = Environment.GetEnvironmentVariable("ME_AUDIT_DIR");
            if (string.IsNullOrEmpty(outDir))
                outDir = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "visual_audit");
            Directory.CreateDirectory(outDir);

            foreach (string sceneName in Scenes)
            {
                yield return SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Single);

                // Let bootstrap/UI/animation settle. Use WALL-CLOCK, not a frame count —
                // frame-count waits are unreliable in batchmode.
                float settleUntil = Time.realtimeSinceStartup + 2.5f;
                while (Time.realtimeSinceStartup < settleUntil) yield return null;

                Capture(sceneName, outDir);
                yield return null;
            }

            Debug.Log($"[VisualAudit] Captures written to {outDir}");
        }

        /// <summary>Render the main camera + every screen-space-overlay canvas into a PNG.
        /// Public + static so other PlayMode tests can reuse it for popups/menus (open a panel,
        /// then call Capture("MyScene_ShopPanel", outDir)).</summary>
        public static void Capture(string label, string outDir)
        {
            Camera cam = Camera.main;
            if (cam == null) { Debug.LogWarning($"[VisualAudit] No main camera in {label}; skipped."); return; }

            var rt = new RenderTexture(Width, Height, 24, RenderTextureFormat.ARGB32);
            rt.Create();

            // KEY TRICK: ScreenSpaceOverlay canvases never appear in a camera render. Temporarily
            // reparent them to the camera (ScreenSpaceCamera) so the HUD lands in the capture,
            // then restore them so gameplay is untouched.
            var switched = new List<Canvas>();
            foreach (var canvas in UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsSortMode.None))
            {
                if (canvas == null || !canvas.isRootCanvas) continue;
                if (canvas.renderMode != RenderMode.ScreenSpaceOverlay) continue;
                canvas.renderMode = RenderMode.ScreenSpaceCamera;
                canvas.worldCamera = cam;
                canvas.planeDistance = cam.nearClipPlane + 0.5f;
                switched.Add(canvas);
            }
            Canvas.ForceUpdateCanvases();

            RenderTexture prevTarget = cam.targetTexture;
            cam.targetTexture = rt;
            cam.Render();
            cam.targetTexture = prevTarget;

            RenderTexture prevActive = RenderTexture.active;
            RenderTexture.active = rt;
            var tex = new Texture2D(Width, Height, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, Width, Height), 0, 0);
            tex.Apply();
            RenderTexture.active = prevActive;

            foreach (var canvas in switched)
            {
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                canvas.worldCamera = null;
            }

            File.WriteAllBytes(Path.Combine(outDir, label + ".png"), tex.EncodeToPNG());
            UnityEngine.Object.Destroy(tex);
            rt.Release();
            UnityEngine.Object.Destroy(rt);
            Debug.Log($"[VisualAudit] Captured {label}");
        }
    }
}
