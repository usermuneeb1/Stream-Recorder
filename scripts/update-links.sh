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
    log_header "🔗 UPDATING LINKS ARCHIVE"
    
    local stream_title="${STREAM_TITLE:-Unknown Stream}"
    local stream_channel="${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}"
    local expected_channel="${CHANNEL_DISPLAY_NAME:-${RECORDER_NAME:-The Muslim Lantern}}"
    if [[ -n "${STREAM_CHANNEL:-}" ]] && [[ "${STREAM_CHANNEL}" != *"${expected_channel}"* ]] && [[ "${STREAM_CHANNEL}" != *"Muslim Lantern"* ]]; then
        log_warn "Skipping links.txt update — channel '${STREAM_CHANNEL}' is not ${expected_channel}"
        return 0
    fi
    local stream_url="${STREAM_URL:-N/A}"
    local duration_fmt="${RECORD_DURATION_FMT:-00:00:00}"
    local size_human="${RECORD_SIZE_HUMAN:-0 B}"
    local size_gb="${RECORD_SIZE_GB:-0.00}"
    local parts="${RECORD_PARTS:-1}"
    local current_date
    current_date=$(now_pkt)
    local upload_count="${UPLOAD_SUCCESS_COUNT:-0}"
    local upload_total="${UPLOAD_EXPECTED_COUNT:-${UPLOAD_TOTAL_SERVICES:-4}}"
    
    # ── Build new entry ──────────────────────────────────────────────────────
    log_step "Building links entry..."
    
    local safe_title
    safe_title=$(sanitize_filename "$stream_title")
    
    local entry=""
    entry+="========================================\n"
    entry+="Date:     ${current_date}\n"
    entry+="Title:    ${stream_title}\n"
    entry+="Channel:  ${stream_channel}\n"
    entry+="File:     ${safe_title} (${parts} part(s))\n"
    entry+="URL:      ${stream_url}\n"
    entry+="Duration: ${duration_fmt}\n"
    entry+="Size:     ${size_human} (${size_gb} GB)\n"
    entry+="Uploads:  ${upload_count}/${upload_total}\n"
    if [[ -n "${THUMBNAIL_CLOUD_URL:-}" ]]; then
        entry+="Thumbnail: ${THUMBNAIL_CLOUD_URL}\n"
    fi
    if [[ -n "${THUMBNAIL_MEGA_URL:-}" ]]; then
        entry+="ThumbnailMEGA: ${THUMBNAIL_MEGA_URL}\n"
    fi
    if [[ -n "${RECORD_DISCORD_MSG_ID:-}" ]]; then
        entry+="MsgID:    ${RECORD_DISCORD_MSG_ID}\n"
    fi
    entry+="--- Links ---\n"
    
    # Add Gofile links
    if [[ -n "${GOFILE_LINKS:-}" ]]; then
        IFS=';' read -ra g_entries <<< "$GOFILE_LINKS"
        for g_entry in "${g_entries[@]}"; do
            local g_part g_link
            g_part=$(echo "$g_entry" | cut -d'|' -f1)
            g_link=$(echo "$g_entry" | cut -d'|' -f2)
            [[ -n "$g_link" ]] && entry+="[gofile:${g_part}] ${g_link}\n"
        done
    fi
    
    # Add MEGA.nz links
    if [[ -n "${MEGA_LINKS:-}" ]]; then
        IFS=';' read -ra mega_entries <<< "$MEGA_LINKS"
        for mega_entry in "${mega_entries[@]}"; do
            local mega_part mega_link
            mega_part=$(echo "$mega_entry" | cut -d'|' -f1)
            mega_link=$(echo "$mega_entry" | cut -d'|' -f2)
            [[ -n "$mega_link" ]] && entry+="[mega:${mega_part}] ${mega_link} (PERMANENT)\n"
        done
    fi
    
    # Add Pixeldrain links
    if [[ -n "${PIXELDRAIN_LINKS:-}" ]]; then
        IFS=';' read -ra p_entries <<< "$PIXELDRAIN_LINKS"
        for p_entry in "${p_entries[@]}"; do
            local p_part p_link
            p_part=$(echo "$p_entry" | cut -d'|' -f1)
            p_link=$(echo "$p_entry" | cut -d'|' -f2)
            [[ -n "$p_link" ]] && entry+="[pixeldrain:${p_part}] ${p_link}\n"
        done
    fi
    
    # Add Archive.org links
    if [[ -n "${ARCHIVE_LINKS:-}" ]]; then
        IFS=';' read -ra a_entries <<< "$ARCHIVE_LINKS"
        for a_entry in "${a_entries[@]}"; do
            local a_part a_link
            a_part=$(echo "$a_entry" | cut -d'|' -f1)
            a_link=$(echo "$a_entry" | cut -d'|' -f2)
            [[ -n "$a_link" ]] && entry+="[archive:${a_part}] ${a_link} (PERMANENT)\n"
        done
    fi
    
    entry+="========================================\n"
    
    log_info "Entry preview:"
    printf '%b' "$entry" | head -20
    
    # ── Read existing links.txt ──────────────────────────────────────────────
    log_step "Reading existing links.txt..."
    
    local existing_links
    existing_links=$(github_api_read_content "links.txt" 2>/dev/null) || existing_links=""
    
    if [[ -n "$existing_links" ]]; then
        log_info "Existing links.txt: $(echo "$existing_links" | wc -l) lines"
    else
        log_info "No existing links.txt — creating new"
        existing_links="# 📡 Stream Recorder — Links Archive\n# Generated by Automated Stream Recorder v${RECORDER_VERSION:-2.0.0}\n# © ${RECORDER_NAME:-Muneeb Ahmad}\n# Newest entries at the top. Entries are never deleted.\n\n"
    fi
    
    # ── Prepend new entry ────────────────────────────────────────────────────
    log_step "Prepending new entry..."
    
    local new_content
    # Find the header end and insert after it
    if printf '%b' "$existing_links" | head -1 | grep -q "^#"; then
        # Has header — insert after empty line following header
        local header_end
        header_end=$(printf '%b' "$existing_links" | grep -n "^$" | head -1 | cut -d: -f1)
        if [[ -n "$header_end" ]]; then
            local header
            header=$(printf '%b' "$existing_links" | head -n "$header_end")
            local body
            body=$(printf '%b' "$existing_links" | tail -n +"$((header_end + 1))")
            new_content="${header}\n\n$(printf '%b' "$entry")\n${body}"
        else
            new_content="$(printf '%b' "$entry")\n${existing_links}"
        fi
    else
        new_content="$(printf '%b' "$entry")\n${existing_links}"
    fi
    
    # ── Write to GitHub ──────────────────────────────────────────────────────
    log_step "Saving links.txt to GitHub..."
    
    if github_api_write "links.txt" "$(printf '%b' "$new_content")" "🔗 New recording: ${stream_title} — $(TZ='Asia/Karachi' date '+%Y-%m-%d')"; then
        log_ok "Links archive updated successfully"
    else
        log_warn "Failed to update links.txt on GitHub — will retry on next run"
        # Don't return 1 — this is non-fatal. Log is printed above, workflow continues.
    fi
    
    log_ok "Done — links.txt update attempted"
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  UPDATE data/recordings.json  (the gallery's source of truth)
# ═══════════════════════════════════════════════════════════════════════════════
#  Appends a structured entry for the new recording so it appears in the website
#  gallery automatically — no manual editing. Keyed by the Archive identifier so
#  re-runs update in place instead of duplicating. Uses the first Pixeldrain and
#  Archive links captured during upload.
update_recordings_json() {
    log_header "🗂️  UPDATING data/recordings.json (gallery)"

    # ── Pull first link of each provider from the "part|url;part|url" strings ──
    local first_link
    first_link() { echo "$1" | cut -d';' -f1 | cut -d'|' -f2; }

    local archive_link pixeldrain_link gofile_link mega_link
    archive_link=$(first_link "${ARCHIVE_LINKS:-}")
    pixeldrain_link=$(first_link "${PIXELDRAIN_LINKS:-}")
    gofile_link=$(first_link "${GOFILE_LINKS:-}")
    mega_link=$(first_link "${MEGA_LINKS:-}")

    # Need at least an Archive link (permanent, drives the player + unique id).
    if [[ -z "$archive_link" ]]; then
        log_warn "No Archive link — skipping recordings.json update"
        return 0
    fi

    # Unique id = the Archive identifier (e.g. tml-2026-05-xxxx-123456).
    local rec_id
    rec_id=$(echo "$archive_link" | sed -E 's#.*/details/##; s#/.*##')
    [[ -z "$rec_id" ]] && { log_warn "Could not derive recording id"; return 0; }

    local video_id="${STREAM_VIDEO_ID:-${DETECTED_VIDEO_ID:-}}"
    local video_url="${STREAM_URL:-}"
    local title="${STREAM_TITLE:-Recording}"
    local date_str; date_str=$(TZ='Asia/Karachi' date '+%Y-%m-%d')
    local month_str="${date_str:0:7}"
    local dur_fmt="${RECORD_DURATION_FMT:-}"
    local dur_sec="${RECORD_DURATION_SEC:-0}"
    local size_human="${RECORD_SIZE_HUMAN:-}"
    local size_bytes="${RECORD_SIZE_BYTES:-0}"
    local resolution="${RECORD_RESOLUTION:-1920x1080}"
    local recorded_at; recorded_at=$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')

    # ── Read current recordings.json (array) ──────────────────────────────────
    local current
    current=$(github_api_read_content "data/recordings.json" 2>/dev/null) || current="[]"
    echo "$current" | jq -e 'type=="array"' >/dev/null 2>&1 || current="[]"

    # ── Build/merge the entry with jq (newest first, dedup by video_id) ───────
    local updated
    updated=$(echo "$current" | jq \
        --arg id "$rec_id" \
        --arg vid "$video_id" \
        --arg vurl "$video_url" \
        --arg title "$title" \
        --arg date "$date_str" \
        --arg month "$month_str" \
        --arg durf "$dur_fmt" \
        --argjson durs "${dur_sec:-0}" \
        --arg sizeh "$size_human" \
        --argjson sizeb "${size_bytes:-0}" \
        --arg res "$resolution" \
        --arg arch "$archive_link" \
        --arg pd "$pixeldrain_link" \
        --arg gof "$gofile_link" \
        --arg mega "$mega_link" \
        --arg rec "$recorded_at" '
        # thumbnail intentionally empty → site uses public/thumbnail.jpg
        ( [ .[] | select(.video_id != $id) ] ) as $rest
        | [ {
            video_id: $id,
            title: $title,
            channel: "The Muslim Lantern",
            video_url: $vurl,
            thumbnail: "",
            duration_sec: $durs,
            duration_fmt: $durf,
            size_bytes: $sizeb,
            size_human: $sizeh,
            size_gb: (($sizeb // 0) / 1073741824 * 10000 | round / 10000),
            resolution: $res,
            date: $date,
            month: $month,
            archive_link: $arch,
            pixeldrain_link: $pd,
            gofile_link: $gof,
            mega_link: $mega,
            chat_url: "",
            recorded_at: $rec
          } ] + $rest
        | sort_by(.date) | reverse
    ') || { log_warn "jq failed to build recordings.json"; return 0; }

    if github_api_write "data/recordings.json" "$updated" "🗂️ Gallery: add ${title} — ${date_str}"; then
        log_ok "recordings.json updated — gallery will show the new recording"
    else
        log_warn "Failed to update recordings.json — will retry next run"
    fi
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════════
#  READ LINKS (used by refresh and weekly report)
# ═══════════════════════════════════════════════════════════════════════════════

read_links() {
    github_api_read_content "links.txt" 2>/dev/null || echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    update_links
    update_recordings_json
fi
