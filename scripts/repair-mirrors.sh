#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🛠️ MIRROR REPAIR — Restore missing/expired public mirrors from Archive.org ║
# ║  Reads data/recordings.json, downloads the permanent Archive.org file,      ║
# ║  reuploads to selected mirrors, and updates data/recordings.json.           ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/utils.sh"
source "$SCRIPT_DIR/upload-clouds.sh"

REPAIR_DIR="${REPAIR_DIR:-/tmp/stream-repair}"
mkdir -p "$REPAIR_DIR"

_is_gofile_alive() {
    local url="$1"
    [[ -z "$url" ]] && return 1
    local code
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 --range 0-1023 -L "$url" 2>/dev/null) || return 1
    [[ "$code" =~ ^(2|3)[0-9]{2}$ ]]
}

_is_pixeldrain_alive() {
    local url="$1"
    [[ -z "$url" ]] && return 1
    local id
    id=$(grep -oE 'pixeldrain\.com/u/[A-Za-z0-9_-]+' <<< "$url" | cut -d/ -f3 | head -1)
    [[ -z "$id" ]] && return 1
    local info success
    info=$(curl -s --max-time 20 "https://pixeldrain.com/api/file/${id}/info" 2>/dev/null) || return 1
    success=$(jq -r '.success // true' <<< "$info" 2>/dev/null)
    [[ "$success" != "false" ]]
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

    log_info "  Archive source: $url"
    log_info "  Downloading to: $out"
    if [[ ! -s "$out" ]]; then
        aria2c -x 8 -s 8 -k 1M --max-tries=5 --retry-wait=5 --dir="$REPAIR_DIR" --out="$(basename "$out")" "$url" >/dev/null 2>&1 || \
        curl -L --retry 3 --max-time 7200 -o "$out" "$url"
    fi
    [[ -s "$out" ]] || return 1
    echo "$out"
}

_update_recording_links() {
    local video_id="$1" gofile="$2" pixel="$3" mega="$4"
    local current updated
    current=$(github_api_read_content "data/recordings.json" 2>/dev/null) || current="$(cat data/recordings.json 2>/dev/null || echo '[]')"
    updated=$(jq \
      --arg id "$video_id" \
      --arg gofile "$gofile" \
      --arg pixel "$pixel" \
      --arg mega "$mega" \
      --arg checked "$(now_utc_iso)" \
      'map(if (.video_id == $id) then
          . + {
            gofile_link: (if $gofile != "" then $gofile else (.gofile_link // "") end),
            pixeldrain_link: (if $pixel != "" then $pixel else (.pixeldrain_link // "") end),
            mega_link: (if $mega != "" then $mega else (.mega_link // "") end),
            mirrors_repaired_at: $checked
          }
        else . end)' <<< "$current") || return 1
    github_api_write "data/recordings.json" "$updated" "🛠️ Mirror repair: ${video_id}" >/dev/null
}

repair_mirrors() {
    log_header "🛠️ MIRROR REPAIR FROM ARCHIVE.ORG"

    local target_video="${TARGET_VIDEO_ID:-}"
    local max_items="${MAX_ITEMS:-3}"
    local dry_run="${DRY_RUN:-false}"
    local destinations="${DESTINATIONS:-gofile,pixeldrain,mega}"

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
        local rec video_id title archive_link gofile_old pixel_old mega_old
        rec=$(jq ".[$idx]" <<< "$candidates")
        video_id=$(jq -r '.video_id // empty' <<< "$rec")
        title=$(jq -r '.title // "recording"' <<< "$rec")
        archive_link=$(jq -r '.archive_link // empty' <<< "$rec")
        gofile_old=$(jq -r '.gofile_link // empty' <<< "$rec")
        pixel_old=$(jq -r '.pixeldrain_link // empty' <<< "$rec")
        mega_old=$(jq -r '.mega_link // empty' <<< "$rec")
        ((idx++)); ((checked++))

        log_separator
        log_info "Checking: ${video_id} — ${title}"

        local need_gofile=false need_pixel=false need_mega=false
        if [[ "$destinations" == *gofile* ]]; then
            _is_gofile_alive "$gofile_old" || need_gofile=true
        fi
        if [[ "$destinations" == *pixeldrain* ]]; then
            _is_pixeldrain_alive "$pixel_old" || need_pixel=true
        fi
        if [[ "$destinations" == *mega* ]]; then
            [[ -n "$mega_old" && "$mega_old" == *mega.nz* ]] || need_mega=true
        fi

        if [[ "$need_gofile" != true && "$need_pixel" != true && "$need_mega" != true ]]; then
            log_ok "  Mirrors already present/alive — skipping"
            continue
        fi

        log_warn "  Needs repair: gofile=${need_gofile}, pixeldrain=${need_pixel}, mega=${need_mega}"
        if [[ "$dry_run" == "true" ]]; then
            continue
        fi

        local file
        file=$(_download_archive_file "$archive_link" "$title") || { log_error "  Could not download Archive.org source"; continue; }

        local new_gofile="" new_pixel="" new_mega=""
        if [[ "$need_gofile" == true ]]; then
            GOFILE_LINKS=()
            upload_to_gofile "$file" "HD" && new_gofile=$(printf '%s' "${GOFILE_LINKS[0]:-}" | cut -d'|' -f2) || true
        fi
        if [[ "$need_pixel" == true ]]; then
            PIXELDRAIN_LINKS=()
            upload_to_pixeldrain "$file" "HD" && new_pixel=$(printf '%s' "${PIXELDRAIN_LINKS[0]:-}" | cut -d'|' -f2) || true
        fi
        if [[ "$need_mega" == true ]]; then
            MEGA_LINKS=()
            upload_to_mega "$file" "HD" && new_mega=$(printf '%s' "${MEGA_LINKS[0]:-}" | cut -d'|' -f2) || true
        fi

        if [[ -n "$new_gofile$new_pixel$new_mega" ]]; then
            _update_recording_links "$video_id" "$new_gofile" "$new_pixel" "$new_mega" || log_warn "  Failed to update recordings.json"
            repaired=$((repaired + 1))
            log_ok "  Repaired mirrors for ${video_id}"
        else
            log_warn "  No new mirrors produced"
        fi
    done

    log_separator
    log_ok "Mirror repair complete: checked=${checked}, repaired=${repaired}"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    repair_mirrors
fi
