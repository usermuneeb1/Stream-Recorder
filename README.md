# 📡 Stream-Recorder

> An automated, multi-cloud archive of every live broadcast from [The Muslim Lantern](https://youtube.com/@TheMuslimLantern). 100% serverless — runs on GitHub Actions, Vercel, and Cloudflare's free tiers.

**Live archive:** https://muslim-lantern-archive.vercel.app

---

## What it does

Every 5 minutes a GitHub Actions runner checks if the channel is live. When it is:

1. **🎬 Records** the stream using 9 fallback methods (ytarchive → streamlink → 7 yt-dlp configurations).
2. **🛠️ Post-processes** — remux for streaming, validate audio + video, split at keyframes if needed.
3. **☁️ Mirrors in parallel** to **Archive.org · MEGA · Pixeldrain · Gofile · Telegram · GitHub Releases** — so no single provider going down ever takes a recording offline.
4. **🧠 Enriches with AI** — Gemini generates chapters and detects guests; chat-downloader captures the live chat; thumbnails are generated.
5. **🌐 Publishes** to a React + Vite dashboard with a multi-source player, live chat replay, transcript search, and AI chapters.

```
detect → record → repair → mirror (6×) → enrich → publish
  5 min   ≤5 hrs   ≤30 m   ≤2 hrs ea.    nightly   2 min
```

---

## Stack

| Layer            | Tools                                                        |
|------------------|--------------------------------------------------------------|
| Recording        | yt-dlp · ytarchive · streamlink · ffmpeg · PoToken provider  |
| Orchestration    | GitHub Actions (35 workflows)                                |
| Storage / CDN    | Archive.org · MEGA · Pixeldrain · Gofile · Telegram · GitHub Releases · Cloudflare Workers · Vercel Edge · jsDelivr |
| AI               | Google Gemini · Whisper · chat-downloader                    |
| Dashboard        | React 19 · Vite 8 · Vidstack · Tailwind                      |
| Quality / Security | gitleaks · trufflehog · CodeQL · Dependabot · shellcheck · ruff |

---

## Folder map

```
.
├── .github/workflows/        35 GitHub Actions workflows
├── data/
│   ├── recordings.json       The database (committed to git)
│   ├── system-status.json    Health badge data
│   └── backups/              Daily snapshots of recordings.json
├── dashboard/                React + Vite frontend (deployed to Vercel)
│   ├── api/                  Vercel edge function proxies (yt, pd, bh)
│   ├── public/               Static assets + sw.js + feeds
│   └── src/                  Components, utils, types
├── scripts/
│   ├── record-stream.sh      The recording engine (9 methods)
│   ├── detect-stream.sh      Triple-layer live detection
│   ├── post-process.sh       Remux / re-encode / split
│   ├── upload-clouds.sh      Mirroring to 6 providers
│   ├── repair-mirrors.sh     Re-uploads recordings with dead links
│   ├── update-links.sh       Writes recordings.json
│   ├── discord-notify.sh     Rich Discord notifications
│   ├── ai/                   Gemini chapter + guest detection
│   ├── telegram/             Pyrogram-based Telegram uploads
│   ├── cloudflare-worker/    Telegram CDN proxy
│   └── generate-feeds.py     RSS / podcast / sitemap regenerator
└── README.md
```

---

## Reliability targets

| Setup                                                         | Public-stream success rate |
|---------------------------------------------------------------|----------------------------|
| Single `yt-dlp web`, cookieless                               | ~30%                       |
| The 7 yt-dlp methods alone                                    | ~92–95%                    |
| **+ ytarchive + streamlink hardened + PoToken provider**      | **~98–99%**                |

Members-only and geo-locked streams will always require cookies — that's a YouTube design constraint, not a bypass problem.

---

## Develop locally

```bash
git clone https://github.com/usermuneeb1/Stream-Recorder.git
cd Stream-Recorder/dashboard
npm install
npm run dev          # http://localhost:5173
```

The dashboard pulls `recordings.json` from jsDelivr (the production repo), so you'll see the real archive in dev without any setup. To work on the recording scripts, see `scripts/setup-check.sh`.

---

## Generated feeds

| URL                                    | Format                          |
|----------------------------------------|---------------------------------|
| `/feed.xml`                            | RSS 2.0                         |
| `/podcast.xml`                         | RSS 2.0 with `<itunes:*>` tags  |
| `/feed.json`                           | JSON Feed 1.1                   |
| `/sitemap.xml`                         | XML sitemap for crawlers        |

All four are regenerated on every deploy by `scripts/generate-feeds.py`.

---

## License

MIT © Muneeb Ahmad
