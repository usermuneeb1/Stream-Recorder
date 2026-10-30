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

## Recording without cookies (SeleniumBase Pure CDP Mode)

Public streams are recorded **without a supplied or exported cookie jar**.
Method K uses [SeleniumBase Pure CDP Mode](https://github.com/seleniumbase/SeleniumBase/blob/master/examples/cdp_mode/ReadMe.md)
(`seleniumbase.sb_cdp`) to open the watch page in a fresh guest Chrome, read the
anonymous `ytInitialPlayerResponse`, and hand the playable HLS/DASH/muxed URL to
ffmpeg. It does **not** use WebDriver/uc_driver, does **not** call yt-dlp with
`--cookies`, and does **not** load a Google account profile.

“Cookie-free” here means no operator cookie file, no exported Netscape jar, and
no persistent login profile. Chrome may still use ordinary anonymous first-party
cookies internally while loading the page; those are never handed to the recorder.

| Layer | What it does |
|---|---|
| **Detection Method 5** | If HTTP detection is bot-walled, CDP opens the channel `/live` page and trusts only an unblocked, playable player response. |
| **Recording Method K** | CDP captures `hlsManifestUrl`, `dashManifestUrl`, a muxed format, or a matching video+audio pair; ffmpeg records it directly. |
| **Strict public mode** | `PUBLIC_STREAM_ONLY=true` closes the cookie gate for every HTTP adapter and skips A/B. This is the CI default. |
| **Last-resort cookies** | Only if you explicitly set `PUBLIC_STREAM_ONLY=false` and supply valid `YOUTUBE_COOKIES` can A/B run, after the cookieless paths. Restricted/members-only/age-gated streams may still need this. |

### Controls

| Variable | Default | Meaning |
|---|---|---|
| `BROWSER_MODE` | `cdp` | `cdp` = Pure CDP, no cookie export · `uc` = legacy cookie-jar fallback |
| `BROWSER_ASSIST` | `first` in CI/config | `first` = Method K before HTTP methods · `auto` = after fast cookieless paths · `off` = disable |
| `PUBLIC_STREAM_ONLY` | `true` in CI | Hard no-cookie contract for public recording |
| `BROWSER_SESSION_TIMEOUT` | `240` | Hard cap for one browser capture (seconds) |
| `BROWSER_SESSION_MAX_AGE` | `900` | Reuse a playable capture for this long (same video only) |
| `BROWSER_BINARY` | auto | Chrome/Chromium executable |
| `BROWSER_CDP_HOST` / `BROWSER_CDP_PORT` | unset | Attach to a **dedicated anonymous** Chrome instead of launching one |
| `BROWSER_HEADED` | `false` | Force headed mode (Xvfb on Linux) |

Set these as repository **variables** (Settings → Secrets and variables →
Actions → Variables) to change the workflows.

### Install / verify

```bash
bash scripts/setup-browser.sh --verify-launch   # Chrome + SeleniumBase CDP launch
python3 scripts/browser_session.py --selftest   # offline logic
python3 tests/test_browser_cdp.py               # CDP capture contract
bash tests/browser-cdp-test.sh                  # no-cookie wiring contract
bash tests/cookieless-smoke-test.sh             # smoke verdict contract
python3 tests/browser-cdp-local-integration.py  # real Chrome + ffmpeg local fixture
```

The **Cookieless smoke test** workflow requires Method K to produce a bounded
recording with real video **and audio**. A browser launch, visitor id, player
blob, or cookie jar alone is not a pass. If required CDP fails, the job fails even
when other cookieless methods pass.

A local fixture pass is not a live YouTube pass. Run the smoke workflow against a
public YouTube VOD/live URL from the production runner to verify current YouTube
behavior; CDP reduces fingerprint friction but cannot guarantee bypass of every
IP/account/restriction challenge.

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
