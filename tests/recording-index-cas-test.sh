#!/usr/bin/env bash
# A completed recording must survive a concurrent canonical-index update.
# Drives the real update_recordings_json -> quarantine -> Contents API chain.
# CAS=1 injects one other writer between the initial GET and first PUT.
# CAS=0 is the no-conflict control. No network or real credentials are used.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
cat > "$TMP/bin/curl" <<'PY'
#!/usr/bin/env python3
import base64, json, os, pathlib, sys
state = pathlib.Path(os.environ['MOCK_STATE'])
args = sys.argv[1:]
def opt(flag):
    return args[args.index(flag) + 1] if flag in args else None
method = opt('-X') or 'GET'
output = opt('-o')
def reply(code, body=''):
    if output:
        pathlib.Path(output).write_text(body)
    else:
        sys.stdout.write(body)
    # Real curl emits the HTTP status only when -w '%{http_code}' is requested.
    fmt = opt('-w') or ''
    if '%{http_code}' in fmt:
        sys.stdout.write(str(code))
    raise SystemExit(0)
url = next((a for a in args if a.startswith('https://')), '')
if '/contents/data/recordings.json' not in url:
    reply(404, '{}')
remote = json.loads((state / 'remote.json').read_text())
version = int((state / 'version').read_text())
if method == 'PUT':
    raw = opt('-d')
    payload = json.loads(pathlib.Path(raw[1:]).read_text() if raw.startswith('@') else raw)
    puts = int((state / 'puts').read_text()) + 1
    (state / 'puts').write_text(str(puts))
    if os.environ.get('CAS') == '1' and puts == 1:
        remote.insert(0, {'video_id': 'concurrent1', 'title': 'Concurrent recording',
                          'date': '2026-10-01', 'duration_sec': 600})
        version += 1
        (state / 'remote.json').write_text(json.dumps(remote))
        (state / 'version').write_text(str(version))
        reply(409, '{"message":"conflict"}')
    if payload.get('sha') != str(version):
        reply(409, '{"message":"conflict"}')
    decoded = base64.b64decode(payload['content']).decode()
    (state / 'remote.json').write_text(decoded)
    (state / 'version').write_text(str(version + 1))
    reply(200, '{"commit":{"sha":"offline-commit"}}')
reply(200, json.dumps({'sha': str(version),
                      'content': base64.b64encode(json.dumps(remote).encode()).decode()}))
PY
cat > "$TMP/bin/sleep" <<'SH'
#!/bin/bash
# No wall-time cost: this regression is about ordering, not backoff duration.
exit 0
SH
chmod +x "$TMP/bin/curl" "$TMP/bin/sleep"
printf '[{"video_id":"oldrecord01","title":"Old recording","date":"2026-01-01","duration_sec":600}]' > "$TMP/remote.json"
if [[ "${EXISTING_MODE:-old}" == enriched ]]; then
  printf '%s' '[{"video_id":"newrecord01","title":"Existing enriched capture","date":"2026-10-01","duration_sec":600,"archive_node":"https://ia.example/keep.mp4","storyboard":{"url":"https://example/sprite.jpg"},"ai_chapters":[{"time":0,"label":"Intro"}]}]' > "$TMP/remote.json"
fi
printf '1' > "$TMP/version"
printf '0' > "$TMP/puts"
: > "$TMP/gh-env"
: > "$TMP/gh-output"
set +e
PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" CAS="${CAS:-1}" \
  GH_PAT='offline-test-token' GITHUB_REPOSITORY='owner/repo' \
  GITHUB_ENV="$TMP/gh-env" GITHUB_OUTPUT="$TMP/gh-output" \
  STREAM_VIDEO_ID='newrecord01' STREAM_CHANNEL='The Muslim Lantern' \
  STREAM_TITLE='Just-completed recording' RECORD_DURATION_SEC=600 \
  RECORD_SIZE_BYTES=1024 STREAM_URL='https://www.youtube.com/watch?v=newrecord01' \
  bash -c 'source "$1/scripts/update-stats.sh"; update_recordings_json' _ "$ROOT" \
  > "$TMP/run.log" 2>&1
rc=$?
set -e
# Only symptom-bearing state is printed; never request headers or credentials.
EXPECTED_IDS='["oldrecord01","newrecord01"]'
[[ "${CAS:-1}" == 1 ]] && EXPECTED_IDS='["oldrecord01","newrecord01","concurrent1"]'
if [[ "${EXISTING_MODE:-old}" == enriched ]]; then
  if jq -e '.[] | select(.video_id == "newrecord01") | .archive_node == "https://ia.example/keep.mp4" and .storyboard.url == "https://example/sprite.jpg" and (.ai_chapters | length) == 1' "$TMP/remote.json" >/dev/null; then
    echo 'GREEN: re-indexing preserved existing playback and enrichment fields'
    exit 0
  fi
  echo 'RED: re-indexing the same video erased existing playback/enrichment fields'
  jq -c '.[] | select(.video_id == "newrecord01") | {video_id,archive_node,storyboard,ai_chapters}' "$TMP/remote.json"
  exit 1
fi
if jq -e --argjson expected "$EXPECTED_IDS" 'map(.video_id) | sort == ($expected | sort)' "$TMP/remote.json" >/dev/null && (( rc == 0 )); then
  echo "GREEN: CAS=${CAS:-1}: old, concurrent, and completed recordings all survived"
  exit 0
fi
echo "RED: CAS=${CAS:-1}: completed recording disappeared after a concurrent update (exit=$rc)"
jq -c '{surviving_ids: map(.video_id)}' "$TMP/remote.json"
exit 1
