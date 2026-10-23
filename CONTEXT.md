# CONTEXT.md — Stream-Recorder (“The Lantern Archive”)

Operational map for anyone debugging or changing this repo. Read this FIRST.

## Architecture (3 layers, each fails independently)

1. **Automation** — ~46 workflows in `.github/workflows/`, driven by `scripts/*.sh`.
   Recording (`stream-recorder.yml` every 5 min) → post-process → mirror uploads
   (`upload-clouds.sh`: gofile, pixeldrain, mega, archive.org, 0807.st, vikingfile)
   → health (`mirror-health.yml` 6h) → repair (`repair-mirrors.yml` daily 08:30 UTC)
   → keep-alive (`cloud-refresh.yml`: gofile every 5d 06:00 UTC, pixeldrain monthly).
   Bot detection: recording **Method K** (`scripts/browser_session.py` via
   `scripts/browser-session.sh`) opens the watch page in SeleniumBase UC-mode
   Chrome, mints a cookie jar + direct HLS/DASH URLs, and replaces
   `COOKIES_FILE` for the rest of the run. Detection **Method 5** reuses the
   same helper when every HTTP client is bot-walled. Gated by `BROWSER_ASSIST`
   (`auto|first|off`), installed by `scripts/setup-browser.sh`.
2. **Data** — JSON-as-database. **Canonical index: `data/recordings.json`** (NOT
   links.txt — that’s the legacy Discord-facing feed). State files also live in
   `data/` (mirror-health, source-health, system-status, backups/).
3. **Dashboard** — `dashboard/` React 19 + Vite + TS + Vidstack. Playback cascade
   order (Auto): 0807 → N3ON(pixeldrain) → R3AL(archive node) →
   B3ING(github) → STORM(telegram) → BUNNY(archive direct) → GHOST(youtube).
   VikingFile is download-only (its links are share pages, unplayable in
   `<video>` — proven 2026-09-04), so it sits in THE VAULT, never in Auto.
   Health sweep sinks dead mirrors to the bottom via `deadMirrors`.

## Hard-won invariants (do not break)

- **Never write a data/*.json without validating the read first.** Every writer
  must refuse to write when the read failed/empty (wipe bug class, fixed
  2026-09-02 in repair-mirrors.sh, update-links.sh, import-archive-backups.sh).
- **`mirror-health.sh` must never emit fewer rows than input recordings** — a
  structural guard exits 2 (vacuous-success outage 2026-09-02: workflow was
  green while checking nothing, so repair never dispatched).
- **The bot wall is an IP/fingerprint challenge, not a login (2026-10-23).**
  Never "fix" a bot wall by asking the owner for a fresher cookie: Method K
  mints a session per run and publishes it through `set_env COOKIES_FILE`, so
  a stale `YOUTUBE_COOKIES` secret must never be able to block a public
  stream. Browser capture failures are non-fatal by design (return 1, cascade
  continues) — Method K sits *after* the fast cookieless paths, before A/B.
  `tests/browser-session-test.sh` locks: reuse window, blocked-jar handling,
  id-less capture rejection, jar→yt-dlp handoff, ffmpeg manifest fallback,
  `BROWSER_ASSIST=off` no-op.
- **Gofile is keyless by owner policy (2026-09-02).** Detection = public `wt`
  token contents endpoint only; upload = auto-minted guest token. The gofile
  SPA page returns 200 for dead folders — never treat page-200 as “alive”.
- **Host TTLs**: gofile 10d idle · 0807.st ~30d idle (owner correction) ·
  pixeldrain 60d. Keep-alive rides the 5-day gofile run (carries 0807+viking).
- **Workflow `shell: bash` = `bash -eo pipefail`.** Every pipeline must be
  -e-safe (`|| true` OUTSIDE the `$(...)` assignment). The install drift
  sentinel died silently for days because `awk … | grep … | wc -l` returned 1
  on empty input under `-e` (step-name anchors had been renamed).
- **Sandbox integration token cannot** push `.github/workflows/*` nor fire
  `workflow_dispatch` (403). Owner applies workflow-file edits via web editor.
- Tests: `tests/*.sh` harnesses exit non-zero on RED; stubs fake curl/network.
  `record-cascade-test.sh` is a drift lock on the method table (now
  D,C,G,E,J,H,I,F,K,A,B) — adding a method without updating its
  `EXPECTED_ORDER` and the "All N methods failed" string is a red test.
  Existing test list + conventions live in each file’s banner comment.

## Sentinels whose red means something

- `Install self-test` (daily 05:30 UTC + PRs on install paths) — gates the
  exact recorder install block. Red since 2026-08-29 was a self-inflicted
  anchor break (see invariants), NOT tool rot. Fix = call the hardened
  `scripts/check-install-drift.sh` from the drift step.
- `Workflow watchdog`, `Auto-issue ticketing` — watch the watchers failing.

## 2026-09-02 outage saga (the big one)

Symptom: “all dead links never update themselves.” Chain: mirror-health
vacuous-green (0/12) → repair never dispatched; refresh-links.sh crashed at
the undefined 0807 gates (added 2026-08-30, `fe803d41`) after the gofile loop
→ all bookkeeping lost; gofile keep-alive was phantom (SPA page ping).
PRs #109 (merged, pipeline fixed) + #110 (PoW/quoting fallout fixes).
Verification loop: `bash .debug/mirror-pipeline-check.sh` (reads main via API).
