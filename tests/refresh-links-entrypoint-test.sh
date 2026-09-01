#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/refresh-links.sh corrupted tail (2026-09-01)       ║
# ║  A paste accident had duplicated the entry-point block and one ═══ banner    ║
# ║  line lost its '#' prefix → ran twice per invocation + "command not found"   ║
# ║  (cloud-refresh.yml red at "Refresh links").                                 ║
# ║                                                                              ║
# ║  Locks three things, repo-wide where cheap:                                  ║
# ║   1. refresh-links.sh has exactly ONE self-run entry point                   ║
# ║   2. NO script anywhere has an uncommented box-drawing '═' line              ║
# ║   3. dry-run behaves: banner once, no stray commands, exit 0                 ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
TARGET="$ROOT/scripts/refresh-links.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

echo "── 1: exactly one self-run entry point in refresh-links.sh ──"
N=$(grep -c 'if \[\[ "\${BASH_SOURCE\[0\]}" == "\${0}" \]\]' "$TARGET")
[[ "$N" -eq 1 ]] && ok "one entry point" || bad "$N entry points"

echo "── 2: no uncommented═/─ banner lines anywhere in scripts/ or tests/ ──"
# A box-drawing line is only legal behind a comment marker.
HITS=$(grep -rPn '^\s*[\x{2550}\x{2500}\x{2554}\x{255A}\x{2557}\x{255D}\x{2551}\x{255A}\x{2560}\x{2563}]{4,}' "$ROOT/scripts" "$ROOT/tests" 2>/dev/null | grep -v ':' ; true)
# (grep -P with the class above finds lines whose first non-space char IS box-drawing = uncommented)
HITS=$(find "$ROOT/scripts" "$ROOT/tests" -name '*.sh' -print0 | xargs -0 grep -nP '^\s*[═─╔╗╝╚║]{4,}' 2>/dev/null)
if [[ -z "$HITS" ]]; then ok "no bare banner lines"; else bad "bare banner lines:\n$HITS"; fi

echo "── 3: behavioral — single run, clean exit ──"
OUT=$(DRY_RUN=true GITHUB_ENV="$(mktemp)" bash "$TARGET" 2>&1) && RC=0 || RC=$?
BANNERS=$(grep -c "CLOUD LINK PRESERVATION" <<<"$OUT")
[[ "$RC" -eq 0 ]] && ok "exit 0 in dry-run" || bad "exit $RC in dry-run"
[[ "$BANNERS" -eq 1 ]] && ok "banner once" || bad "banner $BANNERS times (double-run)"
grep -q "command not found" <<<"$OUT" && bad "stray command executed" || ok "no stray commands"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — entry-point integrity locked repo-wide"; exit 0
