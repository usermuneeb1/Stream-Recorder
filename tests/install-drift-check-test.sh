#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for scripts/check-install-drift.sh                          ║
# ║  Locks down the 2026-08-20 → 2026-09-01 incident: 13 false "install          ║
# ║  regression" pages caused by the old inline drift check dying under          ║
# ║  `bash -eo pipefail` whenever its awk anchors matched nothing.               ║
# ║                                                                              ║
# ║  Must stay true FOREVER:                                                     ║
# ║   1. exit code is ALWAYS 0 (drift is a warning, not a failure)               ║
# ║   2. missing anchors produce an explicit warning, never silent death         ║
# ║   3. real drift produces a warning with both counts                          ║
# ║   4. on the real repo files, both counts are > 0 (anchors sanity)            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
SCRIPT="$ROOT/scripts/check-install-drift.sh"

FAILURES=0
ok()   { echo "  ✅ $1"; }
bad()  { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

echo "── Case 1: real repo files — exits 0, anchors found, counts > 0 ──"
OUT=$(bash "$SCRIPT" "$ROOT/.github/workflows/stream-recorder.yml" "$ROOT/.github/workflows/install-self-test.yml" 2>&1)
RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "exit 0 on real files" || bad "exit $RC on real files"
REAL_N=$(echo "$OUT" | grep -oP 'Real workflow install commands: \K[0-9]+')
TEST_N=$(echo "$OUT" | grep -oP 'Self-test install commands:\s+\K[0-9]+')
[[ "${REAL_N:-0}" -gt 0 ]] && ok "real anchors found (REAL=$REAL_N)" || bad "real anchors NOT found (REAL=0) — step renamed? update script anchors"
[[ "${TEST_N:-0}" -gt 0 ]] && ok "self-test anchors found (TEST=$TEST_N)" || bad "self-test anchors NOT found (TEST=0)"

echo "── Case 2: regression repro — anchors match NOTHING (the 13-day incident) ──"
FIX=$(mktemp -d)
cat > "$FIX/renamed.yml" <<'EOF'
      - name: "Install Tooling Freshly"
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg
EOF
OUT=$(bash "$SCRIPT" "$FIX/renamed.yml" "$FIX/renamed.yml" 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "exit 0 when anchors miss (old code exited 1 here)" || bad "exit $RC when anchors miss — THE INCIDENT IS BACK"
echo "$OUT" | grep -q "::warning::Could not locate" \
    && ok "explicit anchor warning emitted" || bad "anchor warning missing"

echo "── Case 3: real drift — warning shows both counts, still exit 0 ──"
cat > "$FIX/big-real.yml" <<'EOF'
      - name: "Install dependencies"
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg
          sudo curl -L a
          sudo curl -L b
          sudo curl -L c
          sudo curl -L d
          pip3 install x
          chmod +x y
      - name: "Next step"
        run: echo done
EOF
cat > "$FIX/small-self.yml" <<'EOF'
      - name: "Replay real install block"
        run: |
          sudo apt-get update
          sudo apt-get install -y ffmpeg
      - name: "Verify all critical tools"
        run: echo done
EOF
OUT=$(bash "$SCRIPT" "$FIX/big-real.yml" "$FIX/small-self.yml" 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "exit 0 under drift" || bad "exit $RC under drift"
echo "$OUT" | grep -qE "::warning::Real install block has 8 commands but self-test only mirrors 2" \
    && ok "drift warning with exact counts (8 vs 2)" || bad "drift warning wrong/missing"

echo "── Case 4: case-insensitive anchor + range ends at next '- name:' ──"
OUT=$(bash "$SCRIPT" "$FIX/big-real.yml" "$FIX/big-real.yml" 2>&1); RC=$?
R2=$(echo "$OUT" | grep -oP 'Real workflow install commands: \K[0-9]+')
[[ $RC -eq 0 && "${R2:-0}" -eq 8 ]] && ok "count stops at next step (8, not including 'Next step')" || bad "count wrong: R2=$R2 rc=$RC"

echo "── Case 5: immune to caller's -eo pipefail (GitHub default bash shell) ──"
bash --noprofile --norc -eo pipefail -c "bash \"$SCRIPT\" \"$FIX/renamed.yml\" \"$FIX/renamed.yml\" >/dev/null 2>&1"; RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 even under bash -eo pipefail" || bad "died ($RC) under -eo pipefail — THE INCIDENT IS BACK"

rm -rf "$FIX"
echo ""
if (( FAILURES > 0 )); then
    echo "RESULT: RED — $FAILURES case(s) failed"; exit 1
fi
echo "RESULT: GREEN — all drift-check behaviors locked"; exit 0
