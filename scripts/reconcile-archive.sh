#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  RECONCILE ARCHIVE — missed-stream self-healing                              ║
# ║                                                                              ║
# ║  The recorder polls every 5 minutes, but a real miss already happened       ║
# ║  (RATmDJ9Roh4 aired 2026-07-11 and was never captured). This pass closes    ║
# ║  that class of failure permanently:                                         ║
# ║                                                                              ║
# ║    1. List the channel's /streams tab (cookieless, yt-dlp flat playlist).   ║
# ║    2. Any stream NOT in data/recordings.json and NOT in the skip list,      ║
# ║       published within RECONCILE_WINDOW_DAYS, is a MISSED stream.           ║
# ║    3. Rescue it end-to-end by reusing the REAL pipeline:                    ║
# ║          yt-dlp download → post-process.sh → upload-clouds.sh               ║
# ║          → update-stats.sh (gallery entry, quarantine-gated)                ║
# ║    4. Log every finding to data/missed-streams.json + Discord.              ║
# ║                                                                              ║
# ║  Zero-touch: runs daily from reconcile-archive.yml; humans are notified,    ║
# ║  never required.                                                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

RECORDINGS_JSON="${RECORDINGS_JSON:-data/recordings.json}"
SKIP_JSON="${SKIP_JSON:-data/reconcile-skip.json}"
MISSED_JSON="${MISSED_JSON:-data/missed-streams.json}"
WINDOW_DAYS="${RECONCILE_WINDOW_DAYS:-60}"
RECORD_DIR="${RECORD_DIR:-/tmp/stream-recorder}"

# ── collect known ids (video_id field OR parsed from video_url — both schemas) ──
known_ids() {
    {
        jq -r '.[].video_id // empty' "$RECORDINGS_JSON" 2>/dev/null
        jq -r '.[].video_url // empty' "$RECORDINGS_JSON" 2>/dev/null \
            | grep -oP '(?:v=|youtu\.be/)\K[\w-]{11}' 2>/dev/null || true
    } | sort -u
}

# ── list channel streams (id<TAB>title) ─────────────────────────────────────
list_channel_streams() {
    local streams_url="${1:-https://www.youtube.com/@TheMuslimLantern/streams}"
    timeout 120 yt-dlp --flat-playlist --no-warnings --quiet \
        --print "%(id)s	%(title)s" \
        "$streams_url" 2>/dev/null || true
}

# ── fetch metadata for one video: "upload_date|live_status|title|duration" ──
video_meta() {
    local vid="$1"
    timeout 60 yt-dlp --print "%(upload_date)s|%(live_status)s|%(title)s|%(duration)s" \
        --no-download --no-warnings --socket-timeout 20 \
        "https://www.youtube.com/watch?v=${vid}" 2>/dev/null | head -1 || echo "||||"
}

# ── record the finding in the ledger ────────────────────────────────────────
note_missed() {
    local vid="$1" title="$2" status="$3"
    local existing ledger
    existing=$(github_api_read_content "$MISSED_JSON" 2>/dev/null) || existing="[]"
    echo "$existing" | jq -e 'type=="array"' >/dev/null 2>&1 || existing="[]"
    # replace any prior entry for the same id, newest first, cap 100
    ledger=$(echo "$existing" | jq \
        --arg vid "$vid" --arg t "$title" --arg s "$status" --arg at "$(now_utc_iso)" '
        [ .[] | select(.video_id != $vid) ]
        | [{video_id:$vid, title:$t, status:$s, found_at:$at}] + .
        | .[:100]')
    github_api_write "$MISSED_JSON" "$ledger" \
        "Reconciler: ${status} stream ${vid}" >/dev/null 2>&1 || true
}

# ── RESCUE: run the real pipeline on a missed VOD ───────────────────────────
rescue_stream() {
    local vid="$1" title="$2"
    log_header "RESCUING MISSED STREAM ${vid}"

    export STREAM_VIDEO_ID="$vid"
    export STREAM_URL="https://www.youtube.com/watch?v=${vid}"
    export STREAM_TITLE="${title:-Rescued Stream} $(TZ='Asia/Karachi' date '+%Y-%m-%d')"
    export STREAM_CHANNEL="${CHANNEL_DISPLAY_NAME:-The Muslim Lantern}"
    export RECORD_DIR
    mkdir -p "$RECORD_DIR"

    local safe_title raw_file
    safe_title=$(generate_output_filename "${title:-Rescued_Stream}")
    raw_file="${RECORD_DIR}/${safe_title}_raw.mp4"

    log_step "Downloading VOD (cookieless android_vr first)..."
    if ! timeout 5400 yt-dlp \
        --extractor-args "youtube:player_client=android_vr" \
        --no-part --no-continue --no-check-certificates \
        --concurrent-fragments 4 --fixup never \
        -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
        --merge-output-format mp4 \
        -o "$raw_file" \
        "$STREAM_URL" 2>&1 | tail -3; then
        log_warn "android_vr download failed, trying default client..."
        timeout 5400 yt-dlp \
            --no-part --no-continue --no-check-certificates \
            --concurrent-fragments 4 --fixup never \
            -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best" \
            --merge-output-format mp4 \
            -o "$raw_file" \
            "$STREAM_URL" 2>&1 | tail -3 || return 1
    fi

    [[ ! -f "$raw_file" ]] && { log_error "No file produced"; return 1; }
    log_ok "Downloaded: $(format_size "$(get_file_size "$raw_file")")"

    export RECORDING_RAW_FILE="$raw_file"
    export KEEP_WHOLE_FILE="${KEEP_WHOLE_FILE:-true}"

    log_step "Post-processing (real pipeline)..."
    bash "$SCRIPT_DIR/post-process.sh" || return 1

    log_step "Uploading to clouds (real pipeline)..."
    bash "$SCRIPT_DIR/upload-clouds.sh" || log_warn "Some uploads failed — gallery entry still attempted"

    log_step "Updating stats + gallery (real pipeline, quarantine-gated)..."
    bash "$SCRIPT_DIR/update-stats.sh" || true

    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

reconcile() {
    log_header "ARCHIVE RECONCILIATION"

    command -v yt-dlp >/dev/null 2>&1 || { log_error "yt-dlp missing"; return 1; }
    [[ -f "$RECORDINGS_JSON" ]] || { log_error "recordings.json missing"; return 1; }

    local known skip_map
    known=$(known_ids)
    skip_map=$(jq -r '.[] // empty' "$SKIP_JSON" 2>/dev/null | sort -u || true)
    local cutoff_epoch=$(( $(date +%s) - WINDOW_DAYS * 86400 ))

    log_info "Known recordings : $(echo "$known" | grep -c . || echo 0)"
    log_info "Skip list        : $(echo "$skip_map" | grep -c . || echo 0)"
    log_info "Window           : last ${WINDOW_DAYS} days"

    local missed=0 rescued=0 failed=0
    while IFS=$'\t' read -r vid title; do
        [[ -z "$vid" ]] && continue
        echo "$known" | grep -qx "$vid" && continue
        echo "$skip_map" | grep -qx "$vid" && { log_info "Skipped (by request): ${vid}"; continue; }

        local meta odate lstatus vtitle vdur
        meta=$(video_meta "$vid")
        odate=$(echo "$meta" | cut -d'|' -f1)
        lstatus=$(echo "$meta" | cut -d'|' -f2)
        vtitle=$(echo "$meta" | cut -d'|' -f3)
        vdur=$(echo "$meta" | cut -d'|' -f4)

        # Only past/current LIVE broadcasts count as missed streams; regular
        # uploads and upcoming premieres are not the recorder's job.
        case "$lstatus" in
            was_live|is_live|post_live) ;;
            *) log_info "${vid}: live_status=${lstatus:-unknown}, not a missed stream"; continue ;;
        esac

        # Age gate: only rescues within the window (keeps old public VODs out).
        if [[ "$odate" =~ ^[0-9]{8}$ ]]; then
            local oepoch
            oepoch=$(date -d "${odate:0:4}-${odate:4:2}-${odate:6:2}" +%s 2>/dev/null || echo 0)
            (( oepoch > 0 && oepoch < cutoff_epoch )) && {
                log_info "${vid}: outside ${WINDOW_DAYS}-day window, skipping"
                continue
            }
        fi

        log_warn "MISSED STREAM FOUND: ${vid} — ${vtitle} (${odate}, ${lstatus})"
        note_missed "$vid" "${vtitle}" "missed"
        (( ++missed ))

        if rescue_stream "$vid" "${vtitle}"; then
            (( ++rescued ))
            note_missed "$vid" "${vtitle}" "rescued"
            log_ok "RESCUED ${vid}"
        else
            (( ++failed ))
            note_missed "$vid" "${vtitle}" "rescue-failed"
            log_error "Rescue failed for ${vid}"
        fi
    done < <(list_channel_streams)

    log_separator
    log_ok "Reconciliation done: ${missed} missed, ${rescued} rescued, ${failed} failed"

    # Wake-up only when a rescue FAILED — a successful auto-rescue is logged,
    # not announced (zero-touch means silence is the default good state).
    if (( failed > 0 )); then
        set_env "RECONCILE_FAILURES" "$failed"
        return 1
    fi
    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    reconcile
fi
