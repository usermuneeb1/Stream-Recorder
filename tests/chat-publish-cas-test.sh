#!/usr/bin/env bash
# A chat publish must merge a concurrent replay, not drop the new capture or
# overwrite messages collected by another run. All GitHub traffic is doubled.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/record"
cat > "$TMP/bin/curl" <<'PY'
#!/usr/bin/env python3
import base64, json, os, pathlib, sys
state=pathlib.Path(os.environ['MOCK_STATE']); args=sys.argv[1:]
def opt(flag): return args[args.index(flag)+1] if flag in args else None
method=opt('-X') or 'GET'; output=opt('-o')
def reply(code, body=''):
    if output: pathlib.Path(output).write_text(body)
    else: sys.stdout.write(body)
    if '%{http_code}' in (opt('-w') or ''): sys.stdout.write(str(code))
    raise SystemExit(0)
url=next((a for a in args if a.startswith('https://')), '')
if '/contents/data/chat/abcdefghijk.json' not in url: reply(404, '{}')
remote=json.loads((state/'remote.json').read_text())
version=int((state/'version').read_text())
if method == 'PUT':
    raw=opt('-d'); payload=json.loads(pathlib.Path(raw[1:]).read_text())
    puts=int((state/'puts').read_text())+1; (state/'puts').write_text(str(puts))
    mode=os.environ.get('CAS','1')
    if mode == '2': reply(409, '{"message":"conflict"}')
    if mode == '1' and puts == 1:
        remote['messages'].append({'t':3,'a':'Concurrent','m':'Only in the other capture'})
        version+=1
        (state/'remote.json').write_text(json.dumps(remote)); (state/'version').write_text(str(version))
        reply(409, '{"message":"conflict"}')
    if payload.get('sha') != str(version): reply(409, '{"message":"conflict"}')
    (state/'remote.json').write_text(base64.b64decode(payload['content']).decode())
    (state/'version').write_text(str(version+1))
    reply(200, '{"commit":{"sha":"offline"}}')
reply(200, json.dumps({'sha':str(version),'content':base64.b64encode(json.dumps(remote).encode()).decode()}))
PY
cat > "$TMP/bin/sleep" <<'SH'
#!/bin/bash
exit 0
SH
chmod +x "$TMP/bin/curl" "$TMP/bin/sleep"
printf '%s' '{"messages":[{"t":1,"a":"Existing","m":"Keep remote message"}]}' > "$TMP/remote.json"
printf '%s' '{"messages":[{"t":2,"a":"Local","m":"Keep new capture"}]}' > "$TMP/record/chat.json"
printf '1' > "$TMP/version"; printf '0' > "$TMP/puts"; : > "$TMP/env"
RC=0
PATH="$TMP/bin:$PATH" MOCK_STATE="$TMP" CAS="${CAS:-1}" GH_WRITE_MAX_ATTEMPTS=2 \
  GH_PAT='<REDACTED>' GITHUB_REPOSITORY='owner/repo' GITHUB_ENV="$TMP/env" \
  STREAM_VIDEO_ID=abcdefghijk RECORD_CHAT_FILE="$TMP/record/chat.json" \
  RECORD_CHAT_URL='' RECORD_CHAT_REPO='' \
  bash -c 'source "$1/scripts/utils.sh"; source "$1/scripts/upload-clouds.sh"; publish_chat_to_repo' _ "$ROOT" \
  > "$TMP/run.log" 2>&1 || RC=$?
if [[ "${CAS:-1}" == 2 ]]; then
  if (( RC != 0 )) && ! grep -q '^RECORD_CHAT_' "$TMP/env" && \
     jq -e '.messages | length == 1' "$TMP/remote.json" >/dev/null; then
    echo 'GREEN: exhausted chat conflicts fail without publishing a success URL or replacing remote data'
    exit 0
  fi
  echo 'RED: exhausted chat conflicts reported success or changed remote data'
  exit 1
fi
# No-conflict control replaces the replay with the new capture. A conflict
# must instead union the fresh remote messages with the local capture.
EXPECTED=1; [[ "${CAS:-1}" == 1 ]] && EXPECTED=3
REMOTE_CHECK='true'; [[ "${CAS:-1}" == 1 ]] && REMOTE_CHECK='any(.messages[]; .a == "Existing") and any(.messages[]; .a == "Concurrent")'
if (( RC == 0 )) && jq -e --argjson n "$EXPECTED" '.messages | length == $n' "$TMP/remote.json" >/dev/null && \
   jq -e "any(.messages[]; .a == \"Local\") and ($REMOTE_CHECK)" "$TMP/remote.json" >/dev/null && \
   grep -q '^RECORD_CHAT_REPO=data/chat/abcdefghijk.json$' "$TMP/env"; then
  echo "GREEN: chat publish preserved all $EXPECTED messages and published its URL only after saving"
  exit 0
fi
echo "RED: chat publish lost messages after CAS=${CAS:-1} (exit=$RC)"
jq -c '{messages: [.messages[].a]}' "$TMP/remote.json"
exit 1
