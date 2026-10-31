#!/usr/bin/env bash
# The redundant capture path must honor the same cookie-free public contract.
# Execute its real cookie preparation step with a dummy secret, no network.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
ln -s "$ROOT/scripts" "$TMP/scripts"
python3 - "$ROOT/.github/workflows/stream-sniper.yml" "$TMP/step.sh" <<'PY' || exit 2
import pathlib, sys, yaml
w = yaml.safe_load(pathlib.Path(sys.argv[1]).read_text())
env = w['env']
for key, expected in {'PUBLIC_STREAM_ONLY': "${{ vars.PUBLIC_STREAM_ONLY || 'true' }}",
                      'BROWSER_MODE': "${{ vars.BROWSER_MODE || 'cdp' }}",
                      'BROWSER_ASSIST': "${{ vars.BROWSER_ASSIST || 'first' }}"}.items():
    assert env.get(key) == expected, f'{key} default drifted: {env.get(key)!r}'
step = next(s for s in w['jobs']['sniper']['steps'] if s.get('name') == 'Prepare cookies')
assert step.get('if') == "${{ env.PUBLIC_STREAM_ONLY == 'false' }}", \
    f"cookie step must honor resolved default, got: {step.get('if')!r}"
pathlib.Path(sys.argv[2]).write_text(step['run'])
PY
rc=$?
if (( rc != 0 )); then
  echo 'RED: sniper defaults do not match the public cookie-free CDP contract'
  exit 1
fi
# GitHub evaluates the step `if` before running the body. In strict mode the
# body must be skipped entirely; in legacy opt-in mode it may materialize a jar.
(
  cd "$TMP"
  PUBLIC_STREAM_ONLY=false YOUTUBE_COOKIES='dummy-test-cookie-not-a-credential' \
    bash -eo pipefail "$TMP/step.sh"
) > "$TMP/log" 2>&1
if [[ ! -s "$TMP/cookies.txt" ]]; then
  echo 'RED: explicit legacy opt-in did not prepare the cookie jar'
  tail -6 "$TMP/log"
  exit 1
fi
echo 'GREEN: sniper defaults to cookieless CDP; cookie step is gated to explicit legacy opt-in'