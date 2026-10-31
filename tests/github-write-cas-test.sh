#!/usr/bin/env bash
# A stale read-modify-write must never overwrite a concurrent GitHub update.
# Replay a real 409 through github_api_write with a stateful, offline curl double.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
printf '%s' '["base-record"]' > "$TMP/remote"
printf '1' > "$TMP/version"
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
if [[ "$method" == GET ]]; then
  jq -n --rawfile content "$MOCK_STATE/remote" --arg sha "$(cat "$MOCK_STATE/version")" \
    '{sha:$sha,content:($content|@base64)}'
  exit 0
fi
body=$(cat "${payload#@}")
puts=$(( $(cat "$MOCK_STATE/puts") + 1 ))
printf '%s' "$puts" > "$MOCK_STATE/puts"
# The first PUT loses the race: a concurrent writer lands between GET and PUT.
if [[ "$puts" == 1 ]]; then
  printf '%s' '["concurrent-record"]' > "$MOCK_STATE/remote"
  printf '2' > "$MOCK_STATE/version"
  printf '409'
  exit 0
fi
if [[ "$(jq -r '.sha // ""' <<<"$body")" != "$(cat "$MOCK_STATE/version")" ]]; then
  printf '409'
  exit 0
fi
jq -r '.content' <<<"$body" | base64 -d > "$MOCK_STATE/remote"
printf '2' > "$MOCK_STATE/version"
printf '{"commit":{"sha":"local-commit"}}' > "$output"
printf '200'
SH
chmod +x "$TMP/bin/curl"
# Source the unmodified helper. Its first GET sees version 1, then another
# writer lands version 2 before its PUT.
set +e
PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" GH_PAT='dummy-test-token' \
  GITHUB_REPOSITORY='owner/repo' GH_WRITE_MAX_ATTEMPTS=3 bash -c '
    source "$1/scripts/utils.sh"
    github_api_write "data/recordings.json" "[\"stale-local-record\"]" "stale writer"
  ' _ "$ROOT" > "$TMP/log" 2>&1
rc=$?
set -e
REMOTE=$(cat "$TMP/remote")
if [[ "$rc" -ne 0 && "$REMOTE" == '["concurrent-record"]' ]]; then
  echo 'GREEN: conflict was reported and the concurrent remote record survived'
  exit 0
fi
echo "RED: stale CAS result: exit=$rc remote=$REMOTE"
tail -6 "$TMP/log"
exit 1