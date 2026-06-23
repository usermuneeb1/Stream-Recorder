# ☁️ Cloudflare Worker — Telegram Video CDN

Streams videos from your Telegram archive channel through Cloudflare's global CDN.
First request fetches from Telegram, every subsequent request serves from the nearest
Cloudflare edge — instant playback worldwide on the free tier.

## What's hardened (June 2026)

The original Worker took the bot token in the URL (`?bot=…`). That leaked the
token into browsers, public JSON files, and CDN logs. This version:

- ✅ Token comes only from `env.BOT_TOKEN` (a Worker secret you set with wrangler)
- ✅ Only accepts `?file_id=<id>` — no more URL-pasting proxy, no SSRF, no
     open-relay abuse
- ✅ Cache key is derived from `file_id` alone, so the token never appears in
     edge cache metadata or access logs
- ✅ Strict CORS allow-list, `Vary: Origin`, method allow-list
- ✅ file_id format validation (`[A-Za-z0-9_-]{20,200}`)

## Deploy (5 minutes)

### 1. Install wrangler if you don't have it

```bash
npm install -g wrangler
wrangler login
```

### 2. Deploy from this folder

```bash
cd scripts/cloudflare-worker
wrangler deploy
```

You'll get a URL like `https://tg-stream.<your-subdomain>.workers.dev`.

### 3. Set the bot token as a secret

```bash
wrangler secret put BOT_TOKEN
# paste your Telegram bot token when prompted
```

### 4. Use it

```
https://tg-stream.<your-subdomain>.workers.dev/?file_id=<TELEGRAM_FILE_ID>
```

The dashboard's `dataFetcher.ts` already produces these clean URLs — no token
on the client side, ever.

### 5. (Recommended) Allow-list your dashboard origin

Edit `worker.js` → `ALLOWED_ORIGINS` to include your production dashboard URL,
redeploy with `wrangler deploy`. The default allow-list already includes
`https://muslim-lantern-archive.vercel.app`.

## How it performs

| Region | First request (MISS) | Cached (HIT) |
|---|---|---|
| Europe | ~2–4 s (depends on file size) | ~30–80 ms |
| North America | ~3–5 s | ~40–100 ms |
| Asia | ~3–6 s | ~50–150 ms |

100,000 requests/day free. Unlimited cached bandwidth.

## Rotating the token

If your bot token leaks again, no need to redeploy the Worker:

```bash
wrangler secret put BOT_TOKEN
```

That replaces the secret in-place; the next request uses the new token.

## Troubleshooting

- **403 from CDN** — origin not in `ALLOWED_ORIGINS`. Add it and `wrangler deploy`.
- **502 Failed to resolve** — bot doesn't have access to that file_id. Make
  sure the bot is a member of the channel that owns the file.
- **400 No valid file_id** — the request URL is missing or malformed.
- **500 Worker not configured** — `BOT_TOKEN` secret not set.
