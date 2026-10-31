#!/usr/bin/env bash
# Archive imports must be merged into the freshest remote index after a CAS
# conflict, and an API read outage must never fall back to an old checkout.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/data"
sed -n '/^cat > "\$TMP\/bin\/curl" <<.PY./,/^PY$/p' "$ROOT/tests/recording-index-cas-test.sh" > "$TMP/transport.sh"
source "$TMP/transport.sh"
printf '#!/bin/bash\nexit 0\n' > "$TMP/bin/sleep"
chmod +x "$TMP/bin/curl" "$TMP/bin/sleep"
printf '[{"video_id":"oldrecord01","title":"Old","date":"2026-01-01","archive_link":"https://archive.org/details/old"}]' > "$TMP/remote.json"
cp "$TMP/remote.json" "$TMP/data/recordings.json"
printf '1' > "$TMP/version"; printf '0' > "$TMP/puts"
# Exercise the real metadata-to-record conversion; only transport/discovery are
# doubled. The GitHub transport remains stateful and offline.
mv "$TMP/bin/curl" "$TMP/bin/curl.real"
cat > "$TMP/bin/curl" <<'WRAPPER'
#!/bin/bash
for arg in "$@"; do
  if [[ "$arg" == https://archive.org/metadata/* ]]; then
    printf '%s' '{"metadata":{"publicdate":"2026-10-31T00:00:00Z"},"files":[{"name":"video.mp4","format":"MPEG4","length":"600","size":"1024"}]}'
    exit 0
  fi
done
exec "$(dirname "$0")/curl.real" "$@"
WRAPPER
chmod +x "$TMP/bin/curl"
run_import() {
  PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" CAS="${CAS:-1}" GH_PAT='offline-test-token' GITHUB_REPOSITORY='owner/repo' \
    bash -c '
      source "$1/scripts/import-archive-backups.sh"
      _fetch_identifiers() { printf "tml-2026-10-imported001-1793400000\\n"; }
      import_archive_backups
    ' _ "$ROOT"
}
set +e
run_import > "$TMP/run.log" 2>&1
rc=$?
set -e
EXPECTED='["imported001","oldrecord01"]'
[[ "${CAS:-1}" == 1 ]] && EXPECTED='["concurrent1","imported001","oldrecord01"]'
if (( rc == 0 )) && jq -e --argjson expected "$EXPECTED" 'map(.video_id) | sort == ($expected | sort)'  "$TMP/remote.json" >/dev/null; then
  if ! jq -e '.[] | select(.video_id=="imported001") | .video_url == "https://www.youtube.com/watch?v=imported001"' "$TMP/remote.json" >/dev/null; then
    echo 'RED: imported record lacks the video_url required by the dashboard identity parser'
    exit 1
  fi
  echo 'GREEN: imported, concurrent, and existing recordings all survived'
  # Separate outage control: the checkout is readable, but the API is not.
  cat > "$TMP/bin/curl" <<'WRAPPER'
#!/bin/bash
for arg in "$@"; do [[ "$arg" == PUT ]] && exit 99; done
exit 22
WRAPPER
  chmod +x "$TMP/bin/curl"
  printf '0' > "$TMP/puts"
  if run_import > "$TMP/outage.log" 2>&1; then
    echo 'RED: API read outage unexpectedly reported import success'
    exit 1
  fi
  [[ "$(cat "$TMP/puts")" == 0 ]] || { echo 'RED: outage attempted a write'; exit 1; }
  echo 'GREEN: API read outage refused import from the stale checkout'
  exit 0
fi
echo "RED: import lost a recording after concurrent update (exit=$rc)"
jq -c 'map(.video_id)' "$TMP/remote.json"
exit 1
