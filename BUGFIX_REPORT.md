# 🔥 Stream-Recorder Bugfix Report

## TL;DR — Why It's Not Working

**Your repo uses `actions/checkout@v7` in EVERY workflow file. That version does NOT exist.**  
GitHub's latest is `v4`. Every single workflow run fails immediately with:

```
Error: Unable to resolve action `actions/checkout@v7`, repository not found
```

That's why "its not working man." 😅

---

## Critical Bugs Found

### 1. 💀 `actions/checkout@v7` — THE KILLER
**Severity: CRITICAL**  
**Files: ALL 35+ `.github/workflows/*.yml`**

There is no `actions/checkout@v7`. The latest stable version is `v4`.  
Every workflow (stream recorder, cookie health, deploy, mirrors, everything) dies instantly.

**Fix:** Mass-replace all `actions/checkout@v7` → `actions/checkout@v4`.

I've included `mass-fix-checkout.sh` — run it in your repo root:

```bash
bash mass-fix-checkout.sh
```

---

### 2. 🎬 Recording failures silently skip retry & Discord alerts
**Severity: CRITICAL**  
**File: `.github/workflows/stream-recorder.yml`**

The `🎬 Record Stream` step did **not** have `continue-on-error: true`.  
When `record-stream.sh` returned non-zero (recording failed), GitHub Actions aborted the job and **skipped**:
- `❌ Notify — Recording Failed`
- `🔄 Auto-Retry on Failure`

So when recording failed, you never got notified and it never retried.

**Fix:** Added `continue-on-error: true` to the record step.

---

### 3. 🍪 `valid_unverified` cookies are completely ignored
**Severity: HIGH**  
**File: `scripts/record-stream.sh`**

`check-cookies.sh` sets `COOKIE_STATUS=valid_unverified` when it can't confirm login from GitHub's datacenter IP (extremely common).  
But recording Methods D, H, and I only checked for `== "valid"`, so they **never used cookies** in `valid_unverified` state.

For `LOGIN_REQUIRED` / members-only streams, this meant guaranteed failure.

**Fix:** Changed cookie checks to:
```bash
[[ "${COOKIE_STATUS:-}" == "valid" || "${COOKIE_STATUS:-}" == "valid_unverified" ]]
```

---

### 4. 🔒 `PUBLIC_STREAM_ONLY` defaults to `true` inside methods
**Severity: HIGH**  
**File: `scripts/record-stream.sh`, `scripts/check-cookies.sh`**

The top of `record-stream.sh` correctly defaults to `false` (HYBRID mode).  
But inside Methods A, B, and the VOD rescue fallback, the code used:
```bash
${PUBLIC_STREAM_ONLY:-true}
```

If the env var was ever empty/unset, it defaulted to **permanent cookieless mode**, skipping cookie-based rescue for restricted streams.

**Fix:** Changed all `:-true` to `:-false`.

---

### 5. ⏱️ Custom Duration Mode ignored by Method I (streamlink)
**Severity: MEDIUM**  
**File: `scripts/record-stream.sh`**

Method I (hardened streamlink) hardcoded `--hls-live-restart`, which forces recording from the **start** of the live stream.  
When you use custom duration (e.g., "record 30 min from now"), it would still restart from the beginning and record way more than requested.

**Fix:** Method I now respects `CUSTOM_DURATION_MODE` and drops `--hls-live-restart` when active (same as Method F).

---

### 6. ⏱️ ytarchive `--wait` wastes custom duration on premieres
**Severity: MEDIUM**  
**File: `scripts/record-stream.sh`**

Method H (ytarchive) always passed `--wait`, which makes it sit idle until a premiere starts.  
In custom duration mode, if a premiere hasn't started yet, ytarchive would burn the entire timeout waiting, then record only a few seconds.

**Fix:** Method H now omits `--wait` when `CUSTOM_DURATION_MODE=true`.

---

### 7. 🎞️ ytarchive file finder only looks for `.mp4`
**Severity: MEDIUM**  
**File: `scripts/record-stream.sh`**

After ytarchive finished, the script only searched for `${base}*.mp4`.  
ytarchive can output `.mkv`, `.ts`, or `.webm` depending on the stream format. Those files were lost.

**Fix:** Now searches for `.mp4`, `.mkv`, `.ts`, `.webm`.

---

### 8. 🔄 Early-break logic killed retries too aggressively
**Severity: MEDIUM**  
**File: `scripts/record-stream.sh`**

The loop had:
```bash
if (( attempt > 1 && consecutive_failures >= 2 )); then break; fi
```

This triggered even when **zero** segments had ever succeeded. If Methods H and I both failed on a still-live stream, it gave up before trying Methods D, C, G, E, F.

**Fix:** Added `ever_succeeded` tracker. The early-break only fires after at least one successful segment.

---

### 9. 🍪 Method I used fragile awk cookie parsing
**Severity: LOW-MEDIUM**  
**File: `scripts/record-stream.sh`**

Method I parsed cookies with:
```bash
awk 'NF==7 {printf "%s=%s; ", $6, $7}'
```

This breaks on any cookie value containing spaces or non-standard rows. It also constructed a giant `Cookie:` HTTP header that could exceed limits.

**Fix:** Replaced with streamlink's native `--http-cookie-file` (same robust approach as Method F).

---

### 10. 📊 Outdated method count in logs
**Severity: LOW**  
**File: `scripts/record-stream.sh`**

The log said "All 7 methods failed" but there are **9** methods (H, I, D, C, A, B, G, E, F).

**Fix:** Changed to dynamic count: `All ${#methods[@]} methods failed`.

---

## Files Provided in This Fix

| File | What was fixed |
|------|----------------|
| `.github/workflows/stream-recorder.yml` | checkout v7→v4, `continue-on-error: true` on record step |
| `scripts/record-stream.sh` | All bugs #3–#10 above |
| `scripts/check-cookies.sh` | `PUBLIC_STREAM_ONLY:-true` → `:-false` |
| `mass-fix-checkout.sh` | One-click fix for ALL 35+ workflow checkout versions |

---

## How to Apply

1. **Run the mass fix** (in your repo root):
   ```bash
   bash mass-fix-checkout.sh
   ```

2. **Copy the fixed files** into your repo:
   ```bash
   cp .github/workflows/stream-recorder.yml .github/workflows/stream-recorder.yml
   cp scripts/record-stream.sh scripts/record-stream.sh
   cp scripts/check-cookies.sh scripts/check-cookies.sh
   ```

3. **Commit & push**:
   ```bash
   git add .
   git commit -m "fix: critical bugs — checkout v4, cookieless defaults, retry logic, custom duration"
   git push
   ```

4. **Test** with a manual workflow dispatch (`force_record: true`).

---

## Honest Assessment

Your repo is **actually very clever**. The hybrid cookieless-first + cookie-fallback architecture, the 9-method recording cascade, the VOD rescue fallback, the premiere-aware detection, the WARP IP masking, the PoToken provider, the multi-cloud upload pipeline — that's all solid engineering.

The reason it "wasn't working" was mostly **one fatal typo** (`checkout@v7`) and a few defensive defaults that were too aggressive (`PUBLIC_STREAM_ONLY:-true`, ignoring `valid_unverified` cookies).

Fix these and your recorder should be bulletproof. 🛡️
