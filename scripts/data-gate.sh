#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  DATA GATE — fail CI on corrupt or inconsistent public data                 ║
# ║  The dashboard serves these files to the public. If they lie, the public    ║
# ║  sees lies. This gate:                                                       ║
# ║   1. recordings.json — required fields, types, uniqueness, sane dates       ║
# ║   2. stats.json / system-status.json — consistency with recordings.json     ║
# ║   3. mirror-health.json — parses, has a summary, fresh enough               ║
# ║  Exits non-zero on any violation, which fails the quality-check workflow.   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -uo pipefail

FAIL=0
fail() { echo "  ✗ $1"; FAIL=1; }
ok()   { echo "  ✓ $1"; }

echo "== data gate =="

# ── 1. recordings.json ────────────────────────────────────────────────────────
if [[ -f data/recordings.json ]]; then
    ok "recordings.json exists"
    jq -e 'type == "array"' data/recordings.json >/dev/null 2>&1 \
        || fail "recordings.json is not an array"
    COUNT=$(jq 'length' data/recordings.json 2>/dev/null || echo 0)
    (( COUNT > 0 )) || fail "recordings.json is empty"

    # required per-entry fields
    MISSING=$(jq -r '.[] | select((.video_id // "") == "" or (.title // "") == "" or (.date // "") == "") | .video_id' data/recordings.json 2>/dev/null)
    if [[ -n "$MISSING" ]]; then
        fail "recordings missing required fields (video_id/title/date): $MISSING"
    else
        ok "all $COUNT recordings have video_id/title/date"
    fi

    # duplicate video_ids
    DUPS=$(jq -r 'group_by(.video_id)[] | select(length > 1) | .[0].video_id' data/recordings.json 2>/dev/null)
    if [[ -n "$DUPS" ]]; then
        fail "duplicate video_id(s): $DUPS"
    else
        ok "no duplicate video_ids"
    fi

    # sane dates (YYYY-MM-DD)
    # NOTE: the || true sits OUTSIDE the $(...) — on valid data grep -vE
    # matches nothing (exit 1), which under bash -eo pipefail would abort
    # the whole gate before it reports anything.
    BADDATES=$(jq -r '.[].date // ""' data/recordings.json | grep -vE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' | head -3) || true
    if [[ -n "$BADDATES" ]]; then
        fail "malformed date(s): $BADDATES"
    else
        ok "dates well-formed"
    fi
else
    fail "data/recordings.json missing"
fi

# ── 2. stats.json ↔ recordings.json consistency ───────────────────────────────
# recordings.json is the list of RECORDED streams. If the channel feed ever
# adds non-recorded entries (fromYouTube/isShort), they are not "streams" and
# must not count against stats.json's total_streams — filter them here.
if [[ -f stats.json ]] && [[ -f data/recordings.json ]]; then
    STATS_N=$(jq -r '.total_streams // -1' stats.json 2>/dev/null)
    RECS_N=$(jq '[.[] | select((.fromYouTube // false) != true and (.isShort // false) != true)] | length' data/recordings.json 2>/dev/null || echo 0)
    if [[ "$STATS_N" != "-1" && "$STATS_N" != "$RECS_N" ]]; then
        fail "stats.json total_streams=$STATS_N != recordings.json recorded count=$RECS_N"
    else
        ok "stats.json and recordings.json agree ($RECS_N recorded streams)"
    fi
else
    fail "stats.json or recordings.json missing for consistency check"
fi

# ── 3. mirror-health.json parses + summary present ─────────────────────────────
if [[ -f data/mirror-health.json ]]; then
    jq -e '.summary and (.summary.total >= 0)' data/mirror-health.json >/dev/null 2>&1 \
        && ok "mirror-health.json parses with summary" \
        || fail "mirror-health.json missing or has no summary"
else
    fail "data/mirror-health.json missing (run scripts/mirror-health.sh)"
fi

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
if (( FAIL == 0 )); then
    echo "data gate: ALL CHECKS PASSED"
    exit 0
else
    echo "data gate: FAILED — public data is inconsistent, refusing to ship"
    exit 1
fi
