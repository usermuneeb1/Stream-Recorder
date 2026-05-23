# ☪️ Stream Recorder — The Muslim Lantern

Fully automated **single-channel** YouTube live stream recorder on GitHub Actions. Detects live streams, records, uploads to Gofile / Pixeldrain / Archive.org / MEGA.nz, and sends Discord notifications with download links.

## Quick start

1. Add secrets — see **[SETUP.md](SETUP.md)**
2. Run **🔧 Setup Check** workflow
3. Enable **GitHub Pages** for `streams.html` dashboard
4. Main recorder runs Thu–Mon every 5 minutes automatically

## Features

- 7 detection methods + 7 recording methods with retries
- Cloudflare WARP IP masking for YouTube
- Rich Discord embeds (live, complete, failed, weekly, cookies)
- Public dashboard (`streams.html` + `stats.json`)
- Cookie health checks with Discord warnings
- Link refresh workflow (Gofile / Pixeldrain expiry)

## Repo layout

```
.github/workflows/   # 10 workflows (main + setup + utilities)
scripts/             # Bash automation
stats.json           # Lifetime stats (updated after each stream)
links.txt            # Permanent link archive
data/recordings.json # Dashboard feed
streams.html         # GitHub Pages UI
```

## Author

Muneeb Ahmad — [GitHub](https://github.com/usermuneeb1)

MIT License
