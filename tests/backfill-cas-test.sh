#!/usr/bin/env bash
# Backfill must reapply its field patch to a fresh index after a CAS conflict.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/data"
sed -n '/^cat > "\$TMP\/bin\/curl" <<.PY./,/^PY$/p' "$ROOT/tests/recording-index-cas-test.sh" > "$TMP/transport.sh"
source "$TMP/transport.sh"
printf '#!/bin/bash\nexit 0\n' > "$TMP/bin/sleep"
chmod +x "$TMP/bin/curl" "$TMP/bin/sleep"
printf '[{"video_id":"oldrecord01","archive_link":"https://archive.org/details/old","archive_direct":"https://archive.org/download/old/v.mp4","archive_node":"https://ia.example/old.mp4"}]' > "$TMP/remote.json"
cp "$TMP/remote.json" "$TMP/data/recordings.json"
printf '1' > "$TMP/version"; printf '0' > "$TMP/puts"
set +e
PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" CAS=1 GH_PAT='offline-test-token' GITHUB_REPOSITORY='owner/repo' \
  RECORDINGS_JSON="$TMP/data/recordings.json" bash -c '
    source "$1/scripts/backfill-archive-nodes.sh"
    UPDATES="[{\"video_id\":\"oldrecord01\",\"archive_node\":\"https://ia.example/new.mp4\"}]"
    persist_updates
  ' _ "$ROOT" > "$TMP/run.log" 2>&1
rc=$?
set -e
if (( rc == 0 )) && jq -e 'map(.video_id) | sort == ["concurrent1","oldrecord01"]' "$TMP/remote.json" >/dev/null &&
   jq -e '.[] | select(.video_id=="oldrecord01") | .archive_node == "https://ia.example/new.mp4"' "$TMP/remote.json" >/dev/null; then
  echo 'GREEN: backfill patch and concurrent recording both persisted'
  exit 0
fi
echo "RED: backfill lost its patch or the concurrent recording (exit=$rc)"
jq -c 'map({video_id,archive_node})' "$TMP/remote.json"
exit 1
