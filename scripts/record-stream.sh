#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — BULLETPROOF RECORDING ENGINE                          ║
# ║  6-method, 3-attempt approach to guarantee successful recording.            ║
# ║  Methods: web → tv → ios → android_vr → mweb → streamlink                ║
# ║  Each attempt checks if stream is still live before retrying.              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"
source "$SCRIPT_DIR/detect-stream.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

RECORD_DIR="${RECORD_DIR:-/tmp/stream-recorder}"
SEGMENTS_DIR="${RECORD_DIR}/segments"
COOKIES_FILE="${COOKIES_FILE:-cookies.txt}"
RECORDED_FILES=()
RECORDING_SUCCESS=false

# v4: per-method failure log so Discord notification can tell us WHY each method failed
mkdir -p "${RECORD_DIR}/method_logs"
METHOD_FAILURE_LOG="${RECORD_DIR}/method_logs/failures.log"
: > "$METHOD_FAILURE_LOG"
_log_method_failure() {
  local method_name="$1"
  local status="$2"
  local video_url="$3"
  local output_file="$4"
  local last_err="${5:-}"
  {
    echo "==== ${method_name} FAILED at $(now_pkt) ===="
    echo "Status: ${status}"
    echo "URL: ${video_url}"
    echo "Output: ${output_file}"
    echo "--- last stderr ---"
    echo "${last_err}"
    echo ""
  } >> "$METHOD_FAILURE_LOG" 2>/dev/null || true
}
export -f _log_method_failure

# Custom duration mode: when set, we record from "now" (no --live-from-start)
# so the timeout produces a file of approximately the requested length.
CUSTOM_DURATION_MODE="${CUSTOM_DURATION_MODE:-false}"

# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC_STREAM_ONLY (default: false — HYBRID mode)
#   Set to "true" only if you NEVER want cookie-based methods to run.
#
#   HYBRID MODE (the default):
#     • Cookieless methods (H ytarchive, I streamlink, D androidvr, C
#       mediaconnect, G/E/F) run FIRST — fastest path, no cookie risk.
#     • Cookie-based methods (A web_creator, B tv_embedded) run as a
#       fallback if the cookieless methods all bail. This is what catches
#       sign-in-required / age-restricted / membership streams.
#     • Stale cookies can't break a public-stream recording (cookieless
#       runs first), but valid cookies rescue a LOGIN_REQUIRED stream
#       that would otherwise be missed (real failure on 2026-06-27 with
#       stream WOqZf9Myz_c).
#
#   PURE COOKIELESS (PUBLIC_STREAM_ONLY=true):
#     • Methods A/B + VOD-rescue cookie fallback all skipped
#     • Recommended only if you're certain ALL streams will be fully public
# ─────────────────────────────────────────────────────────────────────────────
PUBLIC_STREAM_ONLY="${PUBLIC_STREAM_ONLY:-false}"

# ═══════════════════════════════════════════════════════════════════════════════
# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD A: Cookies + web_creator Player
#  web_creator bypasses the n-challenge that blocks the regular 'web' client
# ═══════════════════════════════════════════════════════════════════════════════

record_method_a() {
    local video_url="$1"
    local output_file="$2"
    local user_agent
    user_agent=$(rotate_user_agent)
    
    log_info "  Method A: Cookies + web_creator player"

    # Permanent cookieless mode for public streams
    if [[ "${PUBLIC_STREAM_ONLY:-false}" == "true" ]]; then
        log_info "  Method A: Skipped (PUBLIC_STREAM_ONLY=true — cookieless permanent mode)"
        return 1
    fi

    # Skip if cookies are expired or missing
    if [[ "${COOKIE_STATUS:-}" == "expired" ]]; then
        log_warn "  Method A: Cookies expired — skipping"
        return 1
    fi
    
    if [[ ! -f "$COOKIES_FILE" ]] || [[ ! -s "$COOKIES_FILE" ]]; then
        log_warn "  Method A: No cookies file — skipping"
        return 1
    fi
    
    local live_start_flag="--live-from-start"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && live_start_flag=""
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --cookies "$COOKIES_FILE" \
        --extractor-args "youtube:player_client=web_creator" \
        --user-agent "$user_agent" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        $live_start_flag \
        --concurrent-fragments "${CONCURRENT_FRAGMENTS:-4}" \
        --fixup never \
        -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD B: Cookies + tv_embedded Player
#  Embedded TV player — bypasses n-challenge and most bot detection
# ═══════════════════════════════════════════════════════════════════════════════

record_method_b() {
    local video_url="$1"
    local output_file="$2"
    local user_agent
    user_agent=$(rotate_user_agent)
    
    log_info "  Method B: Cookies + tv_embedded player"

    # Permanent cookieless mode for public streams
    if [[ "${PUBLIC_STREAM_ONLY:-false}" == "true" ]]; then
        log_info "  Method B: Skipped (PUBLIC_STREAM_ONLY=true — cookieless permanent mode)"
        return 1
    fi

    if [[ "${COOKIE_STATUS:-}" == "expired" ]]; then
        log_warn "  Method B: Cookies expired — skipping"
        return 1
    fi
    
    if [[ ! -f "$COOKIES_FILE" ]] || [[ ! -s "$COOKIES_FILE" ]]; then
        log_warn "  Method B: No cookies file — skipping"
        return 1
    fi
    
    local live_start_flag="--live-from-start"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && live_start_flag=""
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --cookies "$COOKIES_FILE" \
        --extractor-args "youtube:player_client=tv_embedded" \
        --user-agent "$user_agent" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        $live_start_flag \
        --concurrent-fragments "${CONCURRENT_FRAGMENTS:-4}" \
        --fixup never \
        -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD C: mediaconnect Player (No Cookies)
#  Newer YouTube client — no PO token required (unlike ios)
# ═══════════════════════════════════════════════════════════════════════════════

record_method_c() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method C: mediaconnect player (no cookies)"
    
    local live_start_flag="--live-from-start"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && live_start_flag=""
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        --extractor-args "youtube:player_client=mediaconnect" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        $live_start_flag \
        --concurrent-fragments "${CONCURRENT_FRAGMENTS:-4}" \
        --fixup never \
        -f "bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD D: Android VR Player (PROVEN WORKING)
#  Bypasses n-challenge entirely — most reliable as of May 2026
# ═══════════════════════════════════════════════════════════════════════════════

record_method_d() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method D: Android VR player (cookieless 1080p — primary)"
    
    local live_start_flag="--live-from-start"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && live_start_flag=""
    
    # Option C: this primary method is DELIBERATELY COOKIELESS. android_vr returns
    # full 1080p without cookies (verified 2026-06-14), and passing STALE/rotated
    # cookies here can actually make YouTube reject the request. Only attach
    # cookies if they are verified-valid; otherwise run clean cookieless so a bad
    # cookie file can never block a public-stream recording.
    local -a cookies_args=()
    if [[ "${COOKIE_STATUS:-}" == "valid" || "${COOKIE_STATUS:-}" == "valid_unverified" ]] && [[ -f "${COOKIES_FILE:-cookies.txt}" ]] && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
        cookies_args=(--cookies "${COOKIES_FILE:-cookies.txt}")
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        "${cookies_args[@]}" \
        --extractor-args "youtube:player_client=android_vr" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        $live_start_flag \
        --concurrent-fragments "${CONCURRENT_FRAGMENTS:-4}" \
        --fixup never \
        -f "bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD E: Mobile Web Player
#  mweb client with mobile user-agent — minimal bot detection
# ═══════════════════════════════════════════════════════════════════════════════

record_method_e() {
    local video_url="$1"
    local output_file="$2"
    local mobile_ua="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
    
    log_info "  Method E: Mobile web player (mweb)"
    
    local live_start_flag="--live-from-start"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && live_start_flag=""
    
    local -a cookies_args=()
    if [[ -f "${COOKIES_FILE:-cookies.txt}" ]] && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
        cookies_args=(--cookies "${COOKIES_FILE:-cookies.txt}")
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        "${cookies_args[@]}" \
        --extractor-args "youtube:player_client=mweb" \
        --user-agent "$mobile_ua" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        $live_start_flag \
        --concurrent-fragments "${CONCURRENT_FRAGMENTS:-4}" \
        --fixup never \
        -f "bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD F: Streamlink (Completely Different Tool)
#  Uses HLS directly, bypasses yt-dlp entirely — different codebase
# ═══════════════════════════════════════════════════════════════════════════════

record_method_f() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method F: Streamlink (HLS direct)"
    
    if ! command -v streamlink &>/dev/null; then
        log_warn "  Method F: streamlink not installed — skipping"
        return 1
    fi
    
    local restart_flag="--hls-live-restart"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && restart_flag=""
    
    # Use cookies with streamlink if available
    local -a cookies_args=()
    if [[ -f "${COOKIES_FILE:-cookies.txt}" ]] && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
        cookies_args=(--http-cookie-file "${COOKIES_FILE:-cookies.txt}")
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" streamlink \
        "${cookies_args[@]}" \
        --output "$output_file" \
        --force \
        --stream-segment-threads 3 \
        $restart_flag \
        "$video_url" best 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD G: Plain yt-dlp (Default — No Player Override)
#  Lets yt-dlp auto-select the best client. Most reliable general method.
#  This is what "yt-dlp JSON Dump" detection method uses internally.
# ═══════════════════════════════════════════════════════════════════════════════

record_method_g() {
    local video_url="$1"
    local output_file="$2"
    
    log_info "  Method G: Plain yt-dlp (default auto-select)"
    
    local live_start_flag="--live-from-start"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && live_start_flag=""
    
    local -a cookies_args=()
    if [[ -f "${COOKIES_FILE:-cookies.txt}" ]] && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
        cookies_args=(--cookies "${COOKIES_FILE:-cookies.txt}")
    fi
    
    timeout "${MAX_RECORD_DURATION:-18000}" yt-dlp \
        "${cookies_args[@]}" \
        --no-part \
        --no-continue \
        --no-check-certificates \
        $live_start_flag \
        --concurrent-fragments "${CONCURRENT_FRAGMENTS:-4}" \
        --fixup never \
        -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$output_file" \
        "$video_url" 2>&1 | tail -5
    
    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# ═══════════════════════════════════════════════════════════════════════════════
#  FILE VALIDATOR — Check if recorded file is valid
# ═══════════════════════════════════════════════════════════════════════════════

validate_recorded_file() {
    local output_base="$1"
    local min_size="${MIN_FILE_SIZE_KB:-100}"
    local min_bytes=$(( min_size * 1024 ))
    
    # Search for any output file (yt-dlp may add extensions)
    local found_file=""
    local extensions=("mp4" "webm" "mkv" "ts" "m4a" "flv" "part")
    
    # First check the exact file
    if [[ -f "$output_base" ]]; then
        local size
        size=$(get_file_size "$output_base")
        if (( size >= min_bytes )); then
            found_file="$output_base"
        else
            log_warn "  File too small ($(format_size "$size")): $output_base" >&2
            rm -f "$output_base"
        fi
    fi
    
    # Check with various extensions
    if [[ -z "$found_file" ]]; then
        for ext in "${extensions[@]}"; do
            local check_file="${output_base%.mp4}.${ext}"
            [[ "$check_file" == "$output_base" ]] && continue
            
            if [[ -f "$check_file" ]]; then
                local size
                size=$(get_file_size "$check_file")
                if (( size >= min_bytes )); then
                    found_file="$check_file"
                    break
                else
                    log_warn "  File too small ($(format_size "$size")): $check_file" >&2
                    rm -f "$check_file"
                fi
            fi
        done
    fi
    
    # Also check for files in the same directory matching the pattern
    if [[ -z "$found_file" ]]; then
        local dir
        dir=$(dirname "$output_base")
        local base
        base=$(basename "$output_base" .mp4)
        
        while IFS= read -r f; do
            if [[ -f "$f" ]]; then
                local size
                size=$(get_file_size "$f")
                if (( size >= min_bytes )); then
                    found_file="$f"
                    break
                fi
            fi
        done < <(find "$dir" -maxdepth 1 -name "${base}*" -type f 2>/dev/null | sort -r)
    fi
    
    if [[ -n "$found_file" ]]; then
        local final_size
        final_size=$(get_file_size "$found_file")
        log_ok "  Valid recording found: $(basename "$found_file") ($(format_size "$final_size"))" >&2
        echo "$found_file"
        return 0
    fi
    
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING ATTEMPT — Tries all 7 methods in sequence
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
# APPEND-ONLY snippet — paste at the END of scripts/record-stream.sh, BEFORE
# the `attempt_recording()` function definition (around line 392). Nothing
# above this line gets touched.
#
# Adds two new recording methods:
#   H: ytarchive  — purpose-built YouTube live stream archiver, separate codebase
#   I: streamlink (hardened) — independent of yt-dlp, with PoToken-aware retries
#
# Also defines _pot_args() — a helper that returns yt-dlp PoToken provider args
# if the local PoToken provider is running, or empty array otherwise.
# Existing methods can opt-in by adding "" to their yt-dlp call.
# ═══════════════════════════════════════════════════════════════════════════════


# ── PoToken provider helper ─────────────────────────────────────────────────
# Returns extractor-args that route yt-dlp through the local bgutil PoToken
# HTTP service if it is reachable. Safe to call when the service isn't running
# — it returns an empty array and yt-dlp behaves exactly as before.
_pot_args() {
    local -n _out=$1
    _out=()
    # Check multiple times with longer timeout
    for _ in 1 2; do
        if curl -fsS --max-time 3 "http://127.0.0.1:4416/ping" >/dev/null 2>&1; then
            _out=(--extractor-args "youtube:pot_provider=http://127.0.0.1:4416")
            return
        fi
        sleep 1
    done
}


# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD H: ytarchive (PURPOSE-BUILT FOR YOUTUBE LIVE)
#  Independent Go binary, not yt-dlp. Holds the live connection through ad
#  rolls, handles fragment re-fetch, and uses its own client signature.
#  Most reliable single tool for live streams as of 2026.
# ═══════════════════════════════════════════════════════════════════════════════

record_method_h() {
    local video_url="$1"
    local output_file="$2"

    log_info "  Method H: ytarchive (cookieless, purpose-built for live)"

    if ! command -v ytarchive &>/dev/null; then
        log_warn "  Method H: ytarchive not installed — skipping"
        return 1
    fi

    # ytarchive writes to <output>.<ext>, so strip the .mp4 we were given
    local base="${output_file%.mp4}"

    # Optional cookies — only if verified valid (matches method D's logic)
    local -a cookies_args=()
    if [[ "${COOKIE_STATUS:-}" == "valid" || "${COOKIE_STATUS:-}" == "valid_unverified" ]] \
        && [[ -f "${COOKIES_FILE:-cookies.txt}" ]] \
        && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
        cookies_args=(-c "${COOKIES_FILE:-cookies.txt}")
    fi

    local wait_flag="--wait"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && wait_flag=""

    timeout "${MAX_RECORD_DURATION:-18000}" ytarchive \
        "${cookies_args[@]}" \
        --threads 4 \
        --merge \
        --no-frag-files \
        --retry-stream 30 \
        $wait_flag \
        --output "$base" \
        "$video_url" best 2>&1 | tail -10

    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0

    # ytarchive sometimes writes to <base>.mp4 directly, sometimes to
    # <base>.f<itag>.mp4 — try to find what it actually produced.
    if [[ ! -f "$output_file" ]]; then
        local produced
        produced=$(ls -1t "${base}".* 2>/dev/null | grep -E '\.(mp4|mkv|ts|webm)$' | head -1 || true)
        [[ -n "$produced" && -f "$produced" ]] && mv "$produced" "$output_file"
    fi

    return "$status"
}


# ═══════════════════════════════════════════════════════════════════════════════
#  RECORDING METHOD I: streamlink (HARDENED — DIFFERENT FROM EXISTING METHOD F)
#  Independent of yt-dlp. Hardened retry flags to survive longer outages, and
#  uses ffmpeg for the final mux so we get a clean MP4 with faststart.
#  Method F already uses streamlink but with default flags — this is the
#  "give it everything" variant for when F's defaults aren't enough.
# ═══════════════════════════════════════════════════════════════════════════════

record_method_i() {
    local video_url="$1"
    local output_file="$2"

    log_info "  Method I: streamlink (hardened retry, independent codebase)"

    if ! command -v streamlink &>/dev/null; then
        log_warn "  Method I: streamlink not installed — skipping"
        return 1
    fi

    local -a cookies_args=()
    if [[ "${COOKIE_STATUS:-}" == "valid" || "${COOKIE_STATUS:-}" == "valid_unverified" ]] \
        && [[ -f "${COOKIES_FILE:-cookies.txt}" ]] \
        && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
        cookies_args=(--http-cookie-file "${COOKIES_FILE:-cookies.txt}")
    fi

    local restart_flag="--hls-live-restart"
    [[ "$CUSTOM_DURATION_MODE" == "true" ]] && restart_flag=""

    timeout "${MAX_RECORD_DURATION:-18000}" streamlink \
        "${cookies_args[@]}" \
        $restart_flag \
        --hls-segment-threads 4 \
        --hls-playlist-reload-attempts 10 \
        --hls-playlist-reload-time 2 \
        --hls-segment-attempts 10 \
        --hls-segment-timeout 30 \
        --retry-streams 5 \
        --retry-max 10 \
        --retry-open 3 \
        --stream-timeout 60 \
        --ffmpeg-fout mp4 \
        --ffmpeg-copyts \
        -o "$output_file" \
        --force \
        "$video_url" best 2>&1 | tail -10

    local status=${PIPESTATUS[0]}
    [[ "$status" == "124" ]] && return 0
    return "$status"
}

# v4: RECORDING METHOD J — ffmpeg HLS direct (independent path)
# Resolves the HLS manifest URL via yt-dlp --get-url, then hands it to ffmpeg.
# Catches cases where yt-dlp internal downloader hits n-challenge but ffmpeg
# can still read the manifest.
record_method_j() {
  local video_url="$1"
  local output_file="$2"

  log_info " Method J: ffmpeg HLS direct (independent path)"

  if ! command -v ffmpeg &>/dev/null; then
    log_warn " Method J: ffmpeg not installed — skipping"
    return 1
  fi

  local err_log="${RECORD_DIR}/method_logs/last_err.log"
  local manifest_url
  manifest_url=$(timeout 60 yt-dlp \
    --no-download \
    --no-playlist \
    --no-warnings \
    --quiet \
    -f "best" \
    -g \
    "${video_url}" 2>"${err_log}" | head -1) || {
    local err
    err=$(tail -3 "${err_log}" 2>/dev/null)
    _log_method_failure "Method J" "$?" "$video_url" "$output_file" "${err}"
    log_warn " Method J: could not resolve manifest URL"
    return 1
  }

  if [[ -z "$manifest_url" ]]; then
    _log_method_failure "Method J" "empty-manifest" "$video_url" "$output_file" "yt-dlp -g returned empty"
    log_warn " Method J: empty manifest URL"
    return 1
  fi

  log_info " Method J: manifest = ${manifest_url:0:80}..."

  timeout "${MAX_RECORD_DURATION:-18000}" ffmpeg -y \
    -i "$manifest_url" \
    -c copy \
    -f mp4 \
    -movflags +faststart \
    "$output_file" 2>&1 | tail -5

  local status=${PIPESTATUS[0]}
  if [[ "$status" != "0" && "$status" != "124" ]]; then
    _log_method_failure "Method J" "$status" "$video_url" "$output_file" "ffmpeg returned non-zero"
  fi
  [[ "$status" == "124" ]] && return 0
  return "$status"
}

attempt_recording() {
    local video_url="$1"
    local attempt_num="$2"
    local output_base
    output_base="${SEGMENTS_DIR}/segment_$(printf '%03d' "$attempt_num").mp4"
    
    log_step "Recording attempt ${attempt_num}/${MAX_RECORD_ATTEMPTS:-3}"
    log_info "  URL: ${video_url}"
    log_info "  Output: ${output_base}"
    
    # ── METHOD ORDER (Option C: cookieless-first reliability) ──────────────
    # Verified 2026-06-14: android_vr + mediaconnect both return FULL 1080p
    # WITHOUT cookies. So we try the proven cookieless methods FIRST — this means
    # stale/expired YouTube cookies can NEVER block a public-stream recording.
    # The cookie-based methods (A/B) run only AFTER, as a bonus for the rare
    # members-only / age-restricted stream where cookies are actually required.

    local methods=(
        "record_method_h"
        "record_method_i"
        "record_method_h"
        "record_method_i"
        "record_method_d"
        "record_method_c"
        "record_method_j"
        "record_method_a"
        "record_method_b"
        "record_method_g"
        "record_method_e"
        "record_method_f"
    )
    local method_names=(
        "H: ytarchive (cookieless, purpose-built for live — PRIMARY)"
        "I: streamlink hardened (cookieless, independent codebase)"
        "D: Android VR (cookieless 1080p)"
        "C: mediaconnect (cookieless 1080p)"
        "J: ffmpeg HLS direct (NEW v4, independent path)"
        "A: Cookies+web_creator (bonus)"
        "B: Cookies+tv_embedded (bonus)"
        "G: Plain yt-dlp (default)"
        "E: Mobile Web"
        "F: Streamlink (HLS, default flags)"
    )
    for i in "${!methods[@]}"; do
        log_separator
        log_info "  Trying method ${method_names[$i]}..."
        
        # Try the recording method
        ${methods[$i]} "$video_url" "$output_base" || true
        
        # Check if a valid file was produced
        local valid_file
        valid_file=$(validate_recorded_file "$output_base") && {
            log_ok "  ✅ Method ${method_names[$i]} succeeded!"
            RECORDED_FILES+=("$valid_file")
            return 0
        }
        
        log_warn "  Method ${method_names[$i]} — no valid file produced"
        
        # Small delay between methods
        sleep "${METHOD_RETRY_DELAY:-5}"
    done
    
    log_error "  All ${#methods[@]} methods failed for attempt ${attempt_num}"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  SEGMENT MERGER — Combine multiple segments into one file
# ═══════════════════════════════════════════════════════════════════════════════

merge_segments() {
    local output_file="$1"
    
    if [[ ${#RECORDED_FILES[@]} -eq 0 ]]; then
        log_error "No segments to merge"
        return 1
    fi
    
    if [[ ${#RECORDED_FILES[@]} -eq 1 ]]; then
        log_info "Single segment — moving to output"
        mv "${RECORDED_FILES[0]}" "$output_file"
        return 0
    fi
    
    log_step "Merging ${#RECORDED_FILES[@]} segments..."
    
    # Create concat file for ffmpeg
    local concat_file="${RECORD_DIR}/concat_list.txt"
    : > "$concat_file"
    for segment in "${RECORDED_FILES[@]}"; do
        echo "file '$(realpath "$segment")'" >> "$concat_file"
    done
    
    log_debug "Concat file contents:"
    cat "$concat_file"
    
    # Try lossless concat first
    if ffmpeg -y -f concat -safe 0 -i "$concat_file" \
        -c copy -movflags +faststart \
        "$output_file" 2>/dev/null; then
        log_ok "Segments merged successfully (lossless)"
        # Clean up individual segments
        for segment in "${RECORDED_FILES[@]}"; do
            rm -f "$segment"
        done
        rm -f "$concat_file"
        return 0
    fi
    
    log_warn "Lossless merge failed — trying re-encode merge..."
    
    # Fallback: re-encode merge
    if ffmpeg -y -f concat -safe 0 -i "$concat_file" \
        -c:v libx264 -crf "${REENCODE_CRF:-18}" -preset "${REENCODE_PRESET:-medium}" \
        -c:a aac -b:a "${REENCODE_AUDIO_BITRATE:-192k}" \
        -movflags +faststart \
        "$output_file" 2>/dev/null; then
        log_ok "Segments merged successfully (re-encoded)"
        for segment in "${RECORDED_FILES[@]}"; do
            rm -f "$segment"
        done
        rm -f "$concat_file"
        return 0
    fi
    
    log_warn "Merge failed — using largest single segment"
    
    # Fallback: use the largest segment
    local largest_file=""
    local largest_size=0
    for segment in "${RECORDED_FILES[@]}"; do
        local size
        size=$(get_file_size "$segment")
        if (( size > largest_size )); then
            largest_size=$size
            largest_file="$segment"
        fi
    done
    
    if [[ -n "$largest_file" ]]; then
        mv "$largest_file" "$output_file"
        # Clean up other segments
        for segment in "${RECORDED_FILES[@]}"; do
            rm -f "$segment"
        done
        log_ok "Using largest segment: $(format_size "$largest_size")"
        return 0
    fi
    
    rm -f "$concat_file"
    return 1
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN RECORDING ORCHESTRATOR
#  Runs up to MAX_RECORD_ATTEMPTS, checking if stream is still live between
# ═══════════════════════════════════════════════════════════════════════════════

record_stream() {
    log_header "🎬 BULLETPROOF RECORDING ENGINE"
    
    local video_url="${STREAM_URL:-}"
    local video_id="${STREAM_VIDEO_ID:-}"
    local stream_title="${STREAM_TITLE:-Live Stream}"
    
    if [[ -z "$video_url" ]]; then
        log_error "No stream URL provided (STREAM_URL not set)"
        return 1
    fi
    
    log_info "Stream    : ${stream_title}"
    log_info "Video ID  : ${video_id}"
    log_info "URL       : ${video_url}"
    log_info "Max Tries : ${MAX_RECORD_ATTEMPTS:-3} attempts × 10 methods = $((${MAX_RECORD_ATTEMPTS:-3} * 10)) chances"
    log_info "Started   : $(now_pkt)"

    # v4: pre-flight liveness check — race-condition guard for streams that
    # end between detection and recording (this lost HbS5TF1atFU).
    log_step "Pre-flight: verifying stream is still live..."
    if is_stream_still_live "$video_id"; then
        log_ok "Pre-flight: stream is LIVE — proceeding"
    else
        log_warn "Pre-flight: stream is NOT live anymore — falling through to VOD rescue"
    fi
    
    # ── Prepare directories ──────────────────────────────────────────────────
    mkdir -p "$RECORD_DIR" "$SEGMENTS_DIR"
    
    # ── Generate output filename ─────────────────────────────────────────────
    local safe_title
    safe_title=$(generate_output_filename "$stream_title")
    local raw_output="${RECORD_DIR}/${safe_title}_raw.mp4"
    local final_output="${RECORD_DIR}/${safe_title}.mp4"
    
    set_env "RECORD_OUTPUT_TITLE" "$safe_title"
    set_env "RECORD_RAW_FILE" "$raw_output"
    
    # ── Live Chat Extractor ──────────────────────────────────────────────────
    local chat_output="${RECORD_DIR}/chat.json"
    local chat_pid=""
    
    log_info "Spawning chat-downloader in background..."
    if command -v chat_downloader &>/dev/null; then
        chat_downloader "$video_url" --output "$chat_output" >/dev/null 2>&1 &
        chat_pid=$!
        log_info "Chat downloader started (PID: $chat_pid)"
    else
        log_warn "chat_downloader not found, skipping chat extraction"
    fi
    
    # ── Recording Loop ───────────────────────────────────────────────────────
    local max_attempts="${MAX_RECORD_ATTEMPTS:-3}"
    local attempt=1
    local consecutive_failures=0
    local ever_succeeded=false
    
    while (( attempt <= max_attempts )); do
        log_separator
        
        # Try to record
        if attempt_recording "$video_url" "$attempt"; then
            RECORDING_SUCCESS=true
            ever_succeeded=true
            consecutive_failures=0
            log_ok "Attempt ${attempt} produced a valid recording"
        else
            (( consecutive_failures++ ))
            log_warn "Attempt ${attempt} failed to produce a recording (${consecutive_failures} consecutive failure(s))"
            # If we've had 2+ consecutive failures on non-first attempt, stream is likely over
            if (( attempt > 1 && consecutive_failures >= 2 )) && [[ "$ever_succeeded" == "true" ]]; then
                log_info "Multiple consecutive failures after a successful segment — stream has ended"
                break
            fi
        fi
        
        # ── Post-recording: decide whether to loop for another segment ────────
        if (( attempt < max_attempts )); then
            
            # If custom duration mode, this was a single-shot run.
            # Break immediately — don't loop or wait for live checks.
            if [[ "${CUSTOM_DURATION_MODE:-false}" == "true" ]]; then
                log_info "Custom duration mode — single-shot recording complete. Breaking loop."
                break
            fi
            
            # Normal mode: verify the stream genuinely ended (not a micro-drop)
            log_info "Checking if stream is still live..."
            if [[ "$RECORDING_SUCCESS" == "true" ]]; then
                log_info "Cooling down 600s (10 minutes) to verify stream truly ended..."
                local wait_iters=0
                local is_ended="true"
                while (( wait_iters < 10 )); do
                    sleep 60
                    (( wait_iters++ ))
                    if is_stream_still_live "$video_id"; then
                        log_warn "Stream came back online during cooldown! Resuming recording loop..."
                        is_ended="false"
                        break
                    fi
                done
                if [[ "$is_ended" == "true" ]]; then
                    log_info "Stream has verified ended — stopping recording loop"
                    break
                fi
            fi
            
            if is_stream_still_live "$video_id"; then
                log_info "Stream is still live — recording next segment"
                (( attempt++ ))
                continue
            else
                log_info "Stream has ended — stopping recording loop"
                break
            fi
        fi
        
        (( attempt++ ))
    done
    
    # ── Check Results ────────────────────────────────────────────────────────
    log_separator
    
    # Stop chat downloader gracefully
    if [[ -n "${chat_pid:-}" ]]; then
        log_info "Stopping chat downloader..."
        kill -2 "$chat_pid" 2>/dev/null || kill -9 "$chat_pid" 2>/dev/null
        wait "$chat_pid" 2>/dev/null || true
        set_env "RECORD_CHAT_FILE" "$chat_output"
    fi
    
    if [[ ${#RECORDED_FILES[@]} -eq 0 ]]; then
        log_warn "═══ LIVE RECORDING FAILED — TRYING VOD RESCUE ═══"
        log_info "All live methods failed — attempting to grab VOD replay before it goes private..."
        
        # ── VOD RESCUE FALLBACK ──────────────────────────────────────────
        # After a stream ends, the VOD stays public for a few minutes
        # before the streamer can make it private. We try anonymous
        # download methods to grab it in that window.
        # This works even with EXPIRED cookies.
        # ─────────────────────────────────────────────────────────────────
        
        local vod_rescued=false
        local vod_output="${RECORD_DIR}/vod_rescue.mp4"

        # v4: VOD rescue now waits up to 30 min for the VOD to appear AND
        # tries 6 methods instead of 3. Some streamers private the VOD within
        # seconds of ending; we poll every 60s for up to 30 min, then try
        # each method.
        log_info "Waiting up to 30 min for VOD to become available..."
        local vod_wait_iters=0
        local max_vod_wait=30  # 30 iterations × 60s = 30 min
        local vod_url="https://www.youtube.com/watch?v=${video_id}"
        while (( vod_wait_iters < max_vod_wait )); do
            if is_stream_still_live "$video_id"; then
                log_warn "VOD wait: stream is STILL live — unexpected, breaking"
                break
            fi
            local http_code
            http_code=$(curl -s -o /dev/null -w '%{http_code}' \
                --max-time 15 -L "$vod_url" 2>/dev/null || echo "000")
            if [[ "$http_code" == "200" ]]; then
                log_ok "VOD is now accessible (after $((vod_wait_iters * 60))s)"
                break
            fi
            log_info "VOD not yet available (HTTP $http_code) — waiting 60s more... [$((vod_wait_iters + 1))/${max_vod_wait}]"
            sleep 60
            (( vod_wait_iters++ ))
        done

        local vod_methods=(
            "android_vr"
            "ios"
            "mweb"
            "web"
            "tv_embedded"
            "web_creator"
        )
        local vod_method_names=(
            "Android VR (anonymous)"
            "iOS (anonymous)"
            "Mobile Web (anonymous)"
            "Web (default client)"
            "TV Embedded (cookie-friendly)"
            "Web Creator (alt client)"
        )

        for i in "${!vod_methods[@]}"; do
            local client="${vod_methods[$i]}"
            local mname="${vod_method_names[$i]}"
            
            log_info "  🆘 VOD Rescue attempt $((i+1))/${#vod_methods[@]}: ${mname}..."
            
            # Try downloading the full VOD (not live, just the replay)
            if timeout 1800 yt-dlp \
                --extractor-args "youtube:player_client=${client}" \
                --no-part \
                --no-continue \
                --no-check-certificates \
                --no-live-from-start \
                -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
                --merge-output-format mp4 \
                -o "$vod_output" \
                "$video_url" 2>&1 | tail -5; then
                
                # Check if file is valid
                if [[ -f "$vod_output" ]]; then
                    local vod_size
                    vod_size=$(get_file_size "$vod_output")
                    if (( vod_size >= 5000000 )); then  # At least 5MB
                        log_ok "  🆘 VOD Rescue SUCCESS! Method: ${mname} — $(format_size "$vod_size")"
                        RECORDED_FILES+=("$vod_output")
                        RECORDING_SUCCESS=true
                        vod_rescued=true
                        break
                    else
                        log_warn "  VOD file too small ($(format_size "$vod_size")) — trying next method"
                        rm -f "$vod_output"
                    fi
                fi
            fi
            
            # Also try with cookies if available (they might still work for VOD even if live failed)
            # Skipped entirely under PUBLIC_STREAM_ONLY=true (permanent cookieless mode)
            if [[ "$vod_rescued" != "true" ]] && [[ "${PUBLIC_STREAM_ONLY:-false}" != "true" ]] && [[ -f "$COOKIES_FILE" ]] && [[ -s "$COOKIES_FILE" ]]; then
                log_info "  🆘 VOD Rescue retry with cookies: ${mname}..."
                if timeout 1800 yt-dlp \
                    --cookies "$COOKIES_FILE" \
                    --extractor-args "youtube:player_client=${client}" \
                    --no-part \
                    --no-continue \
                    --no-check-certificates \
                    --no-live-from-start \
                    -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
                    --merge-output-format mp4 \
                    -o "$vod_output" \
                    "$video_url" 2>&1 | tail -5; then
                    
                    if [[ -f "$vod_output" ]]; then
                        local vod_size
                        vod_size=$(get_file_size "$vod_output")
                        if (( vod_size >= 5000000 )); then
                            log_ok "  🆘 VOD Rescue SUCCESS (with cookies)! Method: ${mname} — $(format_size "$vod_size")"
                            RECORDED_FILES+=("$vod_output")
                            RECORDING_SUCCESS=true
                            vod_rescued=true
                            break
                        else
                            rm -f "$vod_output"
                        fi
                    fi
                fi
            fi
            
            sleep 5
        done
        
        if [[ "$vod_rescued" != "true" ]]; then
            log_error "═══ RECORDING FAILED ═══"
            log_error "All live methods AND VOD rescue failed"

            # v4: dump a diagnostic summary so the Discord alert has real data
            log_separator
            log_error "DIAGNOSTIC SUMMARY"
            log_info "  Stream URL : ${video_url}"
            log_info "  Video ID : ${video_id}"
            log_info "  WARP : ${WARP_CONNECTED:-unknown} (IP: ${WARP_IP:-${ORIGINAL_IP:-unknown}})"
            log_info "  PoToken : $(curl -fsS --max-time 1 http://127.0.0.1:4416/ping >/dev/null 2>&1 && echo running || echo NOT_RUNNING)"
            log_info "  Cookies : ${COOKIE_STATUS:-unknown} ($(if [[ -f cookies.txt ]]; then wc -l < cookies.txt; else echo 0; fi) lines)"
            log_info "  Method failures captured : $(wc -l < "$METHOD_FAILURE_LOG" 2>/dev/null || echo 0) lines"
            log_separator
            log_info "Last 20 lines of failure log:"
            tail -20 "$METHOD_FAILURE_LOG" 2>/dev/null || echo "  (no failure log captured)"
            log_separator

            set_env "RECORDING_SUCCESS" "false"
            set_env "METHOD_FAILURE_LOG" "$METHOD_FAILURE_LOG"
            set_output "recording_success" "false"
            log_error "The stream may have been made private before we could grab it"
            log_error "Check the Discord notification for the diagnostic dump above."
            return 1
        fi
    fi
    
    log_ok "═══ RECORDED ${#RECORDED_FILES[@]} SEGMENT(S) ═══"
    for f in "${RECORDED_FILES[@]}"; do
        log_info "  → $(basename "$f") ($(format_size "$(get_file_size "$f")"))"
    done
    
    # ── Merge segments ───────────────────────────────────────────────────────
    if merge_segments "$raw_output"; then
        log_ok "Final raw file: $(basename "$raw_output") ($(format_size "$(get_file_size "$raw_output")"))"
    else
        log_error "Failed to produce final output file"
        set_env "RECORDING_SUCCESS" "false"
        set_output "recording_success" "false"
        return 1
    fi
    
    # ── Record end time ──────────────────────────────────────────────────────
    set_env "STREAM_END_EPOCH" "$(now_epoch)"
    set_env "STREAM_END_TIME" "$(now_pkt)"
    set_env "RECORDING_SUCCESS" "true"
    set_env "RECORDING_RAW_FILE" "$raw_output"
    set_output "recording_success" "true"
    set_output "raw_file" "$raw_output"
    
    log_ok "Recording completed at: $(now_pkt)"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    record_stream
fi
