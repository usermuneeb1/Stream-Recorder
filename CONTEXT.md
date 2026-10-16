# CONTEXT.md — Stream-Recorder (“The Lantern Archive”)

Operational map for anyone debugging or changing this repo. Read this FIRST.

## Architecture (3 layers, each fails independently)

1. **Automation** — ~46 workflows in `.github/workflows/`, driven by `scripts/*.sh`.
   Recording (`stream-recorder.yml` every 5 min) → post-process → mirror uploads
   (`upload-clouds.sh`: gofile, pixeldrain, mega, archive.org, 0807.st, vikingfile)
   → health (`mirror-health.yml` 6h) → repair (`repair-mirrors.yml` daily 08:30 UTC)
   → keep-alive (`cloud-refresh.yml`: gofile every 5d 06:00 UTC, pixeldrain monthly).
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
- **Gofile detection needs a real bearer token (corrected 2026-10-16).** Use
  `utils.sh gofile_contents_status()`, never a raw `?wt=` call: `GOFILE_API_KEY`
  when the operator set it, else ONE auto-minted guest account per run (the same
  flow the uploader already used). The public `wt` website token comes from
  gofile's obfuscated `wt.obf.js` and **rotates**; a stale one returns
  `error-token`, which must read as *unverifiable* — never *alive*. Three
  consequences of the old hardcoded `wt=4fd6sg89d7s6`: every gofile mirror read
  unverifiable (18/18 in mirror-health.json), `repair-mirrors` fell through to
  grepping the `/d/` SPA shell (HTTP 200, no error text) and reported DELETED
  folders as alive, and `refresh_gofile`'s keep-alive was phantom again.
  The gofile SPA page returns 200 for dead folders — never treat page-200 as
  “alive”.
- **Host TTLs**: gofile 10d idle · 0807.st ~30d idle (owner correction) ·
  pixeldrain 60d. Keep-alive rides the 5-day gofile run (carries 0807+viking).
- **Every host counted in `summary.dead_links` must have a repairer.** dead_links
  dispatches `repair-mirrors.yml`, whose destinations are
  gofile/pixeldrain/mega/st0807/vikingfile. **GitHub releases are NOT among
  them** — they are repaired by `github-release-mirror.yml`, which is why
  `github-release-upload.py` must re-verify existing `github_release` URLs and
  re-upload a 404 asset. Until 2026-10-16 it skipped any recording with a
  non-empty `github_release`, so a deleted asset was unfixable and re-paged
  every 6h forever. telegram/youtube/archive_direct stay demotion-only.
- **Workflow `shell: bash` = `bash -eo pipefail`.** Every pipeline must be
  -e-safe (`|| true` OUTSIDE the `$(...)` assignment). The install drift
  sentinel died silently for days because `awk … | grep … | wc -l` returned 1
  on empty input under `-e` (step-name anchors had been renamed).
- **Sandbox integration token cannot** push `.github/workflows/*` nor fire
  `workflow_dispatch` (403). Owner applies workflow-file edits via web editor.
- Tests: `tests/*.sh` harnesses exit non-zero on RED; stubs fake curl/network.
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
