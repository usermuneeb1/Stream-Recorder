# ☪️ The Muslim Lantern — Stream Archive

A **100% serverless, zero-cost, fully automated** system that records the
[@TheMuslimLantern](https://youtube.com/@TheMuslimLantern) YouTube live streams,
backs them up to multiple clouds, and serves them through a premium web gallery.
The entire backend runs on **GitHub Actions** — no server, no hosting bill.

🌐 **Live site:** https://muslim-lantern-archive.vercel.app

![Recordings](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main/data/badges/recordings.json)
![Archived](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main/data/badges/storage.json)
![AI enriched](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main/data/badges/ai.json)
![Subscribers](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main/data/badges/subscribers.json)

---

## How it works

```
YouTube goes LIVE
   → GitHub Actions detects it (every 5 min)
   → records at 1080p
   → uploads to Archive.org + Pixeldrain + MEGA
   → writes data/recordings.json
   → website auto-updates + Discord notification
   → AI enrichment adds transcripts, summaries, chapters
```

## Repository layout

| Path | Purpose |
|------|---------|
| `.github/workflows/` | All automation robots (record, upload, monitor, AI, security) |
| `scripts/` | Bash/Python workers (detection, recording, upload, AI, account managers) |
| `scripts/ai/` | Groq-powered transcripts + summaries + chapters |
| `dashboard/` | React + Vite website (deployed on Vercel) |
| `data/` | The gallery database (`recordings.json`), stats, status, backups |

## Features

- 🎬 Auto-records live streams (6 fallback methods, never misses)
- ☁️ Multi-cloud backup (Archive.org permanent + Pixeldrain + MEGA)
- 🧠 AI transcripts, summaries, chapters & tags (free via Groq) — *set `GROQ_API_KEY`*
- ⏯️ Continue-watching, timestamp sharing, live chat replay
- 🔐 Secret scanning, CodeQL, Dependabot
- 💾 Automatic database backups + disaster recovery from Archive
- 📊 Live status badges & system health

## Setup

Configure these GitHub **Secrets** (Settings → Secrets → Actions):
`YOUTUBE_COOKIES`, `ARCHIVE_ACCESS_KEY`, `ARCHIVE_SECRET_KEY`, `PIXELDRAIN_API_KEY`,
`MEGA_EMAIL`, `MEGA_PASSWORD`, `GH_PAT`, `DISCORD_WEBHOOK_*`, and optionally
`GROQ_API_KEY` (enables AI features).

## License

MIT © Muneeb Ahmad
