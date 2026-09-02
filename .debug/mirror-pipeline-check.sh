#!/usr/bin/env bash
# [DEBUG-mh1] THROWAWAY debug harness — DO NOT SHIP. Deleted in Phase 6 cleanup.
# Phase 1 feedback loop for: "dead pixeldrain/gofile links are not auto-updated"
# Asserts the user's exact symptom. Exit 1 = RED (bug present), 0 = GREEN.
# Checks 1-2 are local+deterministic; checks 3-4 query GitHub run conclusions.
set -u
cd "$(dirname "$0")/.."
red() { printf '  \033[31mRED\033[0m   %s\n' "$1"; }
grn() { printf '  \033[32mGREEN\033[0m %s\n' "$1"; }
FAIL=0

echo "CHECK 1: mirror-health covers every recording"
gh api 'repos/usermuneeb1/Stream-Recorder/contents/data/recordings.json?ref=main' -q '.content' | base64 -d > /tmp/dbg-recs.json 2>/dev/null
gh api 'repos/usermuneeb1/Stream-Recorder/contents/data/mirror-health.json?ref=main' -q '.content' | base64 -d > /tmp/dbg-mh.json 2>/dev/null
TOTAL_REC=$(python3 -c "import json;print(len(json.load(open('/tmp/dbg-recs.json'))))")
COVERED=$(python3 -c "import json;print(json.load(open('/tmp/dbg-mh.json'))['summary']['total'])")
if [ "$COVERED" -eq "$TOTAL_REC" ] && [ "$TOTAL_REC" -gt 0 ]; then
  grn "mirror-health covers $COVERED/$TOTAL_REC recordings"
else
  red "mirror-health covers $COVERED/$TOTAL_REC recordings — dead links invisible to repair queue"
  FAIL=1
fi

echo "CHECK 2: gofile mirrors inside 10-day expiry window (mirrors_repaired_at < 9d old)"
STALE=$(python3 - <<'EOF'
import json, datetime
now = datetime.datetime.now(datetime.timezone.utc)
stale = 0
for r in json.load(open('/tmp/dbg-recs.json')):
    ts = r.get('mirrors_repaired_at')
    if not ts or not r.get('gofile_link'):
        stale += 1; continue
    t = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
    if (now - t).days >= 9:
        stale += 1
print(stale)
EOF
)
if [ "$STALE" -eq 0 ]; then grn "all gofile links refreshed < 9d ago"
else red "$STALE/$TOTAL_REC gofile links past 9d refresh window → dead or dying (gofile deletes after 10d idle)"; FAIL=1; fi

echo "CHECK 3: cloud-refresh (gofile/pixeldrain re-up) last run healthy"
CLR=$(gh run list --repo usermuneeb1/Stream-Recorder --workflow "Cloud link refresh" --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null)
if [ "$CLR" = "success" ]; then grn "cloud-refresh last run: success"
else red "cloud-refresh last run on 'main': ${CLR:-unavailable}"; FAIL=1; fi

echo "CHECK 4: repair-mirrors last run healthy (note: green-but-fast = vacuous)"
REP=$(gh run list --repo usermuneeb1/Stream-Recorder --workflow "Repair cloud mirrors" --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null)
if [ "$REP" = "success" ]; then grn "repair-mirrors last run: success (check duration in gh UI — 44s ≈ vacuous)"
else red "repair-mirrors last run: ${REP:-unavailable}"; FAIL=1; fi

echo
if [ "$FAIL" -eq 1 ]; then echo "VERDICT: RED — dead-link auto-repair pipeline is broken"; exit 1
else echo "VERDICT: GREEN — pipeline healthy"; exit 0; fi
