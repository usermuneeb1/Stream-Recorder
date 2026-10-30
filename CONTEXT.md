# CONTEXT.md — Stream-Recorder (“The Lantern Archive”)

Operational map for anyone debugging or changing this repo. Read this FIRST.

## Architecture (3 layers, each fails independently)

1. **Automation** — ~46 workflows in `.github/workflows/`, driven by `scripts/*.sh`.
   Recording (`stream-recorder.yml` every 5 min) → post-process → mirror uploads
   (`upload-clouds.sh`: gofile, pixeldrain, mega, archive.org, 0807.st, vikingfile)
   → health (`mirror-health.yml` 6h) → repair (`repair-mirrors.yml` daily 08:30 UTC)
   → keep-alive (`cloud-refresh.yml`: gofile every 5d 06:00 UTC, pixeldrain monthly).
   Bot detection: recording **Method K** (`scripts/browser_session.py` via
   `scripts/browser-session.sh`) opens the watch page in SeleniumBase **Pure
   CDP Mode** (`BROWSER_MODE=cdp`, default), reads anonymous HLS/DASH/muxed
   player URLs, and records them with ffmpeg. It exports no cookie jar and does
   not replace `COOKIES_FILE`. Detection **Method 5** reuses the same helper
   when HTTP clients are bot-walled. `BROWSER_ASSIST=first` is the CI/config
   default; `PUBLIC_STREAM_ONLY=true` is the CI no-cookie contract. Legacy
   `BROWSER_MODE=uc` is opt-in only. Installed by `scripts/setup-browser.sh`.
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
- **Public recording is cookie-free by default (2026-10-30).** Method K uses
  SeleniumBase Pure CDP, exports no jar, and never promotes operator cookies.
  A CDP pass requires an unblocked playable player plus real ffmpeg video+audio;
  a jar/visitor/player blob alone is not success. `PUBLIC_STREAM_ONLY=true`
  closes every HTTP adapter cookie gate. Account cookies are an explicit last
  resort (`PUBLIC_STREAM_ONLY=false` + valid `YOUTUBE_COOKIES`) for restricted
  streams, not the fix for a public bot wall. Browser failures remain non-fatal
  to the cascade, but the cookieless smoke workflow fails when required CDP
  fails. `tests/browser-cdp-test.sh`, `tests/test_browser_cdp.py`, and
  `tests/browser-session-test.sh` (legacy UC) lock these contracts.
- **Archive.org object names are underscore-folded (2026-10-23).** The uploader
  names uploads with `make_safe_filename()` (`upload-clouds.sh`): spaces and
  punctuation become `_`. Any offline derivation of `archive_direct` MUST use
  that rule — `normalize-recordings.py` used the space-keeping
  `sanitize_filename()` and pointed BUNNY at files that are never uploaded.
  `tests/archive-filename-contract-test.sh` locks the contract.
- **Writers must reach the repo, not the checkout (2026-10-23).**
  `repair-mirrors.yml` has no commit step, and `repair-mirrors.sh` rewrites the
  index through the Contents API from a fresh read — a script that edits
  `data/recordings.json` locally inside that job has written nothing.
  `backfill-archive-nodes.sh` had done exactly that since it was added (plus a
  tab-collapsing `read` that shifted `title` into `archive_direct`), so 0/20
  recordings ever carried `archive_direct`/`archive_node`: R3AL/BUNNY were dead
  and feeds fell back to a private YouTube page. Persist via
  `github_api_write` (validate the read first), fall back to the file only for
  manual runs. `tests/backfill-archive-nodes-test.sh` locks all three defects.
- **Feeds are build artifacts (2026-10-23).** Vercel serves
  `dashboard/public/feed.xml|podcast.xml|feed.json|sitemap.xml` straight from
  the repo, and `npm run build` never regenerated them — they were 4 months
  stale (5 of 20 recordings). The build now runs
  `dashboard/scripts/generate-feeds.mjs`, a byte-compatible twin of
  `scripts/generate-feeds.py` (GitHub Pages keeps calling the Python one);
  `tests/feeds-freshness-test.sh` diffs both and rejects any enclosure that is
  not a direct-media URL (`<enclosure type="video/mp4">` pointing at a watch
  page was the old fallback).
- **Forced repair is opt-in and single-recording (2026-10-24).**
  `repair-mirrors.yml` declared `force_repair` with `default: "true"`, and
  `mirror-health.yml` dispatches it with `{"ref":"main"}` and no inputs, so
  GitHub injected that default: every automated repair ran in force mode, which
  marks every mirror dead. Each pass therefore re-uploaded all five mirrors of
  the first `MAX_ITEMS` candidates — `recordings.json` is newest-first, so that
  was always the same six newest recordings, four times a day — while the other
  14 recordings were only reached by the once-daily schedule, and every
  published link (Discord post, `links.txt`, feeds) was silently replaced under
  it. `repair_mirrors()` now ignores `FORCE_REPAIR` unless `TARGET_VIDEO_ID`
  names one recording, the workflow default is `"false"`, and candidates are
  ordered by `mirrors_repaired_at` (never repaired first, then oldest) so
  consecutive bounded passes walk the archive instead of re-touching its head.
  `tests/repair-mirrors-dispatch-test.sh` locks all three.
- **The cookieless smoke test is the recorder's early warning (2026-10-23).**
  `scripts/cookieless-smoke-test.sh` exercises every no-cookie method in the
  cascade (D, C, G, E, J, H, I, F, K — A/B are cookie-jar methods and are
  excluded by definition) and only counts a method as passing on real pixels
  (size + `ffprobe` height), never on "downloaded". `tests/cookieless-smoke-test.sh`
  diffs the matrix against `scripts/record-stream.sh`, so **adding a recording
  method without adding it to the smoke matrix is a red test** — the old inline
  YAML tested 5 of 11, hardcoded `/5`, and could not fail on Method K.
- **Every recording reports HOW it was captured (2026-10-30).** The
  "ARCHIVED SUCCESSFULLY" Discord card only listed duration/size/uploads, so
  "was this recorded through the CDP browser or with cookies?" was
  unanswerable after the fact. `record-stream.sh` now publishes
  `RECORD_METHOD_DESC|CODE|TOOL|AUTH` as it leaves `attempt_recording()`
  (`_note_recording_method_for`), plus the same for VOD rescue; the card shows
  **Recorded via** + **Cookies**, and `links.txt` keeps it in the permanent
  record. Method K self-describes as *SeleniumBase CDP + ffmpeg / cookieless*
  (legacy UC: *browser jar*), and `tests/record-cascade-test.sh` locks that a
  cookieless method can never be reported as a cookie one. **Any new recording
  method must be added to `method_meta()`** or it reports `unknown`.
- **Live chat is one pipeline, and only real messages count (2026-10-30).**
  `scripts/archive-chat.sh` is the single capture implementation
  (yt-dlp `live_chat` → chat-downloader fallback → `convert-chat.mjs`), used by
  both the recorder (`--output` into `RECORD_DIR`, then
  `upload-clouds.sh` publishes `data/chat/<video_id>.json` via
  `github_api_write` + archive.org `chat.json`) and `chat-archiver.yml`. Before
  this, `convert-chat.mjs` could only read yt-dlp's JSON-Lines dump while the
  recorder captured chat-downloader's JSON **array** — so every capture
  converted to 0 messages, the Discord card said "❌ Not archived", and the
  dashboard replay was empty. A replay is valid only when
  `(.messages|length) > 0`: a non-empty `[]` is a failed capture, never an
  archive (the old `-s`/byte-count check blocked retries forever).
  `tests/chat-archive-test.sh` locks both formats, `--output`, the `--wait`
  retry and the empty-dump failure.
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
Verification loop: `bash tests/repair-mirrors-dispatch-test.sh` (hermetic, no network).
