#!/usr/bin/env bash
# Cookie-gating contract test.
#
# Methods A, B, D, H, I gate cookie attachment on COOKIE_STATUS in
# {valid, valid_unverified}. The design comment at the top of record-stream.sh
# lists D, C, G, E, J, H, I, F, K as the COOKIELESS methods that "run FIRST,
# fastest path, no cookie risk", and method D's comment explains the rationale:
# stale/rotated cookies can make YouTube reject the request, so a verified-valid
# gate must protect every cookieless path.
#
# Methods E, F, G attach cookies whenever a cookie file exists, ignoring
# COOKIE_STATUS — stale cookies silently poison the cookieless cascade.
#
# This harness mocks the external tools with PATH shims that record the exact
# argv they receive, then asserts:
#   expired/invalid/missing status -> NO cookie flag on any method
#   valid status                   -> cookie flag present on every method
#   valid_unverified status        -> cookie flag present on every method
set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$TEST_DIR/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# ── mock tools: record argv, then fail so the caller returns early ───────────
BIN="$WORK/bin"
mkdir -p "$BIN"
export ARGS_LOG="$WORK/args.log"
for tool in yt-dlp streamlink ytarchive ffmpeg; do
    cat > "$BIN/$tool" <<EOF
#!/usr/bin/env bash
echo "$tool \$*" >> "\$ARGS_LOG"
exit 1
EOF
    chmod +x "$BIN/$tool"
done
export PATH="$BIN:$PATH"

# ── harness env ──────────────────────────────────────────────────────────────
export RECORD_DIR="$WORK/record"
export SEGMENTS_DIR="$WORK/record/segments"
export MAX_RECORD_DURATION=5
export MIN_FILE_SIZE_KB=100
export COOKIES_FILE="$WORK/cookies.txt"
mkdir -p "$SEGMENTS_DIR"
printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1750000000\tCONSENT\tYES\n' > "$COOKIES_FILE"

# shellcheck disable=SC1091
source "$REPO/scripts/utils.sh"
# shellcheck disable=SC1091
source "$REPO/scripts/detect-stream.sh"
# shellcheck disable=SC1091
source "$REPO/scripts/record-stream.sh"
export METHOD_RETRY_DELAY=0

# Run one recording method under a given COOKIE_STATUS; return captured argv.
run_method() {
    local method="$1" status="$2"
    : > "$ARGS_LOG"
    COOKIE_STATUS="$status" "$method" "https://youtu.be/TEST" "$WORK/out.bin" >/dev/null 2>&1
    cat "$ARGS_LOG"
}

cookie_sent() {  # argv -> 0 if a cookie flag is present
    if echo "$1" | grep -qE -- "--cookies|--http-cookie-file"; then return 0; fi
    if echo "$1" | grep -qE -- "(^|[[:space:]])-c([[:space:]]|$)"; then return 0; fi
    return 1
}

expect_none() {  # method status
    local args
    args="$(run_method "$1" "$2")"
    if cookie_sent "$args"; then
        bad "$1 sends cookies at COOKIE_STATUS=$2: [$args]"
    else
        ok "$1 attaches no cookies at COOKIE_STATUS=$2"
    fi
}

expect_present() {  # method status
    local args
    args="$(run_method "$1" "$2")"
    if cookie_sent "$args"; then
        ok "$1 attaches cookies at COOKIE_STATUS=$2"
    else
        bad "$1 did NOT attach cookies at COOKIE_STATUS=$2: [$args]"
    fi
}

METHODS="record_method_a record_method_b record_method_d record_method_e record_method_f record_method_g record_method_h record_method_i"

echo "== cookie-gating: unverified statuses must not send cookies =="
for status in expired invalid missing; do
    for m in $METHODS; do
        expect_none "$m" "$status"
    done
done

echo
echo "== cookie-gating: verified statuses must send cookies =="
for status in valid valid_unverified; do
    for m in $METHODS; do
        expect_present "$m" "$status"
    done
done

echo
echo "== cookie-gating: ${PASS} passed, ${FAIL} failed =="
[[ "$FAIL" == "0" ]]
