#!/usr/bin/env bash
# workflow_dispatch.wait_max_hours is a string. A non-numeric value must fall
# back to the documented default instead of poisoning the arithmetic deadline.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
python3 - "$ROOT/.github/workflows/stream-recorder.yml" "$TMP/step.sh" <<'PY' || exit 2
import pathlib, re, sys, yaml
w = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
run = next(s for s in w['jobs']['record']['steps'] if s.get('id') == 'detect')['run']
values = {
    'github.event.inputs.force_record': 'false',
    'github.event.inputs.wait_for_live': 'true',
    'github.event.inputs.wait_max_hours': 'not-a-number',
    'github.event_name': 'workflow_dispatch',
}
run = re.sub(r'\$\{\{\s*([^}]+?)\s*\}\}', lambda m: values[m.group(1).strip()], run)
# Stop immediately after the deadline is computed; this test is about input
# normalization, not polling (covered by recorder-wait-budget-test.sh).
run = run.replace('POLL=0', 'exit 0\n            POLL=0', 1)
pathlib.Path(sys.argv[2]).write_text(run)
PY
cat > "$TMP/bin/date" <<'SH'
#!/bin/bash
if [[ "${1:-}" == '+%s' ]]; then printf '0\n'; else /bin/date "$@"; fi
SH
chmod +x "$TMP/bin/date"
(
  cd "$TMP"
  PATH="$TMP/bin:$PATH" GITHUB_OUTPUT="$TMP/output" /bin/bash -eo pipefail "$TMP/step.sh"
) > "$TMP/log" 2>&1
rc=$?
if (( rc == 0 )) && grep -q 'up to 5h' "$TMP/log"; then
  echo 'GREEN: non-numeric wait_max_hours fell back to the 5h default'
  exit 0
fi
echo "RED: non-numeric wait_max_hours was not normalized (exit=$rc)"
tail -6 "$TMP/log"
exit 1
