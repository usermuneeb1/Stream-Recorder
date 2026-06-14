# 📡 The Muslim Lantern — Stream Archive System
### Complete Documentation & Explainer

> A 100% free, fully-automated, serverless system that records **@TheMuslimLantern**
> YouTube live streams, backs them up across multiple clouds, enriches them with
> on-screen guest detection, and serves them on a premium web video gallery —
> with **zero servers** and **zero monthly cost**.

---

## 1. What is this project? (one-paragraph version)

This is an **automatic TV recorder for a YouTube channel**. When *The Muslim Lantern*
goes live, this system detects it within ~5 minutes, records the entire stream in
1080p, saves permanent copies to several free cloud hosts, automatically generates
chapter markers by **reading the guests' names off the screen**, and publishes
everything to a beautiful, fast website where anyone can watch the recordings back
with working chapters, search, and download links. Everything runs for free on
**GitHub Actions** (the compute) + **Vercel** (the website) + free file hosts (the
storage). There is no paid server anywhere.

---

## 2. Why does it exist? (the purpose)

The Muslim Lantern is a daʿwah (Islamic outreach) channel that does live Q&A and
debate streams with non-Muslims. These live streams are valuable but:

- ⚠️ Live streams can disappear, get cut off, or be taken down.
- ⚠️ YouTube VODs can be made private or deleted by the channel.
- ⚠️ There's no easy way to jump to "when guest X joined the debate."

**This system preserves that daʿwah content permanently** and makes it easy to
re-watch, navigate (chapters), search, and download — a long-term public archive
for the Ummah.

---

## 3. The big picture (how it all flows)

```
                    ┌─────────────────────────────────────────────────┐
                    │  GitHub Actions = the "robot brain" (free CI)    │
                    │  Runs every 5 minutes, 24/7                      │
                    └─────────────────────────────────────────────────┘
                                          │
   ① DETECT          ② RECORD            ③ PROCESS          ④ BACK UP
   Is the channel    Download the live   Validate the       Upload copies to
   live right now?   stream in 1080p     video file         Archive + MEGA +
   (4 methods)       (6 cookieless/      (ffprobe check)    Pixeldrain + GitHub
        │            cookie methods)          │             Releases
        ▼                  ▼                   ▼                   │
   ⑤ INDEX            ⑥ MIRROR (fast)     ⑦ ENRICH (AI)          ▼
   Write the new      Upload the .mp4 to  Read guest names    ⑧ PUBLISH
   video into the     GitHub Releases     off-screen (OCR) →   The website auto-
   gallery database   (the fast player    make "X joins /      updates and shows
   (recordings.json)  source)             X leaves" chapters   the new recording
                                          │
                                          ▼
                          ┌──────────────────────────────────┐
                          │  Vercel = the website (free host) │
                          │  React app at:                    │
                          │  muslim-lantern-archive.vercel.app│
                          └──────────────────────────────────┘
```

**Key idea:** there is no always-on server. GitHub Actions wakes up every 5
minutes, does its job, and goes back to sleep. The website is just static files
that read a JSON database. This is why it's free and never goes down.

---

## 4. The technology stack (what it's built with)

| Layer | Technology | Why |
|---|---|---|
| **Compute / automation** | GitHub Actions (28 workflows) | Free unlimited minutes on public repos |
| **Recording** | yt-dlp + streamlink + ffmpeg | Industry-standard stream downloaders |
| **IP masking** | Cloudflare WARP | Hides GitHub's datacenter IP so YouTube doesn't block it |
| **Guest detection** | tesseract OCR + ffmpeg | Reads names written on screen |
| **Transcription (fallback)** | Groq Whisper Large v3 Turbo | Free speech-to-text |
| **Q&A chapters (fallback)** | Groq Llama 3.3 70B | Free LLM for question chapters when no on-screen guests |
| **Website** | React + TypeScript + Vite + TailwindCSS | Fast, modern single-page app |
| **Video player** | Vidstack (@vidstack/react) | Premium HTML5 player with chapters/seeking |
| **Animations/UI** | Framer Motion, Lucide icons, Recharts | Polished premium feel |
| **Website hosting** | Vercel (Hobby/free plan) | Free static + serverless functions |
| **Data delivery** | jsDelivr CDN (+ raw GitHub fallback) | Fast global data delivery |

---

## 5. Where the videos are stored (the storage strategy)

Videos are stored in **multiple places at once** for safety and speed. Each has a
role:

| Host | Role | Player button | Notes |
|---|---|---|---|
| 🎁 **GitHub Releases** | **Primary playback** | **R3AL** | Fast (Azure CDN ~20+ MB/s), permanent, no expiry, no account farming — it's the repo's own Releases. 2 GB/file limit. |
| 🏛️ **Internet Archive** | **Backup playback** + permanent archive | **B3ING** | Truly permanent, reliable, embeddable. Auto-fallback if GitHub fails. |
| 🔴 **MEGA.nz** | Download mirror | — | 20 GB free; auto-rotating accounts keep files alive. |
| 🟣 **Pixeldrain** | Download mirror only | — | Removed from playback (free tier blocks embedded playback with a CAPTCHA "hotlink" block). Still offered as a download. |

**Why GitHub Releases is the star:** GitHub has TWO storage areas — the *repo*
(limited ~1 GB, for code) and *Releases* (no total size limit, no bandwidth limit,
2 GB per file). Videos go in **Releases**, so the 1 GB repo limit does **not**
apply. One account holds unlimited videos forever — no "account manager" needed
(unlike MEGA/Pixeldrain which need farming because of small quotas/expiry).

---

## 6. The recording pipeline (step by step)

The heart of the system is `stream-recorder.yml`, which runs **every 5 minutes**.

### Step 1 — Detect (`scripts/detect-stream.sh`)
Checks if the channel is live using **4 independent methods** (so one failing
doesn't miss the stream):
1. `/live` redirect check
2. yt-dlp JSON dump
3. `/streams` tab scan
4. RSS feed check (works without cookies)

### Step 2 — Record (`scripts/record-stream.sh`)
Records in 1080p using a **7-method, cookieless-first** fallback chain (so a stale
YouTube cookie can never block a public stream):
1. **Android VR** (cookieless, 1080p — primary) ⭐
2. **mediaconnect** (cookieless, 1080p)
3. Cookies + web_creator (bonus, for members-only)
4. Cookies + tv_embedded (bonus)
5. Plain yt-dlp
6. Mobile web
7. Streamlink (HLS)

Cookies are only attached when **verified valid** — otherwise it runs clean
cookieless. (Verified by testing: cookieless `android_vr` returns full 1080p.)

### Step 3 — Post-process (`scripts/post-process.sh`)
Validates the recorded file with `ffprobe` (real video, not corrupt/empty).

### Step 4 — Upload to clouds (`scripts/upload-clouds.sh`)
Uploads to Archive.org, MEGA, and Pixeldrain in parallel (one failing doesn't stop
the others).

### Step 5 — Index (`scripts/update-links.sh`)
Writes the new recording into `data/recordings.json` (the gallery's database),
including the fast `archive_node` direct URL.

### Step 6 — Mirror to GitHub Releases (`github-release-mirror.yml` → `scripts/github-release-upload.py`)
Automatically triggered when `recordings.json` changes. Uploads the .mp4 as a
GitHub Release asset and saves the fast `github_release` URL.

### Step 7 — AI / OCR enrichment (`ai-enrich.yml` → `scripts/ai/enrich.py`)
Generates the chapters (see Section 7).

### Step 8 — Publish
The website reads `recordings.json` and shows the new video automatically. No
manual step.

**Resilience:** WARP IP-masking, auto-retry on failure, disk-space checks, Discord
notifications at each stage, and a `workflow-watchdog` that re-dispatches failed
runs.

---

## 7. ⭐ Guest detection — the standout feature (OCR, not audio)

This is the system's smartest, most unique part.

### The problem
On these debate streams, guests join and leave constantly. Knowing **who** joined
and **when** is what makes the chapters useful. Early versions tried to guess names
from the **audio transcript** — but that was unreliable (AI mishears names,
invents them, or misses them entirely).

### The insight
On The Muslim Lantern streams, **every speaker's name is written on screen** in a
caption box at the bottom of their video tile (e.g. "Rocco Donofrio", "Josh
Bandeira"). Reading that text directly is far more accurate than audio.

### How it works (`scripts/ai/detect-guests.py`)
1. **Sample frames** — grab one frame every 20 seconds from the recording.
2. **OCR each frame** — `tesseract` reads all text, with position + confidence data
   (TSV mode).
3. **Position filtering** — only keep text in the **bottom name-band** (below ~62%
   of frame height) at caption font-size with good confidence. This is what
   **rejects false positives** like the host's "Columbia" shirt logo or background
   posters — they're in the middle of the frame, not the name-band.
4. **Line merging** — words on the same caption line (same screen side + similar
   vertical position) are joined, so "Rocco" + "Donofrio" → "Rocco Donofrio".
5. **Host removal** — drop the channel's own name ("TheMuslimLantern - M.A").
6. **Fuzzy merge** — combine OCR variants of the same person across frames; a name
   must appear in ≥2 samples to count (kills one-off OCR noise).
7. **Build chapters** — emit `"<Guest> joins"` at first appearance and
   `"<Guest> leaves"` when they disappear.

### Fallback
If a stream has **no on-screen guest names** (e.g. phone callers with no overlay),
it falls back to **audio**: Groq Whisper transcribes it and Groq Llama makes
generic `"Q: ..."` / "Caller joins" chapters so the video still has navigation.

### Real output example
```
00:00  Stream starts
18:00  Rocco Donofrio joins
18:40  Rocco Donofrio leaves
58:40  Mira joins
104:00 Mira leaves
154:00 Josh Bandeira joins
181:20 Josh Bandeira leaves
```

> **Note:** the AI **summary** and **tags** were intentionally removed — the user
> wanted **chapters only**.

---

## 8. The website (what visitors see)

Live at **https://muslim-lantern-archive.vercel.app**

### Pages
| Page | File | What it does |
|---|---|---|
| **Home** | `pages/Home.tsx` | Premium landing page with hero, animations, latest recordings |
| **Gallery** | `pages/Gallery.tsx` | All recordings, searchable (by title + chapter labels) |
| **Watch** | `pages/Watch.tsx` | The video player page (the most important one) |
| **Command Center** | `pages/CommandCenter.tsx` | Admin dashboard (password-protected) for system status |

### The Watch page features
- 🎬 **Premium video player** (Vidstack) with multiple sources: **R3AL** (GitHub,
  fast) and **B3ING** (Archive, backup) — auto-fails-over between them.
- 📑 **Clickable chapters** — click a chapter and the video jumps to that moment;
  the active chapter highlights and auto-scrolls as the video plays.
- ▶️ **Continue Watching** — remembers where you left off.
- 🔗 **Share with timestamp** (`?t=SECONDS`).
- 📥 **Download menu** (Pixeldrain + MEGA mirrors).
- 🔖 **Bookmarks/highlights** (saved in your browser).
- 💬 **Live Chat Replay** (when chat data was captured).
- 🚀 **Service Worker** caches the website shell so the page opens instantly on
  repeat visits (does NOT cache video — that broke playback and was removed).

### Serverless functions (Vercel)
- `api/pd/[id].js` — Pixeldrain streaming proxy (server-side fetch to bypass
  hotlink blocks; used for downloads).
- `api/bh/[id].js` — Buzzheavier proxy (built but not active — Buzzheavier is
  Cloudflare-blocked for server proxies).

---

## 9. The data model (`data/recordings.json`)

This single JSON file is the **source of truth** for the gallery. Each recording is
an object with these fields:

| Field | Meaning |
|---|---|
| `video_id` | Unique ID (Archive identifier) |
| `title`, `channel`, `date`, `month` | Basic metadata |
| `video_url` | Original YouTube URL |
| `duration_sec`, `duration_fmt`, `size_human`, `resolution` | Stats |
| `thumbnail` | Thumbnail image |
| `github_release`, `github_direct` | 🎁 Fast playback URL (R3AL) |
| `archive_link`, `archive_direct`, `archive_node` | 🏛️ Backup playback (B3ING) |
| `mega_link`, `pixeldrain_link`, `gofile_link` | Download mirrors |
| `ai_chapters` | Array of `{time: SECONDS, label: "X joins"}` |
| `chapter_logic_version` | Which chapter algorithm produced them (currently v8) |
| `transcript_url` | Transcript (for audio-fallback videos) |
| `chat_url` | Live chat replay data |
| `recorded_at`, `ai_enriched_at` | Timestamps |

Data is served to the website via **jsDelivr CDN** first (fast), with **raw
GitHub** as a fallback (always fresh). After updates, the jsDelivr cache is purged
so changes appear quickly.

---

## 10. All 28 workflows (what each one does)

### 🔴 Core (the essential ones)
| Workflow | Purpose |
|---|---|
| `stream-recorder.yml` | **THE MAIN ONE** — detect + record every 5 min |
| `github-release-mirror.yml` | Upload videos to GitHub Releases (fast source) |
| `ai-enrich.yml` | OCR guest chapters (+ audio fallback) |

### ☁️ Storage & backup
| Workflow | Purpose |
|---|---|
| `archive-to-mega.yml`, `account-keepalive.yml` | Keep MEGA files alive |
| `mega-account-manager.yml`, `pixeldrain-account-manager.yml` | Generate/rotate throwaway storage accounts |
| `sync-archive-mirrors.yml`, `repair-mirrors.yml`, `import-archive-backups.yml` | Keep mirrors healthy |
| `cloud-refresh.yml`, `url-to-cloud.yml` | Refresh/re-host links |
| `db-backup.yml` | Daily snapshot of recordings.json |

### 🩺 Health & ops
| Workflow | Purpose |
|---|---|
| `cookie-health.yml` | Watch YouTube cookie validity |
| `workflow-watchdog.yml` | Re-dispatch failed runs |
| `status.yml`, `youtube-stats.yml` | Generate status badges + channel stats |
| `database-audit.yml`, `quality-check.yml`, `setup-check.yml` | Integrity checks |
| `auto-issue.yml` | Auto-file GitHub Issues for failures |
| `weekly-summary.yml` | Weekly report |
| `anonymize-archive.yml` | Privacy cleanup |

### 🔒 Security
| Workflow | Purpose |
|---|---|
| `secret-scan.yml` (gitleaks), `trufflehog.yml`, `codeql.yml` | Scan for leaked secrets / code vulnerabilities |

### 🌐 Deploy
| Workflow | Purpose |
|---|---|
| `deploy-pages.yml` | (GitHub Pages mirror; Vercel is primary) |

---

## 11. Key design decisions (and why)

| Decision | Reason |
|---|---|
| **GitHub Releases as #1 video host** | Free, fast (Azure CDN), permanent, no farming, no expiry — beats every free file host tested |
| **Archive.org as backup** | The only other truly reliable free embeddable host |
| **Pixeldrain = download only** | Free tier CAPTCHA-blocks embedded playback ("hotlinking"); can't be automated around |
| **Buzzheavier rejected for playback** | Behind Cloudflare → blocks server proxies; anonymous files expire fast |
| **No Dropbox** | 20 GB/day bandwidth → bans links exactly when content gets popular |
| **Cookieless-first recording** | So stale YouTube cookies never block a public stream |
| **OCR over audio for guests** | Names on screen are far more accurate than mishearing audio |
| **No AI summary** | User wanted chapters only |
| **Service Worker = app-shell only** | Caching video broke playback (206 range caching) — now only caches the website |
| **Everything serverless/free** | No monthly cost, nothing to maintain, can't "go down" |

---

## 12. What it does NOT do (honest limitations)

- ❌ **First-video-load isn't instant** for viewers far from the host servers
  (e.g. Pakistan). Free hosting has no edge server nearby. Only a paid CDN
  (~$1/mo, e.g. BunnyCDN) would fully fix geographic latency.
- ❌ **Videos over 2 GB** can't go to GitHub Releases (it skips them gracefully;
  Archive still serves them).
- ❌ **Members-only / age-restricted streams** still need valid cookies.
- ❌ **Phone callers without on-screen name overlays** get generic "Caller"
  chapters (from the audio fallback).
- ⚠️ **OCR enrichment is slow** (~10 min per long video) due to frame-by-frame
  sampling.

---

## 13. Repository map (where everything lives)

```
Stream-Recorder/
├── .github/workflows/        # 28 automation workflows
├── scripts/
│   ├── detect-stream.sh      # ① is the channel live?
│   ├── record-stream.sh      # ② record (7-method, cookieless-first)
│   ├── post-process.sh       # ③ validate the file
│   ├── upload-clouds.sh      # ④ Archive + MEGA + Pixeldrain
│   ├── update-links.sh       # ⑤ write recordings.json
│   ├── github-release-upload.py   # ⑥ mirror to GitHub Releases (fast source)
│   ├── ai/
│   │   ├── detect-guests.py  # ⑦ OCR on-screen guest detection ⭐
│   │   └── enrich.py         # ⑦ orchestrates chapters (OCR + audio fallback)
│   ├── setup-warp.sh         # Cloudflare WARP IP masking
│   ├── check-cookies.sh      # cookie health
│   ├── discord-notify.sh     # notifications
│   └── utils.sh              # shared helpers
├── data/
│   ├── recordings.json       # THE gallery database (source of truth)
│   ├── badges/               # shields.io status badges
│   └── backups/              # daily snapshots
└── dashboard/                # the React website
    ├── src/pages/            # Home, Gallery, Watch, CommandCenter
    ├── src/components/        # UI components
    ├── src/contexts/         # Auth, Theme, Github
    ├── src/utils/dataFetcher.ts   # loads recordings.json (jsDelivr + raw)
    ├── api/pd/[id].js         # Pixeldrain download proxy
    ├── api/bh/[id].js         # Buzzheavier proxy (inactive)
    └── public/sw.js           # Service Worker (app-shell cache)
```

---

## 14. One-line summary for anyone

> "It's a free robot that automatically records a YouTube channel's live debate
> streams, saves permanent backups everywhere, figures out who the guests were by
> reading their names off the screen, and puts it all on a slick website with
> clickable chapters — running entirely on free services with no server and no
> monthly cost."

---

*Built with ❤️ for the preservation of daʿwah content. Maintained by Muneeb Ahmad.*
