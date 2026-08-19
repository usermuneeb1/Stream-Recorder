<div align="center">

# Stream-Recorder

### An autonomous, zero-cost live-stream archiving system that records *The Muslim Lantern*'s YouTube live streams in 1080p, mirrors them across independent cloud storages, and publishes a dashboard. All running on free GitHub Actions minutes. No server, no bill.

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Stream Recorder](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/stream-recorder.yml?label=stream%20recorder&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/stream-recorder.yml)
[![Quality Check](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/quality-check.yml?label=quality%20check&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/quality-check.yml)
[![Deploy Dashboard](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/deploy-pages.yml?label=dashboard%20deploy&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/deploy-pages.yml)
[![Database Audit](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/database-audit.yml?label=database%20audit&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/database-audit.yml)

13 streams preserved, 23.5 hours of 1080p footage, 42 automated workflows, 6 independent storage mirrors

</div>

---

## What this is

Stream-Recorder runs entirely on GitHub Actions. The free runner minutes do the work, and free-tier storage services hold the files. It runs end to end with no human at the keyboard:

| Stage | What happens |
|---|---|
| Detect | A 5-minute sentinel watches the channel via RSS and yt-dlp probes. A GitHub cron runs it, plus an external cron-job.org pinger that GitHub's cron throttling can't affect. |
| Record | When a stream goes live, a 10-method recording cascade captures 1080p. It tries independent tools until one produces a valid file. |
| Rescue | If live capture fails, a VOD-rescue fallback polls for up to 30 minutes and tries 6 more methods before the streamer can private the video. |
| Process | Segments are losslessly merged. Thumbnails, storyboard sprites, AI chapters, and a live-chat archive are generated. |
| Mirror | The finished file goes to 6 independent storages, so no single host can take the archive down. |
| Notify | Discord and Telegram alerts include per-method failure diagnostics. |
| Publish | The archive index is committed to the repo, and the dashboard reads it through a CDN with failover. |

---

## Architecture

```
                        ┌──────────────────────────────────────┐
  External 5-min pinger │  cron-job.org  ──▶ repository_dispatch│
  (bypasses GH throttling)└──────────────────────┬───────────────┘
   + GH cron */5 * * * *                        ▼
                          ┌──────────────────────────────────────┐
                          │   stream-recorder.yml  (main workflow)│
                          │  Detect → Recheck → Record → Process │
                          │   → Upload → Notify → Archive        │
                          └──────────────┬───────────────────────┘
            ┌────────────────────────────┼────────────────────────────┐
            ▼                            ▼                            ▼
   detect-stream.sh            record-stream.sh              upload-clouds.sh
   (RSS + yt-dlp probe)        (10-method cascade)           (Gofile/PD/MEGA/
   3-source "any match"        + VOD-rescue fallback          Archive/Telegram)
            │                            │                            │
            └────────────── Cloudflare WARP (IP masking) ◀────────────┘
                           bgutil PoToken provider
```

### The 10-method recording cascade

`record-stream.sh` tries 10 independent methods in order and moves on the moment one yields a valid file:

| # | Method | Tool | Why it exists |
|---|--------|------|---------------|
| D | `android_vr` | yt-dlp | Full 1080p, no PoToken, no cookies. The proven primary. |
| C | `mediaconnect` | yt-dlp | Newer client, no PO token needed. |
| G | plain yt-dlp | yt-dlp | Lets yt-dlp auto-select the best client. |
| E | `mweb` | yt-dlp | Mobile web, minimal bot detection. |
| J | ffmpeg HLS-direct | ffmpeg | Fully independent path. Resolves the manifest, copies with ffmpeg. |
| H | ytarchive | Go binary | Purpose-built for YouTube live. Holds through ad rolls. |
| I | streamlink, hardened | streamlink | Independent codebase, aggressive retry flags. |
| F | streamlink, default | streamlink | Different flag set. |
| A | `web_creator` + cookies | yt-dlp | Catches sign-in-required and members-only streams. |
| B | `tv_embedded` + cookies | yt-dlp | Bypasses the n-challenge. |

Cookieless methods run first, so stale cookies can never break a public recording. Valid cookies still rescue LOGIN_REQUIRED streams as a fallback. Every failure is logged with its reason and injected into the Discord alert.

### How failures are handled

- Race-condition guard. The detect-to-record gap re-checks "still live?" with any-pass-of-3 logic. Each guard references a real lost stream.
- Segment-then-merge. Long streams record as numbered segments and are losslessly concatenated, with re-encode and largest-segment fallbacks.
- Self-retry. On failure, a fresh workflow run is dispatched through the API.
- Cloudflare WARP masks the GitHub datacenter IP. YouTube blocks raw GitHub IPs, so this is a hard requirement.
- The bgutil PoToken provider solves YouTube's PO token and nsig challenge.

---

## Storage fan-out, 6 independent mirrors

| Storage | Why |
|---|---|
| Archive.org | Permanent node with direct file access. |
| GitHub Releases | Versioned cold storage. |
| MEGA | Encrypted cloud vault, 20 GB free, auto-rotating accounts. |
| Pixeldrain | Edge streaming cache, 60-day retention. |
| Gofile | Anonymous overflow. |
| Telegram | Bot-delivered stream channel. |

Any single host can vanish and every recording still exists elsewhere. A source-health workflow probes each mirror, and a repair-mirrors workflow re-uploads anything that fails.

---

## The 42 workflows

Beyond the main recorder, the repo runs a full support crew in YAML:

| Category | Workflows |
|---|---|
| Recording | `stream-recorder`, `stream-sniper`, `record-postprocess-test`, `cookieless-smoke-test`, `smart-schedule`, `youtube-ghost-host` |
| Mirroring | `upload`/`url-to-cloud`, `catbox-mirror`, `telegram-mirror`, `github-release-mirror`, `archive-to-mega`, `sync-archive-backups`, `repair-mirrors`, `cloud-refresh`, `source-health` |
| Security and secrets | `secret-rotator`, `secret-scan`, `trufflehog`, `gitleaks`, `codeql`, `cookie-health`, `anonymize-archive` |
| Quality gates | `quality-check`, `database-audit`, `install-self-test`, `setup-check`, `workflow-watchdog` |
| Enrichment | `thumbnail-gen`, `storyboard-gen`, `chat-archiver`, `youtube-stats` |
| Data and backup | `db-backup`, `import-archive-backups`, `weekly-summary`, `status`, `auto-issue` |
| Publishing | `deploy-pages` plus Vercel deployment of the same build |
| Account management | `mega-account-manager`, `pixeldrain-account-manager`, `account-keepalive` |
| Community | `discord-bot`, `youtube-to-archive` |

---

## The dashboard

A React + Vite + Tailwind app deployed to GitHub Pages and Vercel. It serves the archive with:

- Watch page. Chapters rail, storyboard scrub previews, per-mirror latency probes, mirror-failover playback, comments, share links.
- Shorts cinema. A snap-scroll vertical player.
- Full-text search and a command palette, Ctrl/Cmd+K, plus a "Surprise me" button.
- Archive insights at `#/stats`. Growth charts, stream cadence, peak windows, mirror-redundancy coverage, quality mix, all computed live from the archive data.
- Mission control at `#/system`. The pipeline made visible.
- Two themes. Dark and light, persisted.
- Feeds. RSS at `/feed.xml`, podcast at `/podcast.xml`, sitemap.
- PWA. Offline shell, service-worker cache stamping per deploy.

### Run it locally

```bash
cd dashboard
npm ci
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
```

---

## Repository map

```
.github/workflows/   42 workflows
scripts/             recording and support scripts
  detect-stream.sh      live detection (RSS + probe, any-pass-of-3)
  record-stream.sh      10-method recording cascade + VOD rescue
  upload-clouds.sh      multi-cloud fan-out
  post-process.sh       merge, thumbnail, storyboard, chapters
  archive-chat.sh       live-chat archiving
  smart-schedule/       peak-window prediction model
  discord_bot.py        community bot
  cloudflare-worker/    streaming proxy worker
dashboard/           the React viewer (Vite + Tailwind + Vidstack)
data/                the archive index (JSON)
  recordings.json       master recording index
  system-status.json    live totals + health
  predicted-schedule.json  stream schedule model
  chat/                 archived live chat per stream
links.txt            master link database
stats.json           aggregate stats
```

Docs: [`SYSTEM_ANALYSIS.md`](SYSTEM_ANALYSIS.md) for the architecture review, [`DEEP_BUG_FIX_REPORT.md`](DEEP_BUG_FIX_REPORT.md) for the incident log and fixes, [`SNIPER_SETUP.md`](SNIPER_SETUP.md) for the go-live sniper, [`PREMIUM_UPGRADE_SUMMARY.md`](PREMIUM_UPGRADE_SUMMARY.md) and [`BUGFIX_REPORT.md`](BUGFIX_REPORT.md) for older notes.

---

## Adapt it to your own channel

1. Fork the repo. A public fork gets unlimited Actions minutes.
2. Set your channel. Put `YOUTUBE_CHANNEL_ID` in secrets, or `DEFAULT_CHANNEL_HANDLE` in `scripts/config.env`.
3. Add a Discord webhook as `DISCORD_WEBHOOK_URL` to get alerts. Nothing else is required to start.
4. Optionally add storage keys, `ARCHIVE_ACCESS_KEY`, `MEGA_EMAIL`/`MEGA_PASSWORD`, `PIXELDRAIN_API_KEY`, and a Telegram bot token, to unlock the full mirror fan-out.
5. Point `dashboard/src/lib/fetcher.ts` `SOURCES` at your fork and redeploy.

Note: recording public streams you don't have rights to may violate YouTube's terms of service. This project is designed to archive your own content or content you have permission to preserve.

---

## Tech stack

| Layer | Tools |
|---|---|
| Orchestration | GitHub Actions, 42 workflows, external cron-job.org pinger |
| Capture | yt-dlp nightly, ytarchive, streamlink, ffmpeg |
| Evasion | Cloudflare WARP, bgutil PoToken, rotating clients |
| Storage | Archive.org, GitHub Releases, MEGA, Pixeldrain, Gofile, Telegram |
| Frontend | React 19, Vite 8, Tailwind 3, Vidstack, TypeScript |
| Data | JSON indices in the repo, served via jsDelivr CDN with failover |
| Quality | shellcheck, actionlint, CodeQL, TruffleHog, gitleaks, database audits |

---

## License

MIT, Muneeb Ahmad. See [LICENSE](LICENSE).

The Muslim Lantern archive is preserved by this system. All recorded content belongs to its respective creators.
