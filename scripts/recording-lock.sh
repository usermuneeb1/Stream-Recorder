#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🔒 RECORDING LOCK — coordinates the main recorder + go-live sniper         ║
# ║                                                                            ║
# ║  Prevents both the main "Stream Recorder" and the "Go-Live Sniper" from    ║
# ║  capturing the SAME stream at the same time (wasteful duplicate).          ║
# ║                                                                            ║
# ║  DESIGN PRINCIPLE = FAIL-SAFE TOWARD CAPTURE:                              ║
# ║    Any error (API hiccup, corrupt lock, network) defaults to "proceed"     ║
# ║    (record). The ONLY thing that makes lock_acquire return "busy" is a     ║
# ║    clear, fresh lock held by the OTHER component for the same video.        ║
# ║    Skipping a recording = a lost stream (the VOD gets privated). A rare    ║
# ║    duplicate recording is infinitely preferable to a missed one.            ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    source scripts/recording-lock.sh                                        ║
# ║    lock_acquire "<video_id>" "recorder"  && echo proceed                   ║
# ║    ... record ...                                                          ║
# ║    lock_release "<video_id>"                                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# (No set -e: this file is sourced. Every path must be fail-safe.)

LOCK_FILE="${RECORDING_LOCK_FILE:-data/recording_lock.json}"
LOCK_TTL="${RECORDING_LOCK_TTL:-21600}"   # 6h — longer than any stream + processing

# Acquire the lock for $1 (video_id) as $2 (owner: recorder|sniper).
# Returns 0 = acquired (or error → proceed); 1 = busy (another component owns it).
lock_acquire() {
    local my_video="$1"
    local owner="${2:-recorder}"

    # No video id → nothing to lock → proceed (fail-safe).
    [[ -z "$my_video" ]] && return 0

    # No GH_PAT → can't coordinate → proceed (fail-safe; duplicate is OK).
    if [[ -z "${GH_PAT:-}" ]]; then
        return 0
    fi

    local lock=""
    lock=$(github_api_read_content "$LOCK_FILE" 2>/dev/null) || lock=""

    if [[ -n "$lock" && "$lock" != "{}" ]]; then
        local vid ow ts
        vid=$(echo "$lock" | jq -r '.video_id // empty' 2>/dev/null)
        ow=$(echo "$lock" | jq -r '.owner // empty' 2>/dev/null)
        ts=$(echo "$lock" | jq -r '.started_at_epoch // 0' 2>/dev/null)
        [[ "$ts" =~ ^[0-9]+$ ]] || ts=0

        local now fresh
        now=$(date '+%s')
        fresh=0
        (( now - ts <= LOCK_TTL )) && fresh=1

        # A clear, fresh lock exists.
        if [[ -n "$vid" && "$vid" != "null" && "$fresh" == "1" ]]; then
            # Same video, same owner → re-acquire (idempotent), proceed.
            if [[ "$vid" == "$my_video" && "$ow" == "$owner" ]]; then
                : # proceed to (re)write below
            else
                # Someone else (or another run) is actively recording this / another video.
                log_warn "🔒 Lock busy: '$vid' held by '$ow' (age $(( (now - ts) / 60 )) min) — deferring to avoid duplicate capture"
                return 1
            fi
        fi
        # else: stale or empty lock → treat as free, proceed.
    fi

    # Write/refresh the lock. Failure to write must NOT block recording.
    local payload
    payload=$(jq -n \
        --arg v "$my_video" \
        --arg o "$owner" \
        --argjson ts "$(date '+%s')" \
        --arg at "$(TZ='Asia/Karachi' date '+%Y-%m-%d %H:%M:%S PKT' 2>/dev/null)" \
        '{video_id:$v, owner:$o, started_at_epoch:$ts, started_at:$at}' 2>/dev/null) || return 0
    github_api_write "$LOCK_FILE" "$payload" "🔒 Recording lock acquired: $my_video ($owner)" >/dev/null 2>&1 || return 0
    log_ok "🔒 Lock acquired: $my_video ($owner)"
    return 0
}

# Release (clear) the lock. Always best-effort.
lock_release() {
    local my_video="${1:-}"
    if [[ -z "${GH_PAT:-}" ]]; then return 0; fi
    local payload
    payload=$(jq -n --argjson ts "$(date '+%s')" \
        '{video_id:null, owner:null, released_at_epoch:$ts}' 2>/dev/null) || return 0
    github_api_write "$LOCK_FILE" "$payload" "🔓 Recording lock released${my_video:+: $my_video}" >/dev/null 2>&1 || true
    log_info "🔓 Lock released"
    return 0
}
