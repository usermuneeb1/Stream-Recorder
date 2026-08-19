# Cloudflare Worker: Telegram Video CDN

Streams videos from your Telegram archive channel through Cloudflare's CDN.
The first request fetches from Telegram. Every request after that is served
from the nearest Cloudflare edge, on the free tier.

## What changed in June 2026

The original Worker took the bot token in the URL, `?bot=…`. That leaked the
token into browsers, public JSON files, and CDN logs. This version:

- Reads the token only from `env.BOT_TOKEN`, a Worker secret you set with wrangler
- Accepts only `?file_id=<id>`. No URL-pasting proxy, no SSRF, no open-relay abuse
- Derives the cache key from `file_id` alone, so the token never appears in
  edge cache metadata or access logs
- Strict CORS allow-list, `Vary: Origin`, method allow-list
- Validates file_id format, `[A-Za-z0-9_-]{20,200}`

## Deploy, about 5 minutes

### 1. Install wrangler if you do not have it

```bash
npm install -g wrangler
wrangler login
```

### 2. Deploy from this folder

```bash
cd scripts/cloudflare-worker
wrangler deploy
```

You get a URL like `https://tg-stream.<your-subdomain>.workers.dev`.

### 3. Set the bot token as a secret

```bash
wrangler secret put BOT_TOKEN
# paste your Telegram bot token when prompted
```

### 4. Use it

```
https://tg-stream.<your-subdomain>.workers.dev/?file_id=<TELEGRAM_FILE_ID>
```

The dashboard's `dataFetcher.ts` already produces these clean URLs. No token
on the client side, ever.

### 5. Recommended: allow-list your dashboard origin

Edit `worker.js` `ALLOWED_ORIGINS` to include your production dashboard URL,
redeploy with `wrangler deploy`. The default allow-list already includes
`https://muslim-lantern-archive.vercel.app`.

## Performance

| Region | First request (MISS) | Cached (HIT) |
|---|---|---|
| Europe | about 2 to 4 seconds, depends on file size | about 30 to 80 ms |
| North America | about 3 to 5 seconds | about 40 to 100 ms |
| Asia | about 3 to 6 seconds | about 50 to 150 ms |

100,000 requests per day free. Unlimited cached bandwidth.

## Rotating the token

If your bot token leaks again, no redeploy is needed:

```bash
wrangler secret put BOT_TOKEN
```

That replaces the secret in place. The next request uses the new token.

## Troubleshooting

- 403 from CDN. Origin not in `ALLOWED_ORIGINS`. Add it and `wrangler deploy`.
- 502 Failed to resolve. The bot does not have access to that file_id. Make
  sure the bot is a member of the channel that owns the file.
- 400 No valid file_id. The request URL is missing or malformed.
- 500 Worker not configured. The `BOT_TOKEN` secret is not set.
