#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  BROWSER SESSION, Google "Sign in to confirm you're not a bot" bypass        ║
# ║                                                                              ║
# ║  Wraps scripts/browser_session.py (SeleniumBase UC mode) so the recorder     ║
# ║  can mint a REAL Chrome session on demand, on the runner's own IP.           ║
# ║                                                                              ║
# ║  What it gives the recorder:                                                  ║
# ║    • a fresh Netscape cookie jar  → COOKIES_FILE (yt-dlp/ytarchive/streamlink)║
# ║    • stream.json                  → hlsManifestUrl / dashManifestUrl /       ║
# ║                                     per-format URLs for a pure-ffmpeg path   ║
# ║    • browser.env                  → UA + visitorData + capture facts         ║
# ║                                                                              ║
# ║  NO GOOGLE ACCOUNT IS USED. Public streams keep recording with an empty or   ║
# ║  stale YOUTUBE_COOKIES secret, because the jar is generated per run from a   ║
# ║  genuine browser on the same IP that will download the video.                ║
# ║                                                                              ║
# ║  Controls (all optional):                                                    ║
# ║    BROWSER_ASSIST=auto|first|off   (default auto)                            ║
# ║        auto  → Method K sits after the cookieless yt-dlp/ytarchive paths     ║
# ║        first → Method K is tried before every other method                   ║
# ║        off   → feature disabled, behaviour identical to pre-2026-10          ║
# ║    BROWSER_SESSION_DIR      where cookies/stream.json land (default:         ║
# ║                             ${RECORD_DIR}/browser_session)                    ║
# ║    BROWSER_SESSION_TIMEOUT  hard cap for one browser launch (default 240s)   ║
# ║    BROWSER_SESSION_MAX_AGE  reuse window for a captured session (default 900)║
# ║    BROWSER_HEADED=true      run headed (needs Xvfb); default xvfb+headless   ║
# ║    BROWSER_PYTHON           python interpreter (default python3)             ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# Intentionally NO `set -e`: this file is sourced by record-stream.sh (which is
# `set -uo pipefail`) and by detect-stream.sh. A helper must never abort the
# caller's recording because the optional browser step failed.

BROWSER_SESSION_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v log_info >/dev/null 2>&1; then
    # shellcheck disable=SC1091
    source "${BROWSER_SESSION_SH_DIR}/utils.sh"
fi

browser_assist_mode() {
    local mode="${BROWSER_ASSIST:-auto}"
    case "$mode" in
        auto|first|off) echo "$mode" ;;
        true|on|yes|1) echo "auto" ;;
        false|no|0) echo "off" ;;
        *) echo "auto" ;;
    esac
}

browser_session_dir() {
    echo "${BROWSER_SESSION_DIR:-${RECORD_DIR:-/tmp/stream-recorder}/browser_session}"
}

# _browser_json_get <file> <field> → scalar value (jq if present, python3 else)
_browser_json_get() {
    local file="$1" field="$2"
    [[ -s "$file" ]] || return 0
    if command -v jq >/dev/null 2>&1; then
        jq -r ".${field} // \"\"" "$file" 2>/dev/null || true
        return 0
    fi
    "${BROWSER_PYTHON:-python3}" - "$file" "$field" <<'PY' 2>/dev/null || true
import json, sys
try:
    data = json.load(open(sys.argv[1]))
except Exception:
    sys.exit(0)
value = data.get(sys.argv[2], "")
if isinstance(value, bool):
    value = "true" if value else "false"
print(value)
PY
}

# browser_video_id_from_url <url> → 11-char id (empty when not a watch URL)
browser_video_id_from_url() {
    local url="${1:-}"
    if [[ "$url" =~ (v=|youtu\.be/|/live/|/shorts/)([A-Za-z0-9_-]{11}) ]]; then
        echo "${BASH_REMATCH[2]}"
        return 0
    fi
    return 0
}

# Returns 0 when the Python helper can actually launch a browser.
# Cheap: imports only, never starts Chrome.
browser_session_available() {
    [[ "$(browser_assist_mode)" == "off" ]] && return 1
    local py="${BROWSER_PYTHON:-python3}"
    command -v "$py" >/dev/null 2>&1 || return 1
    "$py" -c "import seleniumbase" >/dev/null 2>&1 || return 1
    return 0
}

browser_session_why_unavailable() {
    local py="${BROWSER_PYTHON:-python3}"
    if ! command -v "$py" >/dev/null 2>&1; then
        echo "python3 not found"
    elif ! "$py" -c "import seleniumbase" >/dev/null 2>&1; then
        echo "seleniumbase not installed (bash scripts/setup-browser.sh)"
    else
        echo "available"
    fi
}

# Export everything the Python helper recorded in browser.env.
_browser_session_load_env_file() {
    local env_file="$1"
    [[ -s "$env_file" ]] || return 1
    # The helper writes shell-quoted KEY='value' lines it generated itself;
    # sourcing it is the same trust level as the rest of $RECORD_DIR.
    # shellcheck disable=SC1090
    source "$env_file"
    export BROWSER_SESSION_OK BROWSER_COOKIES_FILE BROWSER_STREAM_JSON \
           BROWSER_UA BROWSER_VISITOR_DATA BROWSER_IS_LIVE BROWSER_PLAYABILITY \
           BROWSER_COOKIE_COUNT BROWSER_HLS_MANIFEST BROWSER_DASH_MANIFEST \
           BROWSER_SESSION_BLOCKED 2>/dev/null || true
    return 0
}

# Adopt a captured session as the recorder's cookie source.
_browser_session_adopt() {
    local cookies="$1" stream="$2"

    [[ -s "$cookies" ]] || return 1

    BROWSER_COOKIES_FILE="$cookies"
    BROWSER_STREAM_JSON="$stream"
    BROWSER_SESSION_OK=1
    export BROWSER_COOKIES_FILE BROWSER_STREAM_JSON BROWSER_SESSION_OK

    # Hand the fresh jar to every later method (A/B included). This is the
    # whole point: a stale hand-pasted cookie file stops mattering.
    COOKIES_FILE="$cookies"
    export COOKIES_FILE
    COOKIE_STATUS="valid_unverified"
    export COOKIE_STATUS

    # Publish the fresh jar to later STEPS too (detection mints, recording
    # reuses). Every script reads ${COOKIES_FILE}, so this single assignment
    # retires a stale hand-pasted jar for the rest of the run.
    set_env "COOKIES_FILE" "$cookies" 2>/dev/null || true
    set_env "BROWSER_COOKIES_FILE" "$cookies" 2>/dev/null || true
    set_env "BROWSER_STREAM_JSON" "$stream" 2>/dev/null || true
    set_env "COOKIE_STATUS" "valid_unverified" 2>/dev/null || true
    return 0
}

# A captured session is reusable while it is fresh AND for the same video.
_browser_session_is_fresh() {
    local dir="$1" target="${2:-}"
    local cookies="$dir/cookies.txt" stream="$dir/stream.json"
    [[ -s "$cookies" && -s "$stream" ]] || return 1

    local max_age age mtime
    max_age="${BROWSER_SESSION_MAX_AGE:-900}"
    mtime=$(stat -c %Y "$stream" 2>/dev/null || echo 0)
    age=$(( $(date +%s) - mtime ))
    (( age >= 0 && age < max_age )) || return 1

    if [[ -n "$target" ]]; then
        local cached_id
        cached_id=$(_browser_json_get "$stream" "video_id")
        # A capture with no id (channel /live page that was not broadcasting)
        # must never be reused for a concrete video: we would hand the recorder
        # a page with no manifest.
        if [[ "$cached_id" != "$target" ]]; then
            return 1
        fi
    fi
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_mint_session [video-id-or-url]
#    Launches the real browser and captures the session.
#    Returns 0 on success (BROWSER_COOKIES_FILE set), 1 on any failure.
#    NEVER fatal: callers treat failure as "try the next method".
# ─────────────────────────────────────────────────────────────────────────────
browser_mint_session() {
    local target="${1:-${STREAM_VIDEO_ID:-}}"

    if [[ "$(browser_assist_mode)" == "off" ]]; then
        log_info "  Browser session: disabled (BROWSER_ASSIST=off)"
        return 1
    fi
    if [[ -z "$target" ]]; then
        log_warn "  Browser session: no video id/url supplied"
        return 1
    fi

    local dir url
    dir="$(browser_session_dir)"
    mkdir -p "$dir" 2>/dev/null || true

    if [[ "$target" =~ ^https?:// ]]; then
        url="$target"
        # Normalise so the freshness check can compare ids.
        if [[ "$target" =~ (v=|youtu\.be/|/live/)([A-Za-z0-9_-]{11}) ]]; then
            target="${BASH_REMATCH[2]}"
        fi
    else
        url="https://www.youtube.com/watch?v=${target}"
    fi

    local log_file="${RECORD_DIR:-/tmp/stream-recorder}/method_logs/browser_session.log"
    mkdir -p "$(dirname "$log_file")" 2>/dev/null || true

    # ── reuse a fresh capture (one launch serves detection + recording) ─────
    if _browser_session_is_fresh "$dir" "$target"; then
        if _browser_session_load_env_file "$dir/browser.env" 2>/dev/null; then
            :
        fi
        if _browser_session_adopt "$dir/cookies.txt" "$dir/stream.json"; then
            log_ok "  Browser session: reusing fresh capture ($(_browser_json_get "$dir/stream.json" cookie_count) cookies)"
            return 0
        fi
    fi

    # ── availability gate (install once, never block a recording) ───────────
    if ! command -v "${BROWSER_PYTHON:-python3}" >/dev/null 2>&1; then
        log_warn "  Browser session: python3 missing, skipping"
        return 1
    fi
    if ! "${BROWSER_PYTHON:-python3}" -c "import seleniumbase" >/dev/null 2>&1; then
        log_warn "  Browser session: seleniumbase not installed, skipping"
        log_info "  Install with: bash scripts/setup-browser.sh"
        return 1
    fi

    # ── launch ──────────────────────────────────────────────────────────────
    local timeout_s="${BROWSER_SESSION_TIMEOUT:-240}"
    local py="${BROWSER_PYTHON:-python3}"
    local helper="${BROWSER_SESSION_SH_DIR}/browser_session.py"
    local -a headed_args=()
    [[ "${BROWSER_HEADED:-false}" == "true" ]] && headed_args=(--headed)

    log_info "  Browser session: launching real Chrome (SeleniumBase UC)…"
    log_info "  Browser session: target ${url}"

    local rc=0
    timeout "$timeout_s" "$py" "$helper" \
        --url "$url" \
        --outdir "$dir" \
        --max-wait "${BROWSER_MAX_WAIT:-60}" \
        --max-height "${BROWSER_MAX_HEIGHT:-1080}" \
        "${headed_args[@]}" >"$log_file" 2>&1 || rc=$?

    # Surface the tail either way; the full log stays in method_logs/.
    tail -12 "$log_file" 2>/dev/null | sed 's/^/    │ /' || true

    if [[ "$rc" == "124" ]]; then
        log_warn "  Browser session: timed out after ${timeout_s}s"
    elif [[ "$rc" == "3" ]]; then
        log_warn "  Browser session: seleniumbase unavailable"
    elif [[ "$rc" != "0" ]]; then
        log_warn "  Browser session: capture failed (rc=${rc})"
    fi

    # Even a "blocked" exit can leave a usable jar behind, so always try to
    # adopt whatever landed on disk.
    _browser_session_load_env_file "$dir/browser.env" 2>/dev/null || true

    if [[ -s "$dir/cookies.txt" ]] && [[ -s "$dir/stream.json" ]]; then
        if _browser_session_adopt "$dir/cookies.txt" "$dir/stream.json"; then
            local blocked
            blocked=$(_browser_json_get "$dir/stream.json" "blocked")
            if [[ "$blocked" == "true" ]]; then
                log_warn "  Browser session: YouTube still showed the bot wall (jar kept as best effort)"
                return 1
            fi
            log_ok "  Browser session: minted fresh cookies ($(grep -c $'\t' "$dir/cookies.txt" 2>/dev/null || echo "?") rows)"
            return 0
        fi
    fi
    return 1
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_session_jq <field>
#    Read one field out of the captured stream.json (empty when absent).
# ─────────────────────────────────────────────────────────────────────────────
browser_session_jq() {
    local field="$1"
    local stream="${BROWSER_STREAM_JSON:-$(browser_session_dir)/stream.json}"
    [[ -s "$stream" ]] || return 0
    _browser_json_get "$stream" "$field"
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_detect_live [channel_url]
#    Detection Method 5. Opens the channel's /live page in a real browser and
#    reads the player response, which is the one channel YouTube cannot lie to
#    (it either hands the player a manifest or it does not).
#    Sets DETECTED_* globals (defined in detect-stream.sh) on success.
# ─────────────────────────────────────────────────────────────────────────────
browser_detect_live() {
    local channel_url="${1:-}"
    if [[ -z "$channel_url" ]] && declare -F get_live_url >/dev/null 2>&1; then
        channel_url="$(get_live_url)"
    fi
    if [[ -z "$channel_url" ]]; then
        log_warn "  Method 5: no channel URL to probe"
        return 1
    fi

    log_info "  Method 5: real browser session on ${channel_url}"
    if ! browser_mint_session "$channel_url"; then
        log_info "  Method 5: no session / channel not broadcasting"
        return 1
    fi

    local is_live vid title author playability
    is_live=$(browser_session_jq is_live)
    vid=$(browser_session_jq video_id)
    title=$(browser_session_jq title)
    author=$(browser_session_jq author)
    playability=$(browser_session_jq playability)

    if [[ -z "$vid" ]]; then
        log_info "  Method 5: browser player exposed no video id (playability=${playability:-unknown})"
        return 1
    fi
    if [[ "$is_live" != "true" ]]; then
        log_info "  Method 5: video ${vid} is not live right now (playability=${playability:-unknown})"
        return 1
    fi

    DETECTED_VIDEO_ID="$vid"
    DETECTED_TITLE="${title:-Live Stream}"
    DETECTED_CHANNEL="${author:-${CHANNEL_DISPLAY_NAME:-The Muslim Lantern}}"
    DETECTED_THUMBNAIL="https://i.ytimg.com/vi/${vid}/maxresdefault_live.jpg"
    DETECTED_METHOD="Browser (SeleniumBase UC)"
    DETECTED_URL="https://www.youtube.com/watch?v=${vid}"

    log_ok "Method 5: ✅ LIVE DETECTED via real browser, ${DETECTED_TITLE} by ${DETECTED_CHANNEL}"
    return 0
}

# ─────────────────────────────────────────────────────────────────────────────
#  browser_session_selfcheck
#    Human-readable readiness report (used by setup-check / smoke test).
# ─────────────────────────────────────────────────────────────────────────────
browser_session_selfcheck() {
    echo "BROWSER_ASSIST            = $(browser_assist_mode)"
    echo "BROWSER_SESSION_DIR       = $(browser_session_dir)"
    echo "python                    = ${BROWSER_PYTHON:-python3}"
    echo "seleniumbase python pkg   = $(browser_session_why_unavailable)"
    if command -v google-chrome >/dev/null 2>&1; then
        echo "chrome                    = $(google-chrome --version 2>/dev/null | head -1)"
    elif command -v chromium >/dev/null 2>&1; then
        echo "chromium                  = $(chromium --version 2>/dev/null | head -1)"
    else
        echo "chrome                    = MISSING"
    fi
    if command -v Xvfb >/dev/null 2>&1; then
        echo "Xvfb                      = $(command -v Xvfb)"
    else
        echo "Xvfb                      = MISSING (headed UC mode needs it)"
    fi
}
