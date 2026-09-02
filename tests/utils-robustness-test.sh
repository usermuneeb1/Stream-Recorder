#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: 2026-09-02 backfill-run findings                          ║
# ║                                                                              ║
# ║  1. upload-clouds.sh 0807/VikingFile log lines passed $(basename \"$file\")║
# ║     with literal backslash-escapes INSIDE $() → quote chars leaked into      ║
# ║     args → format_size('"392569774"') crashed all four (( )) tests in       ║
# ║     utils.sh (lines 201-207 syntax errors on every repair item)              ║
# ║  2. st0807_pow.py fetched /pow with urllib's default UA (CDN-blocked)        ║
# ║  3. _st0807_pow_json swallowed stderr — failures were invisible in run logs  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

source "$ROOT/scripts/utils.sh"

echo "── 1: format_size survives dirty/quoted input ──"
OUT=$(format_size '"392569774"' 2>/dev/null); RC=$?
[[ "$RC" -eq 0 && "$OUT" == *MB* ]] && ok "format_size '\"392569774\"' → $OUT" || bad "format_size broke on quoted input (rc=$RC out=$OUT)"
if command -v bc >/dev/null 2>&1; then
    [[ "$(format_size 1048576)" == "1.00 MB" ]] && ok "clean input still formats" || bad "clean input regressed"
else
    ok "clean-input case skipped (bc absent in this env; runners install it)"
fi
[[ "$(format_size '')" == "0 B" ]] && ok "empty input → 0 B" || bad "empty input mishandled"

echo "── 2: no backslash-escaped quotes inside \$() anywhere in scripts/ ──"
HITS=$(grep -rn '\$(.*\\\\"' "$ROOT/scripts" --include='*.sh' 2>/dev/null | grep -v '^\s*#' || true)
[[ -z "$HITS" ]] && ok "no \$(... \\\"...\\\" ...) anti-pattern left" || bad "still present:\n$HITS"

echo "── 3: 0807 PoW fetch sends a real UA and errors stay visible ──"
grep -q 'User-Agent' "$ROOT/scripts/st0807_pow.py" && ok "pow request carries a User-Agent" || bad "urllib default UA still in use"
grep -q 'urllib.request.Request(' "$ROOT/scripts/st0807_pow.py" && ok "headers actually applied" || bad "headers dict unused"
# code lines only — the word "2>/dev/null" inside a COMMENT is fine
if grep -A3 '_st0807_pow_json()' "$ROOT/scripts/upload-clouds.sh" | grep -v '^\s*#' | grep -v 'upload-clouds.sh.*#' | grep -q 'st0807_pow.py.*2>/dev/null'; then
    bad "pow stderr still swallowed"
else
    ok "pow stderr reaches the run log"
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — quoting, UA, and error-visibility fixes locked"; exit 0
