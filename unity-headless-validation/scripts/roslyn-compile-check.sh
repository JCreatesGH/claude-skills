#!/usr/bin/env bash
# roslyn-compile-check.sh — compile-check a Unity C# project in seconds WITHOUT launching Unity.
#
# Unity ships its own .NET runtime and the Roslyn C# compiler inside the editor install. By
# pointing csc.dll at the engine's reference assemblies we get a true 0-error compile baseline
# in ~10-30s — no editor focus, no domain reload, no asset import, and it works while the editor
# is open on the project (great for tight edit→check loops and CI gates).
#
# This does NOT replace Unity's compile (it can't see source generators or per-asmdef define
# constraints exactly), but in practice it catches the overwhelming majority of compile errors
# the moment you introduce them.
#
# Usage:
#   roslyn-compile-check.sh [--project DIR] [--unity DIR] [--mode runtime|editor]
#                           [--src "DIR1 DIR2"] [--exclude "pat1,pat2"] [--out FILE]
#
#   --project   Unity project root (has Assets/ and Library/). Default: $PWD.
#   --unity     Unity editor install root. Default: $UNITY_PATH, else newest under the Hub dir.
#   --mode      runtime (default) excludes Editor sources; editor includes them + UNITY_EDITOR.
#   --src       A source root to compile. Repeatable (pass --src once per root) so paths with
#               spaces work. Default: the project's Assets/ minus Editor/ and Tests/ in runtime mode.
#   --exclude   Comma-separated assembly-NAME substrings to skip from Library/ScriptAssemblies
#               so you don't reference the very assemblies your sources compile into (which would
#               cause duplicate-definition errors). Put YOUR asmdef output names here.
#   --ref       Extra reference DLL (or a glob) to add. Repeatable. Use for precompiled deps that
#               live outside Library/ScriptAssemblies — e.g. nunit for test assemblies:
#               --ref "$PROJECT/Library/PackageCache/com.unity.ext.nunit*/net*/*/nunit.framework.dll"
#   --out       Throwaway output DLL path. Default: a temp file.
#
# Tip: point --src at YOUR source root (e.g. Assets/MyGame), not all of Assets/ — third-party
# plugins under Assets/ often rely on per-asmdef settings (unsafe code, precompiled refs) this
# flat compile can't reproduce. -unsafe is enabled by default so unsafe third-party code is fine.
#
# Exit code: number of compile errors (0 = clean), capped at 250.

set -euo pipefail

PROJECT="$PWD"
UNITY="${UNITY_PATH:-}"
MODE="runtime"
SRC_ROOTS=()          # repeatable --src; paths may contain spaces
EXTRA_REFS=()         # repeatable --ref; precompiled deps outside ScriptAssemblies
EXCLUDE=""
OUT=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project) PROJECT="$2"; shift 2 ;;
    --unity)   UNITY="$2"; shift 2 ;;
    --mode)    MODE="$2"; shift 2 ;;
    --src)     SRC_ROOTS+=("$2"); shift 2 ;;
    --ref)     EXTRA_REFS+=("$2"); shift 2 ;;
    --exclude) EXCLUDE="$2"; shift 2 ;;
    --out)     OUT="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

# ---- Locate the Unity install ------------------------------------------------------------
if [ -z "$UNITY" ]; then
  for hub in "/Applications/Unity/Hub/Editor" "$HOME/Unity/Hub/Editor" "/opt/unity/editors"; do
    [ -d "$hub" ] || continue
    UNITY="$(ls -d "$hub"/*/ 2>/dev/null | sort -V | tail -1)"
    [ -n "$UNITY" ] && break
  done
fi
[ -n "$UNITY" ] || { echo "Could not find a Unity install. Pass --unity or set UNITY_PATH." >&2; exit 2; }
UNITY="${UNITY%/}"

# The directory that actually contains Resources/Scripting differs by platform.
UDATA=""
for cand in "$UNITY/Unity.app/Contents" "$UNITY/Data" "$UNITY/Editor/Data" "$UNITY"; do
  if [ -d "$cand/Resources/Scripting/Managed/UnityEngine" ]; then UDATA="$cand"; break; fi
done
[ -n "$UDATA" ] || { echo "Couldn't find Resources/Scripting under $UNITY. Wrong --unity?" >&2; exit 2; }

DOTNET="$(find "$UDATA/Resources/Scripting" -name dotnet -type f 2>/dev/null | head -1)"
CSC="$(find "$UDATA/Resources/Scripting" -name csc.dll 2>/dev/null | head -1)"
[ -n "$DOTNET" ] && [ -n "$CSC" ] || { echo "Couldn't find bundled dotnet/csc.dll under $UDATA." >&2; exit 2; }

ENGINE_DIR="$UDATA/Resources/Scripting/Managed/UnityEngine"
NETSTD_REF="$(find "$UDATA/Resources/Scripting/NetStandard/ref" -name netstandard.dll 2>/dev/null | head -1)"
NETSTD_SHIMS_DIR="$(dirname "$(find "$UDATA/Resources/Scripting/NetStandard/compat" -path '*shims/netstandard/System.Buffers.dll' 2>/dev/null | head -1)" 2>/dev/null || true)"

[ -f "$NETSTD_REF" ] || { echo "Couldn't find netstandard.dll ref — engine layout unexpected." >&2; exit 2; }

# ---- Resolve source roots ----------------------------------------------------------------
[ ${#SRC_ROOTS[@]} -gt 0 ] || SRC_ROOTS=("$PROJECT/Assets")

RSP="$(mktemp)"; trap 'rm -f "$RSP"' EXIT
[ -n "$OUT" ] || OUT="$(mktemp -u).dll"

{
  echo "-target:library"
  echo "-nologo"
  echo "-out:$OUT"
  echo "-nowarn:0169,0414,0649"   # unused-field noise from inspector-serialized fields
  echo "-unsafe"                  # harmless for a check; lets unsafe third-party code through
  [ "$MODE" = "editor" ] && echo "-define:UNITY_EDITOR"

  # Engine + editor module reference assemblies (the per-module DLLs include UnityEditor.*Module).
  for d in "$ENGINE_DIR"/*.dll; do
    # The monolithic Managed/UnityEditor.dll duplicates types already in the *Module DLLs and
    # causes CS0433 "type exists in both" — never reference it alongside the modules.
    case "$d" in */UnityEditor.dll) continue ;; esac
    echo "-r:\"$d\""
  done

  # netstandard 2.1 reference + compat shims — WITHOUT these you get thousands of
  # "System.Collections does not exist" errors. This is the non-obvious part of the recipe.
  echo "-r:\"$NETSTD_REF\""
  if [ -n "$NETSTD_SHIMS_DIR" ] && [ -d "$NETSTD_SHIMS_DIR" ]; then
    for d in "$NETSTD_SHIMS_DIR"/*.dll; do echo "-r:\"$d\""; done
  fi

  # Third-party + package assemblies Unity already compiled. Skip the assemblies your OWN
  # sources compile into (pass them via --exclude) or you'll get duplicate-definition errors.
  # In runtime mode also skip Editor/Test assemblies.
  if [ -d "$PROJECT/Library/ScriptAssemblies" ]; then
    for d in "$PROJECT/Library/ScriptAssemblies"/*.dll; do
      name="$(basename "$d")"
      skip=0
      if [ "$MODE" = "runtime" ]; then
        case "$name" in *Editor*.dll|*Tests*.dll|*Test.dll) skip=1 ;; esac
      else
        case "$name" in *Tests*.dll|*Test.dll) skip=1 ;; esac
      fi
      if [ -n "$EXCLUDE" ]; then
        IFS=',' read -ra pats <<< "$EXCLUDE"
        for p in ${pats[@]+"${pats[@]}"}; do [ -n "$p" ] && case "$name" in *"$p"*) skip=1 ;; esac; done
      fi
      [ "$skip" = "1" ] || echo "-r:\"$d\""
    done
  fi

  # Extra references (precompiled deps outside ScriptAssemblies, e.g. nunit). Each --ref may be
  # a literal file or a glob; expand globs here. (${arr[@]+...} guard = bash 3.2 / set -u safe.)
  for spec in ${EXTRA_REFS[@]+"${EXTRA_REFS[@]}"}; do
    for d in $spec; do [ -f "$d" ] && echo "-r:\"$d\""; done
  done

  # Source files. SRC_ROOTS is an array so roots with spaces survive. Tests/ are excluded in
  # BOTH modes — test assemblies carry special precompiled refs and are validated by RUNNING
  # them in batchmode (the other half of this skill), not by this flat compile.
  for root in "${SRC_ROOTS[@]}"; do
    if [ "$MODE" = "runtime" ]; then
      find "$root" -name '*.cs' -not -path '*/Editor/*' -not -path '*/Tests/*'
    else
      find "$root" -name '*.cs' -not -path '*/Tests/*'
    fi | sed 's/^/"/;s/$/"/'
  done
} > "$RSP"

# Guard against a false "clean": if no source files made it into the response file, the compile
# is meaningless (csc with zero sources reports zero errors). Fail loudly instead.
SRC_COUNT="$(grep -c '\.cs"$' "$RSP" || true)"
if [ "$SRC_COUNT" = "0" ]; then
  echo "❌ no source files found under: ${SRC_ROOTS[*]} — check --src / --project." >&2
  exit 2
fi

# ---- Compile -----------------------------------------------------------------------------
ERR_LINES="$("$DOTNET" exec "$CSC" "@$RSP" 2>&1 | grep -E ': error ' || true)"
COUNT="$(printf '%s\n' "$ERR_LINES" | grep -c ': error ' || true)"

if [ "$COUNT" = "0" ]; then
  echo "✅ compile clean ($MODE) — 0 errors"
  exit 0
fi

echo "❌ $COUNT compile error(s) ($MODE):"
printf '%s\n' "$ERR_LINES" | sort | uniq -c | sort -rn | head -20
[ "$COUNT" -gt 250 ] && COUNT=250
exit "$COUNT"
