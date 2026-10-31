#!/usr/bin/env bash
# Regression: "poll for up to one hour" is a wall-clock deadline, not 60 x
# (detector runtime + 60 seconds). Replay the actual workflow loop with a
# virtual clock and a slow detector; no network, real sleeps, or recording.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
python3 - "$ROOT/.github/workflows/stream-recorder.yml" "$TMP/step.sh" <<'PY' || exit 2
import pathlib, sys, yaml
w = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
run = next(s for s in w['jobs']['record']['steps'] if s.get('id') == 'detect')['run']
values = {
    'github.event.inputs.force_record': 'false',
    'github.event.inputs.wait_for_live': 'false',
    'github.event.inputs.wait_max_hours': '5',
    'github.event_name': 'repository_dispatch',
}
import re
run = re.sub(r'\$\{\{\s*([^}]+?)\s*\}\}', lambda m: values[m.group(1).strip()], run)
pathlib.Path(sys.argv[2]).write_text(run)
PY
printf '0\n' > "$TMP/clock"
cat > "$TMP/bin/date" <<'SH'
#!/bin/bash
if [[ "${1:-}" == '+%s' ]]; then cat "$MOCK_CLOCK"; else /bin/date "$@"; fi
SH
cat > "$TMP/bin/sleep" <<'SH'
#!/bin/bash
printf '%s\n' "$(( $(cat "$MOCK_CLOCK") + $1 ))" > "$MOCK_CLOCK"
SH
cat > "$TMP/bin/bash" <<'SH'
#!/bin/bash
if [[ "${1:-}" == 'scripts/detect-stream.sh' ]]; then
  printf '%s\n' "$(( $(cat "$MOCK_CLOCK") + ${MOCK_PASS_SECONDS:-90} ))" > "$MOCK_CLOCK"
  echo 'is_live=false' >> "$GITHUB_OUTPUT"
  exit 0
fi
exec /bin/bash "$@"
SH
cat > "$TMP/bin/timeout" <<'SH'
#!/bin/bash
# Model timeout's real deadline enforcement against the virtual detector.
limit="$1"; shift
before=$(cat "$MOCK_CLOCK")
"$@"; rc=$?
after=$(cat "$MOCK_CLOCK")
if (( after > before + limit )); then
  printf '%s\n' "$((before + limit))" > "$MOCK_CLOCK"
  exit 124
fi
exit "$rc"
SH
chmod +x "$TMP/bin/"*
: > "$TMP/output"
(
  cd "$TMP"
  PATH="$TMP/bin:$PATH" MOCK_CLOCK="$TMP/clock" GITHUB_OUTPUT="$TMP/output" \
    MOCK_PASS_SECONDS="${MOCK_PASS_SECONDS:-90}" /bin/bash -eo pipefail "$TMP/step.sh"
) > "$TMP/log" 2>&1
ELAPSED=$(cat "$TMP/clock")
if (( ELAPSED <= 3600 )); then
  echo "GREEN: automatic wait stayed within one hour (${ELAPSED}s virtual time)"
  exit 0
fi
echo "RED: automatic one-hour wait consumed ${ELAPSED}s with 90-second detector passes"
tail -4 "$TMP/log"
exit 1
