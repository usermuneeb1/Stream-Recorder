#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/check-cookies.sh must ALERT on Discord when the    ║
# ║  YouTube session cookie is expiring/expired — throttled, not spammy.         ║
# ║                                                                              ║
# ║  Owner request 2026-10-14: "make only I get cookie expired notifications,    ║
# ║  like cookie expired warnings, so I can change it before it expires."        ║
# ║  Since 51be019 (08-21) _cookie_alert() only logged ("non-event") and the     ║
# ║  cookie-health cron was commented out, while the recorder itself runs in     ║
# ║  HYBRID mode (cookies ARE the fallback for LOGIN_REQUIRED streams).          ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }
WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN"
STATE="$WORKDIR/state"; mkdir -p "$STATE"      # fake GitHub contents store for throttle files
WEBHOOKS="$WORKDIR/webhooks.log"

make_cookies() {  # $1 = seconds from now until the critical cookie expires
  local exp=$(( $(date +%s) + $1 ))
  printf '# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t%s\tSID\tfixture-not-a-real-sid\n.youtube.com\tTRUE\t/\tTRUE\t%s\tPREF\tf1=50000000\n' "$exp" "$((exp+86400*400))" > "$WORKDIR/cookies.txt"
}

# curl double: GitHub contents API (read/write throttle files into $STATE),
# Discord webhooks (log the embed title), YouTube homepage (inconclusive).
cat > "$STUBBIN/curl" <<STUB
#!/usr/bin/env bash
url=""; method="GET"; data=""; out=""; wfmt=""
while (( \$# )); do
  case "\$1" in
    -X) method="\$2"; shift 2;;
    -d|--data|--data-binary) data="\$2"; shift 2;;
    -o) out="\$2"; shift 2;;
    -w) wfmt="\$2"; shift 2;;
    -H|-b|-A|--max-time) shift 2;;
    http*) url="\$1"; shift;;
    *) shift;;
  esac
done
emit() { if [[ -n "\$out" ]]; then printf '%s' "\$2" > "\$out"; else printf '%s' "\$2"; fi; [[ -n "\$wfmt" ]] && printf '%s' "\$1"; exit 0; }
case "\$url" in
  *api.github.com/repos/*/contents/*)
    f="$STATE/\${url##*/contents/}"
    if [[ "\$method" == "PUT" ]]; then
      jq -r '.content' "\${data#@}" | base64 -d > "\$f"; emit 200 '{"commit":{"sha":"abc"}}'
    fi
    if [[ -f "\$f" ]]; then emit 200 "{\"sha\":\"s1\",\"content\":\"\$(base64 -w0 < "\$f")\",\"encoding\":\"base64\"}"; fi
    emit 404 '{"message":"Not Found"}';;
  *discord*|*webhook*)
    body="\$data"; [[ "\$body" == @* ]] && body=\$(cat "\${body#@}")
    printf '%s\n' "\$(jq -r '.embeds[0].title // "no-title"' <<< "\$body" 2>/dev/null || echo raw)" >> "$WEBHOOKS"; emit 204 '';;
  *youtube.com*) emit 200 '<html>inconclusive from datacenter</html>';;
  *) emit 200 '';;
esac
STUB
chmod +x "$STUBBIN/curl"

run_check() {  # $@ = extra env
  : > "$WEBHOOKS"
  (cd "$WORKDIR" && env PATH="$STUBBIN:$PATH" COOKIES_FILE="$WORKDIR/cookies.txt" \
     GITHUB_REPOSITORY=fixture/repo GH_PAT=x GITHUB_ENV="$WORKDIR/gh-env" GITHUB_OUTPUT="$WORKDIR/gh-out" \
     DISCORD_WEBHOOK_URL="https://discord.example/webhooks/main" DISCORD_WEBHOOK_ALERTS="https://discord.example/webhooks/alerts" \
     "$@" bash "$ROOT/scripts/check-cookies.sh" 2>&1)
}
alerts() { cat "$WEBHOOKS" 2>/dev/null; }

echo "── 1: cookie expiring in 3 days → ONE Discord expiry alert ──"
rm -f "$STATE"/*; make_cookies $((3*86400))
OUT=$(run_check)
grep -q 'Cookie Expiry Warning' <(alerts) && ok "expiry alert sent" || bad "no expiry alert (webhooks: $(alerts | tr '\n' '|'))"
[[ $(alerts | wc -l) -eq 1 ]] && ok "exactly one webhook" || bad "$(alerts | wc -l) webhooks sent"

echo "── 2: same state 1 hour later → throttled, nothing sent ──"
OUT=$(run_check)
[[ -z "$(alerts)" ]] && ok "no repeat within the throttle window" || bad "re-alerted: $(alerts | tr '\n' '|')"
grep -q 'throttled' <<<"$OUT" && ok "throttle logged" || bad "throttle not logged"

echo "── 3: throttle window elapsed → alerts again ──"
echo "$(( $(date +%s) - 90000 ))" > "$STATE/cookie_expiring_warning_sent.txt"   # 25h ago
OUT=$(run_check)
grep -q 'Cookie Expiry Warning' <(alerts) && ok "re-alerted after 24h" || bad "no re-alert after the window"

echo "── 4: cookie already expired → expired alert ──"
rm -f "$STATE"/*; make_cookies -3600
OUT=$(run_check)
grep -q 'Cookies Expired' <(alerts) && ok "expired alert sent" || bad "no expired alert: $(alerts | tr '\n' '|')"

echo "── 5: healthy cookie (60 days left, fresh file) → silence ──"
rm -f "$STATE"/*; make_cookies $((60*86400))
OUT=$(run_check)
[[ -z "$(alerts)" ]] && ok "no alert for a healthy cookie" || bad "alerted on a healthy cookie: $(alerts | tr '\n' '|')"

echo "── 6: PUBLIC_STREAM_ONLY=true → cookies irrelevant → silence even when expired ──"
rm -f "$STATE"/*; make_cookies -3600
OUT=$(run_check PUBLIC_STREAM_ONLY=true)
[[ -z "$(alerts)" ]] && ok "suppressed in pure cookieless mode" || bad "alerted despite PUBLIC_STREAM_ONLY=true"

echo "── 7: no cookie file at all → silence (nothing to renew, cookieless) ──"
rm -f "$STATE"/* "$WORKDIR/cookies.txt"
OUT=$(run_check)
[[ -z "$(alerts)" ]] && ok "no alert without a cookie file" || bad "alerted with no cookie file"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — cookie expiry alerts fire once per day per state, and only when actionable"; exit 0
