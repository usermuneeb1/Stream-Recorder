#!/usr/bin/env bash
# Recording cascade test — mock-adapter harness (codebase-design, tool port).
#
# Sources the REAL scripts/record-stream.sh, mocks the four external tools
# (yt-dlp, streamlink, ytarchive, ffmpeg) with PATH shims, and asserts:
#   1. Cascade order + labels match the documented D,C,G,E,J,H,I,F,A,B order
#      (locks the method-table-as-data refactor: a label can never drift from
#      the method it names).
#   2. Fallback: when only streamlink works, the cascade walks D,C,G,E,J,H
#      and stops at I (success) — proving order + retry-to-next-method.
#   3. First-method success: when only yt-dlp works, it stops at D.
#   4. Total failure: returns 1 with "All 10 methods failed".
#
# No network, no YouTube, no cookies. Deterministic and fast.
set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$TEST_DIR/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

ok()   { echo "  PASS: $1"; PASS=$((PASS + 1)); }
bad()  { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── mock external tools ──────────────────────────────────────────────────────
# A mock succeeds (writes a valid >100KB file to the output arg) iff
# MOCK_SUCCEED_TOOL equals its own name; otherwise it exits 1.
make_mock() {
    local tool="$1"
    cat > "$BIN/$tool" <<EOF
#!/usr/bin/env bash
# Mock $tool for the recording-cascade test.
if [[ -n "\${MOCK_SUCCEED_TOOL:-}" && "\$MOCK_SUCCEED_TOOL" != "$tool" ]]; then
  exit 1
fi
out=""
for a in "\$@"; do
  case "\$a" in
    *segment_*) out="\$a" ;;
  esac
done
[[ -z "\$out" ]] && exit 1
dd if=/dev/zero of="\$out" bs=1024 count=200 2>/dev/null
exit 0
EOF
    chmod +x "$BIN/$tool"
}

BIN="$WORK/bin"
mkdir -p "$BIN"
for t in yt-dlp streamlink ytarchive ffmpeg; do
    make_mock "$t"
done
export PATH="$BIN:$PATH"

# ── minimal harness env ─────────────────────────────────────────────────────
export RECORD_DIR="$WORK/record"
export SEGMENTS_DIR="$WORK/record/segments"
export MAX_RECORD_DURATION=10
export MIN_FILE_SIZE_KB=100
mkdir -p "$SEGMENTS_DIR"

# shellcheck disable=SC1091
source "$REPO/scripts/utils.sh"
# shellcheck disable=SC1091
source "$REPO/scripts/detect-stream.sh"
# shellcheck disable=SC1091
source "$REPO/scripts/record-stream.sh"

# config.env is loaded during source and overrides exports; set test values
# after sourcing so the cascade runs at full speed.
export METHOD_RETRY_DELAY=0

# ── helpers ─────────────────────────────────────────────────────────────────
reset_work() {
    rm -rf "$WORK/record/segments"/* "$WORK/record/method_logs" 2>/dev/null || true
    mkdir -p "$SEGMENTS_DIR"
    RECORDED_FILES=()
}

trying_lines() {  # attempt_recording stdout -> "Trying method" lines only
    echo "$1" | sed 's/\x1b\[[0-9;]*m//g' | grep -o "Trying method .*" | sed 's/Trying method //; s/\.\.\.$//'
}

# ── TEST 1: cascade order + labels (all methods fail, order is observable) ──
reset_work
export MOCK_SUCCEED_TOOL=none
OUT=$(attempt_recording "https://youtu.be/TEST" 1 2>&1)
RC=$?

EXPECTED_ORDER="D: Android VR (cookieless 1080p)
C: mediaconnect (cookieless 1080p)
G: Plain yt-dlp (default)
E: Mobile Web
J: ffmpeg HLS direct (independent path)
H: ytarchive (cookieless, purpose-built for live)
I: streamlink hardened (cookieless, independent codebase)
F: Streamlink (HLS, default flags)
A: Cookies+web_creator (bonus)
B: Cookies+tv_embedded (bonus)"

GOT="$(trying_lines "$OUT")"
if [[ "$GOT" == "$EXPECTED_ORDER" ]]; then
    ok "cascade order + labels match documented D,C,G,E,J,H,I,F,A,B (drift lock)"
else
    bad "cascade order/labels differ"
    diff <(echo "$EXPECTED_ORDER") <(echo "$GOT") | head -10
fi
if [[ "$RC" == "1" ]] && echo "$OUT" | grep -q "All 10 methods failed"; then
    ok "all-methods-fail returns 1 with 'All 10 methods failed'"
else
    bad "all-methods-fail path wrong (rc=$RC)"
fi

# ── TEST 2: fallback — only streamlink works → stops at method I ───────────
reset_work
export MOCK_SUCCEED_TOOL=streamlink
OUT=$(attempt_recording "https://youtu.be/TEST" 1 2>&1)
RC=$?

if [[ "$RC" == "0" ]]; then
    ok "attempt succeeds when streamlink (method I) works"
else
    bad "streamlink-only run failed (rc=$RC)"
fi
if echo "$OUT" | grep -q "✅ Method I: streamlink hardened (cookieless, independent codebase) succeeded"; then
    ok "cascade fell through D,C,G,E,J,H and stopped at I"
else
    bad "cascade did not stop at method I"
fi
if ! echo "$OUT" | grep -q "Trying method F:"; then
    ok "methods after I were not tried"
else
    bad "cascade tried methods after the first success"
fi

# ── TEST 3: first-method success — only yt-dlp works → stops at D ──────────
reset_work
export MOCK_SUCCEED_TOOL=yt-dlp
OUT=$(attempt_recording "https://youtu.be/TEST" 1 2>&1)
RC=$?

if [[ "$RC" == "0" ]] && echo "$OUT" | grep -q "✅ Method D: Android VR (cookieless 1080p) succeeded"; then
    ok "yt-dlp-only run succeeds at method D and stops"
else
    bad "yt-dlp-only run wrong (rc=$RC)"
fi
if ! echo "$OUT" | grep -q "Trying method C:"; then
    ok "cascade stops after first success"
else
    bad "cascade continued past first success"
fi

echo
echo "== cascade test: ${PASS} passed, ${FAIL} failed =="
[[ "$FAIL" == "0" ]]
