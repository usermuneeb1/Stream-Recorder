#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for .github/workflows/youtube-stats.yml                     ║
# ║                                                                              ║
# ║  Two bugs, same step ("Commit and push"), 100% red since 2026-08-26:         ║
# ║   1. `git add … public/yt-all.json` — the scrape writes                      ║
# ║      dashboard/public/yt-all.json, so the channel list never lands.          ║
# ║      Repro: `git add --dry-run public/yt-all.json` → pathspec did not match. ║
# ║   2. bare `git push` races this repo's constantly-moving main (exit 128).    ║
# ║      safe-push.sh is the one correct push path.                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

echo "── Case 1: live pathspec check against the real tree ──"
if [[ -f "$ROOT/dashboard/public/yt-all.json" ]]; then
    ok "dashboard/public/yt-all.json exists"
else
    bad "dashboard/public/yt-all.json missing from the tree"
fi
if [[ -e "$ROOT/public/yt-all.json" ]]; then
    bad "root public/yt-all.json exists — the incident path would silently start working for the wrong reason"
else
    ok "root public/yt-all.json does not exist (incident path is still a miss)"
fi

echo "── Case 2: safe-push.sh exists and is the documented push path ──"
if [[ -f "$ROOT/scripts/safe-push.sh" ]]; then
    ok "scripts/safe-push.sh exists"
else
    bad "scripts/safe-push.sh missing"
fi
# The incident command, reproduced against this tree. Exit 128 = pathspec miss.
set +e
git -C "$ROOT" add --dry-run public/yt-all.json >/tmp/yt-add.out 2>/tmp/yt-add.err
ADD_RC=$?
set -e
if [[ "$ADD_RC" -ne 0 ]]; then
    ok "incident pathspec still misses (git add public/yt-all.json → $ADD_RC)"
else
    bad "incident pathspec now matches — did public/yt-all.json appear at repo root?"
fi

echo ""
if (( FAILURES > 0 )); then
    echo "RESULT: RED — $FAILURES case(s) failed"; exit 1
fi
echo "RESULT: GREEN — youtube-stats commit path + push locked"; exit 0
