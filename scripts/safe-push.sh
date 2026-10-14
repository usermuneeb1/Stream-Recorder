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
# ║  Semantics: fetch, rebase onto freshest origin/<branch>, push, retry with    ║
# ║  backoff. Exit 0 on success (or nothing-to-push), 1 after 5 attempts or on  ║
# ║  a TRUE conflict (rebase aborted, local commit preserved, loud ::error::).   ║
# ║  2026-10-14: a conflict used to exit 0 "nothing to push" with the commit    ║
# ║  dropped and the tree left in UU — tests/safe-push-race-test.sh Case 4.     ║
# ║                                                                              ║
# ║  Env: SAFE_PUSH_SLEEP=0 disables the backoff sleep (tests).                  ║
# ║  Usage: safe-push.sh [branch]        (default: main)                         ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u

BRANCH="${1:-main}"

# Never leave a half-done rebase behind: the next `git` command in the job
# (or the next safe-push attempt) would fail on "rebase in progress".
abort_rebase() {
    if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
        git rebase --abort >/dev/null 2>&1 || true
    fi
}

# Rebase refuses on modified tracked files; say so instead of calling it a conflict.
if ! git diff --quiet 2>/dev/null; then
    echo "::error::safe-push: uncommitted changes to tracked files — commit (or checkout) them before pushing"
    git status --short 2>/dev/null | head -20
    exit 1
fi

for attempt in 1 2 3 4 5; do
    if ! git fetch -q origin "$BRANCH" 2>/dev/null; then
        echo "⚠️  fetch attempt ${attempt} failed (network?), retry"
        sleep "${SAFE_PUSH_SLEEP:-${attempt}}" 2>/dev/null || true
        continue
    fi

    # Nothing local that upstream doesn't already have → not an error.
    # (Checked via ancestry, never via `git diff` — during a stalled rebase
    # HEAD sits ON origin/<branch>, so a diff-based check lied "nothing to
    # push" while the local commit was being dropped. 2026-10-14.)
    if git merge-base --is-ancestor HEAD "origin/${BRANCH}" 2>/dev/null; then
        echo "✅ nothing to push (already in sync with ${BRANCH})"
        exit 0
    fi

    if ! git rebase -q "origin/${BRANCH}" >/dev/null 2>&1; then
        abort_rebase
        echo "::error::safe-push: rebase onto origin/${BRANCH} conflicts — local commit kept at $(git rev-parse --short HEAD), nothing pushed; merge by hand"
        git status --short 2>/dev/null | head -20
        exit 1
    fi

    if git push -q origin "HEAD:${BRANCH}" >/dev/null 2>&1; then
        echo "✅ pushed to ${BRANCH} (attempt ${attempt})"
        exit 0
    fi
    echo "⚠️  push attempt ${attempt} rejected (remote moved), rebase + retry"
    sleep "${SAFE_PUSH_SLEEP:-${attempt}}" 2>/dev/null || true
done

echo "::error::could not push to ${BRANCH} after 5 attempts"
exit 1
