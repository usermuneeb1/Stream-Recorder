#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/database-audit.sh _audit_links                     ║
# ║                                                                              ║
# ║  Two defects hid the links.txt overwrite for three months:                   ║
# ║  1. `grep -c … || echo 0` prints "0\n0" (grep -c already prints 0 and exits  ║
# ║     1 on no match) → a two-line INFO row nobody reads.                       ║
# ║  2. The audit only counted legacy separators. A links.txt that had been      ║
# ║     replaced by a JSON array (the refresh-links bug) scored "0 separators"   ║
# ║     and passed.                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
mkdir -p "$WORKDIR/data"
# minimal valid data/ so the other audits stay quiet
echo '[]' > "$WORKDIR/data/recordings.json"
echo '{}' > "$WORKDIR/data/youtube-stats.json"
echo '{"total_streams":0}' > "$WORKDIR/stats.json"

run_audit() { (cd "$WORKDIR" && bash "$ROOT/scripts/database-audit.sh" 2>&1); }

echo "── 1: legacy text links.txt → single-line summary with real counts ──"
cat > "$WORKDIR/links.txt" <<'TXT'
# Stream Recorder links archive

========================================
Title:    A
URL:      https://www.youtube.com/watch?v=a
[archive:HD] https://archive.org/details/a
========================================
Title:    B
URL:      https://youtu.be/b
[gofile:HD] https://gofile.io/d/b
========================================
TXT
OUT=$(run_audit); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0" || bad "exit $RC"
LINE=$(grep -n 'links.txt separator lines' <<<"$OUT" | head -1)
grep -q 'separator lines: 3; YouTube URLs: 2' <<<"$OUT" && ok "counts 3 separators / 2 YouTube URLs on one line" || bad "summary line wrong: ${LINE:-missing}"
grep -q 'entries without Archive.org link: 1' <<<"$OUT" && ok "flags the entry without an archive link" || bad "missing-archive warning absent"

echo "── 2: links.txt with no separators at all → '0', not '0\\n0' ──"
printf '# header only\n' > "$WORKDIR/links.txt"
OUT=$(run_audit)
grep -q 'separator lines: 0; YouTube URLs: 0' <<<"$OUT" && ok "zero counts render on one line" || bad "double-zero / split line: $(grep -A1 'separator lines' <<<"$OUT" | tr '\n' '|')"

echo "── 3: links.txt replaced by a JSON array (the 2026-07..10 damage) → warning ──"
echo '[{"video_id":"x","title":"X","gofile_link":"https://gofile.io/d/x [EXPIRED]"}]' > "$WORKDIR/links.txt"
OUT=$(run_audit)
grep -qi 'links.txt is not in the legacy text format' <<<"$OUT" && ok "overwrite detected and reported" || bad "JSON links.txt passed silently"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — links.txt audit counts correctly and detects the JSON overwrite"; exit 0
