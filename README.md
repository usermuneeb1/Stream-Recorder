<div align="center">

# 📡 Stream-Recorder

### An autonomous, zero-cost live-stream archiving system that records *The Muslim Lantern*'s YouTube live streams in 1080p, mirrors them across independent cloud storages, and publishes a cinema-grade dashboard — **all running on free GitHub Actions minutes, no server, no bill.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Stream Recorder](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/stream-recorder.yml?label=stream%20recorder&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/stream-recorder.yml)
[![Quality Check](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/quality-check.yml?label=quality%20check&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/quality-check.yml)
[![Deploy Dashboard](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/deploy-pages.yml?label=dashboard%20deploy&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/deploy-pages.yml)
[![Database Audit](https://img.shields.io/github/actions/workflow/status/usermuneeb1/Stream-Recorder/database-audit.yml?label=database%20audit&logo=github)](https://github.com/usermuneeb1/Stream-Recorder/actions/workflows/database-audit.yml)

**13 streams preserved · 23.5 hours of 1080p footage · 42 automated workflows · 6 independent storage mirrors**

</div>

---

## 🔥 What this is

**Stream-Recorder** is a self-operating archiving machine. The entire infrastructure is **GitHub Actions** — GitHub's free runner minutes are the "computer," and a constellation of free-tier storage services are the "disk." It does, end to end, with no human at the keyboard:

| Stage | What happens |
|---|---|
| 🔍 **Detect** | A 5-minute sentinel (GitHub cron **plus** an external cron-job.org pinger that defeats GitHub's silent cron throttling) watches the channel via RSS + yt-dlp probes |
| 🎬 **Record** | The moment a stream goes live, a **10-method recording cascade** captures 1080p — trying independent tools until one produces a valid file |
| 🛟 **Rescue** | If the live capture fails, a **VOD-rescue fallback** polls for up to 30 minutes and tries 6 more methods before the streamer can private the video |
| 🧹 **Process** | Segments are losslessly merged, thumbnails + storyboard sprites + AI chapters generated, live chat archived |
| ☁️ **Mirror** | The finished file fans out to **6 independent storages** so no single host can take the archive down |
| 📢 **Notify** | Discord + Telegram alerts with per-method failure diagnostics |
| 🖥️ **Publish** | The archive index publishes to the repo and the dashboard reads it through a CDN with failover |

---

## 🏛️ Architecture

```
                        ┌──────────────────────────────────────┐
  External 5-min pinger │  cron-job.org  ──▶ repository_dispatch│
  (bypasses GH throttling)└──────────────────────┬───────────────┘
   + GH cron */5 * * * *                        ▼
                          ┌──────────────────────────────────────┐
                          │   stream-recorder.yml  (the brain)   │
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

`record-stream.sh` doesn't bet on one downloader — it tries **10 independent methods in order**, advancing the moment one yields a valid file:

| # | Method | Tool | Why it exists |
|---|--------|------|---------------|
| D | `android_vr` | yt-dlp | Full 1080p, **no PoToken, no cookies** — proven primary |
| C | `mediaconnect` | yt-dlp | Newer client, no PO token needed |
| G | plain yt-dlp | yt-dlp | Let yt-dlp auto-select the best client |
| E | `mweb` | yt-dlp | Mobile web, minimal bot detection |
| J | ffmpeg HLS-direct | ffmpeg | Fully independent path (resolve manifest, copy with ffmpeg) |
| H | **ytarchive** | Go binary | Purpose-built for YT live; holds through ad rolls |
| I | streamlink (hardened) | streamlink | Independent codebase, aggressive retry flags |
| F | streamlink (default) | streamlink | Different flag set |
| A | `web_creator` + cookies | yt-dlp | Catches sign-in-required / members-only streams |
| B | `tv_embedded` + cookies | yt-dlp | Bypasses the n-challenge |

Cookieless methods run **first** (stale cookies can never break a public recording), while valid cookies still rescue `LOGIN_REQUIRED` streams as a fallback. Every failure is logged with its reason and injected into the Discord alert.

### Defense in depth

- **Race-condition guard** — detect→record re-checks "still live?" with any-pass-of-3 logic (incident-driven: each guard references a real lost stream)
- **Segment-then-merge** — long streams record as numbered segments, losslessly concatenated (with re-encode + largest-segment fallbacks)
- **Self-retry** — on failure, dispatches a fresh workflow run via the API
- **Cloudflare WARP** masks the GitHub datacenter IP (a hard requirement — YouTube blocks raw GH IPs)
- **bgutil PoToken provider** — solves YouTube's PO token / nsig challenge

---

## ☁️ Storage fan-out (6 independent mirrors)

| Storage | Why |
|---|---|
| **Archive.org** | The "forever library" — permanent node + direct files |
| **GitHub Releases** | Versioned cold storage |
| **MEGA** | Encrypted cloud vault (20 GB free, auto-rotating accounts) |
| **Pixeldrain** | Edge streaming cache (60-day retention) |
| **Gofile** | Anonymous overflow |
| **Telegram** | Bot-delivered stream channel |

Redundancy is the product: any single host can vanish and every recording survives elsewhere. A `source-health` workflow probes each mirror and a `repair-mirrors` workflow re-uploads anything that dies.

---

## 🤖 The 42-workflow fleet

Beyond the main recorder, the repo is effectively a self-operating SRE team in YAML:

| Category | Workflows |
|---|---|
| 🎬 **Recording** | `stream-recorder` (the brain), `stream-sniper` (go-live detection), `record-postprocess-test`, `cookieless-smoke-test`, `smart-schedule` (peak-window model), `youtube-ghost-host` |
| ☁️ **Mirroring** | `upload`/`url-to-cloud`, `catbox-mirror`, `telegram-mirror`, `github-release-mirror`, `archive-to-mega`, `sync-archive-backups`, `repair-mirrors`, `cloud-refresh`, `source-health` |
| 🛡️ **Security & secrets** | `secret-rotator`, `secret-scan`, `trufflehog`, `gitleaks`, `codeql`, `cookie-health` (cookie sentinel), `anonymize-archive` |
| 🧪 **Quality gates** | `quality-check` (shellcheck + actionlint + build), `database-audit`, `install-self-test`, `setup-check`, `workflow-watchdog` |
| 🎨 **Enrichment** | `thumbnail-gen`, `storyboard-gen`, `chat-archiver`, `youtube-stats` |
| 🗄️ **Data & backup** | `db-backup`, `import-archive-backups`, `weekly-summary`, `status`, `auto-issue` |
| 🌐 **Publishing** | `deploy-pages` (GitHub Pages dashboard), plus Vercel deployment of the same build |
| 🏪 **Account management** | `mega-account-manager`, `pixeldrain-account-manager`, `account-keepalive` |
| 💬 **Community** | `discord-bot`, `youtube-to-archive` |

---

## 🖥️ The dashboard (React + Vite + Tailwind)

The "Crimson Cinema" front-end ([The Lantern Archive](https://github.com/usermuneeb1/Stream-Recorder)) is a movie-grade viewing experience:

- 🎬 **Watch page** — chapters rail, storyboard scrub previews, per-mirror latency probes, mirror-failover playback, comments, share links
- 📱 **Shorts cinema** — snap-scroll vertical player
- 🔎 **Full-text search** + ⌨️ **Command palette** (Ctrl/Cmd+K), "Surprise me"
- 📊 **Archive insights** (`#/stats`) — growth charts, stream cadence, peak windows, mirror-redundancy coverage, quality mix — computed live from the archive data
- 🧭 **Mission control** (`#/system`) — the pipeline made visible
- 🌗 **Dual themes** — midnight crimson cinema / white gallery
- 📡 **Feeds** — RSS (`/feed.xml`), podcast (`/podcast.xml`), sitemap
- ⚡ **PWA** — offline shell, service-worker cache stamping per deploy

### Run it locally

```bash
cd dashboard
npm ci
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
```

---

## 🗂️ Repository map

```
.github/workflows/   42 workflows — the "SRE team"
scripts/             the engine room
  detect-stream.sh      live detection (RSS + probe, any-pass-of-3)
  record-stream.sh      10-method recording cascade + VOD rescue
  upload-clouds.sh      multi-cloud fan-out
  post-process.sh       merge, thumbnail, storyboard, chapters
  archive-chat.sh       live-chat archiving
  smart-schedule/       peak-window prediction model
  discord_bot.py        community bot
  cloudflare-worker/    streaming proxy worker
dashboard/           the React viewer (Vite + Tailwind + Vidstack)
data/                the archive index (JSON — the "database")
  recordings.json       master recording index
  system-status.json    live totals + health
  predicted-schedule.json  stream schedule model
  chat/                 archived live chat per stream
links.txt            master link database
stats.json           aggregate stats
```

**Docs:** [`SYSTEM_ANALYSIS.md`](SYSTEM_ANALYSIS.md) (deep architecture review) · [`DEEP_BUG_FIX_REPORT.md`](DEEP_BUG_FIX_REPORT.md) (incident log + fixes) · [`SNIPER_SETUP.md`](SNIPER_SETUP.md) (go-live sniper) · [`PREMIUM_UPGRADE_SUMMARY.md`](PREMIUM_UPGRADE_SUMMARY.md) · [`BUGFIX_REPORT.md`](BUGFIX_REPORT.md)

---

## 🚀 Adapt it to your own channel

1. **Fork the repo** (a public fork gets unlimited Actions minutes).
2. Set your channel: `YOUTUBE_CHANNEL_ID` secret (or `DEFAULT_CHANNEL_HANDLE` in `scripts/config.env`).
3. Add a Discord webhook (`DISCORD_WEBHOOK_URL`) to get alerts — nothing else is required to start.
4. Optionally add storage keys (`ARCHIVE_ACCESS_KEY`, `MEGA_EMAIL/PASSWORD`, `PIXELDRAIN_API_KEY`, Telegram bot) to unlock the full mirror fan-out.
5. Point `dashboard/src/lib/fetcher.ts` `SOURCES` at your fork, and redeploy.

> ⚠️ Recording public streams you don't have rights to may violate YouTube's ToS. This project is designed for archiving **your own content** or content you have permission to preserve.

---

## 🧰 Tech stack

| Layer | Tools |
|---|---|
| Orchestration | GitHub Actions (42 workflows), external cron-job.org pinger |
| Capture | yt-dlp (nightly), ytarchive, streamlink, ffmpeg |
| Evasion | Cloudflare WARP, bgutil PoToken, rotating clients |
| Storage | Archive.org, GitHub Releases, MEGA, Pixeldrain, Gofile, Telegram |
| Frontend | React 19, Vite 8, Tailwind 3, Vidstack, TypeScript |
| Data | JSON indices on the repo itself, served via jsDelivr CDN with failover |
| Quality | shellcheck, actionlint, CodeQL, TruffleHog, gitleaks, database audits |

---

## 📜 License

MIT © Muneeb Ahmad — see [LICENSE](LICENSE).

*The Muslim Lantern archive is preserved by this system. All recorded content belongs to its respective creators.*
