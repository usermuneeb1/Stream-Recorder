#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  YOUTUBE CHANNEL STATS — refresh data/youtube-stats.json                     ║
# ║                                                                              ║
# ║  Called every 6h by .github/workflows/youtube-stats.yml. Consumers:          ║
# ║  scripts/gen-status.py (badges / system-status.json). Schema is fixed:       ║
# ║    subscribers + subscribers_suffix   e.g. 633 + "K", 1.07 + "M"             ║
# ║    total_views + views_suffix         e.g. 183 + "M"                         ║
# ║    video_count, joined_date, last_updated                                    ║
# ║                                                                              ║
# ║  History: until 2026-10-14 this lived inline in the workflow. It only        ║
# ║  parsed counts in the HTML-fallback branch; when yt-dlp SUCCEEDED, nothing   ║
# ║  was read from its JSON, every field fell back to the previous file, and     ║
# ║  the counts sat at their 2026-06-05 values for four months. (The commit      ║
# ║  step was broken too, so nobody noticed the data never moved.)               ║
# ║                                                                              ║
# ║  Sources, in order:                                                          ║
# ║   1. yt-dlp --dump-json on the channel: channel_follower_count,              ║
# ║      playlist_count (video count)                                            ║
# ║   2. channel HTML: subscriberCountText / viewCountText                       ║
# ║   3. /videos HTML: videosCountText                                           ║
# ║   4. the previous file (per field)                                           ║
# ║  If nothing at all could be fetched the file is left untouched (not even     ║
# ║  last_updated) and we exit 0: a YouTube hiccup is not a red page.            ║
# ║                                                                              ║
# ║  Usage: youtube-channel-stats.sh [handle] [out.json]                         ║
# ║    defaults: @TheMuslimLantern  data/youtube-stats.json                      ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
# NO errexit: this script is a chain of greps that are ALLOWED to miss. The
# workflow runs steps under `bash -e`, and `set -uo pipefail` would NOT clear
# an inherited -e, so turn it off explicitly (tests/youtube-channel-stats-test.sh
# runs this under bash -e to prove it).
set +e -uo pipefail

HANDLE="${1:-@TheMuslimLantern}"
OUT="${2:-data/youtube-stats.json}"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

prev() { # prev <jq-path> <default>
    local v
    v=$(jq -r "$1 // empty" "$OUT" 2>/dev/null) || v=""
    printf '%s' "${v:-$2}"
}

# fmt_count <n> <decimals-for-M>
#   fmt_count 1070000 2 -> "1.07 M"   (subscribers: YouTube shows 2 decimals)
#   fmt_count 201345678 0 -> "201 M"  (views: schema stores whole millions)
#   fmt_count 633400 2 -> "633 K" ; fmt_count 950 2 -> "950 "
fmt_count() {
    awk -v n="$1" -v d="${2:-2}" 'BEGIN {
        if (n >= 1000000) {
            if (d > 0) { v = sprintf("%." d "f", n / 1000000); sub(/\.?0+$/, "", v) }
            else { v = sprintf("%d", int(n / 1000000)) }
            printf "%s M", v
        }
        else if (n >= 1000) { printf "%d K", int(n / 1000 + 0.5) }
        else { printf "%d ", n }
    }'
}

# Strip a human string like "1.07M subscribers" / "201,345,678 views" into
# number + suffix as the schema wants them.
split_human() { # split_human "1.07M subscribers" -> "1.07 M"
    local raw="$1" num suf
    num=$(grep -oE '[0-9][0-9.,]*' <<<"$raw" | head -1 | tr -d ',')
    suf=$(grep -oE '[KMB]' <<<"$raw" | head -1)
    [[ -z "$num" ]] && return 1
    printf '%s %s' "$num" "${suf:-}"
}

SUBS_NUM="" SUBS_SUFFIX="" VIEWS_NUM="" VIEWS_SUFFIX="" VIDEO_COUNT=""
GOT_ANYTHING=0

# ── 1. yt-dlp ─────────────────────────────────────────────────────────────────
CHANNEL_JSON=$(yt-dlp --dump-json --playlist-items 0 --flat-playlist \
                 "https://www.youtube.com/${HANDLE}" 2>/dev/null | head -1) || CHANNEL_JSON=""
if [[ -n "$CHANNEL_JSON" ]] && jq -e . >/dev/null 2>&1 <<<"$CHANNEL_JSON"; then
    followers=$(jq -r '.channel_follower_count // empty' <<<"$CHANNEL_JSON")
    if [[ "$followers" =~ ^[0-9]+$ ]]; then
        read -r SUBS_NUM SUBS_SUFFIX <<<"$(fmt_count "$followers" 2)"
        GOT_ANYTHING=1
    fi
    n_videos=$(jq -r '.playlist_count // empty' <<<"$CHANNEL_JSON")
    if [[ "$n_videos" =~ ^[0-9]+$ ]] && (( n_videos > 0 )); then
        VIDEO_COUNT="$n_videos"; GOT_ANYTHING=1
    fi
    views=$(jq -r '.view_count // empty' <<<"$CHANNEL_JSON")
    if [[ "$views" =~ ^[0-9]+$ ]]; then
        read -r VIEWS_NUM VIEWS_SUFFIX <<<"$(fmt_count "$views" 0)"
        GOT_ANYTHING=1
    fi
    echo "yt-dlp: followers=${followers:-?} videos=${n_videos:-?} views=${views:-?}"
else
    echo "yt-dlp yielded nothing usable, falling back to HTML"
fi

# ── 2. channel page (subscribers if still missing, lifetime views) ────────────
PAGE=$(curl -sL --max-time 30 -H "Accept-Language: en" -H "User-Agent: $UA" \
         "https://www.youtube.com/${HANDLE}" 2>/dev/null) || PAGE=""
if [[ -n "$PAGE" ]]; then
    if [[ -z "$SUBS_NUM" ]]; then
        raw=$(grep -oP '"subscriberCountText":\{"simpleText":"\K[^"]*' <<<"$PAGE" | head -1)
        if parsed=$(split_human "${raw:-}"); then
            read -r SUBS_NUM SUBS_SUFFIX <<<"$parsed"; GOT_ANYTHING=1
        fi
    fi
    if [[ -z "$VIEWS_NUM" ]]; then
        raw=$(grep -oP '"viewCountText":\{"simpleText":"\K[^"]*' <<<"$PAGE" | head -1)
        full=$(grep -oE '[0-9][0-9,]*' <<<"${raw:-}" | head -1 | tr -d ',')
        if [[ "$full" =~ ^[0-9]+$ ]]; then
            read -r VIEWS_NUM VIEWS_SUFFIX <<<"$(fmt_count "$full" 0)"; GOT_ANYTHING=1
        fi
    fi
fi

# ── 3. /videos page (video count if still missing) ────────────────────────────
if [[ -z "$VIDEO_COUNT" ]]; then
    VPAGE=$(curl -sL --max-time 30 -H "Accept-Language: en" -H "User-Agent: $UA" \
              "https://www.youtube.com/${HANDLE}/videos" 2>/dev/null) || VPAGE=""
    n=$(grep -oP '"videosCountText":\{"runs":\[\{"text":"\K[0-9,]+' <<<"${VPAGE:-}" | head -1 | tr -d ',')
    if [[ "$n" =~ ^[0-9]+$ ]]; then VIDEO_COUNT="$n"; GOT_ANYTHING=1; fi
fi

# ── 4. nothing fetched → leave the file alone ─────────────────────────────────
if (( GOT_ANYTHING == 0 )); then
    echo "::warning::youtube-stats: could not fetch any channel stat — keeping ${OUT} as is"
    exit 0
fi

# ── Fill the gaps from the previous file, then write ──────────────────────────
SUBS_NUM="${SUBS_NUM:-$(prev .subscribers 0)}"
SUBS_SUFFIX="${SUBS_SUFFIX:-$(prev .subscribers_suffix '')}"
VIEWS_NUM="${VIEWS_NUM:-$(prev .total_views 0)}"
VIEWS_SUFFIX="${VIEWS_SUFFIX:-$(prev .views_suffix '')}"
VIDEO_COUNT="${VIDEO_COUNT:-$(prev .video_count 0)}"
JOINED=$(prev .joined_date "")
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "Subscribers: ${SUBS_NUM}${SUBS_SUFFIX}  Views: ${VIEWS_NUM}${VIEWS_SUFFIX}  Videos: ${VIDEO_COUNT}"

TMP=$(mktemp)
if jq -n \
     --argjson subs "$SUBS_NUM" --arg subs_sfx "$SUBS_SUFFIX" \
     --argjson views "$VIEWS_NUM" --arg views_sfx "$VIEWS_SUFFIX" \
     --argjson videos "$VIDEO_COUNT" --arg joined "$JOINED" --arg now "$NOW" \
     '{subscribers: $subs, subscribers_suffix: $subs_sfx,
       total_views: $views, views_suffix: $views_sfx,
       video_count: $videos, joined_date: $joined, last_updated: $now}' > "$TMP" 2>/dev/null \
   && jq -e . "$TMP" >/dev/null 2>&1; then
    mv "$TMP" "$OUT"
    echo "✅ ${OUT} updated"
else
    rm -f "$TMP"
    echo "::warning::youtube-stats: refusing to write malformed stats (subs='${SUBS_NUM}' views='${VIEWS_NUM}' videos='${VIDEO_COUNT}')"
fi
exit 0
