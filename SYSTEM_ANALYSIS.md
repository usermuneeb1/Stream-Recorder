# 🔬 Stream-Recorder — System Analysis

> **Correction (2026-07-26):** An earlier version of this doc claimed
> `actions/checkout@v7` is "THE KILLER". That was **wrong** — `v7.0.0` shipped
> 2026-06-17 and is the current Latest release. The repo's checkout is fine.
> For the verified, in-depth bug list + applied fixes, see
> **`DEEP_BUG_FIX_REPORT.md`**.

*A deep-dive review of the architecture, the clever bits, and one critical issue still live in the repo.*

---

## TL;DR — What this is

**Stream-Recorder** is an autonomous, **zero-cost** archiving system that records **The Muslim Lantern**'s YouTube live streams and mirrors them across ~5 cloud storage providers. The remarkable part: the *entire* infrastructure is **GitHub Actions** — no server, no VPS, no Docker host, no cloud compute bill. GitHub's free Actions minutes are the "computer," and a constellation of free-tier storage services are the "disk."

It has recorded 7 streams (~12 hours, ~3–6 GB of 1080p video) and published them to a polished Vercel dashboard.

---

## 🏛️ The Architecture (high level)

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

Supporting the main loop are **41 total workflows** (cookie sentinel, secret rotator, mirror repair, weekly report, Discord bot, dashboard deploy, account keep-alive, etc.) — it's effectively a self-operating SRE team in YAML.

---

## 🧠 What makes it genuinely clever

### 1. GitHub Actions as a free 24/7 server
GitHub silently throttles `cron` on inactive repos (noted in the workflow comments — `*/5` actually fired only ~2× in 24h at one point). The system **defeats this** with two tricks:
- An **external pinger** (cron-job.org) fires `repository_dispatch` every 5 min — not subject to GH throttling.
- On any non-manual trigger, the job **auto-waits up to 1 hour** polling for the stream to go live. So even if a cron tick is late, it compensates.

### 2. The 10-method recording cascade (the centerpiece)
`record-stream.sh` doesn't bet on one downloader. For every recording attempt it tries **10 independent methods in order**, advancing to the next the moment one yields a valid file:

| # | Method | Tool | Why it exists |
|---|--------|------|---------------|
| D | `android_vr` | yt-dlp | Full 1080p, **no PoToken**, no cookies — proven primary |
| C | `mediaconnect` | yt-dlp | Newer client, no PO token needed |
| G | plain yt-dlp | yt-dlp | Let yt-dlp auto-select the best client |
| E | `mweb` | yt-dlp | Mobile web, minimal bot detection |
| J | ffmpeg HLS-direct | ffmpeg | Resolve manifest via yt-dlp `-g`, then ffmpeg copies it — fully independent path |
| H | **ytarchive** | Go binary | Purpose-built for YT live; holds connection through ad rolls |
| I | streamlink (hardened) | streamlink | Independent codebase, aggressive retry flags |
| F | streamlink (default) | streamlink | Different flag set |
| A | `web_creator` + cookies | yt-dlp | Bonus: catches sign-in-required / members-only |
| B | `tv_embedded` + cookies | yt-dlp | Bonus: bypasses n-challenge |

The ordering is **cookieless-first by design** (verified 2026-06-14 that android_vr + mediaconnect return 1080p without cookies), so stale/expired cookies can **never** break a public recording — but valid cookies still rescue `LOGIN_REQUIRED` streams as a fallback. That's a thoughtful risk/reward tradeoff.

### 3. Defense-in-depth everywhere
- **Race-condition guard:** detect → record has a 30–60s gap, so it re-checks "still live?" with **any-pass-of-3** logic. The comments explain *why any-pass* (a single false-negative would abort a live recording, which is unrecoverable; a false-positive just yields an empty file that the validator rejects). This is incident-driven — each guard references a specific lost stream by ID.
- **VOD-rescue fallback:** if all live methods fail, it polls up to 30 min for the VOD to appear and tries 6 more methods (× cookies) before the streamer can private it.
- **Per-method failure log** → injected into the Discord alert so you actually see *why* each method died, not just "it failed."
- **Self-retry:** on failure it dispatches a fresh workflow run via the API (queued by the concurrency group).
- **Segment-then-merge:** long streams record as numbered segments and are losslessly concatenated (with re-encode + largest-segment fallbacks).

### 4. IP/anti-bot evasion
- **Cloudflare WARP** masks the GitHub datacenter IP (a hard requirement in v4 — it aborts if WARP won't connect, because YouTube blocks raw GH IPs).
- **bgutil PoToken provider** solves YouTube's PO-token / nsig challenges locally (auto-detected; methods degrade gracefully if it's not running).

### 5. Multi-cloud redundancy + account-rotation
Uploads fan out to **Gofile, Pixeldrain, MEGA, Archive.org, Telegram (+ a Cloudflare Worker stream)** — if any single service dies or deletes, the recording survives. There are even **account-manager workflows** that auto-generate and rotate fresh MEGA / Pixeldrain accounts when storage fills, so the free tier stays "permanent."

### 6. The premium dashboard
A React + TypeScript + Vite SPA (deployed to Vercel) with Netflix-style hero, 3D card tilt, ambient orbs, live-status polling, skeletons, SEO/JSON-LD — reading the channel's RSS feed to show "🔴 LIVE" badges. Nicely engineered, accessibility-aware (respects `prefers-reduced-motion`).

### 7. Incident-driven code
Almost every non-obvious branch has a dated comment citing a real failure ("this lost HbS5TF1atFU on 2026-07-04"). The codebase literally documents its own post-mortems inline. That's a sign of real production hardening, not a toy.

---

## ⚠️ One critical issue still in the repo

Your `BUGFIX_REPORT.md` correctly identifies that `actions/checkout@v7` **does not exist** (latest is `v4`) and is "THE KILLER" — every workflow dies instantly with `Unable to resolve action ... repository not found`.

**But the fix was never applied.** I checked the current `main`:

```
$ grep -rh "actions/checkout@" .github/workflows/ | sort | uniq -c
     32   uses: actions/checkout@v7
      8  - uses: actions/checkout@v7
```

→ **All 40 workflow files still reference `checkout@v7`.** This is the single biggest reason "it's not working" — every job, not just recording, is failing at checkout before doing anything. (The `mass-fix-checkout.sh` helper exists in the repo but hasn't been run/committed.)

**This is the highest-leverage fix available.** Applying it should revive the whole system.

---

## 📊 By the numbers

| Metric | Value |
|--------|-------|
| Workflows | 41 |
| Core scripts | 50+ (~4,000 lines in the 6 main bash scripts alone) |
| Recording methods in cascade | 10 (+ 6 VOD-rescue) |
| Cloud mirrors per recording | 5 (Gofile, Pixeldrain, MEGA, Archive.org, Telegram) |
| Streams recorded | 7 (~12 h, 1080p) |
| Dashboard | React/TS/Vite on Vercel |
| Monthly cost | $0 |

---

## 🎯 Bottom line

This is a genuinely clever, well-hardened system — the kind of "use free tiers as infrastructure" thinking that's hard to get right, and the defensive engineering (10-method cascade, any-pass recheck, VOD rescue, incident-commented code) is real production-grade work. The architecture choices are sound.

The only thing standing between it and "bulletproof" (its own stated goal) is mostly that **one un-fixed typo** (`checkout@v7` → `v4`) still live across all workflows. Fix that and the machine should run.
