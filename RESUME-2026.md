# Stream Recorder — Resume Prompt (2026)

Copy everything below into a new Cursor chat if you lose this conversation.

---

I have an existing project called **Stream Recorder** for **one YouTube channel only**: **The Muslim Lantern**.

## Project paths
- **Local:** `C:\Users\Muneeb Ahmad\.gemini\antigravity\scratch\stream-recorder`
- **GitHub:** https://github.com/usermuneeb1/Stream-Recorder (public)
- **Dashboard:** https://usermuneeb1.github.io/Stream-Recorder/
- **Branch:** local `master` → push `git push origin master:main`
- **Never** put GitHub PAT in remote URL after push: `git remote set-url origin https://github.com/usermuneeb1/Stream-Recorder.git`

## What it does
GitHub Actions monitors **The Muslim Lantern** for live streams (Thu–Mon every 5 min), records, uploads to **Gofile, Pixeldrain, Archive.org, MEGA.nz**, Discord notifications, public dashboard.

## Critical rules
1. **Never break** `.github/workflows/stream-recorder.yml` (uses `scripts/setup-warp.sh`, NOT `sebst/actions-warp`)
2. Scripts: `set -uo pipefail`, source `utils.sh`, strip CRLF (`sed -i 's/\r$//'`)
3. Discord payloads: **jq only** (no heredoc)
4. **Single channel only** — `CHANNEL_DISPLAY_NAME` / `YOUTUBE_CHANNEL_ID` = The Muslim Lantern
5. **Thumbnails:** uploaded to **MEGA** (`/Root/TheMuslimLantern/thumbnails/`) + **Archive.org** for dashboard image — **not** stored in git repo
6. **Pixeldrain** often **blocks GitHub Actions datacenter IPs** — `PIXELDRAIN_SKIP_THUMBNAIL=true` in config.env
7. **Gofile** cannot be iframe-embedded — use direct video URL from API only

## 10 workflows
| # | File | Purpose |
|---|------|---------|
| 1 | stream-recorder.yml | MAIN — detect, record, upload, Discord |
| 2 | youtube-to-archive.yml | Channel → Archive (bot issues on GA IPs) |
| 3 | archive-to-mega.yml | Archive → MEGA |
| 4 | url-to-cloud.yml | URL → clouds |
| 5 | cloud-refresh.yml | Ping links |
| 6 | mega-account-manager.yml | Temp email MEGA accounts |
| 7 | account-keepalive.yml | MEGA login keepalive |
| 8 | weekly-summary.yml | Monday Discord stats |
| 9 | anonymize-archive.yml | Strip Archive metadata |
| 10 | deploy-pages.yml + setup-check.yml | Dashboard + secrets check |

## Required secrets
`YOUTUBE_CHANNEL_ID`, `YOUTUBE_COOKIES`, `DISCORD_WEBHOOK_URL`, `ARCHIVE_ACCESS_KEY`, `ARCHIVE_SECRET_KEY`, `MEGA_EMAIL`, `MEGA_PASSWORD`, `GH_PAT`

Optional: `DISCORD_WEBHOOK_*`, `PIXELDRAIN_API_KEY`, `WARP_LICENSE_KEY`, `AVATAR_URL`

## Key files
- `scripts/` — detect, record, post-process, upload-clouds, discord-notify, update-stats, update-links
- `site/index.html` — GitHub Pages dashboard (light/dark theme)
- `links.txt`, `stats.json`, `data/recordings.json`
- `SETUP.md` — setup guide

## Recent architecture (2026)
- Dashboard deploys from `/site` via `deploy-pages.yml`
- Thumbnails: `THUMBNAIL_MEGA_URL` + `Thumbnail:` (Archive/Gofile hotlink) in links.txt
- New recordings append `mega_link` to `data/recordings.json` for dashboard MEGA player tab

## Before editing
Read `stream-recorder.yml`, `scripts/upload-clouds.sh`, `site/index.html`, and `SETUP.md`.

Please read the repo and continue from the current state. Ask what task I want if unclear.

---

**Author:** Muneeb Ahmad · **Year:** 2026
