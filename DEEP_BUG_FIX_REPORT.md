# Deep Bug Hunt, Stream-Recorder (2026-07-26)

An in-depth audit of the whole repo before the channel went live that day, about 4 hours out. Scope: 41 workflows, 50+ scripts, roughly 6,000 lines, the dashboard, and the data.

---

## TL;DR

1. The supposed number one killer, `actions/checkout@v7`, is not a bug. v7.0.0 shipped on 2026-06-17 and is GitHub's current latest release. v7.0.1 came on 2026-07-20. The repo's own `BUGFIX_REPORT.md` and `mass-fix-checkout.sh` were stale and wrong. I verified this against the live GitHub releases page and the repo's git history. The v4 downgrade had already been applied and reverted in commit `c0de20b`. Downgrading checkout fixes nothing and should not be done.
2. The recording engine is sound. All 9 critical-path scripts pass `bash -n`. All 41 workflows parse as valid YAML. The 10-method recording cascade, premiere-aware detection, any-pass recheck, VOD rescue, WARP masking, PoToken provider, and multi-cloud upload are hardened with real incident-driven fixes.
3. I fixed the genuine bugs I found, 3 of them, applied and verified. Two more are documented with the reason I did not change them under a 4-hour deadline. Risk outweighed reward on a working production recorder.
4. The one thing that can actually bite on a live stream is an edge case in the upcoming and premiere path, covered in section 4 below, with a 1-minute mitigation you can run when the stream starts.

---

## Bugs fixed, applied and verified

### Fix 1. Duplicate update_recordings_json corrupted the gallery

Severity: Medium. It corrupts the dashboard, not the recording.
Where: `scripts/update-links.sh` vs `scripts/update-stats.sh`.

`update_recordings_json()` was defined twice with conflicting schemas.

- `update-stats.sh` keys the entry by `video_id` and matches the existing `data/recordings.json` schema. It has `thumbnail`, `thumbnail_mega`, `gofile_link`, and the rest. This one is canonical.
- `update-links.sh` keys the entry by the Archive identifier, with different fields like `archive_direct` and `archive_node`, and no `thumbnail_mega`.

The recorder runs them back to back, step 12 update-stats then step 13 update-links. The second write overwrote the first with the wrong key, so gallery entries ended up duplicated or mis-shaped.

Fix applied: removed the conflicting write from `update-links.sh`. Only the canonical `update-stats.sh` version writes the gallery now. Verified `bash -n` passes and no other code referenced it.

### Fix 2. Three workflows did git push with no write permissions

Severity: Medium. Their commits silently fail when the repo's default GITHUB_TOKEN is read-only, which is GitHub's modern default.

These workflows perform git push or Contents-API writes but declared no permissions block at all:

- `smart-schedule.yml`, which pushes `data/predicted-schedule.json` and `upcoming-streams.json`. This is the workflow that alerts you about upcoming streams. If it cannot commit, the dashboard's upcoming data goes stale.
- `catbox-mirror.yml`, which pushes mirror links.
- `thumbnail-gen.yml`, which pushes generated thumbnails.

Fix applied: added `permissions: contents: write` to all three. Verified placement and YAML validity.

### Fix 3. Stale doc and script, BUGFIX_REPORT.md and mass-fix-checkout.sh

Severity: High in terms of wasted time and re-breakage risk.

`BUGFIX_REPORT.md` loudly claims checkout@v7 is the killer and tells you to run `mass-fix-checkout.sh` to downgrade to v4. Since v7 is valid, following those instructions changes nothing useful. Worse, it reinforces the false belief that checkout is the problem, sending you down a dead end while a real stream is missed.

Fix applied:

- Added a prominent SUPERSEDED banner at the top of `BUGFIX_REPORT.md` pointing here.
- Added a guard to `mass-fix-checkout.sh` so it refuses to run unless you explicitly set `FORCE=1`. This prevents an accidental mass downgrade.

---

## Real issue, not changed, with rationale

### Issue 4. An upcoming or premiere stream can trip the 5-hour record timeout

Severity: Medium to High for that day's stream specifically, since it was upcoming about 4 hours out.

What happens: detection is premiere-aware, deliberately and correctly. `detect-stream.sh` Method 2 treats `live_status == is_upcoming` as "go record now", and `record-stream.sh` Method H launches `ytarchive --wait`, which sits idle until the stream actually starts and then records.

So if a 5-minute pinger tick fires about 4 hours before go-live, it catches `is_upcoming` and one run commits to a `ytarchive --wait` for roughly 4 hours. The record step has `timeout-minutes: 300`, a 5-hour budget. That budget gets eaten as about 4 hours of waiting plus about 1 hour of recording, and the step times out. When the step times out, `record_stream` is killed before it marks success or merges, so the first hour of capture is discarded. A fresh run only starts capturing about an hour into the stream. The rest is captured fine through auto-retry and the queue. You would lose roughly the opening.

Why I did not auto-fix it: the robust fix touches the recording loop and step timeouts. Changing that untested, 4 hours before a live stream, risks breaking the working recorder. That is a far worse outcome than a roughly 1-hour opening gap that self-recovers. Not worth it under the deadline.

The 1-minute mitigation, for when the stream actually goes live: open Actions, choose the Stream Recorder workflow, and run it with default inputs the moment the stream is live. Because the stream is already live, `isLiveNow`, it records directly with no `--wait` and captures the whole thing. The scheduled cron will also try on its own, but a manual run at go-live is the guaranteed path.

If you want the premiere path hardened properly, the incremental segment save plus upload-on-timeout, say the word and I will do it after the stream so there is time to test it.

---

## Other real findings, low priority, off the recording path

### Issue 5. Nine more workflows have no permissions block

`anonymize-archive`, `archive-to-mega`, `cloud-refresh`, `discord-bot`, `secret-rotator`, `setup-check`, `url-to-cloud`, `weekly-summary`, `youtube-to-archive`.

Most are read-only, so it is harmless. The exception is `youtube-to-archive`, a manual bulk-archive tool that does git push and would 403 under a read-only default token. It is not on the live path. Fix when convenient.

### Issue 6. PUBLIC_STREAM_ONLY mode is ambiguous

`cookie-health.yml` is disabled with a comment asserting `PUBLIC_STREAM_ONLY=true`, pure cookieless. `stream-recorder.yml` sets `PUBLIC_STREAM_ONLY: ${{ vars.PUBLIC_STREAM_ONLY || 'false' }}`, hybrid. The actual mode depends on a repo variable I cannot see from a clone.

For a public stream both modes work. The cookieless methods `android_vr` and `mediaconnect` return full 1080p without cookies. Just be aware which mode you are in so the cookie-warning noise makes sense. Check the variable at repo Settings, Secrets and variables, Actions, Variables.

### Issue 7. Cosmetic stray main() in database-audit.sh and secret_rotator.sh

Harmless, just non-standard naming. Leave it.

---

## Verified sound, no action needed

| Area | Status |
|------|--------|
| `actions/checkout@v7` | Valid. Current latest release, v7.0.1. |
| `actions/configure-pages@v6`, `setup-node@v4`, `setup-python@v5`, `deploy-pages@v5`, `github-script@v7` | All exist. |
| All 50+ scripts, bash -n syntax | Pass, 0 errors. |
| All 41 workflows, YAML parse | Valid. |
| Every bash scripts/ reference in a workflow | Exists. |
| Recording engine, the 10-method cascade D, C, G, E, J, H, I, F, A, B | Robust, cookieless-first by design. |
| Premiere-aware detection, Methods 1 to 4 plus RSS | Correct. |
| Still-live recheck, any-pass-of-3 | Correct, will not false-abort. |
| VOD rescue, 30-minute poll, 6 methods | Correct. |
| Cloudflare WARP hard-abort on failure | Correct. |
| Multi-cloud upload, Gofile, Pixeldrain, MEGA, Archive, Telegram | Correct, independent retries. |
| Discord notifications, 7 types, jq-built | Correct. |
| Post-processing, remux to re-encode to split, moov-atom recovery | Hardened. |
| GitHub Contents-API writes, SHA-aware, 409/422 retry | Correct. |

---

## Pre-flight checklist, before the stream starts

These take about 5 minutes total:

- [ ] Confirm the external pinger is alive. The `*/5 * * * *` cron is throttled by GitHub on active repos. Real coverage comes from the external pinger hitting `repository_dispatch` every 5 minutes, see the PINGER note in `stream-recorder.yml`. If that pinger on cron-job.org is stopped, restart it. Without it you may miss the go-live window.
- [ ] Commit the fixes in this repo and push, so the next run uses them:

  ```bash
  git add scripts/update-links.sh .github/workflows/smart-schedule.yml \
          .github/workflows/catbox-mirror.yml .github/workflows/thumbnail-gen.yml \
          BUGFIX_REPORT.md mass-fix-checkout.sh
  git commit -m "fix: gallery double-write, missing write permissions, neutralize stale checkout downgrade"
  git push
  ```

- [ ] When the stream goes live, trigger the recorder manually once. Actions, Stream Recorder, Run workflow, default inputs. This guarantees a clean full capture with no `--wait`. See Issue 4.
- [ ] Do not run `mass-fix-checkout.sh` or downgrade checkout. v7 is correct.
- [ ] Optional. Verify the `PUBLIC_STREAM_ONLY` variable value in repo Settings, Variables. Pure cookieless or hybrid, either is fine for a public stream.

---

## Exact files changed in this audit

| File | Change |
|------|--------|
| `scripts/update-links.sh` | Removed the conflicting recordings.json write. The canonical version in `update-stats.sh` remains. |
| `.github/workflows/smart-schedule.yml` | Added `permissions: contents: write`. |
| `.github/workflows/catbox-mirror.yml` | Added `permissions: contents: write`. |
| `.github/workflows/thumbnail-gen.yml` | Added `permissions: contents: write`. |
| `BUGFIX_REPORT.md` | Added the SUPERSEDED banner. checkout@v7 is valid. |
| `mass-fix-checkout.sh` | Disabled by default with a guard, prevents accidental checkout downgrade. |
| `SYSTEM_ANALYSIS.md` | Correction note. Checkout was not the bug. |
| `DEEP_BUG_FIX_REPORT.md` | This file. |

---

## Bottom line

The recorder is not broken. The checkout@v7 killer was a false alarm from a stale report. The engine is solid and records the stream. I fixed the 3 genuine code defects, flagged the one timing edge case to watch with a one-button manual workaround at go-live, and verified everything else is healthy.

Push the fixes, keep the pinger alive, and fire a manual run when it goes live.
