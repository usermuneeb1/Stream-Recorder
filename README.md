# Stream-Recorder — The Lantern Archive

A private, fully-automated live-stream archive: it records streams as they air,
preserves every recording across independent permanent mirrors, and serves the
whole library through a cinematic streaming dashboard.

> **Private project.** This README is an internal overview, not public
> documentation. © Muneeb Ahmad — see [LICENSE](LICENSE).

---

## Architecture

Three decoupled layers. Each fails independently; none trusts the others.

```
┌─────────────────────────────────────────────────────────────────┐
│  1 · AUTOMATION — ~48 GitHub Actions workflows                  │
│                                                                  │
│   record ──▶ post-process ──▶ mirror ──▶ verify ──▶ repair       │
│                                                                  │
│   · Recording    stream-recorder · stream-sniper · stream-guard  │
│   · Mirrors      Archive.org · MEGA · Pixeldrain · Gofile        │
│                  0807.st · VikingFile · Telegram · GitHub        │
│   · Enrichment   AI thumbnails · storyboards · chapters · HLS    │
│   · Scheduling   smart-schedule · stream prediction              │
│   · Community    Discord bot · chat archiver · weekly summary    │
│   · Reliability  mirror-health · repair-mirrors ·                │
│                  reconcile-archive · workflow watchdogs          │
│   · Security     secret rotator · gitleaks · trufflehog · CodeQL │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  2 · DATA — JSON-as-database, backed up daily                    │
│                                                                  │
│   data/recordings.json      the canonical index                 │
│   data/backups/*            daily snapshots                     │
│   data/mirror-health.json   per-source liveness                 │
│   data/chat · comments      replay + discussion                 │
└──────────────────────────────┬──────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  3 · DASHBOARD — The Lantern Archive web app (dashboard/)        │
│                                                                  │
│   React 19 · Vite · TypeScript · Tailwind CSS                   │
│   Vidstack player with auto-failover mirror cascade             │
│   "Crimson Cinema" design system · dark cinema / light gallery  │
│   View Transitions routing · command palette · PWA               │
└─────────────────────────────────────────────────────────────────┘
```

### The NEVER-DEAD guarantee

Every recording exists in **multiple independent archives** at once. Playback
runs through an auto-failing mirror cascade — if a source gutters, the next
lights up. Sources flagged dead by the health sweep sink to the bottom of the
cascade, and `repair-mirrors` re-uploads them from a permanent mirror within
hours. The billboard and watch page always prefer permanent storage
(Archive.org / GitHub Releases) over expiring hosts.

---

## Dashboard development

```bash
cd dashboard
npm ci          # Node ≥ 22, < 25
npm run dev     # Vite dev server
npm run test    # vitest
npm run lint    # eslint
npm run build   # type-check + production build
```

Deploy targets: **Vercel** (`dashboard/vercel.json`, serverless API routes in
`dashboard/api/`) and **GitHub Pages** (`deploy-pages.yml`).

---

## Recording without cookies (bot-detection bypass)

YouTube answers datacenter IPs with **"Sign in to confirm you're not a bot"**.
That is an IP + browser-fingerprint challenge, not a login problem, so a
hand-pasted `YOUTUBE_COOKIES` secret works for a few days and then rots —
which is exactly the "I have to keep changing the cookie" pain.

The recorder no longer depends on that secret for public streams:

| Layer | What it does |
|---|---|
| **Detection Method 5** | If curl/yt-dlp detection is bot-walled, a real Chrome opens the channel's `/live` page and reads the player directly. |
| **Recording Method K** | Opens the watch page in **SeleniumBase UC mode** (undetected-chromedriver), clears the consent/bot interstitial, then exports (a) its cookie jar to `cookies.txt` and (b) the live `hlsManifestUrl` / `dashManifestUrl` / format URLs for a pure-ffmpeg download. |
| **Auto-adoption** | The minted jar replaces `COOKIES_FILE` for the rest of the run, so a stale cookie file can never poison methods A/B or the pre-flight liveness recheck. |

No Google account is ever used, so this is still **cookieless in the sense that
matters**: nothing is stored, nothing expires, nothing needs manual rotation.

### Controls

| Variable | Default | Meaning |
|---|---|---|
| `BROWSER_ASSIST` | `auto` | `auto` = Method K after the fast cookieless paths · `first` = before everything · `off` = disable |
| `BROWSER_SESSION_TIMEOUT` | `240` | Hard cap for one browser launch (seconds) |
| `BROWSER_SESSION_MAX_AGE` | `900` | Reuse a captured session for this long (same video only) |
| `BROWSER_HEADED` | `false` | Force headed mode (Xvfb) |

Set `BROWSER_ASSIST` as a repository **variable** (Settings → Secrets and
variables → Actions → Variables) to change it for every workflow.

### Install / verify

```bash
bash scripts/setup-browser.sh              # Xvfb + seleniumbase + uc_driver
bash scripts/setup-browser.sh --check-only # verdict only
bash scripts/setup-browser.sh --verify-launch  # prove Chrome really launches
bash scripts/browser_session.py --selftest     # offline logic check
bash tests/browser-session-test.sh             # hermetic plumbing test
```

The **Cookieless smoke test** workflow runs the browser bypass once a day and
reports `session minted / N cookies / HLS manifest captured` in its summary, so
rot is visible hours before a stream.

> `PUBLIC_STREAM_ONLY=true` still skips cookie methods A/B. Method K keeps
> working there — it is a session, not a login.

---

## Repository map

| Path | Purpose |
|---|---|
| `.github/workflows/` | The automation fleet (~48 workflows) |
| `scripts/` | Bash/Python tooling: record, upload, mirrors, thumbnails |
| `dashboard/` | React streaming app + serverless API routes |
| `data/` | Canonical JSON state + daily backups |
| `tests/` | Recording-cascade + browser-bypass integration tests |

## Principles

1. **Preservation first** — permanent mirrors before convenient ones.
2. **QoE beats resolution** — time-to-first-frame and rebuffer ratio are the
   metrics; the startup path never depends on a source that can disappear.
3. **Automate the boring, alert on the broken** — watchdogs over hope.
4. **Private by default** — no public documentation, no leaked surface area.
