#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  CHECK-INSTALL-DRIFT — warn (never fail) when the real install block grows   ║
# ║  commands the self-test doesn't replay.                                      ║
# ║                                                                              ║
# ║  History: the old inline drift check in install-self-test.yml used            ║
# ║      REAL=$(awk '/Install Dependencies/,/Start PoToken Provider/' ...        ║
# ║               | grep -E ... | wc -l)                                         ║
# ║  under GitHub's default `bash -eo pipefail`. When the real workflow's step   ║
# ║  was renamed ("Install dependencies", Aug 2026) the awk range matched        ║
# ║  nothing, grep exited 1, pipefail+set -e turned that into step exit 1 —      ║
# ║  13 consecutive red runs (Aug 20 → Sep 1 2026) and false Discord pages       ║
# ║  claiming "a live recording would fail right now" while install was fine.    ║
# ║                                                                              ║
# ║  Rules baked in from that incident:                                          ║
# ║   1. Drift is a WARNING, never a failure — this script always exits 0.       ║
# ║   2. No grep pipelines; awk counts with n+0, so no-match yields "0", not     ║
# ║      a non-zero exit.                                                        ║
# ║   3. Missing anchors get their own explicit warning, distinct from drift.    ║
# ║   4. Case-insensitive step-name match — YAML display names churn in case.    ║
# ║                                                                              ║
# ║  Usage: check-install-drift.sh [stream-recorder.yml] [install-self-test.yml] ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# Deliberately NOT set -e / pipefail: counting to zero must never kill us.
set -u

REAL_WF="${1:-.github/workflows/stream-recorder.yml}"
SELF_WF="${2:-.github/workflows/install-self-test.yml}"

# Count install-looking command lines inside the section that starts at the
# step whose name matches $2 (case-insensitive) and ends at the next "- name:".
# Prints 0 (not an error) when nothing matches.
count_install_cmds() {
    local file="$1" name_re="$2"
    [[ -f "$file" ]] || { echo 0; return; }
    awk -v pat="$name_re" '
        # Portable case-insensitivity (mawk lacks IGNORECASE): lower both sides.
        BEGIN { lpat = tolower(pat); inb = 0; done = 0; n = 0 }
        !done && $0 ~ /^[[:space:]]*- name:/ {
            if (inb) { done = 1; inb = 0 }
            else if (index(tolower($0), lpat)) { inb = 1 }
            next
        }
        inb && /^[[:space:]]*(sudo|pip3|curl|sed -i|chmod)/ { n++ }
        END { print n + 0 }
    ' "$file"
}

REAL=$(count_install_cmds "$REAL_WF" 'install dependencies')
TEST=$(count_install_cmds "$SELF_WF" 'replay real install block')

echo "Real workflow install commands: $REAL"
echo "Self-test install commands:     $TEST"

if (( REAL == 0 )); then
    echo "::warning::Could not locate an 'Install dependencies' step in $REAL_WF (renamed again?>). Drift check is blind — update anchors in scripts/check-install-drift.sh."
fi
if (( TEST == 0 )); then
    echo "::warning::Could not locate the 'Replay real install block' step in $SELF_WF. Drift check is blind — update anchors in scripts/check-install-drift.sh."
fi
if (( REAL > 0 && TEST > 0 && REAL > TEST + 1 )); then
    echo "::warning::Real install block has $REAL commands but self-test only mirrors $TEST. Update install-self-test.yml so it stays representative."
fi

# Always succeed — drift must warn loudly but never red-page the channel.
exit 0
