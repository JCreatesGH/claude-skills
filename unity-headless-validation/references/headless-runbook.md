# Unity headless validation — runbook

The full loop for verifying Unity changes from the command line — no clicking, no waiting on the
editor, and without quitting the editor you have open.

## The three tools

1. **`scripts/roslyn-compile-check.sh`** — sub-minute "does it compile?" using Unity's bundled
   Roslyn. Run this on *every* edit. It does not need the editor closed or even running.
2. **`scripts/clone-unity-project.sh`** — a batchmode-safe copy so you can run tests/bakes while
   the editor stays open on the real project.
3. **Unity `-batchmode`** — run PlayMode/EditMode tests and editor automation (`-executeMethod`)
   on the clone.

## 0. Set your Unity path once

```bash
export UNITY_PATH="/Applications/Unity/Hub/Editor/6000.x.yyfz"   # your version
UNITY_EXE="$UNITY_PATH/Unity.app/Contents/MacOS/Unity"           # macOS; Linux: $UNITY_PATH/Editor/Unity
```

## 1. Compile-check (fast, every edit)

```bash
# Runtime scripts (point --src at YOUR source root, not all of Assets/):
scripts/roslyn-compile-check.sh --project "$PWD" --src "$PWD/Assets/MyGame" --exclude "MyGame,MyGame.Core"
# Editor scripts too (defines UNITY_EDITOR, includes Editor/ + editor modules):
scripts/roslyn-compile-check.sh --project "$PWD" --src "$PWD/Assets/MyGame" --mode editor --exclude "MyGame,MyGame.Core"
```

`--exclude` takes the **names of the assemblies your own sources compile into** (your asmdef
output names). You reference everything in `Library/ScriptAssemblies` *except* those — otherwise
the compiler sees each of your types twice (once from source, once from the prebuilt DLL) and
reports duplicate definitions. If you have no asmdefs and everything is in `Assembly-CSharp`,
pass `--exclude "Assembly-CSharp"`.

**Scope it to your own code.** Point `--src` at your source root rather than all of `Assets/` —
third-party plugins under `Assets/` lean on per-asmdef settings (unsafe code, precompiled
references) this flat compile can't reproduce, so sweeping them produces noise, not signal. `-unsafe`
is on by default (harmless for a check) so the common "unsafe third-party code" case still passes.
`*/Tests/*` is skipped in both modes: test assemblies reference precompiled NUnit/etc. that pull in
a different core library, and they're validated by **running** them (step 3), not by this compile.
If you must compile something with an external precompiled dep, add it with `--ref` (repeatable;
accepts a glob), e.g. `--ref "$PWD/Library/PackageCache/com.unity.ext.nunit*/**/nunit.framework.dll"`.
The script **fails loudly if it finds no sources** — it never reports a false "clean."

Why this works and what it can't see: Unity bundles a .NET runtime + `csc.dll`. Pointing csc at
the engine's reference assemblies (`Resources/Scripting/Managed/UnityEngine/*.dll`) **plus the
netstandard 2.1 ref and its compat shims** reproduces Unity's compile closely enough to catch
essentially all ordinary errors. It will *not* run Roslyn source generators or honor per-asmdef
`defineConstraints`/`versionDefines`, so treat a green result as "very likely compiles" and let
the batchmode run below be the final word.

### Two gotchas baked into the script (so you don't rediscover them)

- **netstandard shims are mandatory.** Without `NetStandard/ref/2.1.0/netstandard.dll` *and* the
  `compat/2.1.0/shims/netstandard/*.dll` shim set, you get thousands of bogus
  "`System.Collections` does not exist" / "`System.IO` does not exist" errors.
- **Never reference the monolithic `Managed/UnityEditor.dll`.** Its types also live in the
  `UnityEditor.*Module.dll` set (and in `Library/ScriptAssemblies` editor modules), so referencing
  both yields `CS0433: type exists in both`. The script references the modules and drops the
  monolith.

## 2. Clone for batchmode (when the editor is open)

```bash
scripts/clone-unity-project.sh "$PWD" /tmp/myproj-clone
```

On APFS this is a copy-on-write clone — near-instant, ~0 disk until files diverge. It removes
`Temp/UnityLockfile`, `Library/EditorInstance.json`, and the saved window layout so batchmode
opens cleanly alongside your live editor session.

## 3. Run tests / automation on the clone

```bash
# PlayMode tests:
"$UNITY_EXE" -batchmode -projectPath /tmp/myproj-clone \
  -runTests -testPlatform PlayMode \
  -testResults /tmp/results.xml -logFile /tmp/run.log

# Editor automation (scene bakes, asset generation, etc.) via a public static method:
"$UNITY_EXE" -batchmode -projectPath /tmp/myproj-clone -quit \
  -executeMethod MyGame.EditorTools.BuildAllScenes -logFile /tmp/bake.log
```

Parse `results.xml` for `total/passed/failed` (it's NUnit XML). `-logFile -` streams to stdout;
a path captures it for grepping.

## 4. Copy validated artifacts back

Because the clone shares the source's `.meta` files, any scene/asset you generated on the clone
keeps the **same GUID**, so it drops straight into the real project with references intact:

```bash
cp /tmp/myproj-clone/Assets/Scenes/World.unity "$PWD/Assets/Scenes/"
cp /tmp/myproj-clone/Assets/_Generated/*.asset "$PWD/Assets/_Generated/"
# Verify nothing else drifted (e.g. a concurrent editor save):
diff <(cd "$PWD" && find Assets -name '*.cs' -exec md5 -r {} \; | sort -k2) \
     <(cd /tmp/myproj-clone && find Assets -name '*.cs' -exec md5 -r {} \; | sort -k2)
```

## Batchmode behaviors that will waste an hour if you don't know them

- **Frame-count waits flake.** `yield return null` ×N and `WaitForFrames` are unreliable in
  batchmode (the loop runs far faster/slower than on-device). Gate on **wall-clock**:
  `while (Time.realtimeSinceStartup < deadline) yield return null;`.
- **`WaitForEndOfFrame` never fires** in `-batchmode -nographics`. Don't await it; if you need a
  render, run batchmode *without* `-nographics` and call `Camera.Render()` explicitly.
- **`OnTriggerEnter` is unreliable for teleported transforms.** Setting `transform.position` to
  overlap a trigger often won't fire it in a headless step. Move via the physics path, or call
  the deposit/interact method directly in the test as a fallback.
- **Serialized scene/prefab values override code defaults.** Changing a field's default in C#
  does nothing to instances already baked into a scene/prefab — the serialized value wins. Re-bake
  the scene, or heal the value at runtime. (A classic symptom: "I changed the default but the game
  still does the old thing.")
- **One throwing `sceneLoaded` subscriber aborts the rest.** If several systems subscribe to
  `SceneManager.sceneLoaded` and an early one throws, later subscribers silently never run. Gate
  visual/consistency passes behind a clean compile and wrap risky ones in try/catch.
- **An editor that auto-opens a window via `[InitializeOnLoad]` can hang batchmode.** Guard such
  code with `if (Application.isBatchMode) return;`.

## Wrapping it as one CI script

Chain them: compile-check (fast fail) → clone → batchmode tests + bakes → parse results → on
green, copy artifacts back and print a summary. That single script is a solid pre-commit / CI gate
that runs on a developer machine even with the editor open.
