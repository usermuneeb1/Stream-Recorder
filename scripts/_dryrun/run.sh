#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  DRY-RUN HARNESS — exercises the full recording pipeline with mocked     ║
# ║  external tools, catching runtime crashes / set -u errors / broken       ║
# ║  handoffs between GitHub Actions steps. Does NOT touch the network.       ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -uo pipefail
REPO="/home/user/Stream-Recorder"
BIN="$REPO/scripts/_dryrun/bin"
export PATH="$BIN:$PATH"

TMP="$(mktemp -d)"
export GITHUB_OUTPUT="$TMP/out.txt"; : > "$GITHUB_OUTPUT"
export GITHUB_ENV="$TMP/env.txt"; : > "$GITHUB_ENV"
export GITHUB_STEP_SUMMARY="$TMP/summary.md"; : > "$GITHUB_STEP_SUMMARY"
export GITHUB_REPOSITORY="usermuneeb1/Stream-Recorder"
export GH_PAT="dummy"   # dry-run only — exercises the GitHub-API write paths via the mocked curl
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
export MEGA_SKIP="true"   # needs real megatools + account; not testable here
export TELEGRAM_BOT_TOKEN="dummy"; export TELEGRAM_CHAT_ID="dummy"
export LIFETIME_TOTAL_STREAMS=10; export LIFETIME_TOTAL_HOURS=20; export LIFETIME_TOTAL_GB=5
export LIFETIME_AVG_DURATION=7200

import_env() {
  [[ -f "$GITHUB_ENV" ]] || return 0
  while IFS='=' read -r k v; do
    [[ -z "$k" || "$k" == *"<<"* ]] && continue
    [[ "$k" == GITHUB_* || "$k" == RUNNER_* || "$k" == "PATH" ]] && continue
    export "$k=$v" 2>/dev/null || true
  done < "$GITHUB_ENV"
}

run_step() {
  local name="$1"; shift
  echo ""
  echo "════════ STEP: $name ════════"
  bash "$@"
  local rc=$?
  import_env
  if [[ $rc -eq 0 ]]; then echo "✅ $name -> exit 0"; else echo "❌ $name -> exit $rc"; fi
  return $rc
}

overall=0
run_step "check-cookies" "$REPO/scripts/check-cookies.sh" || overall=1
run_step "detect-stream" "$REPO/scripts/detect-stream.sh" || overall=1

echo ""
echo "════════ STEP: notify-live-detected (Discord 🔴 LIVE alert) ════════"
( cd "$REPO"; source scripts/utils.sh; source scripts/discord-notify.sh; notify_live_detected )
ld_rc=$?
if [[ $ld_rc -eq 0 ]]; then echo "✅ notify-live-detected -> exit 0"; else echo "❌ notify-live-detected -> exit $ld_rc"; overall=1; fi

run_step "record-stream" "$REPO/scripts/record-stream.sh" || overall=1
run_step "post-process"  "$REPO/scripts/post-process.sh"  || overall=1
run_step "upload-clouds" "$REPO/scripts/upload-clouds.sh" || overall=1
run_step "update-stats"  "$REPO/scripts/update-stats.sh"  || overall=1
run_step "update-links"  "$REPO/scripts/update-links.sh"  || overall=1

echo ""
echo "════════ Discord notify (sourced function) ════════"
( cd "$REPO"; source scripts/discord-notify.sh; notify_recording_complete )
disc_rc=$?
import_env
[[ $disc_rc -eq 0 ]] && echo "✅ discord-notify -> exit 0" || { echo "❌ discord-notify -> exit $disc_rc"; overall=1; }

echo ""
echo "════════ SUMMARY ════════"
echo "TMP dir (inspectable): $TMP"
echo "--- key env produced by pipeline ---"
grep -E 'PROCESSED_FILES_LIST|GOFILE_LINKS|PIXELDRAIN_LINKS|MEGA_LINKS|ARCHIVE_LINKS|RECORDING_SUCCESS|RECORD_PARTS|UPLOAD_SUCCESS_COUNT|COOKIE_STATUS' "$GITHUB_ENV" 2>/dev/null
echo "--- rec dir contents ---"
ls -la "$RECORD_DIR" 2>/dev/null | sed 's/^/  /'
echo ""
if [[ $overall -eq 0 ]]; then echo "🎉 DRY-RUN RESULT: NO CRASHES (all steps exited 0)"; else echo "⚠️  DRY-RUN RESULT: one or more steps non-zero"; fi
