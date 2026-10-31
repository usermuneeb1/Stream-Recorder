#!/usr/bin/env bash
# Lock acquisition and cleanup must identify a capture by video + owner + run.
# Run without MODE for all controls, or MODE=<case> to isolate one boundary.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CASES=(release-other release-own release-new-run release-unreadable
       acquire-free acquire-same-run acquire-new-run acquire-other-owner acquire-stale)
if [[ -z "${MODE:-}" ]]; then
    failures=0
    for mode in "${CASES[@]}"; do
        MODE="$mode" bash "${BASH_SOURCE[0]}" || (( ++failures ))
    done
    (( failures == 0 )) || exit 1
    echo 'GREEN: all lock ownership and acquisition controls passed'
    exit 0
fi
if [[ " ${CASES[*]} " != *" $MODE "* ]]; then
    echo "Unknown MODE: $MODE" >&2
    exit 2
fi
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
printf '0' > "$TMP/puts"
cat > "$TMP/bin/curl" <<'SH'
#!/usr/bin/env bash
method=GET; payload=''; output=''
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
  case "${args[i]}" in
    -X) method="${args[i+1]}" ;;
    -d) payload="${args[i+1]}" ;;
    -o) output="${args[i+1]}" ;;
  esac
done
if [[ "$method" == PUT ]]; then
  count=$(cat "$MOCK_STATE/puts")
  printf '%d' "$((count + 1))" > "$MOCK_STATE/puts"
  jq -r '.content' < "${payload#@}" | base64 -d > "$MOCK_STATE/written"
  printf '{"commit":{"sha":"offline"}}' > "$output"
  printf '200'
else
  if [[ "${READ_FAIL:-0}" == 1 ]]; then
    printf '503'
    exit 22
  fi
  if [[ -s "$MOCK_STATE/written" ]]; then
    jq -n --rawfile content "$MOCK_STATE/written" '{sha:"offline",content:($content|@base64)}'
  else
    jq -n --arg vid "$REMOTE_VIDEO" --arg owner "$REMOTE_OWNER" --arg run "$REMOTE_RUN" \
      --argjson ts "$REMOTE_EPOCH" \
      '{sha:"1",content:({video_id:(if $vid == "" then null else $vid end),owner:$owner,run_id:$run,started_at_epoch:$ts}|tojson|@base64)}'
  fi
fi
SH
chmod +x "$TMP/bin/curl"

export MOCK_STATE="$TMP" REMOTE_VIDEO=abcdefghijk REMOTE_OWNER=sniper REMOTE_RUN=200
export REMOTE_EPOCH; REMOTE_EPOCH=$(date +%s)
READ_FAIL=0
case "$MODE" in
    release-own|acquire-same-run) REMOTE_OWNER=recorder; REMOTE_RUN=100 ;;
    release-new-run|acquire-new-run) REMOTE_OWNER=recorder ;;
    acquire-other-owner) REMOTE_RUN=100 ;;
    acquire-free) REMOTE_VIDEO='' ;;
    acquire-stale) REMOTE_OWNER=recorder; REMOTE_EPOCH=$((REMOTE_EPOCH - 21601)) ;;
    release-unreadable) READ_FAIL=1 ;;
esac
RC=0
PATH="$TMP/bin:$PATH" READ_FAIL="$READ_FAIL" GH_PAT='<REDACTED>' GITHUB_REPOSITORY='owner/repo' \
  GITHUB_RUN_ID=100 GH_WRITE_MAX_ATTEMPTS=1 \
  bash -c '
    source "$1/scripts/utils.sh"
    source "$1/scripts/recording-lock.sh"
    if [[ "$2" == acquire-* ]]; then
      lock_acquire abcdefghijk recorder
    else
      lock_release abcdefghijk recorder
    fi
  ' _ "$ROOT" "$MODE" > "$TMP/run.log" 2>&1 || RC=$?
PUTS=$(cat "$TMP/puts")
failures=0
check() {
    if eval "$1"; then return 0; fi
    echo "RED [$MODE]: $2"
    (( ++failures ))
}
case "$MODE" in
    acquire-free|acquire-same-run|acquire-stale)
        check '[[ "$RC" == 0 && "$PUTS" == 1 ]]' 'free/stale/same-run acquisition must save exactly one lease'
        if [[ -s "$TMP/written" ]]; then
            check 'jq -e '\'' .video_id == "abcdefghijk" and .owner == "recorder" and .run_id == "100" '\'' "$TMP/written" >/dev/null' 'saved lease must carry this capture identity'
        else
            echo "RED [$MODE]: no lock payload was written"
            (( ++failures ))
        fi
        ;;
    acquire-new-run|acquire-other-owner)
        check '[[ "$RC" == 1 && "$PUTS" == 0 ]]' 'a different active capture must defer without overwriting its lease'
        ;;
    release-own)
        check '[[ "$RC" == 0 && "$PUTS" == 1 ]]' 'owning run must release exactly once'
        if [[ -s "$TMP/written" ]]; then
            check 'jq -e '\''.video_id == null and .owner == null and .run_id == null and .released_by_run == "100"'\'' "$TMP/written" >/dev/null' 'release must clear the owning lease'
        fi
        ;;
    release-other|release-new-run|release-unreadable)
        check '[[ "$RC" == 0 && "$PUTS" == 0 ]]' 'cleanup must preserve another capture or unreadable lease for its owner/TTL'
        ;;
esac
if (( failures )); then
    # Only non-secret failure evidence; never dump request headers or environment.
    grep -E 'Lock busy|Lock acquired|Lock belongs|ownership|not defined|compile error|release attempted' "$TMP/run.log" || true
    exit 1
fi
echo "GREEN [$MODE]: rc=$RC, writes=$PUTS"
