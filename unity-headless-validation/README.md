# unity-headless-validation

> Validate Unity C# from the command line — compile-check in seconds **without launching Unity**, and run tests/scene-bakes in `-batchmode` on a lock-free clone **while the editor stays open**.

This is an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills). Claude loads it automatically when you edit a Unity project and want to know it compiles or passes without clicking into the editor. Full instructions in [`SKILL.md`](SKILL.md).

## What it gives you

- **~10-30s compile checks** using Unity's own bundled Roslyn + .NET — no editor focus, no domain reload, runs even while the editor is open.
- **Batchmode tests + editor automation on a clone** — an APFS copy-on-write clone with the lock files stripped, so `-runTests` / `-executeMethod` run alongside your open editor.
- **GUID-identical artifact adoption** — clones share `.meta` files, so a scene/asset you bake on the clone drops back into the real project with all references intact.

## Quick start

```bash
export UNITY_PATH="/Applications/Unity/Hub/Editor/6000.x.yyfz"   # your version

# 1. Compile-check (every edit). --src = your source root; --exclude = YOUR asmdef output names.
scripts/roslyn-compile-check.sh --project "$PWD" --src "$PWD/Assets/MyGame" --exclude "MyGame,MyGame.Core"

# 2. Clone for batchmode (editor can stay open).
scripts/clone-unity-project.sh "$PWD" /tmp/proj-clone

# 3. Tests / bakes on the clone.
"$UNITY_PATH/Unity.app/Contents/MacOS/Unity" -batchmode -projectPath /tmp/proj-clone \
  -runTests -testPlatform PlayMode -testResults /tmp/results.xml -logFile /tmp/run.log

# 4. Copy validated artifacts back (GUID-identical).
cp /tmp/proj-clone/Assets/Scenes/MyScene.unity "$PWD/Assets/Scenes/"
```

## Why the compile-check recipe is non-trivial

Two things, both of which otherwise produce *thousands* of phantom errors, are handled for you:
the **netstandard 2.1 ref + compat shims** must be referenced, and the monolithic
`Managed/UnityEditor.dll` must **not** be (it collides with the per-module editor DLLs → `CS0433`).

## Files

| Path | Purpose |
| --- | --- |
| `SKILL.md` | The full edit→compile→clone→test→adopt loop and operating principles. |
| `scripts/roslyn-compile-check.sh` | Compile-check a project (runtime or editor) via Unity's bundled Roslyn; prints error count + top error classes. |
| `scripts/clone-unity-project.sh` | APFS copy-on-write (or plain) clone with lock/instance/layout files stripped for batchmode. |
| `references/headless-runbook.md` | Every flag, the compile-recipe rationale, and the batchmode failure-mode catalog (frame-wait flakes, serialized-value overrides, sceneLoaded cascade, etc.). |

> Cross-platform note: the scripts auto-detect the Unity install and the macOS `Unity.app/Contents` layout; on Linux the editor binary is `$UNITY_PATH/Editor/Unity` and the data dir is `$UNITY_PATH/Editor/Data` (the compile-check script already probes for both).
