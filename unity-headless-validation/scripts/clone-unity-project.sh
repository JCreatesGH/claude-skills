#!/usr/bin/env bash
# clone-unity-project.sh — make a throwaway copy of a Unity project that can run in -batchmode
# WHILE the editor is open on the original.
#
# Unity holds an exclusive lock on a project (Temp/UnityLockfile); a second -batchmode process
# on the same folder fails. The fix: clone the project, strip the lock/editor-instance/layout
# files, and run batchmode (-runTests / -executeMethod) on the clone. On APFS (macOS) `cp -c`
# is a copy-on-write clone — near-instant and ~0 extra disk until files change — so even a large
# project clones in a second or two.
#
# Typical loop: edit in the open editor → clone → batchmode tests/bakes on the clone → copy the
# validated artifacts (scenes, generated assets) back into the real project (GUID-identical).
#
# Usage: clone-unity-project.sh SOURCE_PROJECT_DIR [DEST_DIR]
#   DEST_DIR defaults to a temp dir next to your TMPDIR.

set -euo pipefail

SRC="${1:?usage: clone-unity-project.sh SOURCE_PROJECT_DIR [DEST_DIR]}"
DST="${2:-${TMPDIR:-/tmp}/$(basename "$SRC")-clone}"
SRC="${SRC%/}"; DST="${DST%/}"

[ -d "$SRC/Assets" ] || { echo "‘$SRC’ doesn't look like a Unity project (no Assets/)." >&2; exit 2; }

echo "Cloning $SRC → $DST"
rm -rf "$DST"

# Prefer an APFS copy-on-write clone (instant, space-free). Fall back to a normal recursive copy.
if cp -Rc "$SRC" "$DST" 2>/dev/null; then
  echo "  (APFS copy-on-write clone)"
else
  echo "  (plain recursive copy — slower, full disk cost)"
  cp -R "$SRC" "$DST"
fi

# Strip the single-instance guards so batchmode can open the clone alongside the live editor.
rm -f  "$DST/Temp/UnityLockfile" 2>/dev/null || true
rm -f  "$DST/Library/EditorInstance.json" 2>/dev/null || true
# A saved window layout can make batchmode try to restore editor windows and stall; drop it.
rm -f  "$DST/UserSettings/Layouts/default-"*.dwlt 2>/dev/null || true

echo "Clone ready: $DST"
echo
echo "Next, run batchmode against the clone, e.g.:"
echo "  \$UNITY/Unity.app/Contents/MacOS/Unity -batchmode -projectPath \"$DST\" \\"
echo "     -runTests -testPlatform PlayMode -testResults \"$DST/results.xml\" -logFile - -quit"
echo
echo "When it passes, copy validated artifacts back into the real project (they keep their GUIDs):"
echo "  cp \"$DST/Assets/Scenes/MyScene.unity\" \"$SRC/Assets/Scenes/\""
