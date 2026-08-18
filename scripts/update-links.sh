#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  📡 STREAM RECORDER — IMMUTABLE LINKS ARCHIVE                              ║
# ║  Permanently logs every recording with all download links to links.txt.    ║
# ║  New entries are prepended (newest first). Entries are never deleted.       ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"

# ═══════════════════════════════════════════════════════════════════════════════
#  UPDATE LINKS ARCHIVE
# ═══════════════════════════════════════════════════════════════════════════════

update_links() {
    log_header "🔗 UPDATING LINKS ARCHIVE (JSON mirror of recordings.json)"

    local stream_title="${STREAM_TITLE:-Unknown Stream}"
    local expected_channel="${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}"
    if [[ -n "${STREAM_CHANNEL:-}" ]] && [[ "${STREAM_CHANNEL}" != *"${expected_channel}"* ]] && [[ "${STREAM_CHANNEL}" != *"Muslim Lantern"* ]]; then
        log_warn "Skipping links.txt update — channel '${STREAM_CHANNEL}' is not ${expected_channel}"
        return 0
    fi

    # ── Build the canonical entry (same schema as data/recordings.json) ──────
    log_step "Building links entry..."
    local gofile_link="" pixeldrain_link="" archive_link="" mega_link="" archive_id=""
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        gofile_link=$(echo "${GOFILE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        pixeldrain_link=$(echo "${PIXELDRAIN_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        archive_link=$(echo "${ARCHIVE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
        archive_id=$(echo "${ARCHIVE_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f3)
    fi
    if [[ -n "${MEGA_LINKS:-}" ]]; then
        mega_link=$(echo "${MEGA_LINKS}" | tr ';' '\n' | head -1 | cut -d'|' -f2)
    fi

    local entry
    entry=$(jq -n \
        --arg video_id "${STREAM_VIDEO_ID:-}" \
        --arg title "${STREAM_TITLE:-Unknown}" \
        --arg channel "${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}" \
        --arg video_url "${STREAM_URL:-}" \
        --arg thumbnail "${THUMBNAIL_CLOUD_URL:-${STREAM_THUMBNAIL:-}}" \
        --arg thumbnail_mega "${THUMBNAIL_MEGA_URL:-}" \
        --argjson duration_sec "${RECORD_DURATION_SEC:-0}" \
        --arg duration_fmt "${RECORD_DURATION_FMT:-00:00:00}" \
        --argjson size_bytes "${RECORD_SIZE_BYTES:-0}" \
        --arg size_human "${RECORD_SIZE_HUMAN:-0 B}" \
        --argjson size_gb "${RECORD_SIZE_GB:-0}" \
        --arg resolution "${RECORD_RESOLUTION:-N/A}" \
        --arg date "$(TZ='Asia/Karachi' date '+%Y-%m-%d')" \
        --arg month "$(TZ='Asia/Karachi' date '+%Y-%m')" \
        --arg archive_link "$archive_link" \
        --arg archive_id "$archive_id" \
        --arg gofile_link "$gofile_link" \
        --arg pixeldrain_link "$pixeldrain_link" \
        --arg mega_link "$mega_link" \
        --arg chat_url "${RECORD_CHAT_URL:-}" \
        --arg recorded_at "$(now_utc_iso)" \
        '{
            video_id: $video_id,
            title: $title,
            channel: $channel,
            video_url: $video_url,
            thumbnail: $thumbnail,
            thumbnail_mega: $thumbnail_mega,
            duration_sec: $duration_sec,
            duration_fmt: $duration_fmt,
            size_bytes: $size_bytes,
            size_human: $size_human,
            size_gb: $size_gb,
            resolution: $resolution,
            date: $date,
            month: $month,
            archive_link: $archive_link,
            archive_id: $archive_id,
            gofile_link: $gofile_link,
            pixeldrain_link: $pixeldrain_link,
            mega_link: $mega_link,
            chat_url: $chat_url,
            recorded_at: $recorded_at
        }')

    # ── Read existing links.txt (JSON mirror) ────────────────────────────────
    log_step "Reading existing links.txt..."
    local existing_links
    existing_links=$(github_api_read_content "links.txt" 2>/dev/null) || existing_links=""
    if [[ -z "$existing_links" || "$existing_links" != "["* ]]; then
        log_warn "links.txt missing or in legacy text format — replacing with JSON mirror"
        existing_links='[]'
    fi
    echo "$existing_links" | jq -e 'type=="array"' >/dev/null 2>&1 || existing_links='[]'

    # ── Upsert (field-level merge; preserves telegram_link / chapters / etc.) ─
    log_step "Upserting entry into links.txt..."
    local new_content
    new_content=$(echo "$existing_links" | jq --argjson e "$entry" '
        ($e | with_entries(select(.value != "" and .value != null))) as $clean
        | [ .[] | if .video_id == $clean.video_id then . * $clean else . end ] as $upserted
        | if any($upserted[]; .video_id == $clean.video_id)
          then $upserted
          else [$e] + $upserted
          end
        | sort_by(.date) | reverse
    ' 2>/dev/null) || new_content="[$entry]"

    # ── Write to GitHub ──────────────────────────────────────────────────────
    log_step "Saving links.txt to GitHub..."
    if github_api_write "links.txt" "$new_content" "🔗 New recording: ${stream_title} — $(TZ='Asia/Karachi' date '+%Y-%m-%d')"; then
        log_ok "Links archive updated successfully"
    else
        log_warn "Failed to update links.txt on GitHub — will retry on next run"
    fi

    log_ok "Done — links.txt update attempted"
    return 0
}

read_links() {
    github_api_read_content "links.txt" 2>/dev/null || echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    update_links
    # NOTE: links.txt is a JSON mirror of data/recordings.json (same schema,
    # same upsert semantics). recordings.json itself is owned by
    # update-stats.sh. Run scripts/repair-archive-data.py to re-sync both.
fi
