#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/cookieless-smoke-test.sh (2026-10-23)             ║
# ║                                                                              ║
# ║  The smoke test is the early-warning sentinel for "can we still record       ║
# ║  public streams with no cookies?" It had drifted from the recorder:         ║
# ║  it only exercised 5 of the 11 cascade methods (G, D, C, E, streamlink),    ║
# ║  hardcoded "/5" in the summary, ran Method K as a side note that could      ║
# ║  never fail the job, and never touched J (ffmpeg HLS) — a path that exists  ║
# ║  precisely because yt-dlp's downloader can fail where ffmpeg succeeds.      ║
# ║                                                                              ║
# ║  Locks:                                                                     ║
# ║   1. the tested matrix covers every COOKIELESS method in record-stream.sh    ║
# ║      (A+B need a cookie jar; they are not cookieless by definition)          ║
# ║   2. each method drives the same flags the recorder uses                     ║
# ║   3. a method only PASSes on real pixels (size + height), not on "downloaded"║
# ║   4. MIN_PASS decides the verdict, and the count is no longer hardcoded      ║
# ║  Run: bash tests/cookieless-smoke-test.sh                                   ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
SMOKE="$ROOT/scripts/cookieless-smoke-test.sh"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin"
export SMOKE_OUT="$TMP/out"
export BROWSER_ASSIST=off          # Method K is exercised separately below

# ── 1: matrix parity with the recorder ─────────────────────────────────────
echo "── 1: every cookieless recorder method is exercised ──"
# Cookieless = every record_method_* except A and B (cookie-jar methods).
RECORDER=$(grep -oE '^record_method_[a-z]' "$ROOT/scripts/record-stream.sh" | sed 's/record_method_//' \
    | grep -vE '^[ab]$' | tr 'a-z' 'A-Z' | sort | tr '\n' ' ')
SMOKE_LIST=$(bash "$SMOKE" --list | cut -f1 | tr 'a-z' 'A-Z' | sort | tr '\n' ' ')
if [[ "$RECORDER" == "$SMOKE_LIST" ]]; then
    ok "matrix matches record-stream.sh: $SMOKE_LIST"
else
    bad "matrix drifted from the recorder"
    echo "       recorder: $RECORDER"
    echo "       smoke:    $SMOKE_LIST"
fi
for m in A B; do
    if bash "$SMOKE" --list | cut -f1 | grep -qx "$m"; then
        bad "method $m (cookie-based) is listed as cookieless"
    fi
done
ok "A/B (cookie-jar methods) excluded"

# ── 2: per-method flags match the recorder ─────────────────────────────────
echo "── 2: each method drives the recorder's own flags ──"
expect_flag() {   # $1=method $2=needle $3=description
    local out
    out=$(BROWSER_ASSIST=off bash "$SMOKE" --video-id dQw4w9WgXcQ --dry-run --only "$1" 2>&1)
    if grep -qF -- "$2" <<< "$out"; then ok "$1: $3"; else bad "$1: expected '$2' — $3"; fi
}
expect_flag D 'youtube:player_client=android_vr' 'android_vr player client'
expect_flag C 'youtube:player_client=mediaconnect' 'mediaconnect player client'
expect_flag E 'youtube:player_client=mweb' 'mweb player client'
expect_flag E 'Android 14; Pixel 8' 'mobile user-agent'
expect_flag J 'ffmpeg' 'ffmpeg pulls the slice'
expect_flag J 'yt-dlp --no-download --no-playlist --no-warnings --quiet -f best -g' 'manifest resolved by yt-dlp -g'
expect_flag I '--hls-segment-threads 4' 'hardened streamlink flags'
expect_flag I '--retry-max 10' 'streamlink retry flags'
expect_flag K 'browser_session.py' 'real-browser session (Method K)'
expect_flag K '--mode cdp' 'Pure CDP mode'
OUTG=$(BROWSER_ASSIST=off bash "$SMOKE" --video-id dQw4w9WgXcQ --dry-run --only G 2>&1)
grep -q 'player_client' <<< "$OUTG" && bad "G must stay the plain auto-select client" || ok "G: no player_client override"

# ── stubs: a working toolchain ─────────────────────────────────────────────
make_stubs() {   # $1 = body size yt-dlp writes
    local size="$1"
    cat > "$TMP/bin/yt-dlp" <<STUB
#!/usr/bin/env bash
# stub: -g prints a manifest URL, otherwise writes a media file
for a in "\$@"; do [[ "\$a" == "-g" ]] && { echo "https://example.test/manifest.m3u8"; exit 0; }; done
out=""; prev=""
for a in "\$@"; do [[ "\$prev" == "-o" ]] && out="\$a"; prev="\$a"; done
[[ -z "\$out" ]] && exit 0
out="\${out//%(ext)s/mp4}"
head -c $size /dev/urandom > "\$out"
STUB
    cat > "$TMP/bin/ffprobe" <<'STUB'
#!/usr/bin/env bash
echo 1080
STUB
    cat > "$TMP/bin/ffmpeg" <<STUB
#!/usr/bin/env bash
# stub: last argument is the output file
for a in "\$@"; do out="\$a"; done
head -c $size /dev/urandom > "\$out"
STUB
    cat > "$TMP/bin/streamlink" <<'STUB'
#!/usr/bin/env bash
echo '{"url":"https://example.test/hls.m3u8","streams":{"best":{"url":"https://example.test/hls.m3u8"}}}'
STUB
    cat > "$TMP/bin/curl" <<'STUB'
#!/usr/bin/env bash
# stub: range probe returns 2 KB of bytes to the -o target
out=""; prev=""
for a in "$@"; do [[ "$prev" == "-o" ]] && out="$a"; prev="$a"; done
[[ -n "$out" ]] && head -c 2048 /dev/urandom > "$out"
exit 0
STUB
    chmod +x "$TMP"/bin/*
}

run_smoke() {   # $1 = min pass; extra env already set by caller
    SMOKE_OUT="$TMP/out" BROWSER_ASSIST=off PATH="$TMP/bin:$PATH" MIN_PASS="$1" \
        bash "$SMOKE" --video-id dQw4w9WgXcQ --json "$TMP/result.json" > "$TMP/run.log" 2>&1
}

echo "── 3: healthy toolchain passes (real bytes + height) ──"
rm -rf "$TMP/out"; make_stubs 200000
if run_smoke 4; then
    read -r P T <<< "$(python3 -c "import json;d=json.load(open('$TMP/result.json'));print(d['passed'], d['total'])" 2>/dev/null || echo '0 0')"
    [[ "$P" -ge 7 ]] && ok "$P/$T methods passed (D,C,G,E,J,I,F)" || bad "only $P/$T passed with healthy tools"
    grep -q "PASSED: $P / $T" "$TMP/run.log" && ok "summary reports the real counts (no hardcoded /5)" \
        || bad "summary counts are stale: $(grep -o 'PASSED:.*' "$TMP/run.log" | head -1)"
else
    bad "healthy toolchain was reported as at-risk"
    tail -12 "$TMP/run.log" | sed 's/^/       /'
fi

echo "── 4: 'downloaded but empty' is a FAIL, not a pass ──"
rm -rf "$TMP/out"; make_stubs 100     # below MIN_BYTES (100000)
if run_smoke 3; then
    bad "tiny/empty media counted as a pass"
else
    ok "undersized media rejected (guard on real pixels)"
    P=$(python3 -c "import json;print(json.load(open('$TMP/result.json'))['passed'])" 2>/dev/null || echo 0)
    [[ "$P" == "2" ]] && ok "only the two streamlink probes passed (5 yt-dlp/ffmpeg methods failed)" \
        || bad "unexpected pass count $P with tiny media"
    grep -q "RECORDER AT RISK" "$TMP/run.log" && ok "at-risk verdict emitted" || bad "no at-risk verdict"
fi

echo "── 5: a broken yt-dlp/streamlink is at-risk (0 methods) ──"
rm -rf "$TMP/out"
printf '#!/usr/bin/env bash\necho "ERROR: Sign in to confirm you are not a bot" >&2\nexit 1\n' > "$TMP/bin/yt-dlp"
printf '#!/usr/bin/env bash\nexit 1\n' > "$TMP/bin/streamlink"
printf '#!/usr/bin/env bash\nexit 1\n' > "$TMP/bin/ffmpeg"
chmod +x "$TMP"/bin/*
if run_smoke 2; then
    bad "at-risk condition exited 0"
else
    ok "exit 1 when fewer than MIN_PASS methods work"
    grep -q "RECORDER AT RISK: only 0/" "$TMP/run.log" && ok "0-pass count reported exactly" || true
fi

echo "── 6: MIN_PASS is honoured (1 failing method still fails if min=3) ──"
rm -rf "$TMP/out"; make_stubs 200000
# break only streamlink -> 5 yt-dlp methods + J stay green
printf '#!/usr/bin/env bash\nexit 1\n' > "$TMP/bin/streamlink"; chmod +x "$TMP/bin/streamlink"
if run_smoke 7; then
    bad "MIN_PASS=7 passed with only 5 working methods"
else
    ok "MIN_PASS=7 rejects 5 working methods"
fi
if run_smoke 2; then ok "the same run passes at MIN_PASS=2"; else bad "5 working methods failed MIN_PASS=2"; fi

echo "── 7: required CDP failure cannot be hidden by other passing methods ──"
rm -rf "$TMP/out"; make_stubs 200000
cat > "$TMP/bin/fake-browser-python" <<'STUB'
#!/usr/bin/env bash
[[ "${1:-}" == "-c" ]] && exit 0
exit 3
STUB
chmod +x "$TMP/bin/fake-browser-python"
if SMOKE_OUT="$TMP/out" BROWSER_ASSIST=first BROWSER_MODE=cdp BROWSER_PYTHON="$TMP/bin/fake-browser-python" \
    SMOKE_REQUIRE_K=true PATH="$TMP/bin:$PATH" MIN_PASS=1 \
    bash "$SMOKE" --video-id dQw4w9WgXcQ --json "$TMP/result.json" > "$TMP/run.log" 2>&1; then
    bad "required CDP failure was hidden by MIN_PASS/other methods"
else
    ok "required CDP failure fails the smoke job"
    if python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["browser_required"] is True and d["browser_passed"] is False and d["at_risk"] is True' "$TMP/result.json"; then
        ok "JSON reports required CDP did not pass"
    else
        bad "JSON missing required-CDP verdict"
    fi
fi

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES case(s) failed"; exit 1; fi
echo "RESULT: GREEN — smoke test covers the whole cookieless cascade and judges real media"
