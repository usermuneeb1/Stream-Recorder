# Stream Recorder — Setup Today (Single Channel)

Automated recording for **one YouTube channel** (The Muslim Lantern). Runs on GitHub Actions — free on public repos.

## 1. Fork or use this repo

https://github.com/usermuneeb1/Stream-Recorder

## 2. Add GitHub Secrets

**Settings → Secrets and variables → Actions → New repository secret**

### Required

| Secret | What to put |
|--------|-------------|
| `YOUTUBE_CHANNEL_ID` | Channel handle, e.g. `@TheMuslimLantern` or `UCxxxxxxxx` |
| `YOUTUBE_COOKIES` | Netscape cookies from browser (export while logged into YouTube) |
| `DISCORD_WEBHOOK_URL` | Main Discord webhook URL |
| `ARCHIVE_ACCESS_KEY` | Archive.org S3 access key |
| `ARCHIVE_SECRET_KEY` | Archive.org S3 secret key |
| `MEGA_EMAIL` | MEGA.nz email |
| `MEGA_PASSWORD` | MEGA.nz password |
| `GH_PAT` | GitHub PAT with `repo` + `actions:write` (for retries & API writes) |

### Recommended (separate Discord channels)

| Secret | Purpose |
|--------|---------|
| `DISCORD_WEBHOOK_ALERTS` | Live detected / failures |
| `DISCORD_WEBHOOK_RECORDINGS` | Recording complete + download links |
| `DISCORD_WEBHOOK_REPORTS` | Weekly summary |
| `DISCORD_WEBHOOK_REFRESH` | Link refresh reports |
| `PIXELDRAIN_API_KEY` | Pixeldrain uploads |
| `WARP_LICENSE_KEY` | Faster WARP (optional) |
| `AVATAR_URL` | Bot avatar image URL |

## 3. Validate setup

1. Go to **Actions → 🔧 Setup Check → Run workflow**
2. Open the run — all required secrets should show ✅

## 4. Enable GitHub Pages (dashboard)

1. **Settings → Pages**
2. **Build and deployment → Source:** choose **GitHub Actions** (not “Deploy from branch”)
3. Push to `main` runs **🌐 Deploy Dashboard** automatically, or run that workflow manually once
4. Your site: **https://usermuneeb1.github.io/Stream-Recorder/**

If you see **404**, wait 2–5 minutes after the deploy workflow finishes, then hard-refresh (Ctrl+F5).

Update `DASHBOARD_URL` in `scripts/config.env` if your username/repo differs.

## 5. Test the main recorder

**Actions → ☪️ The Muslim Lantern — Stream Recorder → Run workflow**

| Input | Use |
|-------|-----|
| `wait_for_live` | `true` to poll until stream starts |
| `force_record` | `true` to record latest channel video (testing, not live) |
| `custom_duration_minutes` | e.g. `5` for a short test |

## 6. Schedule (automatic)

The main workflow runs **every 5 minutes, Thursday–Monday** (PKT-friendly for weekend streams).

## 7. Cookie refresh (every 2–4 weeks)

When Discord shows a cookie warning:

1. Log into YouTube in your browser
2. Export cookies (Netscape format)
3. Update `YOUTUBE_COOKIES` secret

## 8. Push from local (if you edit locally)

```bash
git push origin master:main
git remote set-url origin https://github.com/usermuneeb1/Stream-Recorder.git
```

## Workflows overview

| Workflow | Purpose |
|----------|---------|
| ☪️ Stream Recorder | **Main** — detect, record, upload, Discord |
| 🔧 Setup Check | Validate secrets |
| 📊 Weekly Summary | Monday stats to Discord |
| 🔄 Cloud Refresh | Keep Gofile/Pixeldrain links alive |
| Others | Archive migration, MEGA manager, etc. |

## Single-channel config

Edit `scripts/config.env`:

- `DEFAULT_CHANNEL_HANDLE` — fallback if secret unset
- `CHANNEL_DISPLAY_NAME` — shown in Discord and dashboard
- `RECORDER_NAME` — branding

The `YOUTUBE_CHANNEL_ID` secret always overrides the default handle.
