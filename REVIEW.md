# 📋 Stream-Recorder — Code Review

> Repo: `usermuneeb1/Stream-Recorder` · ~17,500 LOC · 35 GitHub Actions workflows
> · 19 shell scripts · 11 Python scripts · React 19 + Vite dashboard · Cloudflare Worker

This is the result of a deep read of the recorder engine, post-processing, the 6-way
mirror pipeline, the Vercel Edge functions, the React player, the comments backend,
and the Cloudflare Telegram proxy.

---

## 🎯 What I think of the system overall

**Strengths**

| Area | Verdict |
|------|---------|
| Architecture | Genuinely impressive — true serverless on free tiers, multi-cloud redundancy, single source of truth in `recordings.json`. |
| Recording reliability | Nine fallback methods + retry loop is *thoughtful* engineering, not a copy-paste. The 98–99% number in the README is plausible. |
| Security posture | `.gitleaks.toml`, trufflehog, CodeQL, secret-rotator, the recent CF Worker hardening (removed `?bot=` and `?url=` open-proxy) — the author understands threat models. |
| Player UX | Auto source-picker with health probes + error fallback + ⌘K palette + resume + Continue-Watching is better than most paid archive sites. |
| Code style | Comments are excellent. Layered logging, consistent error handling in bash, type hints in Python. |

**Weaknesses (high-level)**

1. **Single point of fragility = `recordings.json` in git.** Every mirror, every comment, every status update commits to the same file. The 710 commits on `main` in a month with a write-conflict-prone API is technical debt waiting to bite.
2. **Vercel Edge functions are misused as bandwidth proxies** (Pixeldrain & Buzzheavier). A live-stream archive will burn through Vercel's free 100 GB/mo in days if traffic picks up.
3. **The "GHOST" YouTube ghost-host source is silently broken** in the player — see Bug #1 below.
4. **Workflow time budgets are wishful** for long streams (>3 h). The math in `MAX_RECORD_DURATION=18000` + 6-way upload doesn't fit in GitHub's 6-hour job ceiling.

---

## 🐛 Bug list (prioritised — P0 first)

### P0 · Player / Data layer

**#1 — GHOST source URL is malformed and never actually plays**
`dashboard/src/components/WatchPage.tsx`, `getSources()`
```ts
out.push({ label: 'GHOST', url: `youtube/${gid}`, ... })   // ← passed to <MediaPlayer src>
```
Vidstack's `<MediaPlayer>` can't resolve `youtube/<id>` — it expects a full URL like
`https://www.youtube.com/watch?v=<id>` (Vidstack's YouTube provider) or an `.mp4` URL.
Result: GHOST tile always raises `error` and the player auto-falls back to R3AL. The
"smart picker" picks GHOST first based on the `i.ytimg.com` probe (which always
succeeds), wastes ~3 s before falling back. **Fix below.**

**#2 — Source auto-fallback uses stale state, picks the same dead source again**
`WatchPage.tsx` `onErr` handler reads `errorFallbackIdx.has(i)` from closure *before* the
state setter has flushed. On consecutive failures the loop may select an index that's
already in the failed set on the next render. **Fix below.**

**#3 — `mode: 'no-cors'` HEAD probes can't distinguish dead from alive**
The Auto picker races each source with `fetch(url, { method: 'HEAD', mode: 'no-cors' })`.
`no-cors` returns an opaque response that *resolves successfully even on 404, 403, or
when the body is a paywall HTML*. The result: `sourceHealth` ranks sources by raw TCP
latency, not actual playability, so dead mirrors win the race when the dead host has
a fast DNS/CDN. **Fix below: replace HEAD with a tiny Range-byte GET for mp4.**

**#4 — `fetchFirst()` mirror fallback doesn't fall back on bad JSON**
`dashboard/src/utils/dataFetcher.ts`:
```ts
if (r.ok) return r.text();   // returns whatever — even HTML 200 from jsDelivr cache miss
```
When jsDelivr returns a stub "domain queued" HTML page with status 200 (which it does
during stale propagation), `JSON.parse` throws in the caller, and the archive shows
zero recordings. Should try-parse here and fall through to the raw.githubusercontent
mirror. **Fix below.**

**#5 — `dedupAndMerge()` keeps the worse resolution**
```ts
if (r.resolution?.includes('1080') && !merged.resolution?.includes('1080'))
  merged.resolution = r.resolution;
```
A 1440p or 2160p record won't ever overwrite a 1080p one because the condition
short-circuits. **Fix below.**

**#6 — Default nickname pollutes localStorage**
`dashboard/src/components/Comments.tsx`:
```ts
const a = author.trim() || 'Anonymous';
localStorage.setItem(NICK_KEY, a);  // writes "Anonymous" forever
```
Every subsequent visit shows `Anonymous` in the name input, even if the user wanted to
type their real name. **Fix below.**

### P0 · Edge functions

**#7 — Comments API will throw in modern Edge runtime**
`dashboard/api/comments/[id].js`:
```js
btoa(unescape(encodeURIComponent(JSON.stringify(list, null, 0) + '\n')))
```
`unescape()` is deprecated globally and is *not* exposed in newer Vercel Edge runtimes
(strict-mode env). The comments POST will return 500 once Vercel rolls forward. Use the
proper Uint8Array → base64 pattern. **Fix below.**

**#8 — Race condition: two POSTs in the same minute lose a comment**
The comments handler does `ghGetFile(...) → push → ghPutFile(...)` without a retry loop.
Two simultaneous comments read the same `sha`; second PUT returns 409 and the second
comment is silently dropped (the function still returns 200 because the catbox upload
succeeded). **Fix below — wrap in a 5-attempt CAS retry.**

**#9 — `api/yt/[id].js` sequential probing wastes 60s of latency budget**
The handler does `for (const inst of PIPED) await fromPiped(...)`, then the same for
Invidious. With 6s timeouts and 11 instances that's up to 66 s. Vercel Edge default
timeout is 25 s. **Fix below: `Promise.any` race across all instances in parallel.**

**#10 — YouTube CDN redirect cached for 30 min, dies at ~6 h**
`api/yt/[id].js` returns `Cache-Control: public, max-age=1800` on a 302 to a YouTube
CDN URL whose signed `&sig=` expires (varies, typically 6 h, sometimes shorter). Cached
redirects within that window are fine; the problem is the *Vercel edge cache stamps it
with the original origin* — a stale 302 served after the signature expires gives a
broken player with no auto-retry. Tighten to `max-age=300`.

### P1 · Recording engine / Workflows

**#11 — Race condition in every `github_api_write` call**
`scripts/utils.sh` reads SHA, encodes, PUTs. Across 35 workflows (some running
concurrently — e.g., `repair-mirrors`, `db-backup`, `status`) the same file is
frequently written from multiple jobs. Returns "Problems parsing JSON" or "sha is
not current" silently; data is lost. The script logs the failure but the *caller*
treats `github_api_write` as fire-and-forget. **Fix below — add CAS retry loop.**

**#12 — `MAX_RECORD_DURATION=18000` (5 h) leaves only 1 h for post-process + 6 uploads**
GitHub-hosted runners have a 6-hour ceiling. A 5-hour 1080p recording is ~10 GB. The
sequential remux (Stage 1) + quality check + parallel upload to Archive.org · MEGA ·
Pixeldrain · Gofile · Telegram · GitHub-Release does *not* finish in 1 h for 10 GB.
The job hits the wall and the runner is killed mid-upload; partial mirrors land in
`recordings.json` and the recording is incomplete on at least half the providers.
**Fix:** either chunked-upload-in-background to a follow-up workflow (already exists
as `repair-mirrors.yml` — good) OR reduce `MAX_RECORD_DURATION` to 14400 (4 h).

**#13 — `--no-part --no-continue` + `timeout` = mid-fragment corruption**
When the 5-hour timeout fires, yt-dlp is killed during fragment write. Without `.part`
files, the final `.mp4` has a missing/broken `moov` atom. `post-process.sh` Stage 1
remux will *appear* to succeed (ffmpeg returns 0 on a `-c copy` of a damaged file)
but the output has no seekable duration. **Fix:** add a `ffprobe` duration check
inside `is_valid_video` and run an explicit `untrunc`/`ffmpeg -f mp4 -err_detect ignore_err`
recovery pass if duration < expected.

**#14 — Method 1 silently fails behind YouTube's consent wall**
`detect-stream.sh:detect_method_1_redirect` sets a `CONSENT=YES+cb…` cookie which YouTube
sometimes ignores from cold runner IPs. The redirect goes to `consent.youtube.com`
and no `videoId` is matched — method exits "not live" instead of "retry". Mitigated by
Methods 2–4, but it skews "first-method success rate" metrics.

**#15 — Title round-trip is brittle**
`_export_detection_results` appends `${today_date}` to the title; the dashboard's
`cleanTitle` strips it back off with a regex. Works in the happy path. Breaks if a
stream's *real* title legitimately ends with `YYYY-MM-DD` — gets stripped, then the
user sees a wrong date appended on re-render of the same record from another method.

### P1 · Security / Privacy

**#16 — Comments rate-limiter is per-edge-instance in-memory**
`api/comments/[id].js` uses `new Map()`. Vercel Edge runs in 30+ regions; an
attacker hitting different regions gets ~30× the rate limit. Move to Upstash Redis
or accept abuse risk.

**#17 — `SLUR_RE` is a copy-paste regex that's trivially bypassable**
`n.i.g.g.e.r`, zero-width joiners, or any homoglyph defeats it. Either drop it
(false sense of security) or hand it to a real moderation API (Perspective).

**#18 — Comments index file grows unbounded**
`trimmed = list.slice(-5000)` silently drops the oldest 4001st comment forever — *with
no archive*. Old conversations vanish. Pagination + cold-storage rotation would fix
this; or warn the user before drop.

**#19 — CORS allow-list "fallback to first" is a misuse**
`scripts/cloudflare-worker/worker.js`:
```js
const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
```
For disallowed origins this sends `Access-Control-Allow-Origin: https://muslim-lantern-archive.vercel.app`,
which browsers reject anyway. Harmless but misleading — should send no Allow-Origin
header (browser blocks naturally).

### P2 · Build / Tooling

**#20 — `package.json` pins `typescript: ~6.0.2`**
TypeScript 6.0 was not released as of this review (latest is 5.x). `npm install`
will fail on a clean clone. Pin to `~5.6.0`. (Same risk for `vite: ^8.0.12` —
verify against npm.)

**#21 — `dashboard/public/sw.js` caches `/` to SHELL_CACHE without a manifest**
Network-first is OK, but in the cache-fallback path a stale `index.html` can reference
hashed asset filenames that no longer exist on the new deploy. The user sees a
white screen and has to hard-reload. **Fix:** include the current build hash in
`VERSION` (set via Vite `define`) so the cache invalidates on every deploy.

### P2 · Cost / Bandwidth surprises

**#22 — `/api/pd/<id>` proxies multi-GB video through Vercel Edge**
With Cache-Control: 1 week and Vercel's 100 GB/mo free bandwidth, a single popular
3 GB stream watched by 30 first-time viewers = quota gone. The cache mitigates but
doesn't eliminate the first-byte cost per region. Either move to a Cloudflare Worker
(unmetered for small payloads under R2 free tier) or front Pixeldrain with the CF
worker rather than Vercel.

**#23 — Service Worker won't help video** (acknowledged in code), so all bandwidth
remains on origin servers. Pre-warming the CF Worker cache for the top-10 recordings
on Friday evening (when streams happen) would massively reduce per-viewer cost.

### P3 · UX nits

- **#24** — `<button onClick onClick=copy>` inside `<button onClick=open>` in
  `StreamCard.tsx` works but is invalid HTML (nested interactive). Should be a `<div role="button">` wrapper.
- **#25** — `Header.tsx` search has no debounce → every keystroke triggers a full
  `useMemo` over all recordings.
- **#26** — Resume banner shows even if the user opened the video from "Continue
  watching" already at the right position.
- **#27** — `App.tsx` route effect waits for `recs.length` before mapping the
  hash. On hard-refresh of `#/watch/<id>` the first paint shows the home page for
  ~500 ms before flipping to the player.

---

## 🚧 System limitations (architectural, not bugs)

| # | Limitation | Why it matters | How to solve |
|---|------------|----------------|--------------|
| L1 | All state in `recordings.json` in git | Concurrency bottleneck, 710 commits/mo bloats `.git`, can't query | Move to **Turso/D1/Neon** (free SQLite/Postgres) read via a tiny edge fn; commit nightly snapshot for portability |
| L2 | GitHub Actions 6 h job ceiling | Streams >4 h hit the wall | Split into 2 workflows: *record* (long-lived) → *post-process* (separate runner, triggered by `workflow_run`) |
| L3 | Free-tier mirror flakiness | MEGA/Pixeldrain accounts get banned for abuse; Telegram bots get rate-limited | You already rotate accounts — formalise it: track 30-day success rate per provider in `system-status.json`, auto-disable providers below 70% |
| L4 | Vercel Edge as a bandwidth proxy | Burns free quota fast | Push the proxies into Cloudflare Workers (10M req/day free) and only use Vercel for the SPA shell + comments API |
| L5 | Single GitHub repo as both code and data | `git clone` is 50+ MB and growing daily | Split data into `Stream-Recorder-Data` repo; CI clones it sparsely |
| L6 | No DRM / authenticated playback | Anyone can hot-link mirrors | If channel requires it, sign URLs with a short-lived JWT in a CF Worker (HMAC of file_id + expiry) |
| L7 | No deletion / takedown workflow | DMCA / right-to-be-forgotten requests have no path | Add `data/blocklist.json` consumed by dashboard + worker (return 410 Gone) |
| L8 | YouTube Ghost-Host bound to one account's 6 uploads/day quota | Pipeline stalls on busy days | Round-robin across 3+ YouTube accounts via the `account-keepalive.yml` pattern you already use for MEGA |
| L9 | No observability beyond Discord notifications | Hard to debug intermittent failures across 35 workflows | Pipe `system-status.json` to Better Stack (free 10 monitors) and graph `recordings_total` over time |
| L10 | No backup of comments | Catbox.moe is a single point of failure | Mirror each comment JSON to a 2nd host (e.g., 0x0.st), store *both* URLs in the index |
| L11 | Detection schedule is naive (`*/5 * * * *`) | 8,640 runs/mo, most useless | Use `smart-schedule/predict_stream.py` (already in repo!) to scale to */1 around predicted live windows, hourly otherwise |
| L12 | No internationalisation / locales | All times PKT, all UI English | Centralise strings in a `messages.{en,ur,ar}.json`; use the browser locale |

---

## ✅ Concrete fixes applied in this review

See `dashboard/src/components/WatchPage.fixed.tsx`, `dashboard/src/utils/dataFetcher.fixed.ts`,
`dashboard/api/comments/[id].fixed.js`, `dashboard/api/yt/[id].fixed.js`,
`scripts/utils.fixed.sh.patch`, and `dashboard/src/components/Comments.fixed.tsx`
in this workspace. I've left the originals untouched so you can diff them; each
fixed file is a drop-in replacement.

The fixes cover bugs **#1, #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #20**.
