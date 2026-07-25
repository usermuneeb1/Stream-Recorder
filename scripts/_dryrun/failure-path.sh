#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  FAILURE-PATH DRY-RUN HARNESS                                            ║
# ║                                                                          ║
# ║  Proves the recorder DEGRADES GRACEFULLY when every recording method      ║
# ║  fails:                                                                  ║
# ║    1. validate_recorded_file() unit checks (H1 fix):                    ║
# ║         • a too-small file is REJECTED                                  ║
# ║         • a playable 20 MB file is ACCEPTED (via is_valid_video)         ║
# ║    2. record_stream() with ALL 10 methods + 6 VOD-rescue methods failing ║
# ║       → sets RECORDING_SUCCESS=false, dumps diagnostics, returns non-zero ║
# ║         WITHOUT crashing (no set -u / broken-handoff errors).            ║
# ║    3. notify_recording_failed() fires without crashing.                 ║
# ║                                                                          ║
# ║  Uses the real failing recording mocks (bin_fail) + the shared working    ║
# ║  mocks (bin) for curl/ffprobe/ffmpeg/etc. Does NOT touch the network.    ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -uo pipefail
REPO="/home/user/Stream-Recorder"
BIN_FAIL="$REPO/scripts/_dryrun/bin_fail"
BIN="$REPO/scripts/_dryrun/bin"
# Failing recording tools first; shared working mocks provide curl/ffprobe/etc.
export PATH="$BIN_FAIL:$BIN:$PATH"

TMP="$(mktemp -d)"
export GITHUB_OUTPUT="$TMP/out.txt"; : > "$GITHUB_OUTPUT"
export GITHUB_ENV="$TMP/env.txt"; : > "$GITHUB_ENV"
export GITHUB_STEP_SUMMARY="$TMP/summary.md"; : > "$GITHUB_STEP_SUMMARY"
export GITHUB_REPOSITORY="usermuneeb1/Stream-Recorder"
export GITHUB_RUN_ID="12345"; export GITHUB_SHA="abc123def456"; export GITHUB_ACTOR="ci-bot"
export GITHUB_WORKSPACE="$REPO"; export RUNNER_TEMP="$TMP"; export GITHUB_SERVER_URL="https://github.com"

export RECORD_DIR="$TMP/rec"; mkdir -p "$RECORD_DIR"
export COOKIES_FILE="$TMP/cookies.txt"
printf '*.youtube.com\tTRUE\t/\tFALSE\t9999999999\tSID\txxx\n' > "$COOKIES_FILE"

export DEFAULT_CHANNEL_HANDLE="@TheMuslimLantern"
export CHANNEL_DISPLAY_NAME="The Muslim Lantern"
export YOUTUBE_CHANNEL_ID="@TheMuslimLantern"
export WARP_CONNECTED="true"; export WARP_IP="203.0.113.5"; export ORIGINAL_IP="198.51.100.1"
export MAX_RECORD_ATTEMPTS=1; export MAX_RECORD_DURATION=10
export KEEP_WHOLE_FILE="true"; export CUSTOM_DURATION_MODE="false"; export PUBLIC_STREAM_ONLY="false"
export METHOD_RETRY_DELAY=0
export STREAM_URL="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
export STREAM_VIDEO_ID="dQw4w9WgXcQ"; export STREAM_TITLE="Test Live Stream"
export RECORDER_NAME="Stream Recorder"; export RECORDER_VERSION="6.0.0"
export AVATAR_URL="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"
export DISK_SPACE_GB="50"; export MIN_DISK_SPACE_GB="3"
export DISCORD_WEBHOOK_URL="https://discord.example/x"
export DISCORD_WEBHOOK_ALERTS="https://discord.example/a"
export DISCORD_WEBHOOK_LINKS="https://discord.example/l"
export DISCORD_WEBHOOK_RECORDINGS="https://discord.example/r"
export DISCORD_WEBHOOK_REFRESH="https://discord.example/f"
export DISCORD_WEBHOOK_REPORTS="https://discord.example/p"
export DASHBOARD_URL="https://example.com"; export BOT_USERNAME="Bot"
export GOFILE_API_KEY="dummy"; export PIXELDRAIN_API_KEY="dummy"
export ARCHIVE_ACCESS_KEY="dummy"; export ARCHIVE_SECRET_KEY="dummy"
export MEGA_SKIP="true"
export TELEGRAM_BOT_TOKEN="dummy"; export TELEGRAM_CHAT_ID="dummy"

# ── Override liveness so the 30-iteration × 60s VOD wait loop breaks at once ──
is_stream_still_live() { return 0; }   # always report "still live" → VOD wait breaks fast

# ── Source libs (entry guards prevent auto-run of detect/record main()) ───────
# shellcheck source=../utils.sh
source "$REPO/scripts/utils.sh"
# shellcheck source=../detect-stream.sh
source "$REPO/scripts/detect-stream.sh"
# shellcheck source=../record-stream.sh
source "$REPO/scripts/record-stream.sh"
# Re-assert override (detect-stream.sh defines its own is_stream_still_live)
is_stream_still_live() { return 0; }

pass=0; fail=0
check() { if [[ "$1" == "0" ]]; then echo "  ✅ PASS: $2"; ((pass++)); else echo "  ❌ FAIL: $2"; ((fail++)); fi; }

echo ""
echo "════════ FAILURE-PATH: validate_recorded_file unit checks (H1) ════════"
# (a) tiny file → rejected
printf 'x%.0s' {1..1000} > "$TMP/tiny.mp4"   # ~1 KB
if validate_recorded_file "$TMP/tiny.mp4" >/dev/null 2>&1; then
  check 1 "tiny (~1KB) file should be REJECTED"
else
  check 0 "tiny (~1KB) file REJECTED"
fi
# (b) playable 20 MB file → accepted via is_valid_video (mock ffprobe)
head -c 20000000 /dev/zero > "$TMP/good.mp4"
if validate_recorded_file "$TMP/good.mp4" >/dev/null 2>&1; then
  check 0 "playable 20MB file ACCEPTED (via is_valid_video)"
else
  check 1 "playable 20MB file should be ACCEPTED"
fi

echo ""
echo "════════ FAILURE-PATH: record_stream() with ALL methods failing ════════"
record_stream
rs_rc=$?
echo "  record_stream exit code: $rs_rc"
if grep -q '^RECORDING_SUCCESS=false$' "$GITHUB_ENV"; then
  check 0 "RECORDING_SUCCESS=false exported to \$GITHUB_ENV"
else
  check 1 "RECORDING_SUCCESS=false should be set in \$GITHUB_ENV (got: $(grep RECORDING_SUCCESS "$GITHUB_ENV" 2>/dev/null))"
fi

echo ""
echo "════════ FAILURE-PATH: notify_recording_failed() (must not crash) ════════"
# shellcheck source=../discord-notify.sh
source "$REPO/scripts/discord-notify.sh"
notify_recording_failed "dry-run-failure" "Test Live Stream"
nf_rc=$?
echo "  notify_recording_failed exit code: $nf_rc"
check "$nf_rc" "notify_recording_failed exited 0 (no crash)"

echo ""
echo "════════ FAILURE-PATH SUMMARY ════════"
echo "  record_stream rc=$rs_rc | notify_recording_failed rc=$nf_rc"
if [[ $rs_rc -ne 0 && $nf_rc -eq 0 ]]; then
  echo "🎉 FAILURE-PATH RESULT: graceful degradation confirmed — recording failure did NOT crash the pipeline, and the failure notification fired cleanly."
else
  echo "⚠️  FAILURE-PATH RESULT: unexpected outcome (record rc=$rs_rc, notify rc=$nf_rc)."
fi
echo "  unit checks passed: $pass | failed: $fail"
echo "  inspectables: $TMP"
