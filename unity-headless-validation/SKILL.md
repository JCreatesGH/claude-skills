---
name: unity-headless-validation
description: >-
  Validate Unity C# changes from the command line — fast compile checks WITHOUT launching Unity,
  plus PlayMode/EditMode tests and editor automation (-executeMethod scene bakes) run in -batchmode
  on a lock-free clone so they work WHILE the editor is open on the project. Use WHENEVER you edit
  a Unity project's C# and want to know it compiles/passes without clicking into the editor or
  waiting on a domain reload — triggers include "does this Unity code compile", "run the Unity
  tests headless", "validate my Unity change", "check this without opening Unity", "rebake the
  scene from the CLI", "set up Unity CI", or any edit→verify loop on a project whose editor is
  already open. Uses Unity's own bundled Roslyn + .NET; no extra installs.
---

# Unity headless validation (compile + test + bake, editor stays open)

## What this does and why

The normal Unity feedback loop is slow (alt-tab to the editor, wait for a domain reload, watch the
Console) and **single-instance** (you can't run a second `-batchmode` process on a project whose
editor is open — it's locked). This skill gives you a fast, scriptable loop that sidesteps both:

1. **Compile-check in seconds without launching Unity** — Unity ships a .NET runtime and the
   Roslyn compiler; point `csc.dll` at the engine reference assemblies and you get a real 0-error
   baseline in ~10-30s. Run it on every edit.
2. **Run tests and editor automation on a lock-free clone** — an APFS copy-on-write clone with the
   lock files stripped runs `-batchmode` tests/bakes while your editor stays open on the original.
3. **Adopt validated artifacts back** — clones share `.meta` files, so generated scenes/assets keep
   their GUIDs and drop back into the real project with references intact.

## Inputs

- A Unity project (has `Assets/` and `Library/`). `Library/ScriptAssemblies` should exist — open
  the project in the editor once so Unity has compiled the package/third-party assemblies the
  compile-check references.
- The Unity editor install path (auto-detected from the Hub dir, or set `UNITY_PATH`).

## The workflow

Run these from the project root. Full detail, flags, and the failure-mode catalog are in
[`references/headless-runbook.md`](references/headless-runbook.md) — read it before a first run.

### 1. Compile-check every edit (fast)

```bash
# Point --src at YOUR source root (not all of Assets/, which pulls in third-party plugins).
scripts/roslyn-compile-check.sh --project "$PWD" --src "$PWD/Assets/MyGame" --exclude "MyGame,MyGame.Core"
scripts/roslyn-compile-check.sh --project "$PWD" --src "$PWD/Assets/MyGame" --mode editor --exclude "MyGame,MyGame.Core"
```

`--exclude` lists the assembly names **your own sources** compile into (your asmdef outputs, or
`Assembly-CSharp` if you have none) so you don't reference them twice. Exit code = error count;
it fails loudly (never a false "clean") if no sources are found, and `*/Tests/*` is excluded in
both modes — test assemblies have special precompiled refs and are validated by *running* them in
batchmode (step 2), not by this flat compile.

Two non-obvious facts the script handles for you, both of which otherwise produce *thousands* of
phantom errors:
- the **netstandard 2.1 ref + compat shims** must be referenced (else "System.X does not exist"),
- the monolithic **`Managed/UnityEditor.dll` must NOT** be referenced (it collides with the
  per-module editor DLLs → `CS0433`).

Green here means "almost certainly compiles." It can't run source generators or per-asmdef define
constraints, so the batchmode run is the final word.

### 2. Clone, then run tests / bakes in batchmode

```bash
scripts/clone-unity-project.sh "$PWD" /tmp/proj-clone
UNITY_EXE="$UNITY_PATH/Unity.app/Contents/MacOS/Unity"   # macOS

"$UNITY_EXE" -batchmode -projectPath /tmp/proj-clone \
  -runTests -testPlatform PlayMode -testResults /tmp/results.xml -logFile /tmp/run.log

"$UNITY_EXE" -batchmode -projectPath /tmp/proj-clone -quit \
  -executeMethod MyGame.EditorTools.BuildAllScenes -logFile /tmp/bake.log
```

### 3. Copy validated artifacts back (GUID-identical)

```bash
cp /tmp/proj-clone/Assets/Scenes/MyScene.unity "$PWD/Assets/Scenes/"
```

## Operating principles

- **Compile-check first, always.** It's the cheapest gate and catches most mistakes before a
  multi-minute batchmode run. Keep the loop: edit → compile-check → (when green) batchmode.
- **Never run batchmode on the live project folder** while its editor is open — clone first.
- **Treat batchmode like a different runtime.** Frame-count waits flake, `WaitForEndOfFrame`
  never fires under `-nographics`, `OnTriggerEnter` is unreliable for teleported transforms, and
  an editor `[InitializeOnLoad]` that opens a window can hang the run. The runbook lists each with
  the fix.
- **Remember serialized values beat code defaults.** If a change "doesn't take," the value is
  probably baked into a scene/prefab — re-bake or heal it at runtime.
- This is a complement to in-editor testing and device builds, not a replacement: it's the fast
  pre-flight that makes the slow checks rare.

## Files

- `scripts/roslyn-compile-check.sh` — compile a project (runtime or editor) via Unity's bundled
  Roslyn; prints the error count and the top error classes. Pure bash, no installs.
- `scripts/clone-unity-project.sh` — APFS copy-on-write (or plain) clone with the lock/instance/
  layout files stripped so batchmode runs alongside the open editor.
- `references/headless-runbook.md` — the end-to-end loop, every flag, the compile-recipe rationale,
  and the batchmode failure-mode catalog.
