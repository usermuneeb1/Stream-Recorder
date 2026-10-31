#!/usr/bin/env bash
# A temporary links.txt read outage must not replace the permanent archive.
# MODE=ok: valid read; MODE=cas: one concurrent prepend between GET and PUT.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
printf '0' > "$TMP/puts"
printf '# Links archive\n\nPERMANENT-OLD-ENTRY\n' > "$TMP/remote"
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
  puts=$(( $(cat "$MOCK_STATE/puts") + 1 ))
  printf '%s' "$puts" > "$MOCK_STATE/puts"
  if [[ "${MODE:-fail}" == cas && "$puts" == 1 ]]; then
    printf '# Links archive\n\nCONCURRENT-ENTRY\nPERMANENT-OLD-ENTRY\n' > "$MOCK_STATE/remote"
    printf '409'
    exit 0
  fi
  jq -r '.content' < "${payload#@}" | base64 -d > "$MOCK_STATE/written"
  cp "$MOCK_STATE/written" "$MOCK_STATE/remote"
  printf '{"commit":{"sha":"offline"}}' > "$output"
  printf '200'
elif [[ "${MODE:-fail}" != fail ]]; then
  jq -n --rawfile content "$MOCK_STATE/remote" --arg sha "$(cat "$MOCK_STATE/puts")" \
    '{sha:$sha,content:($content|@base64)}'
else
  exit 22  # curl -f on HTTP 503: no JSON body
fi
SH
printf '#!/bin/bash\nexit 0\n' > "$TMP/bin/sleep"
chmod +x "$TMP/bin/curl" "$TMP/bin/sleep"
set +e
PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" MODE="${MODE:-fail}" \
  GH_PAT='offline-test-token' GITHUB_REPOSITORY='owner/repo' \
  STREAM_TITLE='New capture' STREAM_CHANNEL='The Muslim Lantern' \
  bash -c 'source "$1/scripts/update-links.sh"; update_links' _ "$ROOT" > "$TMP/run.log" 2>&1
rc=$?
set -e
if [[ "${MODE:-fail}" == ok || "${MODE:-fail}" == cas ]]; then
  if (( rc == 0 )) && grep -q 'PERMANENT-OLD-ENTRY' "$TMP/written" && grep -q 'New capture' "$TMP/written"; then
    if [[ "${MODE:-fail}" == cas ]] && ! grep -q 'CONCURRENT-ENTRY' "$TMP/written"; then
      echo 'RED: concurrent links entry lost'; exit 1
    fi
    echo 'GREEN: valid links read preserves old/concurrent entries and adds the new capture'
    exit 0
  fi
  echo 'RED: valid-read control failed'
  exit 1
fi
if (( rc != 0 )) && [[ "$(cat "$TMP/puts")" == 0 ]]; then
  echo 'GREEN: links read outage refused publication; permanent archive untouched'
  exit 0
fi
echo "RED: links read outage replaced the permanent archive (exit=$rc, PUTs=$(cat "$TMP/puts"))"
exit 1
