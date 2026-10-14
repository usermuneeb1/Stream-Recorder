#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  Regression test: scripts/upload-clouds.sh upload_to_st0807                  ║
# ║  Contract = https://0807.st/api (owner-pasted 2026-10-14).                   ║
# ║                                                                              ║
# ║  Production evidence: of 18 recordings only the two smallest files (8 MB,   ║
# ║  92 MB) ever reached 0807.st; all 16 files ≥ 255 MB failed on every          ║
# ║  recorder and repair run since 2026-09-02, with no visible reason. The       ║
# ║  anonymous POST cap is 2 GB, so size is not it; the PoW has a ttl and a      ║
# ║  multipart POST is only validated after the whole file streamed in. The      ║
# ║  doc's answer: chunked uploads "work anonymously too (attach the             ║
# ║  proof-of-work fields to /upload/init)". This locks:                         ║
# ║    1. anonymous file above the small-file limit → chunked, PoW on init,      ║
# ║       every chunk verified, finish body parsed;                              ║
# ║    2. small anonymous POST sends pow_* BEFORE the file part;                  ║
# ║    3. a failed chunk is retried (and a 429 pauses) instead of leaving a      ║
# ║       hole that /upload/finish would seal into a corrupt file;               ║
# ║    4. every failure is reported with HTTP code + body in log AND summary;    ║
# ║    5. honest User-Agent on every call; ST0807_TOKEN → Bearer + simple POST.  ║
# ╚══════════════════════════════════════════════════════════════════════════════╝
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
FAILURES=0
ok()  { echo "  ✅ $1"; }
bad() { echo "  ❌ $1"; FAILURES=$((FAILURES+1)); }

WORKDIR="$(mktemp -d)"; trap 'rm -rf "$WORKDIR"' EXIT
STUBBIN="$WORKDIR/bin"; mkdir -p "$STUBBIN" "$WORKDIR/chunks"
MODE="$WORKDIR/mode"; CALLS="$WORKDIR/calls.log"; FLAGS="$WORKDIR/flags"
# 2.5 "chunks" of 64 KB (ST0807_CHUNK_SIZE=65536 below) → 3 chunk requests
head -c $((64*1024*2 + 32*1024)) /dev/urandom > "$WORKDIR/big.mp4"
head -c $((8*1024)) /dev/urandom > "$WORKDIR/small.mp4"

# curl double: logs URL | UA | auth | ordered -F field names | -d body; answers per $MODE.
cat > "$STUBBIN/curl" <<STUB
#!/usr/bin/env bash
url=""; ua=""; auth=""; wfmt=""; data=""; fields=""; bin=""
while (( \$# )); do
  case "\$1" in
    -A) ua="\$2"; shift 2;;
    -H) [[ "\$2" == Authorization:* ]] && auth="\$2"; shift 2;;
    -w) wfmt="\$2"; shift 2;;
    -F) fields+="\${2%%=*},"; shift 2;;
    -d) data="\$2"; shift 2;;
    --data-binary) bin="\${2#@}"; shift 2;;
    --max-time|-o|-X|--range) shift 2;;
    http*) url="\$1"; shift;;
    *) shift;;
  esac
done
echo "\$url | ua=\$ua | auth=\${auth:0:22} | fields=\$fields | data=\$data" >> "$CALLS"
mode=\$(cat "$MODE")
reply() { printf '%s' "\$2"; [[ -n "\$wfmt" ]] && printf '\n%s' "\$1"; exit 0; }
case "\$url" in
  https://0807.st/upload)
    case "\$mode" in
      ok)        reply 200 '{"url":"https://0807.st/SimpleOk.mp4","deletion_url":"https://0807.st/d/secret"}';;
      forbidden) reply 403 '<html><title>403 Forbidden</title></html>';;
      empty)     reply 000 '';;
      *)         reply 500 '{"error":"simple POST not expected in this case"}';;
    esac;;
  https://0807.st/upload/init)
    grep -q pow_nonce <<<"\$data" && touch "$FLAGS.init_had_pow"
    grep -q '"size":' <<<"\$data" && touch "$FLAGS.init_had_size"
    reply 200 '{"uploadId":"u123"}';;
  https://0807.st/upload/chunk*)
    off="\${url##*offset=}"
    cp "\$bin" "$WORKDIR/chunks/\$off.\$(date +%s%N)"
    if [[ "\$mode" == "flaky" && "\$off" == "65536" && ! -f "$FLAGS.flaked" ]]; then touch "$FLAGS.flaked"; reply 502 '{"error":"bad gateway"}'; fi
    if [[ "\$mode" == "ratelimit" && ! -f "$FLAGS.limited" ]]; then touch "$FLAGS.limited"; reply 429 '{"error":"rate_limited","retryAt":1}'; fi
    if [[ "\$mode" == "chunkdead" ]]; then reply 500 '{"error":"storage"}'; fi
    reply 200 '{"ok":true}';;
  https://0807.st/upload/finish)
    reply 200 '{"url":"https://0807.st/ChunkedOk.mp4","deletion_url":"https://0807.st/d/secret2","size":163840}';;
  *) reply 200 '';;
esac
STUB
chmod +x "$STUBBIN/curl"

run_upload() {  # $1 mode, $2 file, rest = extra env
  echo "$1" > "$MODE"; : > "$CALLS"; : > "$WORKDIR/summary.md"; rm -f "$FLAGS".* "$WORKDIR"/chunks/*; local f="$2"; shift 2
  (cd "$WORKDIR" && env PATH="$STUBBIN:$PATH" GITHUB_STEP_SUMMARY="$WORKDIR/summary.md" \
       ST0807_RETRY_SLEEP=0 ST0807_RATE_LIMIT_SLEEP=0 ST0807_CHUNK_SIZE=65536 ST0807_ANON_SIMPLE_LIMIT=16384 "$@" bash -c '
     source "$1/scripts/upload-clouds.sh" >/dev/null 2>&1
     _st0807_pow_json() { echo "{\"pow_id\":\"p\",\"pow_ts\":\"1\",\"pow_bits\":\"1\",\"pow_sig\":\"s\",\"pow_nonce\":\"7\"}"; }
     ST0807_LINKS=()
     upload_to_st0807 "'"$WORKDIR/$f"'" HD; rc=$?
     echo "RC=$rc LINKS=${ST0807_LINKS[*]:-}"' _ "$ROOT" 2>&1)
}
chunks_match_file() {  # every chunk request body concatenated in offset order == the file
  local out="$WORKDIR/reassembled"; : > "$out"
  for off in $(ls "$WORKDIR/chunks" | cut -d. -f1 | sort -n | uniq); do
    ls "$WORKDIR/chunks/$off".* | sort | tail -1 | xargs cat >> "$out"   # last attempt per offset
  done
  cmp -s "$out" "$WORKDIR/big.mp4"
}

echo "── 1: anonymous 160 KB file → chunked flow, PoW on /upload/init, bytes intact ──"
OUT=$(run_upload ok big.mp4)
grep -q 'RC=0 LINKS=HD|https://0807.st/ChunkedOk.mp4' <<<"$OUT" && ok "link from /upload/finish" || bad "unexpected: $(grep RC= <<<"$OUT")"
grep -q 'https://0807.st/upload |' "$CALLS" && bad "simple POST attempted for a large anonymous file (PoW ttl race)" || ok "no simple POST for a large anonymous file"
[[ -f "$FLAGS.init_had_pow" ]] && ok "proof-of-work attached to /upload/init" || bad "/upload/init carried no proof-of-work"
[[ -f "$FLAGS.init_had_size" ]] && ok "init declares the size" || bad "init without size"
n=$(grep -c 'upload/chunk' "$CALLS"); [[ "$n" -eq 3 ]] && ok "3 chunks for 2.5×chunk-size" || bad "$n chunk requests (expected 3)"
chunks_match_file && ok "reassembled chunks are byte-identical to the file" || bad "chunk bytes do not match the file (dd slicing wrong)"
grep -q 'deletion_url (keep private)' <<<"$OUT" && ok "deletion_url logged (private run log only)" || bad "deletion_url not logged"
grep -q 'ua=Mozilla/5.0' "$CALLS" && ! grep -q 'ua= |' "$CALLS" && ok "User-Agent on every call" || bad "a call went out without the User-Agent"

echo "── 2: small anonymous file (8 KB) → simple POST with pow_* BEFORE the file part ──"
OUT=$(run_upload ok small.mp4)
grep -q 'RC=0 LINKS=HD|https://0807.st/SimpleOk.mp4' <<<"$OUT" && ok "simple POST accepted" || bad "simple path broken: $(grep RC= <<<"$OUT")"
line=$(grep 'https://0807.st/upload |' "$CALLS" | head -1)
fields=$(sed -E 's/.*fields=([^|]*)\|.*/\1/' <<<"$line")
[[ "$fields" == *pow_nonce,*file,* ]] && [[ "$fields" != *file,*pow_id* ]] && ok "field order: $fields" || bad "file part not after the proof: $fields"

echo "── 3: one chunk fails once (502) → retried, upload completes ──"
OUT=$(run_upload flaky big.mp4)
grep -q 'RC=0' <<<"$OUT" && ok "upload completed despite a failed chunk" || bad "gave up: $(grep RC= <<<"$OUT")"
n=$(grep -c 'upload/chunk?id=u123&offset=65536' "$CALLS"); [[ "$n" -eq 2 ]] && ok "failed chunk sent twice" || bad "offset 65536 sent $n times"
grep -q 'chunk 2/3 (offset 65536) failed — HTTP 502' <<<"$OUT" && ok "chunk failure logged with HTTP code" || bad "chunk failure not logged"

echo "── 4: 429 on a chunk → pause logged, retried, completes ──"
OUT=$(run_upload ratelimit big.mp4)
grep -q 'RC=0' <<<"$OUT" && ok "completed after rate limit" || bad "gave up on 429: $(grep RC= <<<"$OUT")"
grep -q 'rate limited (429), pausing' <<<"$OUT" && ok "rate-limit pause announced" || bad "429 not recognised"

echo "── 5: a chunk fails 3× → upload aborted (no finish → no corrupt file), reason visible ──"
OUT=$(run_upload chunkdead big.mp4 ST0807_MAX_RETRIES=1)
grep -q 'RC=1 LINKS=$' <<<"$OUT" && ok "rc=1, no link" || bad "unexpected: $(grep RC= <<<"$OUT")"
grep -q 'upload/finish' "$CALLS" && bad "/upload/finish called after a missing chunk (would seal a corrupt file)" || ok "finish never called with a hole in the data"
grep -q 'HTTP 500' "$WORKDIR/summary.md" && grep -q 'chunk_failed' "$WORKDIR/summary.md" && ok "summary names the failed stage with its HTTP code" || bad "summary: $(cat "$WORKDIR/summary.md")"

echo "── 6: hard failure on the small path (403 HTML) → 3 attempts, reason in summary ──"
OUT=$(run_upload forbidden small.mp4 ST0807_MAX_RETRIES=3)
grep -q 'RC=1 LINKS=$' <<<"$OUT" && ok "rc=1, no link" || bad "unexpected: $(grep RC= <<<"$OUT")"
n=$(grep -c 'https://0807.st/upload |' "$CALLS"); [[ "$n" -eq 3 ]] && ok "3 attempts" || bad "$n attempts"
grep -q 'HTTP 403' "$WORKDIR/summary.md" && ok "step summary shows HTTP 403" || bad "summary missing: $(cat "$WORKDIR/summary.md")"
OUT=$(run_upload empty small.mp4 ST0807_MAX_RETRIES=1)
grep -q 'HTTP 000' <<<"$OUT" && grep -q '<empty>' <<<"$OUT" && ok "empty response reported explicitly" || bad "empty failure still invisible"

echo "── 7: ST0807_TOKEN → Bearer header, simple POST even for the large file, no PoW ──"
OUT=$(run_upload ok big.mp4 ST0807_TOKEN=tok-not-real)
grep -q 'RC=0 LINKS=HD|https://0807.st/SimpleOk.mp4' <<<"$OUT" && ok "partner path: simple POST" || bad "partner path: $(grep RC= <<<"$OUT")"
grep -q 'auth=Authorization: Bearer' "$CALLS" && ok "Bearer token sent" || bad "token not sent"
grep -q 'fields=.*pow_' "$CALLS" && bad "PoW fields sent with a token" || ok "no PoW with a token"

echo ""
if (( FAILURES > 0 )); then echo "RESULT: RED — $FAILURES assertion(s) failed"; exit 1; fi
echo "RESULT: GREEN — 0807.st uploads follow the published API: chunked + PoW-on-init for anonymous files"; exit 0
