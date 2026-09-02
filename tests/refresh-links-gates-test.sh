#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/refresh-links.sh crash after refresh loops         ║
# ║  (2026-09-01 production outage)                                              ║
# ║                                                                              ║
# ║  fe803d41 (2026-08-30) added 0807.st/VikingFile refresh sections gated on    ║
# ║  $do_st0807 / $do_vikingfile / $st0807_urls / $vikingfile_urls /             ║
# ║  $total_st0807 / $total_vikingfile — none of which were ever defined.        ║
# ║  Under set -u the script aborted with exit 1 AFTER doing the gofile work,    ║
# ║  so every cloud-refresh run went red and the dead-link bookkeeping           ║
# ║  (Discord edits, [EXPIRED] markers, source-health.json) never ran.           ║
# ║                                                                              ║
# ║  The OLD entrypoint test missed this because with no GH_PAT it bailed at     ║
# ║  "Could not read recordings.json" before reaching the crash. This test       ║
# ║  stubs curl (incl. the GitHub contents read) and drives ALL provider gates   ║
# ║  to completion.                                                              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
TARGET="$ROOT/scripts/refresh-links.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN"

# fixture recordings (small; 2 gofile + 2 pixeldrain so loops exercise)
B64=$(python3 - <<'PY'
import base64, json
recs = [
  {"title":"Fixture A","gofile_link":"https://gofile.io/d/FixA1","pixeldrain_link":"https://pixeldrain.com/u/FixA1","archive_link":"https://archive.org/details/fixA"},
  {"title":"Fixture B","gofile_link":"https://gofile.io/d/FixB2","pixeldrain_link":"https://pixeldrain.com/u/FixB2","archive_link":"https://archive.org/details/fixB"},
]
print(base64.b64encode(json.dumps(recs).encode()).decode())
PY
)

cat > "$STUBBIN/curl" <<STUB
#!/usr/bin/env bash
args=" \$* "
case "\$args" in
  *api.github.com/repos/*/contents/data/recordings.json*)
    printf '{"content":"%s","encoding":"base64"}' "$B64"; exit 0;;
  *api.gofile.io/contents/*)
    printf '{"status":"ok"}'; exit 0;;
  *pixeldrain.com/api/file/*/info*)
    printf '{"success":true,"size":10485760}'; exit 0;;
  *pixeldrain.com/api/file/*)
    exit 0;;                      # refresh download — discard
  *gofile.io/d/*)
    printf '' ; exit 0;;          # refresh ping — discard
  *api.github.com*)
    printf '{}'; exit 0;;         # writes + misc — accept
  *discord.com*|*discordapp.com*)
    printf '{}'; exit 0;;
  *)
    exit 0;;
esac
STUB
chmod +x "$STUBBIN/curl"

run_refresh() {  # $1 = REFRESH_PROVIDERS
  PATH="$STUBBIN:$PATH" \
  GITHUB_REPOSITORY="fixture/repo" \
  GH_PAT="test-token-not-real" \
  GITHUB_ENV="$WORKDIR/gh-env" \
  REFRESH_PROVIDERS="$1" \
  DRY_RUN=true \
  bash "$TARGET" 2>"$WORKDIR/stderr.$1.log"
  return $?
}

echo "── 1: REFRESH_PROVIDERS=gofile runs to completion (the production crash) ──"
RC=0; OUT=$(run_refresh gofile) || RC=$?
[[ "$RC" -eq 0 ]] && ok "exit 0" || bad "exit $RC (crash — unbound st0807/vikingfile gate?)"
grep -q "LINK REFRESH COMPLETE" <<<"$OUT" && ok "reached completion banner" || bad "never reached LINK REFRESH COMPLETE"
grep -q 'unbound variable' "$WORKDIR/stderr.gofile.log" && bad "unbound variable in stderr" || ok "no unbound-variable errors"

echo "── 2: REFRESH_PROVIDERS=both also clean (pixeldrain + both gates) ──"
RC=0; OUT=$(run_refresh both) || RC=$?
[[ "$RC" -eq 0 ]] && ok "exit 0" || bad "exit $RC"
grep -q "LINK REFRESH COMPLETE" <<<"$OUT" && ok "reached completion banner" || bad "never completed"
grep -q 'unbound variable' "$WORKDIR/stderr.both.log" && bad "unbound variable in stderr" || ok "no unbound-variable errors"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — all provider gates defined; refresh always reaches its bookkeeping"; exit 0
