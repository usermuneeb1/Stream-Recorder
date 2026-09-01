#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  SAFE-PUSH — the one correct way for workflows to push to main.              ║
# ║                                                                              ║
# ║  Why this exists: this repo's main moves CONSTANTLY (bot snapshots land      ║
# ║  every few minutes). Any workflow that does work for minutes and then runs   ║
# ║  a bare `git push` plays roulette with "! [rejected] main -> main (fetch     ║
# ║  first)". Documented victims:                                                ║
# ║    · status.yml        — fixed inline 2026-07-12 (the pattern this shares)   ║
# ║    · youtube-stats.yml — 100% RED since 2026-08-26 (12/12 runs)              ║
# ║    · db-backup.yml     — red cluster 2026-08-22..25 (backups lost silently)  ║
# ║                                                                              ║
# ║  Semantics: rebase onto freshest origin/<branch>, push, retry with backoff.  ║
# ║  Exit 0 on success (or nothing-to-push), 1 after 5 attempts — caller decides ║
# ║  whether that's fatal.                                                       ║
# ║                                                                              ║
# ║  Env: SAFE_PUSH_SLEEP=0 disables the backoff sleep (tests).                  ║
# ║  Usage: safe-push.sh [branch]        (default: main)                         ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u

BRANCH="${1:-main}"

for attempt in 1 2 3 4 5; do
    if git pull --rebase origin "$BRANCH" >/dev/null 2>&1 \
       && git push origin "HEAD:${BRANCH}" >/dev/null 2>&1; then
        echo "✅ pushed to ${BRANCH} (attempt ${attempt})"
        exit 0
    fi
    # Up-to-date remote but nothing local to push is NOT an error either.
    if git diff --quiet "origin/${BRANCH}" "HEAD" -- 2>/dev/null; then
        echo "✅ nothing to push (already in sync with ${BRANCH})"
        exit 0
    fi
    echo "⚠️  push attempt ${attempt} rejected (remote moved), rebase + retry"
    sleep "${SAFE_PUSH_SLEEP:-${attempt}}" 2>/dev/null || true
done

echo "::error::could not push to ${BRANCH} after 5 attempts"
exit 1
