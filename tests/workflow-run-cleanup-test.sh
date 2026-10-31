#!/usr/bin/env bash
# Regression: recorder cleanup must not delete other workflows' debug history.
# Runs the actual workflow step with a credential-free curl double.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
python3 - "$ROOT/.github/workflows/stream-recorder.yml" "$TMP/step.sh" <<'PY' || exit 2
import pathlib, sys, yaml
w = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
step = next(s for s in w['jobs']['record']['steps'] if s.get('name') == 'Cleanup old workflow runs')
pathlib.Path(sys.argv[2]).write_text(step['run'])
PY
cat > "$TMP/bin/curl" <<'SH'
#!/usr/bin/env bash
url="${*: -1}"
if [[ "$url" == https://api.github.com/repos/* ]]; then
  printf '%s\n' "$url" >> "$MOCK_CALLS"
  if [[ "$url" == *'/actions/runs/'* ]]; then exit 0; fi
  if [[ "$url" == *'/actions/workflows/stream-recorder.yml/runs?'* ]]; then
    jq -n '{workflow_runs: [{id:101},{id:102},{id:103},{id:104},{id:105},{id:108},{id:109}]}'
    exit 0
  fi
  # The repository-wide endpoint deliberately mixes unrelated workflows.
  jq -n '{workflow_runs: [
    {id:101,workflow_path:".github/workflows/stream-recorder.yml"},
    {id:102,workflow_path:".github/workflows/stream-recorder.yml"},
    {id:103,workflow_path:".github/workflows/stream-recorder.yml"},
    {id:104,workflow_path:".github/workflows/stream-recorder.yml"},
    {id:105,workflow_path:".github/workflows/stream-recorder.yml"},
    {id:106,workflow_path:".github/workflows/quality-check.yml"},
    {id:107,workflow_path:".github/workflows/db-backup.yml"}
  ]}'
fi
SH
chmod +x "$TMP/bin/curl"
: > "$TMP/calls"
PATH="$TMP/bin:$PATH" MOCK_CALLS="$TMP/calls" GH_PAT='stub-token' \
  GITHUB_REPOSITORY='owner/repo' bash -eo pipefail "$TMP/step.sh" > "$TMP/output" 2>&1
if grep -q '/actions/workflows/stream-recorder\.yml/runs?' "$TMP/calls" \
    && ! grep -qE '/actions/runs/(106|107)$' "$TMP/calls"; then
  echo 'GREEN: cleanup queries only Stream Recorder history and preserves unrelated runs'
  exit 0
fi
echo 'RED: cleanup queries repository-wide history; unrelated workflow runs can be deleted'
echo 'Captured endpoint (credentials omitted):'
sed -E 's#https://api.github.com/repos/[^/]+/[^/]+/#<REPO>/#' "$TMP/calls"
exit 1
