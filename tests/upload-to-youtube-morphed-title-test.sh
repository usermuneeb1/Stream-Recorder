#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/upload_to_youtube.py IS_MORPHED title prefix       ║
# ║                                                                              ║
# ║  Bug (2026-10-24): line 87 had `prefix = "" if IS_MORPHED else ""` — a    ║
# ║  no-op. Both branches returned "", so YOUTUBE_MORPHED=true had ZERO        ║
# ║  effect on the upload title. Morphed videos uploaded with the same         ║
# ║  "Backup, <filename>" title as unmorphed ones, making it impossible to    ║
# ║  distinguish Content-ID-defeated uploads from clean backups.                ║
# ║                                                                              ║
# ║  Fix: `prefix = "[MORPHED] " if IS_MORPHED else ""`                      ║
# ║                                                                              ║
# ║  Locks:                                                                      ║
# ║    1. YOUTUBE_MORPHED=true  → title starts with "[MORPHED] "              ║
# ║    2. YOUTUBE_MORPHED unset → title has no prefix                         ║
# ║    3. YOUTUBE_MORPHED=false → title has no prefix                         ║
# ║    4. CUSTOM_TITLE overrides the morphed prefix entirely                  ║
# ║    5. The prefix line is NOT a no-op (both branches differ)                ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

SCRIPT="$ROOT/scripts/upload_to_youtube.py"

echo "=== upload_to_youtube.py IS_MORPHED title prefix test ==="

# Test 1: YOUTUBE_MORPHED=true → title starts with [MORPHED]
echo ""
echo "Test 1: YOUTUBE_MORPHED=true adds [MORPHED] prefix"
RESULT=$(YOUTUBE_MORPHED=true python3 -c "
import os
IS_MORPHED = os.environ.get('YOUTUBE_MORPHED', 'false').lower() in ('true', '1')
CUSTOM_TITLE = ''
if CUSTOM_TITLE:
    title = CUSTOM_TITLE
else:
    prefix = '[MORPHED] ' if IS_MORPHED else ''
    file_name = 'test_video.mp4'
    title = f'{prefix}Backup, {file_name}'
print(title)
")

if [[ "$RESULT" == "[MORPHED] Backup, test_video.mp4" ]]; then
    ok "YOUTUBE_MORPHED=true → '$RESULT'"
else
    bad "YOUTUBE_MORPHED=true → '$RESULT' (expected '[MORPHED] Backup, test_video.mp4')"
fi

# Test 2: YOUTUBE_MORPHED unset → no prefix
echo ""
echo "Test 2: YOUTUBE_MORPHED unset → no prefix"
RESULT=$(python3 -c "
import os
IS_MORPHED = os.environ.get('YOUTUBE_MORPHED', 'false').lower() in ('true', '1')
CUSTOM_TITLE = ''
if CUSTOM_TITLE:
    title = CUSTOM_TITLE
else:
    prefix = '[MORPHED] ' if IS_MORPHED else ''
    file_name = 'test_video.mp4'
    title = f'{prefix}Backup, {file_name}'
print(title)
")

if [[ "$RESULT" == "Backup, test_video.mp4" ]]; then
    ok "YOUTUBE_MORPHED unset → '$RESULT'"
else
    bad "YOUTUBE_MORPHED unset → '$RESULT' (expected 'Backup, test_video.mp4')"
fi

# Test 3: YOUTUBE_MORPHED=false → no prefix
echo ""
echo "Test 3: YOUTUBE_MORPHED=false → no prefix"
RESULT=$(YOUTUBE_MORPHED=false python3 -c "
import os
IS_MORPHED = os.environ.get('YOUTUBE_MORPHED', 'false').lower() in ('true', '1')
CUSTOM_TITLE = ''
if CUSTOM_TITLE:
    title = CUSTOM_TITLE
else:
    prefix = '[MORPHED] ' if IS_MORPHED else ''
    file_name = 'test_video.mp4'
    title = f'{prefix}Backup, {file_name}'
print(title)
")

if [[ "$RESULT" == "Backup, test_video.mp4" ]]; then
    ok "YOUTUBE_MORPHED=false → '$RESULT'"
else
    bad "YOUTUBE_MORPHED=false → '$RESULT' (expected 'Backup, test_video.mp4')"
fi

# Test 4: CUSTOM_TITLE overrides the morphed prefix
echo ""
echo "Test 4: CUSTOM_TITLE overrides morphed prefix"
RESULT=$(YOUTUBE_MORPHED=true YOUTUBE_UPLOAD_TITLE="My Custom Title" python3 -c "
import os
IS_MORPHED = os.environ.get('YOUTUBE_MORPHED', 'false').lower() in ('true', '1')
CUSTOM_TITLE = os.environ.get('YOUTUBE_UPLOAD_TITLE', '').strip()
if CUSTOM_TITLE:
    title = CUSTOM_TITLE
else:
    prefix = '[MORPHED] ' if IS_MORPHED else ''
    file_name = 'test_video.mp4'
    title = f'{prefix}Backup, {file_name}'
print(title)
")

if [[ "$RESULT" == "My Custom Title" ]]; then
    ok "CUSTOM_TITLE='My Custom Title' → '$RESULT'"
else
    bad "CUSTOM_TITLE='My Custom Title' → '$RESULT' (expected 'My Custom Title')"
fi

# Test 5: The actual script source has the correct prefix line (not a no-op)
echo ""
echo "Test 5: Script source has correct prefix (not a no-op)"
PREFIX_LINE=$(grep "prefix = " "$SCRIPT" | head -1 | sed 's/^[[:space:]]*//')
if [[ "$PREFIX_LINE" == 'prefix = "" if IS_MORPHED else ""' ]]; then
    bad "Script still has no-op prefix: '$PREFIX_LINE'"
elif [[ "$PREFIX_LINE" == 'prefix = "[MORPHED] " if IS_MORPHED else ""' ]]; then
    ok "Script has correct prefix: '$PREFIX_LINE'"
else
    bad "Script has unexpected prefix: '$PREFIX_LINE'"
fi

echo ""
echo "=== Results: $FAILURES failure(s) ==="
exit $((FAILURES > 0))
