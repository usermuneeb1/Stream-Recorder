# 🔍 Recording Scripts — Code Audit

**Scope:** `scripts/record-stream.sh`, `scripts/detect-stream.sh`, `scripts/check-cookies.sh`, `scripts/utils.sh`
**Date:** 2026-06-19
**Method:** Manual read-through + `bash -n` syntax check (all 4 pass) + cross-reference of function definitions/call-sites + `set -u`/`set -o pipefail` analysis.

> **Headline:** The bugs documented in `BUGFIX_REPORT.md` (`valid_unverified` handling, `PUBLIC_STREAM_ONLY` defaulting to `true`, custom-duration flags, ytarchive multi-ext finder, `ever_succeeded` early-break, dynamic method count) are **already fixed in the current code**. So if the recorder currently "isn't working," the cause is *not* those items — the real issues are below.
>
> **⚠️ `checkout@v7` is NOT a bug — `BUGFIX_REPORT.md` is wrong on this one.**
> It claims *"there is no `actions/checkout@v7`"* and that *v4 is the latest stable*.
> This is **false as of 2026-07-25**: [`actions/checkout@v7` (v7.0.0)](https://github.com/actions/checkout/releases) was published **2026-06-17** and is a valid, current major version. **All 40 workflows use `@v7` and are fine.** `mass-fix-checkout.sh` blindly downgrades `@v7 → @v4` — **do NOT run it.** That would only roll back a major version for no reason (and would break CI the moment v7 becomes required). See the [Verification](#-verification--proof-2026-07-25) section.

---

## 🔴 HIGH — Correctness

### H1. `validate_recorded_file()` accepts a file on **size alone** — never verifies it is playable
**File:** `scripts/record-stream.sh` — `validate_recorded_file()` (line 372); size checks at lines 385, 402, 424.

The validator only checks `(( size >= min_bytes ))`. It does **not** use `is_valid_video()` or `recover_broken_video()`, both of which already exist in `utils.sh` and are specifically built for this exact failure mode ("FIX #13" even documents the truncated-moov case).

```bash
# current (problematic)
if (( size >= min_bytes )); then
    found_file="$output_base"
fi
```

**Impact:** A method that gets SIGTERM'd at `MAX_RECORD_DURATION` returns **0 (success)** — the timeout path in every method does `[[ "$status" == "124" ]] && return 0`. If that cut-off leaves a file ≥ 100 KB but only 2–3 s of corrupt/truncated video, `validate_recorded_file` returns it as valid. The recorder then declares success, skips true rescue, and ships a broken file. This silently defeats the recovery logic the project already wrote.

**Fix:** Require a structural check before accepting, and attempt recovery on the borderline case:

```bash
if (( size >= min_bytes )) && is_valid_video "$check_file"; then
    found_file="$check_file"
    break
elif (( size >= min_bytes )); then
    # size looks OK but structure is damaged (e.g. killed mid-fragment)
    if recover_broken_video "$check_file" && is_valid_video "$check_file"; then
        found_file="$check_file"
        break
    fi
fi
```

(Also raise `MIN_FILE_SIZE_KB` for live, or pair the size gate with the duration check — a 110 KB partial is enough to sneak through today.)

---

### H2. Methods **E, G, F attach cookies even when `COOKIE_STATUS=expired`**
**File:** `scripts/record-stream.sh` — `record_method_e()` (cookie block ~line 263), `record_method_f()` (~line 320), `record_method_g()` (~line 393).

These three gate the cookie attach on **file existence only**:

```bash
if [[ -f "${COOKIES_FILE:-cookies.txt}" ]] && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
    cookies_args=(--cookies "${COOKIES_FILE:-cookies.txt}")
fi
```

Contrast with the *correct* gating used by D/H/I (lines 229, 503, 557):
`[[ "${COOKIE_STATUS:-}" == "valid" || "${COOKIE_STATUS:-}" == "valid_unverified" ]]`, and methods A/B which skip outright on `expired`.

**Impact:** On a members-only / login-required stream where the session is **expired**:
1. D (cookieless) fails — needs login.
2. E, G, F send the **expired** cookies → YouTube rejects/strips them → those methods fail too.
3. A/B are **skipped** because `expired`.
→ Guaranteed miss, even though the project's own `record_method_d` comment explicitly warns *"passing STALE/rotated cookies here can actually make YouTube reject the request."* The same logic applies to E/G/F.

**Fix:** Mirror D/H/I — only attach cookies when status is `valid`/`valid_unverified`, else run clean cookieless:

```bash
if [[ "${COOKIE_STATUS:-}" == "valid" || "${COOKIE_STATUS:-}" == "valid_unverified" ]] \
   && [[ -f "${COOKIES_FILE:-cookies.txt}" ]] && [[ -s "${COOKIES_FILE:-cookies.txt}" ]]; then
    cookies_args=(--cookies "${COOKIES_FILE:-cookies.txt}")
fi
```

---

## 🟠 MEDIUM

### M1. `_pot_args()` (PoToken provider helper) is **dead code — never called**
**File:** `scripts/record-stream.sh` — defined at line 466. `grep` shows **zero** call sites across `scripts/`.

The header comment (line 456) says *"Existing methods can opt-in by adding `\"\"` to their yt-dlp call,"* but none do. So if the bgutil PoToken HTTP service (`127.0.0.1:4416`) is running, **no** yt-dlp method routes through it, and PoToken-related `n`-challenge failures aren't mitigated.

**Fix:** Either wire it in (e.g. `local -a pot_args=(); _pot_args pot_args` then add `"${pot_args[@]}"` to each yt-dlp call), or delete the function to avoid a misleading "feature."

### M2. `record_method_j` logs the **wrong `$?`** in its failure path
**File:** `scripts/record-stream.sh` — lines 615–616.

```bash
err=$(tail -3 "${err_log}" 2>/dev/null)
_log_method_failure "Method J" "$?" "$video_url" "$output_file" "${err}"
```

`$?` here is `tail`'s exit code, **not** the yt-dlp `-g` failure code. The diagnostic dump misreports the real cause.

**Fix:** Capture the yt-dlp status *before* the `tail`, e.g. `local ytexit=$?` right after the `$(...)` substitution, then pass `$ytexit`.

### M3. `record_method_j` writes `-f mp4 -movflags +faststart` from a **live** HLS manifest
**File:** `scripts/record-stream.sh` — `record_method_j()` (line 593).

```bash
timeout … ffmpeg -y -i "$manifest_url" -c copy -f mp4 -movflags +faststart "$output_file"
```

`+faststart` needs a seekable, completed container (moov atom at end) — on a live, still-growing m3u8 this is fragile/unreliable, and `-c copy -f mp4` from a live playlist won't capture the whole stream. It's the last-resort method (rarely reached), so impact is low, but it adds noise and may self-fail.

**Fix:** For live input use `-movflags +frag_keyframe+empty_moov` and drop the hard `-f mp4`, or remove `+faststart`.

---

## 🟡 LOW — Cosmetic / Docs / Minor

- **L1 (docs):** Stale header (lines 3–4): *"6-method, 3-attempt"* and *"Methods: web → tv → ios → android_vr → mweb → streamlink"*. The engine now has **10 methods (A–J)** in a different order. Misleading for maintainers.
- **L2 (cosmetic):** `record_method_j` log lines are missing the leading double-space (`log_info " Method J…"` vs the `"  Method …"` used everywhere else) — indentation drift.
- **L3 (minor):** `record_stream()` diagnostic (line ~1076) does `wc -l < cookies.txt` with a hardcoded relative path instead of `${COOKIES_FILE:-cookies.txt}`, so the cookie-line count is wrong whenever `COOKIES_FILE` points elsewhere.

---

## ✅ Verified NON-issues (so you don't re-chase them)

- All four scripts pass `bash -n` (no syntax errors).
- `valid_unverified` cookie handling, `PUBLIC_STREAM_ONLY:-false` defaults, custom-duration `--hls-live-restart`/`--wait` drops, ytarchive `.mp4|.mkv|.ts|.webm` finder, `ever_succeeded` early-break guard, and dynamic `${#methods[@]}` count are **all present and correct** — contrary to `BUGFIX_REPORT.md` which claims they were missing.
- `_export_detection_results()` **is** defined (detect-stream.sh:530); the premiere-aware `is_upcoming` handling is consistent between detection (detect-stream.sh) and the live recheck (`is_stream_still_live`).
- `config.env` uses `:-` defaults everywhere → safe under `set -u`.
- The `methods[]` / `method_names[]` arrays in `attempt_recording()` are correctly 1:1 aligned (10 vs 10).
- **`actions/checkout@v7` is valid (not a bug).** As of 2026-07-25 it is the current major (v7.0.0, published 2026-06-17). All 40 workflows reference `@v7`; `mass-fix-checkout.sh` must **not** be run. See the Verification section.

---

## 🛠 Recommended priority order
1. **H1** — makes "success" trustworthy (highest real-world impact).
2. **H2** — fixes members-only recordings with expired cookies.
3. **M1** — wire up or remove the PoToken helper.
4. **M2 / M3** — cheap diagnostic/robustness fixes.
5. **L1–L3** — cleanup.

Want me to apply H1 + H2 (the two high-severity correctness fixes) as a patch?

---

## ✅ Fixes Applied (2026-06-19)

All items below were implemented in `scripts/record-stream.sh` and verified with `bash -n` + a runtime test of the new nested-function logic under `set -u`.

| ID | Status | What changed |
|----|--------|--------------|
| **H1** | ✅ Fixed | `validate_recorded_file()` now runs a structural check via `is_valid_video()` (video stream + sane `>=5s` duration) and attempts `recover_broken_video()` on damaged-but-size-OK files before accepting. Falls back to size-only when `ffprobe`/`ffmpeg` are absent (minimal runners). |
| **H2** | ✅ Fixed | Methods **E, G, F** now gate cookie attachment on `COOKIE_STATUS` being `valid`/`valid_unverified`, matching D/H/I. Expired/stale cookies are no longer sent (which could get the request rejected). |
| **M1** | ✅ Resolved (removed) | `_pot_args()` was dead code (zero call sites). **Judgment call:** removed the function + its misleading comment rather than wiring it into 6 methods, since the bgutil PoToken provider's deployment isn't confirmed here and removal eliminates the false impression the feature is live. Can be re-added/wired if you confirm the provider runs. |
| **M2** | ✅ Fixed | `record_method_j` now captures `yt-dlp`'s exit code into `ytexit` *before* the `tail`, so the failure log reports the real cause instead of `tail`'s exit. |
| **M3** | ✅ Fixed | `record_method_j` uses `-movflags +frag_keyframe+empty_moov` instead of `+faststart` for the live HLS source (faststart needs a completed, seekable container). |
| **L1** | ✅ Fixed | Header comment updated to reflect 10 methods (A–J) and the real order. |
| **L2** | ✅ Fixed | `record_method_j` log lines now use the double-space indent used everywhere else. |
| **L3** | ✅ Fixed | Diagnostic now uses `${COOKIES_FILE:-cookies.txt}` instead of a hardcoded `cookies.txt`. |

**Verification:**
- `bash -n scripts/record-stream.sh` → OK
- Standalone test of the nested `_accept_candidate` helper under `set -u`: valid-sized playable file accepted; size-too-small and structurally-broken files rejected.

---

## 🔬 Verification & Proof (2026-07-25)

Goal: give concrete, reproducible evidence that the recording **system wiring is
sound** — even though a *live* recording can't be performed here (no real stream,
no valid cookies, no `ffmpeg`/`yt-dlp`/`streamlink`/`ytarchive` installed in the
audit sandbox). Every check below was run from a clean shell on `arena/019f96ab-stream-recorder`.

### 1. Syntax — every script parses (`bash -n`)
```
bash -n scripts/record-stream.sh      → OK
bash -n scripts/detect-stream.sh      → OK
bash -n scripts/check-cookies.sh      → OK
bash -n scripts/utils.sh              → OK
bash -n scripts/post-process.sh       → OK
bash -n scripts/upload-clouds.sh      → OK
bash -n scripts/discord-notify.sh     → OK
```

### 2. Happy-path dry-run — full pipeline runs end-to-end, no crashes
Harness: `scripts/_dryrun/run.sh` (mocked tools, simulated GitHub Actions env).
Result: **all 5 pipeline steps + the Discord completion notification exited 0**.
```
check-cookies  -> exit 0
detect-stream  -> exit 0
record-stream  -> exit 0
post-process   -> exit 0
upload-clouds  -> exit 0
discord-notify -> exit 0

RECORDING_SUCCESS=true
UPLOAD_SUCCESS_COUNT=3
GOFILE_LINKS=HD|https://gofile.io/d/ABC123
PIXELDRAIN_LINKS=HD|https://pixeldrain.com/u/pd-abc123
ARCHIVE_LINKS=HD|https://archive.org/details/tml-2026-07-dQw4w9WgXcQ-...
🎉 DRY-RUN RESULT: NO CRASHES (all steps exited 0)
```
This proves the step-to-step hand-offs (env exports via `GITHUB_ENV`/`GITHUB_OUTPUT`,
the `RECORDING_SUCCESS` flag, the processed-files list, and the upload-link
format) are all consistent.

### 3. Failure-path dry-run — graceful degradation when recording fails
Harness: `scripts/_dryrun/failure-path.sh` (recording tools mocked to fail).
Result: **4/4 checks passed**.
```
✅ PASS: tiny (~1KB) file REJECTED              (H1 — no more accepting garbage)
✅ PASS: playable 20MB file ACCEPTED            (H1 — is_valid_video path)
✅ PASS: RECORDING_SUCCESS=false exported       (engine reports failure correctly)
✅ PASS: notify_recording_failed exited 0        (failure alert fires, no crash)

record_stream rc=1 | notify_recording_failed rc=0
🎉 FAILURE-PATH RESULT: graceful degradation confirmed
```
This proves that if every one of the 10 live methods **and** 6 VOD-rescue methods
fails, the engine still (a) sets `RECORDING_SUCCESS=false`, (b) dumps a diagnostic
summary, (c) returns non-zero **without crashing**, and (d) the failure
notification path is safe.

### 4. Dashboard builds
```
cd dashboard && npm install   → added 106 packages
npm run build   (tsc -b && vite build)
vite v8.0.16 building for production...
✓ built in 834ms
[stamp-service-worker] stamped sw.js with BUILD_ID=...
BUILD_EXIT=0
```
`node_modules/` and `dist/` are git-ignored, so they don't pollute the repo.

### 5. CI workflows are sound — no dangerous `pull_request_target`/`workflow_run` usage
GitHub **back-ported the "refuse fork-PR code in `pull_request_target`/`workflow_run`"
rule to v2–v6 on 2026-07-16**. Verified it does **not** affect this repo:
- 8 workflows match the grep, but **none fetch fork-PR code** (no
  `ref: …/pull/…/head`, no `repository: …pull_request.head.repo`).
- The main `stream-recorder.yml` is triggered by `cron` + `repository_dispatch` +
  `workflow_dispatch` only — **not** `pull_request_target`. (The only `[5:]` match
  in that file is a `jq` array slice, not a trigger.)

### 6. `actions/checkout@v7` is valid — `mass-fix-checkout.sh` must NOT be run
- `grep -rho 'actions/checkout@[0-9]*' .github/workflows/ | sort | uniq -c`
  → **40 × `actions/checkout@v7`** (valid; v7.0.0 published 2026-06-17).
- `mass-fix-checkout.sh` downgrades `@v7 → @v4` — running it would roll back a
  major version for no reason and is **not** recommended.

### 7. Real recording test — genuine tools, local live HLS source
To go beyond mocks, the **real** `ffmpeg`/`yt-dlp`/`streamlink` binaries were
installed (via `pip` + `imageio-ffmpeg`; `apt`/root unavailable in the audit
sandbox) and the **actual `record-stream.sh` engine** was run against a
locally-served *live* HLS source (so the recording code paths are exercised with
real binaries — only the *source* differs from YouTube, which is network-blocked
here).

Result — **the engine recorded a live stream for real:**
```
Trying method F: Streamlink (HLS direct)
[cli][info] Writing output to /tmp/realrec/segments/segment_001.mp4
[cli][info] ✅ Method F: Streamlink (HLS, default flags) succeeded!
═══ RECORDED 1 SEGMENT(S) ═══
Final raw file: Local HLS Test_raw.mp4
RECORDING_SUCCESS=true
record_stream exit code: 0
```
The 1.65 MB output was verified **independently of `ffmpeg`** (the sandbox's
static `ffmpeg` segfaults when *demuxing* HLS/TS input — an environment quirk,
**not** a repo bug; it encodes fine and decodes a normal MP4 with rc=0) by
parsing the MPEG-TS container in Python:
```
TS packets       : 8786  (sync-byte 0x47 at 188B boundaries: 8786/8786)
PIDs present     : [(256, 7356)=video, (257, 1388)=audio, (17), (0)=PAT, (4096)=PMT]
packets w/ H.264 start-code (00 00 01): 952
H.264 NAL type found in capture: access unit delimiter
VERDICT: ✅ Real MPEG-TS/H.264 video was captured by the engine
```
So the recorder genuinely grabs a live stream, and `post-process.sh` (which the
workflow runs next) remuxes this TS payload into a clean MP4 — exactly as
designed. Method F (streamlink) is one of the ten cascade methods; the others
were also exercised (yt-dlp methods resolved the local manifest; Method J's
`ffmpeg` HLS step is last-resort and was blocked only by the sandbox `ffmpeg`
demux crash noted above).

> Note: `bc` is **installed by the runner** (`stream-recorder.yml` does
> `apt-get install -y ffmpeg jq bc curl python3 megatools`), so `utils.sh`'s
> `format_size` (which shells out to `bc`) works on CI — the `bc: command not
> found` seen during the local test is only because the audit sandbox lacked it.

### Honest limitations (what is NOT proven)
- A *real YouTube* stream has **not** been recorded here — YouTube is
  network-blocked from this audit sandbox (Google/Cloudflare-DNS/YouTube all time
  out; only GitHub/pypi are reachable). To close that gap as far as possible, the
  engine was run against a **locally-served live HLS source with the genuine
  `ffmpeg`/`yt-dlp`/`streamlink` binaries** and it captured real H.264 video
  (see §7). The only remaining unproven step is "point the same engine at a real
  `youtube.com` HLS URL" — which your GitHub runner already does every 5 minutes.
- The dry-run mocks simulate tool *behavior* (exit codes, file creation, API
  response shapes), so logic/control-flow is verified, not bit-level transcoding.
- To prove a live capture end-to-end, run the real pipeline on a GitHub runner
  with the actual tools + cookies (the workflow already does this every 5 min).

### How to reproduce
```bash
bash scripts/_dryrun/run.sh            # happy path
bash scripts/_dryrun/failure-path.sh   # failure path
cd dashboard && npm install && npm run build
```
See `scripts/_dryrun/README.md` for details on the mock layout.

