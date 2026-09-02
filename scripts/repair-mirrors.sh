#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  MIRROR REPAIR, Restore missing/expired public mirrors from Archive.org      ║
# ║  Reads data/recordings.json, downloads the permanent Archive.org file,       ║
# ║  reuploads to selected mirrors, and updates data/recordings.json.            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"
source "$SCRIPT_DIR/upload-clouds.sh"

REPAIR_DIR="${REPAIR_DIR:-/tmp/stream-repair}"
# FORCE=true skips all "alive" checks, always re-uploads every mirror.
# Useful when links appear alive (HTTP 200) but are actually expired.
FORCE_REPAIR="${FORCE_REPAIR:-false}"
mkdir -p "$REPAIR_DIR"

_is_gofile_alive() {
    local url="$1"
    [[ -z "$url" ]] && return 1
    # FORCE mode = always consider dead (force re-upload)
    [[ "${FORCE_REPAIR:-false}" == "true" ]] && return 1
    # The Contents API (public website token — no account key, by policy
    # 2026-09-02) is authoritative; /d/ pages return 200 even when expired
    # (SPA shell). 2026-09-02: page-grep said "alive" for every dead folder.
    local code status
    code=$(sed -n 's#.*gofile\.io/d/\([^/?# ]*\).*#\1#p' <<< "$url" | head -1)
    if [[ -n "$code" ]]; then
        status=$(curl -s --max-time 20 \
            "https://api.gofile.io/contents/${code}?wt=4fd6sg89d7s6" 2>/dev/null | jq -r '.status // "error"' 2>/dev/null)
        case "$status" in
            ok) return 0 ;;
            *notFound*|*notfound*) return 1 ;;
            *) : ;;  # token/network error → unverifiable, fall through to heuristic
        esac
    fi
    # Gofile pages return HTTP 200 even when expired. Check actual content.
    local page
    page=$(curl -sL --max-time 20 "$url" 2>/dev/null) || return 1
    # If page contains "not found" or "expired" or lacks download button, it's dead
    if echo "$page" | grep -qiE "not found|file.*(removed|expired|deleted)|contentnotfound"; then
        return 1
    fi
    # Also check if the page is basically empty / error page
    local size=${#page}
    # Check for known Gofile error indicators (more reliable than byte count)
    if echo "$page" | grep -qiE "(page not found|file was deleted|removed|expired|404)"; then
        return 1
    fi
    (( size < 300 )) && return 1
    return 0
}

_is_pixeldrain_alive() {
    local url="$1"
    [[ -z "$url" ]] && return 1
    [[ "${FORCE_REPAIR:-false}" == "true" ]] && return 1
    local id
    id=$(grep -oE 'pixeldrain\.com/u/[A-Za-z0-9_-]+' <<< "$url" | cut -d/ -f3 | head -1)
    [[ -z "$id" ]] && return 1
    local info verdict
    info=$(curl -s --max-time 20 "https://pixeldrain.com/api/file/${id}/info" 2>/dev/null) || return 1
    # EXPLICIT compare. jq's `//` is the alternative operator: it replaces
    # `false` as well as `null`, so the old `jq -r '.success // true'` answered
    # "true" for {"success":false} — every dead pixeldrain link looked alive,
    # need_pixel stayed false, and repair-mirrors finished green without
    # re-uploading anything (2026-09-02, the "44s vacuous run").
    verdict=$(jq -r 'if .success == false then "dead"
                     elif .success == true then "alive"
                     else "unknown" end' <<< "$info" 2>/dev/null || echo "unknown")
    # "unknown" (HTML error page, rate limit, provider outage) is NOT alive:
    # the repair path re-checks and re-uploads from a permanent mirror, and a
    # wasted re-upload is far cheaper than a permanently dead public link.
    [[ "$verdict" == "alive" ]]
}

_is_st0807_alive() {
    local url="$1"
    [[ -z "$url" ]] && return 1
    [[ "${FORCE_REPAIR:-false}" == "true" ]] && return 1
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 --range 0-1023 -L "$url" 2>/dev/null) || return 1
    [[ "$code" =~ ^(2|3)[0-9]{2}$ ]]
}

_is_vikingfile_alive() {
    local url="$1"
    [[ -z "$url" ]] && return 1
    [[ "${FORCE_REPAIR:-false}" == "true" ]] && return 1
    local hash
    hash=$(echo "$url" | sed -n 's#.*vikingfile.com/f/\([^/?#]*\).*#\1#p')
    [[ -z "$hash" ]] && return 1
    local info exist
    info=$(curl -s --max-time 20 -X POST "https://vikingfile.com/api/check-file" -F "hash=${hash}" 2>/dev/null) || return 1
    exist=$(jq -r '.exist // empty' <<< "$info" 2>/dev/null)
    [[ "$exist" == "true" ]]
}

_archive_id_from_url() {
    sed -E 's#.*archive\.org/details/([^/?#]+).*#\1#' <<< "$1"
}

_archive_best_file_url() {
    local archive_link="$1"
    local archive_id
    archive_id=$(_archive_id_from_url "$archive_link")
    [[ -z "$archive_id" || "$archive_id" == "$archive_link" ]] && return 1

    local metadata selected
    metadata=$(curl -fsS --max-time 30 "https://archive.org/metadata/${archive_id}" 2>/dev/null) || return 1
    selected=$(jq -r '
      [.files[]?
       | select(.name | test("\\.(mp4|m4v|webm|mkv)$"; "i"))
       | select(.name | test("(_thumb|_ia_thumb)"; "i") | not)
       | . + {score: (
           (if (.name|test("\\.mp4$";"i")) then 120 else 0 end) +
           (if ((.format // "")|test("MPEG4|h\\.264|h264";"i")) then 60 else 0 end) +
           (if (.name|test("compressed";"i")|not) then 30 else 0 end) +
           (((.size // "0")|tonumber? // 0) / 1000000000)
         )}
      ] | sort_by(.score) | reverse | .[0].name // empty
    ' <<< "$metadata" 2>/dev/null)
    [[ -z "$selected" ]] && return 1

    local encoded
    encoded=$(python3 - <<PY
import urllib.parse
print('/'.join(urllib.parse.quote(part) for part in '''$selected'''.split('/')))
PY
)
    echo "https://archive.org/download/${archive_id}/${encoded}"
}

_download_archive_file() {
    local archive_link="$1"
    local title="$2"
    local url filename out
    url=$(_archive_best_file_url "$archive_link") || return 1
    filename=$(basename "${url%%\?*}")
    filename=$(python3 - <<PY
import urllib.parse
print(urllib.parse.unquote('''$filename'''))
PY
)
    [[ -z "$filename" ]] && filename="$(sanitize_filename "$title").mp4"
    out="${REPAIR_DIR}/$(make_safe_filename "$filename")"

    log_info "  Archive source: $url" >&2
    log_info "  Downloading to: $out" >&2
    if [[ ! -s "$out" ]]; then
        aria2c -x 8 -s 8 -k 1M --max-tries=5 --retry-wait=5 --dir="$REPAIR_DIR" --out="$(basename "$out")" "$url" >/dev/null 2>&1 || \
        curl -L --retry 3 --max-time 7200 -o "$out" "$url"
    fi
    [[ -s "$out" ]] || return 1
    echo "$out"
}

_update_recording_links() {
    local video_id="$1" gofile="$2" pixel="$3" mega="$4" st0807="$5" viking="$6"
    local current updated
    current=$(github_api_read_content "data/recordings.json" 2>/dev/null) || current="$(cat data/recordings.json 2>/dev/null || echo '[]')"
    # NEVER let a failed read become a wipe of the canonical index:
    # refuse to write when the current data isn't a non-empty array.
    if ! jq -e 'type == "array" and length > 0' <<< "$current" >/dev/null 2>&1; then
        log_error "  recordings.json unreadable/empty — refusing to write (would wipe the index)"
        return 1
    fi
    updated=$(jq \
      --arg id "$video_id" \
      --arg gofile "$gofile" \
      --arg pixel "$pixel" \
      --arg mega "$mega" \
      --arg st0807 "${st0807:-}" \
      --arg viking "${viking:-}" \
      --arg checked "$(now_utc_iso)" \
      'map(if (.video_id == $id) then
          . + {
            gofile_link: (if $gofile != "" then $gofile else (.gofile_link // "") end),
            pixeldrain_link: (if $pixel != "" then $pixel else (.pixeldrain_link // "") end),
            mega_link: (if $mega != "" then $mega else (.mega_link // "") end),
            st0807_link: (if $st0807 != "" then $st0807 else (.st0807_link // "") end),
            vikingfile_link: (if $viking != "" then $viking else (.vikingfile_link // "") end),
            mirrors_repaired_at: $checked
          }
        else . end)' <<< "$current") || return 1
    if ! jq -e 'type == "array" and length > 0' <<< "$updated" >/dev/null 2>&1; then
        log_error "  computed recordings.json update is empty — refusing to write"
        return 1
    fi
    github_api_write "data/recordings.json" "$updated" "Mirror repair: ${video_id}" >/dev/null
}

repair_mirrors() {
    log_header "MIRROR REPAIR FROM ARCHIVE.ORG"

    local target_video="${TARGET_VIDEO_ID:-}"
    local max_items="${MAX_ITEMS:-3}"
    local dry_run="${DRY_RUN:-false}"
    local destinations="${DESTINATIONS:-gofile,pixeldrain,mega,st0807,vikingfile}"
    # Older workflow YAML still passes DESTINATIONS=gofile,pixeldrain,mega.
    # Keep the new hosts in the repair set unless the caller opted out.
    if [[ "${ST0807_SKIP:-false}" != "true" && "$destinations" != *st0807* && "$destinations" != *0807* ]]; then
        destinations="${destinations},st0807"
    fi
    if [[ "${VIKINGFILE_SKIP:-false}" != "true" && "$destinations" != *vikingfile* && "$destinations" != *viking* ]]; then
        destinations="${destinations},vikingfile"
    fi

    local records
    records=$(github_api_read_content "data/recordings.json" 2>/dev/null) || records="$(cat data/recordings.json 2>/dev/null || echo '[]')"

    local filter
    if [[ -n "$target_video" ]]; then
        filter="map(select(.video_id == \"$target_video\"))"
    else
        filter='.'
    fi

    local candidates
    candidates=$(jq "$filter | [.[] | select((.archive_link // \"\") != \"\")]" <<< "$records") || candidates="[]"
    local count
    count=$(jq 'length' <<< "$candidates")
    log_info "Candidates with Archive.org source: $count"

    local repaired=0 checked=0
    local idx=0
    while (( idx < count && repaired < max_items )); do
        local rec video_id title archive_link gofile_old pixel_old mega_old st0807_old viking_old
        rec=$(jq ".[$idx]" <<< "$candidates")
        video_id=$(jq -r '.video_id // empty' <<< "$rec")
        title=$(jq -r '.title // "recording"' <<< "$rec")
        archive_link=$(jq -r '.archive_link // empty' <<< "$rec")
        gofile_old=$(jq -r '.gofile_link // empty' <<< "$rec")
        pixel_old=$(jq -r '.pixeldrain_link // empty' <<< "$rec")
        mega_old=$(jq -r '.mega_link // empty' <<< "$rec")
        st0807_old=$(jq -r '.st0807_link // empty' <<< "$rec")
        viking_old=$(jq -r '.vikingfile_link // empty' <<< "$rec")
        ((idx++)); ((checked++))

        log_separator
        log_info "Checking: ${video_id}, ${title}"

        local need_gofile=false need_pixel=false need_mega=false need_st0807=false need_viking=false
        if [[ "$destinations" == *gofile* ]]; then
            _is_gofile_alive "$gofile_old" || need_gofile=true
        fi
        if [[ "$destinations" == *pixeldrain* ]]; then
            _is_pixeldrain_alive "$pixel_old" || need_pixel=true
        fi
        if [[ "$destinations" == *mega* ]]; then
            if [[ "${FORCE_REPAIR:-false}" == "true" ]] || [[ -z "$mega_old" ]] || [[ "$mega_old" != *mega.nz* ]]; then need_mega=true; fi
        fi
        if [[ "$destinations" == *st0807* || "$destinations" == *0807* ]]; then
            _is_st0807_alive "$st0807_old" || need_st0807=true
        fi
        if [[ "$destinations" == *vikingfile* || "$destinations" == *viking* ]]; then
            _is_vikingfile_alive "$viking_old" || need_viking=true
        fi

        if [[ "$need_gofile" != true && "$need_pixel" != true && "$need_mega" != true && "$need_st0807" != true && "$need_viking" != true ]]; then
            log_ok "  Mirrors already present/alive, skipping"
            continue
        fi

        log_warn "  Needs repair: gofile=${need_gofile}, pixeldrain=${need_pixel}, mega=${need_mega}, 0807=${need_st0807}, vikingfile=${need_viking}"
        if [[ "$dry_run" == "true" ]]; then
            continue
        fi

        local file
        file=$(_download_archive_file "$archive_link" "$title" | tail -n 1) || { log_error "  Could not download Archive.org source"; continue; }
        if [[ -z "$file" || ! -s "$file" ]]; then
            log_error "  Downloaded Archive.org source is missing or empty: ${file:-none}"
            continue
        fi
        log_ok "  Download ready: $(basename "$file") ($(format_size "$(get_file_size "$file")"))"

        local new_gofile="" new_pixel="" new_mega="" new_st0807="" new_viking=""
        if [[ "$need_gofile" == true ]]; then
            GOFILE_LINKS=()
            if upload_to_gofile "$file" "HD"; then
                new_gofile=$(printf '%s' "${GOFILE_LINKS[0]:-}" | cut -d'|' -f2 || true)
            else
                log_warn "  Gofile upload failed for ${video_id}"
            fi
        fi
        if [[ "$need_pixel" == true ]]; then
            PIXELDRAIN_LINKS=()
            if upload_to_pixeldrain "$file" "HD"; then
                new_pixel=$(printf '%s' "${PIXELDRAIN_LINKS[0]:-}" | cut -d'|' -f2 || true)
            else
                log_warn "  Pixeldrain upload failed for ${video_id}"
            fi
        fi
        if [[ "$need_mega" == true ]]; then
            MEGA_LINKS=()
            # Use generated MEGA accounts from scripts/mega/accounts.csv when available.
            # This avoids relying only on the single MEGA_EMAIL/MEGA_PASSWORD secret.
            if [[ -f "$SCRIPT_DIR/mega-rotate.sh" ]]; then
                # shellcheck source=scripts/mega-rotate.sh
                source "$SCRIPT_DIR/mega-rotate.sh"
                select_mega_account || true
            fi
            if upload_to_mega "$file" "HD"; then
                new_mega=$(printf '%s' "${MEGA_LINKS[0]:-}" | cut -d'|' -f2 || true)
            else
                log_warn "  MEGA upload failed for ${video_id}"
            fi
        fi

        if [[ "$need_st0807" == true ]]; then
            ST0807_LINKS=()
            if upload_to_st0807 "$file" "HD"; then
                new_st0807=$(printf '%s' "${ST0807_LINKS[0]:-}" | cut -d'|' -f2 || true)
            else
                log_warn "  0807.st upload failed for ${video_id}"
            fi
        fi
        if [[ "$need_viking" == true ]]; then
            VIKINGFILE_LINKS=()
            if upload_to_vikingfile "$file" "HD"; then
                new_viking=$(printf '%s' "${VIKINGFILE_LINKS[0]:-}" | cut -d'|' -f2 || true)
            else
                log_warn "  VikingFile upload failed for ${video_id}"
            fi
        fi

        if [[ -n "$new_gofile$new_pixel$new_mega$new_st0807$new_viking" ]]; then
            _update_recording_links "$video_id" "$new_gofile" "$new_pixel" "$new_mega" "$new_st0807" "$new_viking" || log_warn "  Failed to update recordings.json"
            repaired=$((repaired + 1))
            log_ok "  Repaired mirrors for ${video_id}"
        else
            log_warn "  No new mirrors produced"
        fi

        # Free the downloaded source before the next candidate — multi-GB
        # files accumulate in /tmp and can exhaust the runner disk (2026-09-02).
        rm -f "${file:-}"
    done

    log_separator
    log_ok "Mirror repair complete: checked=${checked}, repaired=${repaired}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    repair_mirrors
fi
