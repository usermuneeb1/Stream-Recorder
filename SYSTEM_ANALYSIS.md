# Stream-Recorder System Analysis

> Correction, 2026-07-26. An earlier version of this doc claimed `actions/checkout@v7` was the killer. That was wrong. v7.0.0 shipped on 2026-06-17 and is the current latest release. The repo's checkout is fine. For the verified, in-depth bug list and applied fixes, see [DEEP_BUG_FIX_REPORT.md](DEEP_BUG_FIX_REPORT.md).

A review of the architecture, what makes it work, and where the risk is.

---

## What this is

Stream-Recorder records The Muslim Lantern's YouTube live streams and mirrors them across independent cloud storage providers. The whole infrastructure is GitHub Actions. No server, no VPS, no Docker host, no cloud compute bill. GitHub's free Actions minutes do the work, and free-tier storage services hold the files.

As of the latest snapshot it has recorded 13 streams, about 23.5 hours and 10 GB of 1080p video, and published them to the dashboard.

---

## Architecture, high level

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

Around the main loop are 42 total workflows, covering cookie health, secret rotation, mirror repair, the weekly report, the Discord bot, dashboard deploy, and account keep-alive.

---

## What makes it work

### 1. GitHub Actions as a free 24/7 runner

GitHub silently throttles cron on inactive repos. The workflow comments note that `*/5` fired only about twice in 24 hours at one point. The system works around this two ways:

- An external pinger on cron-job.org fires `repository_dispatch` every 5 minutes. GitHub's throttling does not apply to it.
- On any non-manual trigger, the job auto-waits up to 1 hour polling for the stream to go live. A late cron tick is compensated for.

### 2. The 10-method recording cascade

`record-stream.sh` does not bet on one downloader. For every recording attempt it tries 10 independent methods in order and advances to the next the moment one yields a valid file:

| # | Method | Tool | Why it exists |
|---|--------|------|---------------|
| D | `android_vr` | yt-dlp | Full 1080p, no PoToken, no cookies. The proven primary. |
| C | `mediaconnect` | yt-dlp | Newer client, no PO token needed. |
| G | plain yt-dlp | yt-dlp | Lets yt-dlp auto-select the best client. |
| E | `mweb` | yt-dlp | Mobile web, minimal bot detection. |
| J | ffmpeg HLS-direct | ffmpeg | Resolves the manifest with yt-dlp `-g`, then ffmpeg copies it. Fully independent path. |
| H | ytarchive | Go binary | Purpose-built for YouTube live. Holds through ad rolls. |
| I | streamlink, hardened | streamlink | Independent codebase, aggressive retry flags. |
| F | streamlink, default | streamlink | Different flag set. |
| A | `web_creator` + cookies | yt-dlp | Catches sign-in-required and members-only streams. |
| B | `tv_embedded` + cookies | yt-dlp | Bypasses the n-challenge. |

The ordering is cookieless-first by design. Verified on 2026-06-14 that `android_vr` and `mediaconnect` return 1080p without cookies. Stale or expired cookies can never break a public recording, but valid cookies still rescue LOGIN_REQUIRED streams as a fallback. That is a deliberate risk-reward tradeoff.

### 3. Failure handling everywhere

- Race-condition guard. The detect-to-record gap is 30 to 60 seconds, so it re-checks "still live?" with any-pass-of-3 logic. The comments explain why any-pass. A single false negative would abort a live recording, which is unrecoverable. A false positive just yields an empty file the validator rejects. Each guard references a specific lost stream by ID.
- VOD-rescue fallback. If all live methods fail, it polls up to 30 minutes for the VOD to appear and tries 6 more methods, with cookies, before the streamer can private it.
- Per-method failure log. Injected into the Discord alert so you see why each method died, not just that it failed.
- Self-retry. On failure it dispatches a fresh workflow run through the API, queued by the concurrency group.
- Segment-then-merge. Long streams record as numbered segments and are losslessly concatenated, with re-encode and largest-segment fallbacks.

### 4. IP and anti-bot evasion

- Cloudflare WARP masks the GitHub datacenter IP. This is a hard requirement. The workflow aborts if WARP will not connect, because YouTube blocks raw GitHub IPs.
- The bgutil PoToken provider solves YouTube's PO token and nsig challenges locally. Methods degrade gracefully if it is not running.

### 5. Multi-cloud redundancy and account rotation

Uploads fan out to Gofile, Pixeldrain, MEGA, Archive.org, Telegram, and a Cloudflare Worker stream. If any single service dies or deletes, the recording survives. Account-manager workflows auto-generate and rotate fresh MEGA and Pixeldrain accounts when storage fills, so the free tier stays usable.

### 6. The dashboard

A React and TypeScript Vite app deployed to Vercel. It has a hero section, 3D card tilt, ambient orbs, live-status polling, loading skeletons, and SEO with JSON-LD. It reads the channel's RSS feed to show a live badge. It respects prefers-reduced-motion.

### 7. Incident-driven code

Almost every non-obvious branch has a dated comment citing a real failure. For example, "this lost HbS5TF1atFU on 2026-07-04". The codebase documents its own post-mortems inline. That is production hardening, not a toy.

---

## Where the risk is

The recording path is well covered. The live risks are external: the pinger staying alive, and YouTube changing its anti-bot behavior. The current verified findings and the one timing edge case in the upcoming and premiere path are documented in [DEEP_BUG_FIX_REPORT.md](DEEP_BUG_FIX_REPORT.md).

---

## By the numbers

| Metric | Value |
|--------|-------|
| Workflows | 42 |
| Core scripts | 50+ |
| Recording methods in cascade | 10, plus 6 VOD-rescue |
| Cloud mirrors per recording | 6 |
| Streams recorded | 13 |
| Footage | 23.5 hours of 1080p, about 10 GB |
| Dashboard | React, TypeScript, Vite, on Vercel and GitHub Pages |
| Monthly cost | $0 |

---

## Bottom line

This is a well-hardened system. The free-tiers-as-infrastructure approach is hard to get right, and the defensive engineering, the 10-method cascade, the any-pass recheck, the VOD rescue, the incident-commented code, is real production-grade work. The architecture choices are sound.
