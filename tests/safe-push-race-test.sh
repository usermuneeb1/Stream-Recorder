#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test for scripts/safe-push.sh                                    ║
# ║  Reproduces the race that kept youtube-stats.yml 100% red (Aug 26 → Sep 1)   ║
# ║  and reddened db-backup.yml, using local bare remotes — no network.          ║
# ║                                                                              ║
# ║  Case 1 proves the OLD pattern (bare `git push`) goes red in the race.       ║
# ║  Case 2 proves safe-push.sh goes green in the SAME race and lands content.   ║
# ║  Case 3 proves no-op runs exit 0.                                            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
SAFE_PUSH="$ROOT/scripts/safe-push.sh"

T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export SAFE_PUSH_SLEEP=0

git -C "$T" init -q --bare origin.git
git clone -q "$T/origin.git" "$T/mover" 2>/dev/null
( cd "$T/mover" && git config user.email t@t && git config user.name t \
  && git commit -q --allow-empty -m seed && git push -q origin HEAD:main )
git clone -q "$T/origin.git" "$T/worker" 2>/dev/null
( cd "$T/worker" && git config user.email t@t && git config user.name t )

# remote moves while the worker is mid-flight
remote_moves() {
    ( cd "$T/mover" && git fetch -q origin && git reset -q --hard origin/main \
      && echo "$RANDOM" >> mover.txt && git add mover.txt \
      && git commit -q -m "bot snapshot" && git push -q origin HEAD:main )
}

FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

echo "── Case 1: bare 'git push' after remote moved → RED (the incident) ──"
(
    cd "$T/worker" || exit 1
    git fetch -q origin && git reset -q --hard origin/main
    echo "stats payload 1" > data.json && git add data.json
    git commit -q -m "worker: youtube stats 1"
)
remote_moves
NAIVE=$( cd "$T/worker" && git push origin HEAD:main >/dev/null 2>&1 && echo green || echo red )
[[ "$NAIVE" == "red" ]] \
    && ok "naive push goes red in the race (incident reproduced)" \
    || bad "naive push unexpectedly green — race not constructed"

echo "── Case 2: safe-push.sh in the SAME race → GREEN, content landed ──"
( cd "$T/worker" && bash "$SAFE_PUSH" main ) && RC2=0 || RC2=$?
[[ "${RC2:-1}" -eq 0 ]] && ok "safe-push exit 0 in race" || bad "safe-push exit $RC2 in race"
( cd "$T/mover" && git fetch -q origin && git reset -q --hard origin/main \
  && grep -q "stats payload 1" data.json ) \
    && ok "worker's commit content landed on main" || bad "worker's commit missing after safe-push"

echo "── Case 3: nothing to push → exit 0 ──"
(
    cd "$T/worker" || exit 1
    git fetch -q origin && git reset -q --hard origin/main
    echo "stats payload 2" > data.json && git add data.json
    git commit -q -m "worker: youtube stats 2"
)
remote_moves   # one more race for realism, then push it quiet
( cd "$T/worker" && bash "$SAFE_PUSH" main >/dev/null )
( cd "$T/worker" && git fetch -q origin && git reset -q --hard origin/main \
  && bash "$SAFE_PUSH" main >/dev/null 2>&1 ) && RC3=0 || RC3=$?
[[ "${RC3:-1}" -eq 0 ]] && ok "no-op push exits 0" || bad "no-op push failed (rc=$RC3)"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — push-race immunity locked"; exit 0
