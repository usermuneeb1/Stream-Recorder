#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for scripts/youtube-channel-stats.sh                        ║
# ║                                                                              ║
# ║  Locks down the youtube-stats.yml incident (red 15/15 runs, counts frozen   ║
# ║  at the 2026-06-05 values until 2026-10-14):                                 ║
# ║   · the inline fetch step only parsed subscriber/view counts in the HTML     ║
# ║     fallback branch; when yt-dlp SUCCEEDED, nothing was read from its JSON   ║
# ║     and every field silently fell back to the previous file                  ║
# ║   · (commit step: wrong pathspec + bare git push — see                       ║
# ║     tests/workflow-git-paths-test.sh and scripts/safe-push.sh)               ║
# ║                                                                              ║
# ║  Must stay true FOREVER:                                                     ║
# ║   1. yt-dlp JSON path: channel_follower_count / playlist_count are used      ║
# ║   2. HTML fallback path still works when yt-dlp yields nothing               ║
# ║   3. total failure → file untouched, exit 0 (never write garbage,            ║
# ║      never red-page for a YouTube hiccup)                                    ║
# ║   4. output is valid JSON with the schema gen-status.py reads                ║
# ║   5. immune to the caller's bash -e (no-match greps must not kill it)        ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
SCRIPT="$ROOT/scripts/youtube-channel-stats.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

FIX=$(mktemp -d)
trap 'rm -rf "$FIX"' EXIT
mkdir -p "$FIX/bin" "$FIX/repo/data"
SEED='{"subscribers": 633, "subscribers_suffix": "K", "total_views": 183, "views_suffix": "M", "video_count": 651, "joined_date": "Mar 3, 2021", "last_updated": "2026-06-05T00:00:00Z"}'

field() { jq -r ".$1" "$FIX/repo/data/youtube-stats.json"; }
# bash -e on purpose: the workflow runs steps under -e; a no-match grep must not kill the script
run_script() { ( cd "$FIX/repo" && PATH="$FIX/bin:$PATH" bash -e "$SCRIPT" ) ; }

# ── Case 1: yt-dlp succeeds → its JSON is the source of truth ─────────────────
echo "── Case 1: yt-dlp JSON path ──"
echo "$SEED" > "$FIX/repo/data/youtube-stats.json"
cat > "$FIX/bin/yt-dlp" <<'EOF'
#!/usr/bin/env bash
echo '{"id":"UC123","title":"The Muslim Lantern","channel_follower_count":1070000,"playlist_count":702,"view_count":null,"_type":"playlist"}'
EOF
cat > "$FIX/bin/curl" <<'EOF'
#!/usr/bin/env bash
# channel page (views) + /videos page (count) — minimal realistic snippets
case "$*" in
  */videos*) printf '{"videosCountText":{"runs":[{"text":"702"},{"text":" videos"}]}}' ;;
  *)         printf '{"subscriberCountText":{"simpleText":"1.07M subscribers"},"viewCountText":{"simpleText":"201,345,678 views"}}' ;;
esac
EOF
chmod +x "$FIX/bin/yt-dlp" "$FIX/bin/curl"
OUT=$(run_script 2>&1); RC=$?
echo "$OUT" | sed 's/^/     /'
[[ $RC -eq 0 ]] && ok "exit 0" || bad "exit $RC"
jq -e . "$FIX/repo/data/youtube-stats.json" >/dev/null 2>&1 && ok "valid JSON" || bad "output is not valid JSON"
[[ "$(field subscribers)$(field subscribers_suffix)" == "1.07M" ]] && ok "subscribers 1.07M from channel_follower_count" || bad "subscribers = $(field subscribers)$(field subscribers_suffix) (expected 1.07M) — yt-dlp JSON ignored again"
[[ "$(field video_count)" == "702" ]] && ok "video_count 702 from playlist_count" || bad "video_count = $(field video_count) (expected 702)"
[[ "$(field total_views)$(field views_suffix)" == "201M" ]] && ok "views 201M from channel page" || bad "views = $(field total_views)$(field views_suffix) (expected 201M)"
[[ "$(field joined_date)" == "Mar 3, 2021" ]] && ok "joined_date preserved" || bad "joined_date lost"
[[ "$(field last_updated)" != "2026-06-05T00:00:00Z" ]] && ok "last_updated refreshed" || bad "last_updated not refreshed"
for k in subscribers subscribers_suffix total_views views_suffix video_count joined_date last_updated; do
    jq -e "has(\"$k\")" "$FIX/repo/data/youtube-stats.json" >/dev/null || bad "schema key missing: $k"
done

# ── Case 2: yt-dlp fails → HTML fallback ──────────────────────────────────────
echo "── Case 2: HTML fallback path ──"
echo "$SEED" > "$FIX/repo/data/youtube-stats.json"
printf '#!/usr/bin/env bash\nexit 1\n' > "$FIX/bin/yt-dlp"
OUT=$(run_script 2>&1); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0" || bad "exit $RC"
[[ "$(field subscribers)$(field subscribers_suffix)" == "1.07M" ]] && ok "subscribers 1.07M from subscriberCountText" || bad "fallback subscribers = $(field subscribers)$(field subscribers_suffix)"
[[ "$(field video_count)" == "702" ]] && ok "video_count 702 from videosCountText" || bad "fallback video_count = $(field video_count)"

# ── Case 3: everything fails → file untouched, exit 0 ─────────────────────────
echo "── Case 3: YouTube unreachable ──"
echo "$SEED" > "$FIX/repo/data/youtube-stats.json"
printf '#!/usr/bin/env bash\nexit 7\n' > "$FIX/bin/curl"
OUT=$(run_script 2>&1); RC=$?
[[ $RC -eq 0 ]] && ok "exit 0 (no red page for a YouTube hiccup)" || bad "exit $RC"
[[ "$(jq -c . "$FIX/repo/data/youtube-stats.json")" == "$(jq -c . <<<"$SEED")" ]] && ok "file byte-for-byte unchanged (incl. last_updated)" || bad "file was modified despite total failure"

# ── Case 4: sub-million subscribers keep the K format ─────────────────────────
echo "── Case 4: K formatting (seed deliberately differs so a pass is not vacuous) ──"
echo '{"subscribers": 1, "subscribers_suffix": "", "total_views": 183, "views_suffix": "M", "video_count": 1, "joined_date": "Mar 3, 2021", "last_updated": "2026-06-05T00:00:00Z"}' > "$FIX/repo/data/youtube-stats.json"
printf '#!/usr/bin/env bash\necho %s\n' "'{\"channel_follower_count\":633400,\"playlist_count\":651}'" > "$FIX/bin/yt-dlp"
printf '#!/usr/bin/env bash\nexit 7\n' > "$FIX/bin/curl"
run_script >/dev/null 2>&1
[[ "$(field subscribers)$(field subscribers_suffix)" == "633K" ]] && ok "633400 → 633K" || bad "633400 → $(field subscribers)$(field subscribers_suffix)"
[[ "$(field total_views)$(field views_suffix)" == "183M" ]] && ok "views fall back to previous value when page fails" || bad "views = $(field total_views)$(field views_suffix)"
[[ "$(field video_count)" == "651" ]] && ok "video_count 651 from playlist_count" || bad "video_count = $(field video_count)"

echo
if (( FAILURES > 0 )); then echo "RESULT: ❌ $FAILURES failure(s)"; exit 1; fi
echo "RESULT: ✅ all youtube-channel-stats checks passed"
