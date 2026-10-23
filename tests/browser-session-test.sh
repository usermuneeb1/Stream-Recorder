#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BROWSER SESSION TEST, SeleniumBase UC bypass plumbing                       ║
# ║                                                                              ║
# ║  No Chrome, no YouTube, no network. Everything external is a PATH shim.      ║
# ║  Locks the behaviour that makes cookieless operation safe:                   ║
# ║                                                                              ║
# ║   1. browser_session.py --selftest (pure cookie/JSON logic)                  ║
# ║   2. browser_assist_mode mapping (auto|first|off|true|false|garbage)         ║
# ║   3. browser_video_id_from_url parsing                                       ║
# ║   4. browser_mint_session adopts the jar as COOKIES_FILE/COOKIE_STATUS       ║
# ║   5. a fresh capture is REUSED (no second Chrome launch)                     ║
# ║   6. a stale capture for a different video is re-captured                    ║
# ║   7. a blocked capture never deletes the jar, but is reported as failure     ║
# ║   8. a broken capture is non-fatal and leaves the previous jar in place       ║
# ║   9. Method K hands the minted jar + UA to yt-dlp                            ║
# ║  10. Method K falls back to ffmpeg with the browser hlsManifestUrl           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$TEST_DIR/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

BIN="$WORK/bin"
mkdir -p "$BIN"

# ── fake python: emulates scripts/browser_session.py output contract ─────────
# FAKE_MODE=ok       → writes cookies.txt + stream.json + browser.env
# FAKE_MODE=blocked  → same, but stream.json says blocked=true
# FAKE_MODE=fail     → exits 4 and writes nothing
cat > "$BIN/fake_python" <<'PYEOF'
#!/usr/bin/env bash
set -u
# `python3 -c "import seleniumbase"` availability probe must succeed so the
# wrapper proceeds to the (faked) capture.
[[ "${1:-}" == "-c" ]] && exit 0
echo x >> "$WORK_INVOCATIONS"
mode="${FAKE_MODE:-ok}"
outdir=""
prev=""
for a in "$@"; do
    [[ "$prev" == "--outdir" ]] && outdir="$a"
    prev="$a"
done
[[ "$mode" == "fail" ]] && exit 4
[[ -z "$outdir" ]] && exit 4
mkdir -p "$outdir"
printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1900000000\tVISITOR_INFO1_LIVE\tabc\n' > "$outdir/cookies.txt"
blocked=false
[[ "$mode" == "blocked" ]] && blocked=true
cat > "$outdir/stream.json" <<JSON
{
  "ok": $([[ "$blocked" == "true" ]] && echo false || echo true),
  "blocked": ${blocked},
  "video_id": "${FAKE_VIDEO_ID:-TESTVIDEO01}",
  "user_agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0",
  "cookie_count": 1,
  "plays": "ok",
  "playability": "OK",
  "is_live": true,
  "hls_manifest_url": "https://manifest.googlevideo.com/api/manifest/hls_variant/TEST.m3u8",
  "dash_manifest_url": "",
  "video_url": "",
  "audio_url": "",
  "captured_at": $(date +%s)
}
JSON
cat > "$outdir/browser.env" <<ENV
BROWSER_SESSION_OK=$([[ "$blocked" == "true" ]] && echo 0 || echo 1)
BROWSER_SESSION_BLOCKED=$([[ "$blocked" == "true" ]] && echo 1 || echo 0)
BROWSER_COOKIES_FILE='$outdir/cookies.txt'
BROWSER_STREAM_JSON='$outdir/stream.json'
BROWSER_UA='Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0.0.0'
BROWSER_IS_LIVE=1
BROWSER_PLAYABILITY='OK'
BROWSER_COOKIE_COUNT=1
ENV
exit 0
PYEOF
chmod +x "$BIN/fake_python"
export WORK_INVOCATIONS="$WORK/invocations.log"
: > "$WORK_INVOCATIONS"

# ── mock yt-dlp: records argv, writes something to the -o path ───────────────
cat > "$BIN/yt-dlp" <<'YEOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$YTDLP_ARGS"
out=""
prev=""
for a in "$@"; do
    [[ "$prev" == "-o" ]] && out="$a"
    prev="$a"
done
[[ -n "$out" ]] && printf 'fake media bytes\n' > "$out"
exit 0
YEOF
chmod +x "$BIN/yt-dlp"

# ── mock ffmpeg: records argv, writes something to the last argument ────────
cat > "$BIN/ffmpeg" <<'FEOF'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FFMPEG_ARGS"
for a in "$@"; do last="$a"; done
[[ -n "${last:-}" && "$last" != -* ]] && printf 'fake media bytes\n' > "$last"
exit 0
FEOF
chmod +x "$BIN/ffmpeg"

export YTDLP_ARGS="$WORK/ytdlp.args"
export FFMPEG_ARGS="$WORK/ffmpeg.args"

# ── harness env ─────────────────────────────────────────────────────────────
export PATH="$BIN:$PATH"
export RECORD_DIR="$WORK/record"
export SEGMENTS_DIR="$WORK/record/segments"
export BROWSER_SESSION_DIR="$WORK/record/browser_session"
export BROWSER_PYTHON="$BIN/fake_python"
export MAX_RECORD_DURATION=20
export METHOD_RETRY_DELAY=0
export CUSTOM_DURATION_MODE=false
mkdir -p "$SEGMENTS_DIR" "$BROWSER_SESSION_DIR"

# browser-session.sh nominally checks for seleniumbase via python3; the shim
# above already answers every call, so pin the real interpreter only when a
# test needs the genuine module.
source "$REPO/scripts/utils.sh"
source "$REPO/scripts/browser-session.sh"

reset_session() {
    rm -rf "$BROWSER_SESSION_DIR" "$WORK/record/method_logs"
    mkdir -p "$BROWSER_SESSION_DIR"
    : > "$WORK/invocations.log"
    unset BROWSER_COOKIES_FILE BROWSER_STREAM_JSON BROWSER_SESSION_OK COOKIE_STATUS 2>/dev/null || true
    : > "$YTDLP_ARGS"
    : > "$FFMPEG_ARGS"
}

# ── TEST 1: the pure Python logic ───────────────────────────────────────────
if python3 "$REPO/scripts/browser_session.py" --selftest > "$WORK/selftest.out" 2>&1; then
    ok "browser_session.py --selftest all pass"
else
    bad "browser_session.py --selftest failed"
    tail -8 "$WORK/selftest.out"
fi
if grep -q "netscape: three rows written" "$WORK/selftest.out"; then
    ok "netscape converter covers httpOnly rows"
else
    bad "netscape converter missing httpOnly rows"
fi

# ── TEST 2: mode mapping ────────────────────────────────────────────────────
check_mode() {
    local input="$1" want="$2"
    local got
    got=$(BROWSER_ASSIST="$input" browser_assist_mode)
    if [[ "$got" == "$want" ]]; then ok "BROWSER_ASSIST='$input' -> $want"
    else bad "BROWSER_ASSIST='$input' -> '$got' (want $want)"; fi
}
check_mode auto auto
check_mode first first
check_mode off off
check_mode true auto
check_mode false off
check_mode "" auto
check_mode nonsense auto

# ── TEST 3: video id parsing ────────────────────────────────────────────────
check_id() {
    local url="$1" want="$2"
    local got
    got=$(browser_video_id_from_url "$url")
    if [[ "$got" == "$want" ]]; then ok "video id: $url -> ${want:-empty}"
    else bad "video id: $url -> '$got' (want '$want')"; fi
}
check_id "https://www.youtube.com/watch?v=dQw4w9WgXcQ" "dQw4w9WgXcQ"
check_id "https://youtu.be/dQw4w9WgXcQ?t=30" "dQw4w9WgXcQ"
check_id "https://www.youtube.com/live/dQw4w9WgXcQ" "dQw4w9WgXcQ"
check_id "https://www.youtube.com/watch?v=short" ""

# ── TEST 4: mint adopts the jar ─────────────────────────────────────────────
reset_session
export FAKE_MODE=ok FAKE_VIDEO_ID=TESTVIDEO01
if browser_mint_session "TESTVIDEO01" > "$WORK/mint.out" 2>&1; then
    ok "browser_mint_session returns 0 on a good capture"
else
    bad "browser_mint_session failed on a good capture"; cat "$WORK/mint.out"
fi
if [[ "${COOKIES_FILE:-}" == "$BROWSER_SESSION_DIR/cookies.txt" && -s "${COOKIES_FILE:-}" ]]; then
    ok "minted jar adopted as COOKIES_FILE"
else
    bad "COOKIES_FILE not pointed at the minted jar ('${COOKIES_FILE:-}')"
fi
if [[ "${COOKIE_STATUS:-}" == "valid_unverified" ]]; then
    ok "COOKIE_STATUS upgraded so cookie methods A/B may run"
else
    bad "COOKIE_STATUS not upgraded ('${COOKIE_STATUS:-}')"
fi

# ── TEST 5: fresh capture is reused, not relaunched ─────────────────────────
: > "$WORK/invocations.log"
browser_mint_session "TESTVIDEO01" > /dev/null 2>&1
if [[ ! -s "$WORK/invocations.log" ]]; then
    ok "fresh capture reused without launching Chrome again"
else
    bad "fresh capture was re-captured ($(wc -l < "$WORK/invocations.log") launches)"
fi

# ── TEST 6: different video id forces a new capture ─────────────────────────
: > "$WORK/invocations.log"
FAKE_VIDEO_ID=OTHERVID002 browser_mint_session "OTHERVID002" > /dev/null 2>&1
if [[ -s "$WORK/invocations.log" ]]; then
    ok "capture for a different video id re-launches the browser"
else
    bad "stale capture for another video was reused"
fi

# ── TEST 7: blocked capture keeps the jar but reports failure ───────────────
reset_session
export FAKE_MODE=blocked
if browser_mint_session "TESTVIDEO01" > "$WORK/blocked.out" 2>&1; then
    bad "blocked capture reported success"
else
    ok "blocked capture returns failure"
fi
if [[ -s "$BROWSER_SESSION_DIR/cookies.txt" ]]; then
    ok "blocked capture leaves the partial jar in place (best effort)"
else
    bad "blocked capture discarded the jar"
fi
if grep -q "bot wall" "$WORK/blocked.out"; then
    ok "blocked capture is logged as a bot wall"
else
    bad "blocked capture log lacks a bot-wall note"
fi

# ── TEST 8: broken capture is non-fatal, previous jar preserved ─────────────
reset_session
export FAKE_MODE=ok
COOKIES_FILE="$WORK/operator-cookies.txt"
printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1900000000\tOLD\t1\n' > "$COOKIES_FILE"
export COOKIES_FILE
export FAKE_MODE=fail
if browser_mint_session "TESTVIDEO01" > "$WORK/fail.out" 2>&1; then
    bad "broken capture reported success"
else
    ok "broken capture returns failure (never aborts the recording)"
fi
if [[ "$COOKIES_FILE" == "$WORK/operator-cookies.txt" && -s "$COOKIES_FILE" ]]; then
    ok "operator cookie file untouched after a failed capture"
else
    bad "failed capture clobbered COOKIES_FILE ('$COOKIES_FILE')"
fi
export FAKE_MODE=ok

# ── TEST 9/10: Method K wiring (loads the real recorder) ────────────────────
# shellcheck disable=SC1091
source "$REPO/scripts/record-stream.sh"
export STREAM_VIDEO_ID=TESTVIDEO01

reset_session
export FAKE_MODE=ok BROWSER_ASSIST=auto
record_method_k "https://www.youtube.com/watch?v=TESTVIDEO01" "$SEGMENTS_DIR/k1.mp4" \
    > "$WORK/k1.out" 2>&1
if grep -q -- "--cookies" "$YTDLP_ARGS" && grep -q "$BROWSER_SESSION_DIR/cookies.txt" "$YTDLP_ARGS"; then
    ok "Method K feeds the minted jar to yt-dlp"
else
    bad "Method K did not pass --cookies to yt-dlp"; head -5 "$YTDLP_ARGS"
fi
if grep -q -- "--user-agent" "$YTDLP_ARGS" && grep -q "Chrome/140" "$YTDLP_ARGS"; then
    ok "Method K reuses the browser's own User-Agent"
else
    bad "Method K did not pass the browser UA"
fi

# yt-dlp unavailable → ffmpeg path must use the captured HLS manifest
reset_session
mv "$BIN/yt-dlp" "$BIN/yt-dlp.hidden"
record_method_k "https://www.youtube.com/watch?v=TESTVIDEO01" "$SEGMENTS_DIR/k2.mp4" \
    > "$WORK/k2.out" 2>&1
mv "$BIN/yt-dlp.hidden" "$BIN/yt-dlp"
if grep -q "manifest.googlevideo.com" "$FFMPEG_ARGS"; then
    ok "Method K falls back to ffmpeg with the browser hlsManifestUrl"
else
    bad "Method K did not use the captured HLS manifest"
fi
if grep -q "Chrome/140" "$FFMPEG_ARGS"; then
    ok "ffmpeg manifest pull uses the browser User-Agent"
else
    bad "ffmpeg manifest pull missing -user_agent"
fi

# BROWSER_ASSIST=off must make Method K a no-op
reset_session
export BROWSER_ASSIST=off
if record_method_k "https://www.youtube.com/watch?v=TESTVIDEO01" "$SEGMENTS_DIR/k3.mp4" \
    > "$WORK/k3.out" 2>&1; then
    bad "Method K ran while BROWSER_ASSIST=off"
else
    ok "BROWSER_ASSIST=off disables Method K"
fi
if [[ ! -s "$WORK/invocations.log" ]]; then
    ok "BROWSER_ASSIST=off never launches the browser"
else
    bad "BROWSER_ASSIST=off still launched the browser"
fi
export BROWSER_ASSIST=auto

# ── TEST 11: detection Method 5 ─────────────────────────────────────────────
reset_session
export FAKE_MODE=ok
DETECTED_VIDEO_ID=""
DETECTED_TITLE=""
DETECTED_CHANNEL=""
DETECTED_METHOD=""
DETECTED_URL=""
DETECTED_THUMBNAIL=""
if browser_detect_live "https://www.youtube.com/@TheMuslimLantern/live" > "$WORK/detect.out" 2>&1; then
    ok "browser_detect_live reports a live broadcast"
else
    bad "browser_detect_live failed on a live capture"; tail -6 "$WORK/detect.out"
fi
if [[ "$DETECTED_VIDEO_ID" == "TESTVIDEO01" && "$DETECTED_METHOD" == "Browser (SeleniumBase UC)" ]]; then
    ok "detection Method 5 sets video id + method label"
else
    bad "detection facts wrong (id='$DETECTED_VIDEO_ID' method='$DETECTED_METHOD')"
fi

reset_session
export FAKE_MODE=blocked
if browser_detect_live "https://www.youtube.com/@TheMuslimLantern/live" > /dev/null 2>&1; then
    bad "browser_detect_live claimed live from a blocked capture"
else
    ok "blocked capture never produces a live detection"
fi
export FAKE_MODE=ok

# A capture with no video id must never be reused for a concrete video.
reset_session
mkdir -p "$BROWSER_SESSION_DIR"
printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t1900000000\tV\t1\n' > "$BROWSER_SESSION_DIR/cookies.txt"
printf '{"ok": true, "blocked": false, "video_id": "", "captured_at": %s}\n' "$(date +%s)" > "$BROWSER_SESSION_DIR/stream.json"
if _browser_session_is_fresh "$BROWSER_SESSION_DIR" "TESTVIDEO01"; then
    bad "id-less capture treated as fresh for a concrete video"
else
    ok "id-less capture is not reused for a concrete video"
fi

# ── TEST 12: bot-wall detector (gates detection Method 5) ───────────────────
if _is_botwall_text "Sign in to confirm you're not a bot"; then
    ok "bot-wall detector matches the real interstitial"
else
    bad "bot-wall detector missed the interstitial"
fi
if _is_botwall_text "Our systems have detected unusual traffic from your computer network"; then
    ok "bot-wall detector matches the unusual-traffic page"
else
    bad "bot-wall detector missed unusual traffic"
fi
if _is_botwall_text "The Muslim Lantern is offline"; then
    bad "bot-wall detector false-positives on a normal page"
else
    ok "bot-wall detector ignores normal pages"
fi

echo
echo "== browser session test: ${PASS} passed, ${FAIL} failed =="
[[ "$FAIL" == "0" ]]
