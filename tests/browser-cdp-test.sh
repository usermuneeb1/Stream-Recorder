#!/usr/bin/env bash
# Cookie-free CDP wiring: no jar adoption, no yt-dlp cookie handoff, no stale
# capture reuse after a failed launch, and a hard PUBLIC_STREAM_ONLY contract.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
export WORK
trap 'rm -rf "$WORK"' EXIT
PASS=0; FAIL=0
ok(){ echo "  PASS: $1"; PASS=$((PASS+1)); }
bad(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
mkdir -p "$WORK/bin" "$WORK/record/segments"
export RECORD_DIR="$WORK/record" SEGMENTS_DIR="$WORK/record/segments"
export BROWSER_SESSION_DIR="$WORK/cdp" BROWSER_PYTHON="$WORK/bin/fake-python"
export BROWSER_MODE=cdp BROWSER_ASSIST=first PUBLIC_STREAM_ONLY=true
export MAX_RECORD_DURATION=10 METHOD_RETRY_DELAY=0 CUSTOM_DURATION_MODE=true
export PATH="$WORK/bin:$PATH"
export YTDLP_ARGS="$WORK/ytdlp.args" FFMPEG_ARGS="$WORK/ffmpeg.args" INVOCATIONS="$WORK/invocations"
: > "$YTDLP_ARGS"; : > "$FFMPEG_ARGS"; : > "$INVOCATIONS"

cat > "$BROWSER_PYTHON" <<'PY'
#!/usr/bin/env bash
set -u
[[ "${1:-}" == "-c" ]] && exit 0
outdir=""; prev=""
for a in "$@"; do [[ "$prev" == "--outdir" ]] && outdir="$a"; prev="$a"; done
echo x >> "$INVOCATIONS"
[[ "${FAKE_MODE:-ok}" == "fail" ]] && exit 4
mkdir -p "$outdir"
ok=true; blocked=false
[[ "${FAKE_MODE:-ok}" == "blocked" ]] && { ok=false; blocked=true; }
cat > "$outdir/stream.json" <<JSON
{"ok":$ok,"blocked":$blocked,"mode":"cdp","video_id":"TESTVIDEO01","cookie_count":0,"cookies_file":"","playability":"OK","is_live":true,"hls_manifest_url":"https://manifest.googlevideo.com/live.m3u8","user_agent":"Chrome/153","captured_at":$(date +%s)}
JSON
cat > "$outdir/browser.env" <<ENV
BROWSER_MODE='cdp'
BROWSER_SESSION_OK=$([[ "$ok" == true ]] && echo 1 || echo 0)
BROWSER_COOKIES_FILE=''
BROWSER_COOKIE_COUNT='0'
BROWSER_STREAM_JSON='$outdir/stream.json'
BROWSER_UA='Chrome/153'
ENV
[[ "$ok" == true ]] && exit 0
exit 2
PY
chmod +x "$BROWSER_PYTHON"
cat > "$WORK/bin/yt-dlp" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$YTDLP_ARGS"
exit 1
SH
cat > "$WORK/bin/ffmpeg" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$FFMPEG_ARGS"
for a in "$@"; do last="$a"; done
printf 'media' > "$last"
SH
cat > "$WORK/bin/streamlink" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$WORK/method.args"
exit 1
SH
cat > "$WORK/bin/ytarchive" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "$@" > "$WORK/method.args"
exit 1
SH
# Replace the two log-only mocks with per-method argv capture as well.
sed -i 's@> "$YTDLP_ARGS"@| tee "$YTDLP_ARGS" > "$WORK/method.args"@' "$WORK/bin/yt-dlp"
sed -i 's@> "$FFMPEG_ARGS"@| tee "$FFMPEG_ARGS" > "$WORK/method.args"@' "$WORK/bin/ffmpeg"
chmod +x "$WORK/bin/yt-dlp" "$WORK/bin/ffmpeg" "$WORK/bin/streamlink" "$WORK/bin/ytarchive"
# shellcheck disable=SC1091
source "$ROOT/scripts/utils.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/record-stream.sh"

export COOKIES_FILE="$WORK/operator-cookies.txt" COOKIE_STATUS=valid
printf 'operator-secret\n' > "$COOKIES_FILE"
if browser_mint_session TESTVIDEO01 >"$WORK/mint.log" 2>&1; then ok "CDP capture succeeds"; else bad "CDP capture failed"; cat "$WORK/mint.log"; fi
[[ "$COOKIES_FILE" == "$WORK/operator-cookies.txt" && "$COOKIE_STATUS" == valid ]] && ok "operator cookie pointer/status untouched" || bad "CDP adopted operator cookies"
[[ -z "${BROWSER_COOKIES_FILE:-}" && "${BROWSER_COOKIE_COUNT:-0}" == 0 && ! -e "$BROWSER_SESSION_DIR/cookies.txt" ]] && ok "no cookie jar exported" || bad "CDP exported/pointed at a jar"
record_method_k "https://www.youtube.com/watch?v=TESTVIDEO01" "$WORK/k.mp4" >"$WORK/k.log" 2>&1
[[ ! -s "$YTDLP_ARGS" ]] && ok "CDP Method K never invokes yt-dlp" || bad "CDP invoked yt-dlp"
grep -q 'manifest.googlevideo.com' "$FFMPEG_ARGS" && ok "CDP Method K records captured manifest with ffmpeg" || bad "manifest missing from ffmpeg argv"
if grep -Eq -- '--cookies|--http-cookie-file|operator-cookies' "$FFMPEG_ARGS"; then bad "cookie argument reached ffmpeg"; else ok "no cookie argument reaches ffmpeg"; fi

# A failed launch must not reuse an older successful stream.json.
export BROWSER_SESSION_MAX_AGE=0
: > "$INVOCATIONS"; export FAKE_MODE=fail
if browser_mint_session TESTVIDEO01 >"$WORK/fail.log" 2>&1; then bad "failed CDP launch reused stale success"; else ok "failed CDP launch rejects stale success"; fi
[[ -s "$INVOCATIONS" ]] && ok "stale capture forced a new launch" || bad "stale capture skipped launch"
[[ "$COOKIES_FILE" == "$WORK/operator-cookies.txt" ]] && ok "failed CDP launch preserves operator jar" || bad "failed CDP launch changed operator jar"
[[ "${BROWSER_SESSION_OK:-0}" == 0 && -z "${BROWSER_STREAM_JSON:-}" ]] && ok "failed CDP launch clears stale success facts" || bad "failed CDP launch left stale success facts"

export FAKE_MODE=blocked
if browser_mint_session TESTVIDEO01 >"$WORK/blocked.log" 2>&1; then bad "blocked CDP page counted as success"; else ok "blocked CDP page is a failure"; fi

# Strict public mode must suppress cookies even when a valid operator jar exists.
export COOKIE_STATUS=valid
for method in record_method_d record_method_e record_method_f record_method_g record_method_h record_method_i; do
    : > "$WORK/method.args"
    "$method" "https://youtu.be/TESTVIDEO01" "$WORK/strict.mp4" >"$WORK/strict.log" 2>&1 || true
    if grep -Eq -- '--cookies|--http-cookie-file|(^|[[:space:]])-c([[:space:]]|$)|operator-cookies' "$WORK/method.args"; then bad "$method sent cookies in PUBLIC_STREAM_ONLY"; else ok "$method sent no cookies in PUBLIC_STREAM_ONLY"; fi
done

echo
echo "== CDP wiring test: $PASS passed, $FAIL failed =="
if (( FAIL > 0 )); then for f in "$WORK/k.log" "$WORK/fail.log" "$WORK/blocked.log" "$FFMPEG_ARGS"; do echo "--- $f"; cat "$f" 2>/dev/null || true; done; fi
[[ "$FAIL" == 0 ]]
