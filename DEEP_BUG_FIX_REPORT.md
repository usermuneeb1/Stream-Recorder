# 🩺 DEEP BUG HUNT — Stream-Recorder (2026-07-26)

*Raw, in-depth audit of the whole repo before the channel goes live today (~4h).*
*Scope: 41 workflows · 50+ scripts (~6,000 lines) · dashboard · data.*

---

## 🎯 TL;DR

1. **The supposed "#1 killer" — `actions/checkout@v7` — is a PHANTOM.** `v7.0.0` shipped 2026-06-17 and is GitHub's current Latest release (`v7.0.1`, 2026-07-20). The repo's own `BUGFIX_REPORT.md` + `mass-fix-checkout.sh` were stale and **wrong**. I verified this against the live GitHub releases page and the repo's git history (the v4 downgrade was already applied *and then reverted* in commit `c0de20b`). **Downgrading checkout would fix nothing and should NOT be done.**
2. **The recording engine is genuinely sound.** All 9 critical-path scripts pass `bash -n`; all 41 workflows parse as valid YAML; the 10-method recording cascade, premiere-aware detection, any-pass recheck, VOD rescue, WARP masking, PoToken provider, and multi-cloud upload are well-engineered and hardened with real incident-driven fixes.
3. **I fixed the genuine bugs I found** (3 of them, applied + verified). **2 more are documented** with the reason I did not change them under a 4-hour deadline (risk > reward on a working production recorder).
4. **The one thing that can actually bite TODAY** is an edge case in the *upcoming/premiere* path (see §4) — with a 1-minute mitigation you can run when the stream starts.

---

## ✅ BUGS FIXED (applied + verified)

### FIX 1 — Duplicate `update_recordings_json` corrupted the gallery
**Severity:** Medium (corrupts the dashboard, not the recording).
**Where:** `scripts/update-links.sh` vs `scripts/update-stats.sh`.

`update_recordings_json()` was defined **twice** with **conflicting schemas**:
- `update-stats.sh` → keys the entry by **`video_id`**, matches the *existing* `data/recordings.json` schema (has `thumbnail`, `thumbnail_mega`, `gofile_link`, …). ✅ canonical.
- `update-links.sh` → keys the entry by the **Archive identifier**, different fields (`archive_direct`, `archive_node`, no `thumbnail_mega`).

The recorder runs them back-to-back (step 12 `update-stats`, step 13 `update-links`). The second write overwrote the first with the wrong key → duplicated / mis-shaped gallery entries.

**Fix applied:** removed the conflicting write from `update-links.sh` (only the canonical `update-stats.sh` version now writes the gallery). Verified `bash -n` passes and no other code referenced it.

---

### FIX 2 — 3 workflows did `git push` with **no write permissions** → silent 403
**Severity:** Medium (their commits silently fail when the repo's default `GITHUB_TOKEN` is read-only — GitHub's modern default).

These workflows perform `git push` / Contents-API writes but declared **no `permissions:` block at all**:
- `smart-schedule.yml` — pushes `data/predicted-schedule.json` / `upcoming-streams.json` *(this is the workflow that alerts you about upcoming streams — if it can't commit, the dashboard's "upcoming" data goes stale).*
- `catbox-mirror.yml` — pushes mirror links.
- `thumbnail-gen.yml` — pushes generated thumbnails.

**Fix applied:** added `permissions: contents: write` to all three. (Verified placement + YAML validity.)

---

### FIX 3 — Dangerous stale doc + script (`BUGFIX_REPORT.md`, `mass-fix-checkout.sh`)
**Severity:** High *in terms of wasted time / re-breakage risk.*

`BUGFIX_REPORT.md` loudly claims `checkout@v7` is "THE KILLER" and instructs you to run `mass-fix-checkout.sh` to downgrade to v4. Since v7 is valid, **following those instructions would change nothing useful** — and worse, it would reinforce the false belief that checkout is your problem, sending you down a dead end while a real stream is missed.

**Fix applied:**
- Added a prominent "SUPERSEDED" banner at the top of `BUGFIX_REPORT.md` pointing here.
- Added a guard to `mass-fix-checkout.sh` so it **refuses to run** unless you explicitly set `FORCE=1` (prevents an accidental mass-downgrade).

---

## ⚠️ REAL ISSUE — NOT CHANGED (with rationale)

### ISSUE 4 — "Upcoming/premiere" stream can trip the 5-hour record timeout (the one thing to watch TODAY)
**Severity:** Medium-High **for today's stream specifically** (you said it's "upcoming in ~4h").

**What happens:** Your detection is *premiere-aware* (deliberately, and correctly) — `detect-stream.sh` Method 2 treats `live_status == is_upcoming` as "go record now", and `record-stream.sh` Method H launches `ytarchive --wait` which **sits idle until the stream actually starts**, then records.

So if a 5-minute pinger tick fires **now** (~4h before go-live), it catches `is_upcoming` and one run commits to a `ytarchive --wait` for ~4 hours. The record step has `timeout-minutes: 300` (5h). That 5h budget gets eaten as: **~4h waiting + ~1h recording → timeout**. When the step times out, `record_stream` is killed *before* it marks success/merges, so **the first ~1h of capture is discarded**, and a fresh run only starts capturing ~1h into the stream. (The rest is captured fine via the auto-retry/queue — you'd lose roughly the opening.)

**Why I did NOT auto-fix it:** the robust fix touches the recording loop / step timeouts, and changing that untested, 4 hours before a live stream, risks breaking the *working* recorder — a far worse outcome than a ~1h opening gap that self-recovers. Not worth it under deadline.

**✅ 1-minute mitigation (do this when the stream actually goes LIVE):**
Open **Actions → "☪️ The Muslim Lantern — Stream Recorder" → Run workflow** with default inputs, the moment you see the stream is live. Because the stream is *already live* (`isLiveNow`), it records directly with **no `--wait`**, capturing the whole thing. The scheduled cron will *also* try on its own, but a manual run at go-live is the guaranteed path.

(If you want me to harden the premiere path properly — incremental segment save + upload-on-timeout — say the word and I'll do it **after** today's stream so there's time to test it.)

---

## 📋 OTHER REAL FINDINGS (low priority, off the recording path)

### ISSUE 5 — 9 more workflows have no `permissions:` block
`anonymize-archive`, `archive-to-mega`, `cloud-refresh`, `discord-bot`, `secret-rotator`, `setup-check`, `url-to-cloud`, `weekly-summary`, `youtube-to-archive`. Most are read-only so it's harmless, **except `youtube-to-archive`** (a manual bulk-archive tool) which does `git push` and would 403 under a read-only default token. Not on the live path; fix when convenient.

### ISSUE 6 — `PUBLIC_STREAM_ONLY` mode is ambiguous
`cookie-health.yml` is disabled with a comment asserting `PUBLIC_STREAM_ONLY=true` (pure cookieless), but `stream-recorder.yml` sets `PUBLIC_STREAM_ONLY: ${{ vars.PUBLIC_STREAM_ONLY || 'false' }}` (hybrid). The *actual* mode depends on a repo **Variable** I can't see from a clone. **Good news:** for a *public* stream, **both modes work** — cookieless methods (`android_vr`, `mediaconnect`) return full 1080p without cookies. Just be aware which mode you're in so the cookie-warning noise makes sense. (Check: repo → Settings → Secrets and variables → Actions → Variables.)

### ISSUE 7 — cosmetic: stray `main()` in `database-audit.sh` & `secret_rotator.sh`
Harmless; just non-standard naming. Leave it.

---

## 🟢 VERIFIED SOUND — no action needed

| Area | Status |
|------|--------|
| `actions/checkout@v7` | ✅ valid (current Latest release, v7.0.1) |
| `actions/configure-pages@v6`, `setup-node@v4`, `setup-python@v5`, `deploy-pages@v5`, `github-script@v7` | ✅ all exist |
| All 50+ scripts — `bash -n` syntax | ✅ pass (0 errors) |
| All 41 workflows — YAML parse | ✅ valid |
| Every `bash scripts/…` referenced by a workflow | ✅ exists |
| Recording engine (10-method cascade: D,C,G,E,J,H,I,F,A,B) | ✅ robust, cookieless-first by design |
| Premiere-aware detection (Methods 1–4 + RSS) | ✅ correct |
| "Still live?" recheck (any-pass-of-3) | ✅ correct (won't false-abort) |
| VOD rescue (30-min poll, 6 methods) | ✅ correct |
| Cloudflare WARP hard-abort on failure | ✅ correct |
| Multi-cloud upload (Gofile/Pixeldrain/MEGA/Archive + Telegram) | ✅ correct, independent retries |
| Discord notifications (7 types, jq-built) | ✅ correct |
| Post-processing (remux → re-encode → split, moov-atom recovery) | ✅ hardened (FIX #13) |
| GitHub Contents-API writes (SHA-aware, 409/422 retry) | ✅ correct |

---

## 🚀 PRE-FLIGHT CHECKLIST (before the stream starts)

Do these **now**, they take ~5 minutes total:

- [ ] **Confirm the external pinger is alive.** The `*/5 * * * *` cron is throttled by GitHub on active repos. Your real coverage comes from the external pinger hitting `repository_dispatch` every 5 min (see the `PINGER` note in `stream-recorder.yml`). If that pinger (cron-job.org) is stopped, **restart it** — without it you may miss the go-live window.
- [ ] **Commit the fixes** in this repo (the 3 fixes above) and push, so the next run uses them:
  ```bash
  git add scripts/update-links.sh .github/workflows/smart-schedule.yml \
          .github/workflows/catbox-mirror.yml .github/workflows/thumbnail-gen.yml \
          BUGFIX_REPORT.md mass-fix-checkout.sh
  git commit -m "fix: gallery double-write, missing write permissions, neutralize stale checkout downgrade"
  git push
  ```
- [ ] **When the stream goes LIVE** → trigger the recorder manually once (Actions → Stream Recorder → Run workflow, default inputs) to guarantee a clean, no-`--wait` full capture. *(See ISSUE 4.)*
- [ ] **Do NOT** run `mass-fix-checkout.sh` or downgrade checkout — v7 is correct.
- [ ] (Optional) Verify `PUBLIC_STREAM_ONLY` variable value in repo Settings → Variables (pure-cookieless vs hybrid). Either is fine for a public stream.

---

## 🧾 EXACT FILES CHANGED IN THIS AUDIT

| File | Change |
|------|--------|
| `scripts/update-links.sh` | Removed conflicting `recordings.json` write (kept canonical version in `update-stats.sh`) |
| `.github/workflows/smart-schedule.yml` | Added `permissions: contents: write` |
| `.github/workflows/catbox-mirror.yml` | Added `permissions: contents: write` |
| `.github/workflows/thumbnail-gen.yml` | Added `permissions: contents: write` |
| `BUGFIX_REPORT.md` | Added "SUPERSEDED" banner (checkout@v7 is valid) |
| `mass-fix-checkout.sh` | Disabled by default (guard) — prevents accidental checkout downgrade |
| `SYSTEM_ANALYSIS.md` | Correction note (checkout was not the bug) |
| `DEEP_BUG_FIX_REPORT.md` | **This file** |

---

### Bottom line
Your recorder is **not** broken — the "checkout@v7 killer" was a red herring from a stale report. The engine is solid and will record the stream. I fixed the 3 genuine code defects, flagged the one timing edge case to watch (with a 1-button manual workaround at go-live), and verified everything else is healthy. **Push the fixes, keep the pinger alive, and fire a manual run when it goes live.** You're covered. 🛡️
