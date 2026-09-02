#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: a DEAD Pixeldrain link was reported ALIVE (2026-09-02)     ║
# ║                                                                              ║
# ║  Root cause: jq's `//` is the ALTERNATIVE operator — it replaces false as    ║
# ║  well as null. So `jq -r '.success // true'` collapses every possible API    ║
# ║  answer onto "true":                                                         ║
# ║        {"success":false} → true    {"success":true} → true    {} → true      ║
# ║  Both pixeldrain liveness verdicts in the repo used it:                      ║
# ║    · scripts/refresh-links.sh  check_link_alive()     (cloud-refresh)         ║
# ║    · scripts/repair-mirrors.sh _is_pixeldrain_alive() (repair-mirrors)        ║
# ║  Consequence — the reported symptom "dead pixeldrain/gofile links are not    ║
# ║  auto-updated": cloud-refresh logged "✅ Alive, timer reset" for deleted      ║
# ║  files and counted dead=0, and repair-mirrors found nothing to re-upload     ║
# ║  (green-but-vacuous run), so a dead link was never replaced anywhere.        ║
# ║                                                                              ║
# ║  Seam: the real functions, invoked the way their workflows invoke them —     ║
# ║  refresh-links.sh run end-to-end with the scheduled-run env, and             ║
# ║  _is_pixeldrain_alive called directly. curl is stubbed on PATH, so the       ║
# ║  verdict is driven purely by the API payload. No network, no credentials.    ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
REFRESH="$ROOT/scripts/refresh-links.sh"
REPAIR="$ROOT/scripts/repair-mirrors.sh"

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { printf '  ❌ %b\n' "$1"; FAILURES=$((FAILURES+1)); }
strip() { sed -e 's/\x1b\[[0-9;]*m//g'; }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN" "$WORKDIR/writes"
export STUB_DIR="$WORKDIR"

# ── fixture: two recordings, one alive + one DEAD pixeldrain link ────────────
B64=$(python3 - <<'PY'
import base64, json
recs = [
  {"video_id": "alivepix1", "title": "Alive Pixeldrain",
   "archive_link": "https://archive.org/details/alivepix1",
   "pixeldrain_link": "https://pixeldrain.com/u/ALIVEPIX"},
  {"video_id": "deadpix1", "title": "Dead Pixeldrain",
   "archive_link": "https://archive.org/details/deadpix1",
   "pixeldrain_link": "https://pixeldrain.com/u/DEADPIX1"},
]
print(base64.b64encode(json.dumps(recs).encode()).decode())
PY
)
export B64

# ── stub curl: ALIVEPIX exists, DEADPIX1 was deleted, everything else is fine ─
cat > "$STUBBIN/curl" <<'STUB'
#!/usr/bin/env bash
args=" $* "; url=""; out=""; wc=""; data=""; prev=""
for a in "$@"; do
  case "$prev" in -o) out="$a";; -w) wc="$a";; -d|--data) data="$a";; esac
  case "$a" in http*|file*) url="$a";; esac
  prev="$a"
done
body=""; code=200
if [[ "$url" == *api.github.com/repos/*/contents/* ]]; then
  if [[ "$args" == *" -X PUT "* ]]; then
    p="${url##*/contents/}"
    [[ "$data" == @* ]] && data="$(cat "${data:1}" 2>/dev/null)"
    jq -r '.content // ""' <<<"$data" 2>/dev/null | base64 -d > "$STUB_DIR/writes/${p//\//_}" 2>/dev/null
    body='{"commit":{"sha":"0000000000000000"}}'; code=201
  elif [[ "$url" == *data/recordings.json* ]]; then
    body="{\"content\":\"$B64\",\"encoding\":\"base64\",\"sha\":\"0000000000000000\"}"
  else
    body='{"sha":"0000000000000000"}'
  fi
elif [[ "$url" == *pixeldrain.com/api/file/ALIVEPIX/info* ]]; then
  body='{"success":true,"size":10485760}'
elif [[ "$url" =~ pixeldrain\.com/api/file/[A-Za-z0-9_-]+/info ]]; then
  # what pixeldrain returns for a deleted/expired file — the payload the bug ate
  body='{"success":false,"value":"not_found"}'
fi
printf '%s\n' "$url" >> "$STUB_DIR/calls.log"
if [[ -n "$out" ]]; then printf '%s' "$body" > "$out"; else printf '%s' "$body"; fi
[[ "$wc" == *http_code* ]] && printf '%s' "$code"
exit 0
STUB
chmod +x "$STUBBIN/curl"

# keep the loop in seconds: refresh-links.sh sleeps 2-5s per link
printf '#!/usr/bin/env bash\nexit 0\n' > "$STUBBIN/sleep"
chmod +x "$STUBBIN/sleep"

# ══════════════════════════════════════════════════════════════════════════════
echo "── 1: the idiom itself — jq '//' replaces false, not just null ──"
# Documents WHY the verdict was wrong, so the next debugger doesn't re-introduce it.
for payload in '{"success":false}' '{"success":true}' '{}'; do
  got=$(jq -r '.success // true' <<<"$payload")
  [[ "$got" == "true" ]] || bad "'.success // true' on $payload → $got (expected true; is the idiom still the buggy one?)"
done
ok "'.success // true' returns true for ALL THREE payloads — false is indistinguishable from missing"
for payload in '{"success":false}' '{"success":true}' '{}' 'not json'; do
  got=$(jq -r 'if .success == false then "dead" elif .success == true then "alive" else "unknown" end' <<<"$payload" 2>/dev/null || echo unknown)
  case "$payload" in
    '{"success":false}') want="dead" ;;
    '{"success":true}')  want="alive" ;;
    *)                   want="unknown" ;;
  esac
  [[ "$got" == "$want" ]] && ok "explicit compare: $payload → $got" || bad "explicit compare: $payload → $got, want $want"
done

# ══════════════════════════════════════════════════════════════════════════════
echo "── 2: no liveness verdict in the repo may use the '.field // true' idiom ──"
# Code lines only — the comments that explain the old bug legitimately quote it.
HITS=$(grep -rnE "jq .*'\.[A-Za-z_]+ *// *true'" "$ROOT/scripts" "$ROOT/tests" 2>/dev/null \
       | grep -v 'pixeldrain-dead-verdict-test' | grep -vE ':[0-9]+:[[:space:]]*#' || true)
if [[ -z "$HITS" ]]; then ok "no '// true' boolean-swallowing verdict left"; else bad "still present:\n$HITS"; fi

# ══════════════════════════════════════════════════════════════════════════════
echo "── 3: check_link_alive() — the cloud-refresh verdict ──"
verdict() {  # $1 = url → echoes rc
  PATH="$STUBBIN:$PATH" bash -c "
    source '$REFRESH' >/dev/null 2>&1
    declare -F check_link_alive >/dev/null || exit 99
    check_link_alive '$1'
  " >/dev/null 2>&1
  echo $?
}
RC_DEAD=$(verdict "https://pixeldrain.com/u/DEADPIX1")
RC_LIVE=$(verdict "https://pixeldrain.com/u/ALIVEPIX")
[[ "$RC_DEAD" == 99 ]] && bad "check_link_alive not defined (source failed)"
[[ "$RC_DEAD" != 0 ]] && ok "DEAD pixeldrain (API success:false) → dead (rc=$RC_DEAD)" \
                      || bad "DEAD pixeldrain (API success:false) → reported ALIVE (rc=0): the link is never marked expired, never queued for repair"
[[ "$RC_LIVE" == 0 ]] && ok "ALIVE pixeldrain (API success:true) → alive" \
                     || bad "ALIVE pixeldrain regressed to dead (rc=$RC_LIVE) — would trigger pointless re-uploads"

# ══════════════════════════════════════════════════════════════════════════════
echo "── 4: _is_pixeldrain_alive() — the repair-mirrors verdict ──"
PATH="$STUBBIN:$PATH" bash -c "
  source '$REPAIR' >/dev/null 2>&1
  declare -F _is_pixeldrain_alive >/dev/null || exit 99
  _is_pixeldrain_alive 'https://pixeldrain.com/u/DEADPIX1'
" >/dev/null 2>&1
R_RC=$?
[[ "$R_RC" == 99 ]] && bad "_is_pixeldrain_alive not defined (source failed)"
[[ "$R_RC" != 0 ]] && ok "DEAD pixeldrain → needs repair (rc=$R_RC), so repair-mirrors re-uploads it" \
                   || bad "DEAD pixeldrain → 'alive' (rc=0), so repair-mirrors skips it forever (green-but-vacuous run)"

PATH="$STUBBIN:$PATH" bash -c "
  source '$REPAIR' >/dev/null 2>&1
  _is_pixeldrain_alive 'https://pixeldrain.com/u/ALIVEPIX'
" >/dev/null 2>&1
[[ "$?" == 0 ]] && ok "ALIVE pixeldrain → no repair needed" || bad "ALIVE pixeldrain flagged for repair (churn)"

# ══════════════════════════════════════════════════════════════════════════════
echo "── 5: an unverifiable answer must NOT be laundered into 'alive' ──"
# Network/HTML/token errors carry no verdict. refresh-links.sh deliberately
# falls through to the HTTP check for gofile; pixeldrain must not claim alive.
STUBBIN2="$WORKDIR/bin2"; mkdir -p "$STUBBIN2"
cp "$STUBBIN/sleep" "$STUBBIN2/sleep"
cat > "$STUBBIN2/curl" <<'STUB2'
#!/usr/bin/env bash
url=""; for a in "$@"; do case "$a" in http*|file*) url="$a";; esac; done
case "$url" in
  *api.github.com*) printf '{"content":"%s","encoding":"base64","sha":"0"}' "$B64"; exit 0;;
  *pixeldrain.com/api/file/*) printf '<html>503 Service Unavailable</html>'; exit 0;;  # junk, not JSON
esac
exit 0
STUB2
chmod +x "$STUBBIN2/curl"
PATH="$STUBBIN2:$STUBBIN:$PATH" bash -c "
  source '$REFRESH' >/dev/null 2>&1
  check_link_alive 'https://pixeldrain.com/u/JUNKRESP'
" >/dev/null 2>&1
J_RC=$?
[[ "$J_RC" != 0 ]] && ok "unparseable pixeldrain response → not 'alive' (rc=$J_RC)" \
                   || bad "unparseable response treated as ALIVE — a provider outage would mask every dead link"

# ══════════════════════════════════════════════════════════════════════════════
echo "── 6: end-to-end — the scheduled run counts the dead link (the user's symptom) ──"
: > "$WORKDIR/calls.log"; rm -f "$WORKDIR"/writes/*
PATH="$STUBBIN:$PATH" \
GITHUB_REPOSITORY="fixture/repo" \
GH_PAT="fixture-token-not-real" \
GITHUB_ENV="$WORKDIR/gh-env" \
REFRESH_PROVIDERS="pixeldrain" \
  bash "$REFRESH" > "$WORKDIR/stdout.log" 2> "$WORKDIR/stderr.log"
E_RC=$?
[[ "$E_RC" == 0 ]] && ok "exit 0" || bad "exit $E_RC"
SUMMARY=$(strip < "$WORKDIR/stdout.log" | grep -E '│ +(Checked|Alive|Dead) +:' | tr -s ' ' | tr '\n' ' ')
if strip < "$WORKDIR/stdout.log" | grep -qE 'Dead +: 1' \
   && strip < "$WORKDIR/stdout.log" | grep -qE 'Alive +: 1'; then
  ok "run reports alive=1 dead=1 ($SUMMARY)"
else
  bad "run reports $SUMMARY — expected alive=1 dead=1; a dead link counted as alive means no [EXPIRED] marker, no Discord fallback, no repair dispatch"
fi
RESETS=$(strip < "$WORKDIR/stdout.log" | grep -c 'timer reset' || true)
[[ "$RESETS" == 1 ]] && ok "only the alive file was refreshed (1 timer reset)" \
                     || bad "$RESETS timer resets — the DEAD file was 'refreshed' too, burning 10% of a file's bandwidth on something that no longer exists"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — a dead pixeldrain link is dead at both verdict sites, and an unverifiable answer is never 'alive'"
exit 0
