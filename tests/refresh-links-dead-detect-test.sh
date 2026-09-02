#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: dead-link handling in scripts/refresh-links.sh             ║
# ║  Symptom: "auto refresh dead links not working" — dead links are never       ║
# ║  marked [EXPIRED], no Discord edit, no source-health write.                  ║
# ║                                                                              ║
# ║  Deterministic + offline: curl is stubbed, GitHub reads come from a local    ║
# ║  fixture, GitHub writes are captured to files.                               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

# ── Fixture: 1 entry, gofile ALIVE, pixeldrain DEAD ───────────────────────────
cat > "$WORK/recordings.json" <<'JSON'
[
  {
    "video_id": "fixture01",
    "title": "Fixture Stream 2026-01-01",
    "gofile_link": "https://gofile.io/d/ALIVE001",
    "pixeldrain_link": "https://pixeldrain.com/u/DEAD0001",
    "archive_link": "https://archive.org/details/fixture01",
    "discord_msg_id": "1234567890"
  }
]
JSON

# ── Harness: source the script, override its I/O seams, run refresh_links ─────
cat > "$WORK/harness.sh" <<'HARNESS'
set -uo pipefail
source "$ROOT/scripts/refresh-links.sh"   # entry-point guard keeps it from self-running

# Deterministic + offline
random_sleep() { :; }
sleep() { :; }
github_api_read_content() { cat "$WORK/recordings.json"; }
github_api_write() { printf '%s' "$2" > "$WORK/write_$(echo "$1" | tr '/.' '__')"; return 0; }
patch_discord_webhook() { echo "DISCORD_EDIT msg=$3" >> "$WORK/discord.log"; return 0; }
send_discord_webhook()  { return 0; }

# Network stub: pixeldrain DEAD0001 is dead, everything else alive
check_link_alive() {
    [[ "$1" == *DEAD0001* ]] && return 1
    return 0
}
refresh_gofile()     { return 0; }
refresh_pixeldrain() { return 0; }

refresh_links
echo "EXIT_RC=$?"
HARNESS

export ROOT WORK
OUT=$(REFRESH_PROVIDERS=both DRY_RUN=false GITHUB_ENV="$WORK/env" \
      bash "$WORK/harness.sh" 2>&1)
echo "$OUT" | sed 's/^/    | /'
echo ""

echo "── assertions ──"
grep -q "DEAD, link expired" <<<"$OUT" \
  && ok "dead pixeldrain link detected" || bad "dead link never detected"

grep -qE "Dead +: 1|REFRESH_TOTAL_DEAD" <<<"$OUT" \
  && ok "summary reached (script did not abort mid-run)" \
  || bad "script aborted before summary — dead-link handling never ran"

grep -q "unbound variable" <<<"$OUT" && bad "unbound variable error" || ok "no unbound variable errors"

if [[ -f "$WORK/write_data_recordings_json" ]]; then
  W=$(cat "$WORK/write_data_recordings_json")
  jq -e '.[0].expired_links | index("https://pixeldrain.com/u/DEAD0001")' <<<"$W" >/dev/null 2>&1 \
    && ok "dead link recorded in expired_links of recordings.json" \
    || bad "recordings.json written but expired_links missing the dead URL"
  jq -e '.[0].pixeldrain_link == "https://pixeldrain.com/u/DEAD0001"' <<<"$W" >/dev/null 2>&1 \
    && ok "original URL left intact (not string-spliced)" \
    || bad "pixeldrain_link was corrupted by marking"
  jq -e '.[0].gofile_link | not | not' <<<"$W" >/dev/null 2>&1 && ok "output is valid JSON" || bad "output is not valid JSON"
  [[ -f "$WORK/write_links_txt" ]] && bad "links.txt clobbered with recordings.json content" || ok "links.txt not clobbered"
else
  bad "recordings.json never written back — expired marking not persisted"
fi

grep -q "DISCORD_EDIT msg=1234567890" "$WORK/discord.log" 2>/dev/null \
  && ok "Discord message edited for the dead-link entry" \
  || bad "Discord message never edited (msg_id not resolved from recordings.json)"

[[ -f "$WORK/write_data_source-health_json" ]] \
  && ok "source-health.json written" || bad "source-health.json never written"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — dead-link refresh path works end to end"; exit 0
