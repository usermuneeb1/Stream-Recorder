# 🚀 NEXT-LEVEL UPGRADE REPORT — Stream-Recorder v6 (2026-08-18)

*Full audit + hardening pass over the entire system: 42 workflows, 50+ scripts,
the dashboard, and the recording engine. Everything below was applied, then
verified with `bash -n`, ShellCheck (error severity — same gate CI uses), YAML
parse + semantic checks on all 42 workflows, a stubbed end-to-end test of the
new salvage pipeline, and a clean production dashboard build.*

---

## 🛟 HEADLINE: the Timeout Salvage Pipeline (new capability)

**Before:** if the Record step hit its 5-hour timeout (or crashed), GitHub
killed the process — and the pipeline silently threw away everything already
captured: `recording_success` stayed `false`, so post-process, upload, and
notify were all skipped, and the Cleanup step deleted the partial files.
Multi-hour captures were lost to a clock.

**After:** a new `🛟 Salvage Partial Recording` step runs automatically after
any failed/timed-out record attempt:

1. Scans `$RECORD_DIR` for completed segments + partially-written raw files
2. Validates each file; runs **moov-atom recovery** on damaged ones
   (a killed recorder leaves MP4s without their index — repairable)
3. Merges survivors using the **same merge logic** as the main engine
   (single implementation, no drift)
4. Re-exports the standard contract (`RECORDING_RAW_FILE`,
   `RECORDING_SUCCESS=true`, `SALVAGED=true`, …) so the existing
   Post-Process → Upload → Notify → Stats → Links chain runs untouched

Net effect: **a timeout loses at most the final fragment — never the stream.**
The Discord "Archived" notification is marked `⚠️ SALVAGED CAPTURE`, and the
run summary shows `🛟 Salvaged: true`.

Files: `scripts/salvage-recording.sh` (new) · `.github/workflows/stream-recorder.yml`

Verified with a stubbed-ffmpeg harness: segments-merge path, root-raw-file
fallback path, and empty-dir graceful-failure path all pass.

---

## 🐛 Bugs found & fixed this pass

### 1. Stale cookies could poison "cookieless" methods (E, F, G)
`scripts/record-stream.sh` — Methods D/H/I only attach cookies that passed the
health check (`valid` / `valid_unverified`), but **E (mweb), F (streamlink),
and G (plain yt-dlp) attached ANY cookie file that existed** — expired ones
included. That directly violated the documented "cookieless-first means stale
cookies can never break a public recording" invariant the method ordering was
built for. All ten methods now enforce the same rule. Cookie-required streams
are still covered by Methods A/B.

### 2. Method J logged the wrong failure status
`scripts/record-stream.sh` — the ffmpeg-HLS method read `$?` **after** running
`tail`, so every Method J failure was logged with tail's exit code instead of
yt-dlp's, making Discord diagnostics useless. The exit code is now captured
immediately, and the dead "empty manifest" branch was removed.

### 3. Cooldown could truncate a still-live stream
`scripts/record-stream.sh` + `scripts/detect-stream.sh` — between segments the
recorder asks `is_stream_still_live()` 10× over 10 minutes; if all checks
false-negative (documented WARP/GitHub-IP failure mode: YouTube serves consent
pages that omit `isLiveNow`), it concluded "stream ended" and stopped.
Added **`rss_channel_is_live()`** — a cookieless, fully-independent RSS +
`isLiveNow` check — as a mandatory second opinion before committing to
"ended", and as a tie-breaker before each next segment.

### 4. Job timeout could not cover the worst-case legal path
`.github/workflows/stream-recorder.yml` — job `timeout-minutes` was 360, but
detect (up to 310 with manual 5h wait) + record (300) + processing exceeds
that: manual `wait_for_live` runs were killed mid-recording. Raised to **720**.

### 5. Self-retry was dead without a PAT
`.github/workflows/stream-recorder.yml` — the Auto-Retry dispatch only used
`GH_PAT`; if unset, the retry silently never fired. It now falls back to the
job's `GITHUB_TOKEN` (the job already declares `actions: write`).

### 6. Failure log destroyed during salvage
`scripts/salvage-recording.sh` — sourcing `record-stream.sh` truncates the
per-method failure log; salvage now backs it up and restores it, keeping the
primary timeout diagnostic intact.

---

## ✅ Audited & verified sound (no changes needed)

| Area | Result |
|---|---|
| All 42 workflows — YAML parse | ✅ valid |
| All 42 workflows — step-id refs, `needs` refs, cron syntax | ✅ resolve |
| `actions/checkout@v7` (41 refs) | ✅ current release, correct |
| Every `scripts/…` referenced by any workflow | ✅ exists |
| All push-performing workflows | ✅ have `contents: write` (top or job level) |
| All 50+ shell scripts — `bash -n` + `shellcheck -x -S error` | ✅ clean |
| Dashboard — `npm ci && npm run build` (tsc + vite) | ✅ builds clean |
| Recording cascade ordering / VOD rescue / locks / merge fallbacks | ✅ as documented |

---

## 📋 Files changed

| File | Change |
|---|---|
| `scripts/salvage-recording.sh` | **NEW** — timeout/crash salvage pipeline |
| `.github/workflows/stream-recorder.yml` | salvage step + conditions, job timeout 360→720, GITHUB_TOKEN retry fallback, salvage rows in run summary |
| `scripts/record-stream.sh` | cookie-consistency (E/F/G), Method J status capture, RSS second opinion in recording loop |
| `scripts/detect-stream.sh` | `rss_channel_is_live()` helper |
| `scripts/discord-notify.sh` | salvage banner on completion notification |
| `README.md` | defense-in-depth section updated |

*Prior audits remain valid history: `BUGFIX_REPORT.md` (superseded),
`DEEP_BUG_FIX_REPORT.md`, `SYSTEM_ANALYSIS.md`.*
