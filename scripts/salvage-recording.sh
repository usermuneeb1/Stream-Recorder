#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🛟 SALVAGE PIPELINE — Partial Recording Recovery (v6)                      ║
# ║                                                                            ║
# ║  When the Record step TIMES OUT or crashes (step killed mid-fragment), the ║
# ║  captured video data is still sitting on disk in $RECORD_DIR — but the old ║
# ║  pipeline threw it away: recording_success stayed false, so post-process,  ║
# ║  upload, and notify were all skipped, and Cleanup deleted everything.      ║
# ║                                                                            ║
# ║  This script runs AFTER a failed/timed-out record step and recovers        ║
# ║  whatever is salvageable:                                                  ║
# ║    1. Collects completed segments + any partially-written raw file         ║
# ║    2. Validates each file; runs moov-atom recovery on damaged ones         ║
# ║    3. Merges survivors with the SAME merge logic as the main engine        ║
# ║    4. Re-exports the standard env/outputs so the existing Post-Process →   ║
# ║       Upload → Notify → Stats → Links chain picks it up untouched          ║
# ║                                                                            ║
# ║  Net effect: a timeout now loses (at most) the final fragment instead of   ║
# ║  the entire capture.                                                       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

RECORD_DIR="${RECORD_DIR:-/tmp/stream-recorder}"

# Sourcing record-stream.sh truncates the per-method failure log on load —
# back it up first; it is the primary diagnostic when a run timed out.
_fail_backup=""
if [[ -f "${RECORD_DIR}/method_logs/failures.log" ]]; then
    _fail_backup=$(mktemp /tmp/salvage_faillog_XXXX)
    cp "${RECORD_DIR}/method_logs/failures.log" "$_fail_backup" 2>/dev/null || _fail_backup=""
fi

# Reuse the main engine's merge_segments() + validate_recorded_file() so there
# is exactly ONE merge implementation in the codebase. Entry points in both
# sourced scripts are guarded (BASH_SOURCE check), so nothing executes.
source "$SCRIPT_DIR/record-stream.sh"

if [[ -n "$_fail_backup" ]]; then
    cp "$_fail_backup" "${RECORD_DIR}/method_logs/failures.log" 2>/dev/null || true
    rm -f "$_fail_backup"
fi

SEGMENTS_DIR="${RECORD_DIR}/segments"

salvage_recording() {
    log_header "🛟 SALVAGE — Partial Recording Recovery"
    log_info "Record step did not complete — scanning for recoverable capture data..."
    log_info "Record dir: ${RECORD_DIR}"

    if [[ ! -d "$RECORD_DIR" ]]; then
        log_error "No record directory found — nothing to salvage"
        set_output "salvage_success" "false"
        return 1
    fi

    # ── 1. Collect candidate files ──────────────────────────────────────────
    # Priority: numbered segments (canonical pre-merge artifacts). If none
    # exist, fall back to whatever video files remain in the record dir root
    # (a killed merge / vod-rescue / single-method output).
    local -a candidates=()
    local f
    if [[ -d "$SEGMENTS_DIR" ]]; then
        while IFS= read -r f; do
            candidates+=("$f")
        done < <(find "$SEGMENTS_DIR" -maxdepth 1 -type f \
                    \( -name '*.mp4' -o -name '*.mkv' -o -name '*.ts' -o -name '*.webm' \) \
                    2>/dev/null | sort)
    fi

    if (( ${#candidates[@]} == 0 )); then
        while IFS= read -r f; do
            candidates+=("$f")
        done < <(find "$RECORD_DIR" -maxdepth 1 -type f \
                    \( -name '*.mp4' -o -name '*.mkv' -o -name '*.ts' -o -name '*.webm' \) \
                    2>/dev/null | sort)
    fi

    if (( ${#candidates[@]} == 0 )); then
        log_error "No candidate video files found — nothing to salvage"
        set_output "salvage_success" "false"
        return 1
    fi

    log_info "Found ${#candidates[@]} candidate file(s):"
    for f in "${candidates[@]}"; do
        log_info "  → $(basename "$f") ($(format_size "$(get_file_size "$f")"))"
    done

    # ── 2. Validate / repair each candidate ─────────────────────────────────
    # A file killed mid-fragment typically lacks its moov atom: is_valid_video
    # rejects it, recover_broken_video rebuilds a playable container.
    local -a good_files=()
    for f in "${candidates[@]}"; do
        if is_valid_video "$f"; then
            log_ok "  ✓ $(basename "$f") is valid"
            good_files+=("$f")
        elif recover_broken_video "$f"; then
            log_ok "  ✓ $(basename "$f") REPAIRED (moov-atom recovery)"
            good_files+=("$f")
        else
            log_warn "  ✗ $(basename "$f") is unrecoverable — skipping"
        fi
    done

    if (( ${#good_files[@]} == 0 )); then
        log_error "All candidates were unrecoverable — salvage failed"
        set_output "salvage_success" "false"
        return 1
    fi

    # ── 3. Merge survivors (main engine's merge_segments) ───────────────────
    local video_id="${STREAM_VIDEO_ID:-unknown}"
    local raw_output="${RECORD_DIR}/Salvaged_${video_id}_raw.mp4"
    rm -f "$raw_output"

    # shellcheck disable=SC2034  # consumed by merge_segments() in record-stream.sh
    RECORDED_FILES=("${good_files[@]}")
    if ! merge_segments "$raw_output"; then
        log_error "Salvage merge failed"
        set_output "salvage_success" "false"
        return 1
    fi

    if ! is_valid_video "$raw_output"; then
        log_warn "Merged salvage file failed validation — attempting repair"
        if ! recover_broken_video "$raw_output"; then
            log_error "Salvaged merge is unusable"
            set_output "salvage_success" "false"
            return 1
        fi
    fi

    local salvaged_size salvaged_dur
    salvaged_size=$(get_file_size "$raw_output")
    salvaged_dur=$(get_video_duration "$raw_output")
    log_ok "═══ SALVAGE RECOVERED $(format_size "$salvaged_size") / ${salvaged_dur}s of footage ═══"

    # ── 4. Re-export the standard contract ──────────────────────────────────
    # Post-Process, Upload, Notify, Stats and Links all read these — setting
    # them means the rest of the pipeline runs exactly as if the record step
    # had succeeded (with SALVAGED=true marking the provenance).
    local safe_title
    safe_title=$(generate_output_filename "${STREAM_TITLE:-Salvaged_${video_id}}")
    set_env "RECORD_OUTPUT_TITLE" "$safe_title"
    set_env "RECORD_RAW_FILE" "$raw_output"
    set_env "RECORDING_RAW_FILE" "$raw_output"
    set_env "RECORDING_SUCCESS" "true"
    set_env "SALVAGED" "true"
    set_env "STREAM_END_EPOCH" "$(now_epoch)"
    set_env "STREAM_END_TIME" "$(now_pkt)"
    if [[ -f "${RECORD_DIR}/chat.json" ]]; then
        set_env "RECORD_CHAT_FILE" "${RECORD_DIR}/chat.json"
    fi

    set_output "salvage_success" "true"
    set_output "recording_success" "true"
    set_output "raw_file" "$raw_output"

    log_ok "Handing off to Post-Process (SALVAGED=true)"
    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    salvage_recording
fi
