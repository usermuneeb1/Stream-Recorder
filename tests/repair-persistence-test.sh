#!/usr/bin/env bash
# Repaired links must survive a concurrent index edit, and a failed persistence
# step must not count as a successful repair (which advances the daily budget).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/data"
# Reuse the stateful Contents API transport from the recorder regression.
sed -n '/^cat > "\$TMP\/bin\/curl" <<.PY./,/^PY$/p' "$ROOT/tests/recording-index-cas-test.sh" > "$TMP/transport.sh"
source "$TMP/transport.sh"
cat > "$TMP/bin/sleep" <<'SH'
#!/bin/bash
exit 0
SH
chmod +x "$TMP/bin/curl" "$TMP/bin/sleep"
printf '[{"video_id":"repairme001","title":"Repair target","archive_link":"https://archive.org/details/fixture","gofile_link":"https://gofile.io/d/old"}]' > "$TMP/remote.json"
cp "$TMP/remote.json" "$TMP/data/recordings.json"
printf '1' > "$TMP/version"; printf '0' > "$TMP/puts"
set +e
PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" CAS=1 GH_PAT='offline-test-token' GITHUB_REPOSITORY='owner/repo' \
  bash -c 'source "$1/scripts/repair-mirrors.sh"; _update_recording_links repairme001 "https://gofile.io/d/new" "" "" "" ""' _ "$ROOT" > "$TMP/run.log" 2>&1
rc=$?
set -e
FAIL=0
if (( rc == 0 )) && jq -e 'map(.video_id) | sort == ["concurrent1","repairme001"]' "$TMP/remote.json" >/dev/null &&
   jq -e '.[] | select(.video_id=="repairme001") | .gofile_link == "https://gofile.io/d/new" and has("mirrors_repaired_at")' "$TMP/remote.json" >/dev/null; then
  echo 'GREEN: repaired links and concurrent recording both persisted'
else
  echo "RED: repair persistence lost data or failed (exit=$rc)"
  jq -c 'map({video_id,gofile_link,mirrors_repaired_at})' "$TMP/remote.json"
  FAIL=1
fi
# Full caller seam: upload succeeds, but persistence permanently fails.
printf '1' > "$TMP/version"; printf '0' > "$TMP/puts"
OUT=$(PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" CAS=0 GH_PAT='offline-test-token' GITHUB_REPOSITORY='owner/repo' \
  MAX_ITEMS=1 MAX_ATTEMPTS=1 DESTINATIONS=gofile bash -c '
    source "$1/scripts/repair-mirrors.sh"
    _is_gofile_alive() { return 1; }
    _download_archive_file() { echo "$MOCK_STATE/fake.mp4"; }
    upload_to_gofile() { GOFILE_LINKS=("1|https://gofile.io/d/new"); }
    _update_recording_links() { return 1; }
    printf x > "$MOCK_STATE/fake.mp4"
    repair_mirrors
  ' _ "$ROOT" 2>&1)
if grep -q 'repaired=0' <<<"$OUT"; then
  echo 'GREEN: failed persistence does not consume a successful-repair slot'
else
  echo 'RED: failed persistence was counted as a successful repair'
  grep 'Mirror repair complete' <<<"$OUT" || true
  FAIL=1
fi
exit "$FAIL"
