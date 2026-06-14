#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  🧠 AI ENRICHMENT — Transcripts, Summaries, Chapters, Tags (free via Groq)   ║
# ║                                                                              ║
# ║  For each recording missing AI data:                                         ║
# ║    1. Download the audio from the permanent Archive.org copy                  ║
# ║    2. Transcribe with Groq Whisper Large v3 (2,000 free/day)                  ║
# ║    3. Generate summary + chapters + tags with a free Groq LLM                 ║
# ║    4. Upload transcript.json (+ .srt) to the Archive item                     ║
# ║    5. Write summary/chapters/tags/transcript_url into data/recordings.json    ║
# ║                                                                              ║
# ║  Safe by design: if GROQ_API_KEY is unset, it exits cleanly (no-op).         ║
# ║  Idempotent: skips recordings that already have ai_summary.                   ║
# ║                                                                              ║
# ║  Env:  GROQ_API_KEY (required)                                               ║
# ║        ARCHIVE_ACCESS_KEY, ARCHIVE_SECRET_KEY (to upload transcript)          ║
# ║        AI_MAX_ITEMS (default 2 per run, to respect rate limits)              ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import json
import os
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RECORDINGS = os.path.join(ROOT, "data", "recordings.json")

GROQ_KEY = os.environ.get("GROQ_API_KEY", "").strip()
ARCHIVE_ACCESS = os.environ.get("ARCHIVE_ACCESS_KEY", "").strip()
ARCHIVE_SECRET = os.environ.get("ARCHIVE_SECRET_KEY", "").strip()
MAX_ITEMS = int(os.environ.get("AI_MAX_ITEMS", "2"))
# AI_FORCE=true re-enriches recordings that already have ai_summary (e.g. to
# regenerate chapters with an improved prompt).
FORCE = os.environ.get("AI_FORCE", "false").lower() == "true"

# Bump this whenever the chapter PROMPT/logic changes, so a forced re-run knows
# which recordings still need regenerating with the new logic.
#  v2 = audio LLM guests join/leave (or Q&A if no guests)
#  v3 = OCR on-screen-name guest detection (primary) + audio Q&A fallback; NO summary
#  v4 = refined OCR: rejects shirt logos / donations / chat, 1.5x upscale, 30s step
#  v5 = fuzzy logo reject (Columbu), strip stray prefix (I Kainat), drop code-junk
CHAPTER_LOGIC_VERSION = 5

GROQ_BASE = "https://api.groq.com/openai/v1"
WHISPER_MODEL = "whisper-large-v3-turbo"
LLM_MODEL = "llama-3.3-70b-versatile"

# Chunk size for Whisper (Groq accepts up to 25MB/file). We slice audio into
# ~10-minute mono 16kHz chunks to stay well under the limit on long streams.
CHUNK_SECONDS = 600


def log(msg):
    print(msg, flush=True)


def groq_post(path, *, data=None, files=None, headers=None):
    import requests  # lazy import
    h = {"Authorization": f"Bearer {GROQ_KEY}"}
    if headers:
        h.update(headers)
    url = f"{GROQ_BASE}{path}"
    for attempt in range(4):
        try:
            r = requests.post(url, headers=h, data=data, files=files, timeout=300)
            if r.status_code == 429:
                wait = int(r.headers.get("retry-after", 20))
                log(f"   rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as e:
            log(f"   groq attempt {attempt+1} failed: {e}")
            time.sleep(5)
    return None


def archive_audio_url(rec):
    """Best direct media URL for the recording (audio extracted from video)."""
    return rec.get("archive_node") or rec.get("archive_direct") or ""


def video_url(rec):
    """Best direct VIDEO URL for OCR frame sampling. Prefer the fast GitHub
    Release mirror (Azure CDN), then Archive node/direct."""
    return (rec.get("github_direct") or rec.get("github_release")
            or rec.get("archive_node") or rec.get("archive_direct") or "")


def detect_guests_ocr(url):
    """Run the OCR on-screen-name guest detector. Returns chapter list or []."""
    try:
        import importlib.util
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "detect-guests.py")
        spec = importlib.util.spec_from_file_location("detect_guests", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod.detect(url)
    except Exception as e:
        log(f"   ⚠️ OCR guest detection failed: {e}")
        return []


def extract_audio(src_url, out_wav):
    """Stream the video from Archive and extract 16kHz mono wav with ffmpeg."""
    cmd = [
        "ffmpeg", "-y", "-i", src_url,
        "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
        out_wav,
    ]
    p = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3600)
    return p.returncode == 0 and os.path.exists(out_wav) and os.path.getsize(out_wav) > 1000


def split_audio(wav, outdir):
    """Split into CHUNK_SECONDS pieces; return ordered list of chunk paths."""
    pattern = os.path.join(outdir, "chunk_%04d.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-i", wav, "-f", "segment", "-segment_time", str(CHUNK_SECONDS),
         "-c", "copy", pattern],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=600,
    )
    return sorted(p for p in (os.path.join(outdir, f) for f in os.listdir(outdir))
                  if os.path.basename(p).startswith("chunk_"))


def transcribe(wav_chunks):
    """Transcribe each chunk, offsetting timestamps. Returns (segments, full_text)."""
    segments, full = [], []
    offset = 0.0
    for i, chunk in enumerate(wav_chunks):
        log(f"   transcribing chunk {i+1}/{len(wav_chunks)}...")
        with open(chunk, "rb") as f:
            res = groq_post(
                "/audio/transcriptions",
                data={"model": WHISPER_MODEL, "response_format": "verbose_json", "temperature": "0"},
                files={"file": (os.path.basename(chunk), f, "audio/wav")},
            )
        if not res:
            continue
        for seg in res.get("segments", []):
            segments.append({
                "start": round(seg.get("start", 0) + offset, 2),
                "end": round(seg.get("end", 0) + offset, 2),
                "text": (seg.get("text") or "").strip(),
            })
        full.append((res.get("text") or "").strip())
        offset += CHUNK_SECONDS
    return segments, " ".join(full).strip()


def llm_enrich(title, segments):
    """Ask the LLM for summary + chapters + tags as strict JSON.

    `segments` is a list of {start, end, text}. CRITICAL: long videos (3h+)
    produce transcripts far bigger than the LLM token limit. Naively trimming
    the first N chars meant the model only saw the first ~hour and invented
    round-number chapters for the rest. Instead we DOWNSAMPLE evenly across the
    ENTIRE video — one short snippet roughly every ~2 minutes spanning the full
    duration — so the model sees the whole video and uses REAL, well-spread
    timestamps. We also pass the total duration explicitly."""
    total = int(segments[-1].get("end", 0)) if segments else 0

    # Evenly sample snippets across the whole timeline (target ~one per 120s,
    # capped so the prompt stays within token limits).
    target_window = 120  # seconds between sampled snippets
    buckets = {}
    for s in segments:
        t = int(s.get("start", 0))
        key = t // target_window
        if key not in buckets:  # first segment in each window
            txt = (s.get("text") or "").strip()
            if txt:
                buckets[key] = (t, txt)
    sampled = [buckets[k] for k in sorted(buckets)]
    # Hard cap on number of snippets to respect token limits (~700 * ~60 chars).
    if len(sampled) > 700:
        step = len(sampled) / 700
        sampled = [sampled[int(i * step)] for i in range(700)]

    lines = []
    for t, txt in sampled:
        lines.append(f"[{t}s {t // 60:02d}:{t % 60:02d}] {txt[:160]}")
    ts_transcript = "\n".join(lines)[:48000]

    dur_str = f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"
    prompt = (
        "You are creating chapters and a summary for a recorded Islamic "
        "live-stream / Q&A / debate video for an archive website.\n"
        f"Video title: {title}\n"
        f"TOTAL VIDEO DURATION: {dur_str} ({total} seconds).\n\n"
        "Below are transcript snippets sampled evenly across the WHOLE video, "
        "each tagged [SECONDS mm:ss].\n"
        "Return STRICT JSON with keys:\n"
        '  "summary": a 2-3 sentence neutral summary,\n'
        '  "tags": array of 4-8 short topic tags,\n'
        '  "chapters": array of {"time": SECONDS_INT, "label": "short title"}.\n\n'
        "CHAPTER RULES — FOLLOW EXACTLY, DO NOT ADD ANYTHING ELSE:\n"
        " 1. The chapters must be ONLY about guests/callers joining and leaving.\n"
        "    - When a guest or caller JOINS / is introduced / starts speaking, add a\n"
        "      chapter labelled like 'NAME joins' (use their real name if mentioned,\n"
        "      otherwise 'Caller joins' or 'Guest joins'; add a country/topic if\n"
        "      clearly stated, e.g. 'Caller from India joins').\n"
        "    - When that guest/caller LEAVES / is removed / the host moves on to the\n"
        "      next person, add a chapter labelled like 'NAME leaves'.\n"
        " 2. Use the REAL second value from the snippet where the join/leave happens.\n"
        "    NEVER use round guesses like 0, 300, 600, 900.\n"
        " 3. Do NOT create chapters for topics, sub-topics, side discussions, intros,\n"
        "    outros, breaks, or anything that is not a guest joining or leaving.\n"
        " 4. SPECIAL CASE — if the stream has NO guests/callers at all (it is just the\n"
        "    host talking or answering questions), then INSTEAD create chapters for\n"
        "    each distinct question answered by Muslims, labelled like\n"
        "    'Q: <short question topic>'. Still use real second values.\n"
        " 5. Always include a first chapter at or near second 0 ('Stream starts' or\n"
        "    the first guest/question). Keep labels short (max ~6 words).\n"
        " 6. Chapters must be in chronological order by time.\n"
        "Return ONLY the JSON object, no markdown.\n\n"
        f"TIMESTAMPED SNIPPETS:\n{ts_transcript}"
    )
    res = groq_post(
        "/chat/completions",
        headers={"Content-Type": "application/json"},
        data=json.dumps({
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 4000,
            "response_format": {"type": "json_object"},
        }),
    )
    if not res:
        return {}
    try:
        return json.loads(res["choices"][0]["message"]["content"])
    except Exception:
        return {}


def segments_to_srt(segments):
    def ts(s):
        h = int(s // 3600); m = int((s % 3600) // 60); sec = s % 60
        return f"{h:02d}:{m:02d}:{sec:06.3f}".replace(".", ",")
    out = []
    for i, seg in enumerate(segments, 1):
        out.append(f"{i}\n{ts(seg['start'])} --> {ts(seg['end'])}\n{seg['text']}\n")
    return "\n".join(out)


def upload_to_archive(identifier, filename, content_bytes, content_type):
    if not (ARCHIVE_ACCESS and ARCHIVE_SECRET):
        return ""
    import requests
    url = f"https://s3.us.archive.org/{identifier}/{filename}"
    try:
        r = requests.put(
            url,
            headers={"authorization": f"LOW {ARCHIVE_ACCESS}:{ARCHIVE_SECRET}", "Content-Type": content_type},
            data=content_bytes, timeout=300,
        )
        if r.status_code in (200, 201):
            return f"https://archive.org/download/{identifier}/{filename}"
    except Exception as e:
        log(f"   archive upload failed: {e}")
    return ""


def main():
    if not GROQ_KEY:
        log("ℹ️ GROQ_API_KEY not set — AI enrichment skipped (no-op).")
        return 0
    if not os.path.exists(RECORDINGS):
        log("❌ recordings.json not found")
        return 1

    with open(RECORDINGS) as f:
        recs = json.load(f)

    def needs_enrich(r):
        if not archive_audio_url(r):
            return False
        # "enriched" now means it has chapters from the CURRENT logic version.
        if r.get("chapter_logic_version") != CHAPTER_LOGIC_VERSION:
            return True
        if not FORCE:
            return False
        # FORCE: regenerate chapters with the current prompt. The chapter
        # philosophy changed (guest joins/leaves only, or Q&A if no guests), so a
        # forced run reprocesses videos that were enriched with the OLD prompt.
        # We mark each successful run with chapter_logic_version; skip videos that
        # already match the current version so repeated force runs finish the
        # remaining ones instead of restarting from video #1.
        return r.get("chapter_logic_version") != CHAPTER_LOGIC_VERSION

    todo = [r for r in recs if needs_enrich(r)][:MAX_ITEMS]
    if not todo:
        log("✅ All recordings already enriched (nothing to do).")
        return 0

    log(f"🧠 Enriching {len(todo)} recording(s)...")
    for rec in todo:
        ident = (rec.get("archive_link") or "").split("/details/")[-1]
        log(f"\n──── {rec.get('date')} {ident} ────")
        # ── STEP 1: OCR guest detection (PRIMARY) ─────────────────────────────
        # Read the on-screen name captions from the video frames. This is far
        # more reliable than guessing guest names from audio.
        vurl = video_url(rec)
        ocr_chapters = []
        if vurl:
            log("   👁️ detecting guests from on-screen names (OCR)...")
            ocr_chapters = detect_guests_ocr(vurl)
            log(f"   OCR found {len(ocr_chapters)} chapter(s)")

        # A "real guest" result = more than just the opening "Stream starts".
        has_guests = any(c.get("label", "").lower() not in ("stream starts",)
                         for c in ocr_chapters)

        new_chapters = []
        if has_guests:
            new_chapters = ocr_chapters
            log("   ✅ using OCR guest chapters")
        else:
            # ── STEP 2: audio Q&A fallback (only when NO guests on screen) ─────
            # No guests detected on screen → fall back to audio so the video
            # still gets useful "Q:" question chapters.
            log("   no on-screen guests — falling back to audio Q&A chapters...")
            src = archive_audio_url(rec)
            with tempfile.TemporaryDirectory() as tmp:
                wav = os.path.join(tmp, "audio.wav")
                if extract_audio(src, wav):
                    chunks = split_audio(wav, tmp) or [wav]
                    segments, text = transcribe(chunks)
                    if text:
                        log(f"   transcript: {len(text)} chars, {len(segments)} segments")
                        enrich = llm_enrich(rec.get("title", ""), segments)
                        new_chapters = enrich.get("chapters", []) or []
                        # Upload transcript so the player can offer captions.
                        t_url = upload_to_archive(
                            ident, "transcript.json",
                            json.dumps({"segments": segments, "text": text}).encode(),
                            "application/json")
                        if t_url:
                            rec["transcript_url"] = t_url

        # ── SAFETY: only overwrite when we actually got chapters ──────────────
        if new_chapters:
            rec["ai_chapters"] = new_chapters
            rec["chapter_logic_version"] = CHAPTER_LOGIC_VERSION
            rec["ai_enriched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
            # Remove the AI summary/tags — user wants chapters only.
            rec.pop("ai_summary", None)
            rec.pop("ai_tags", None)
            log(f"   ✅ {len(new_chapters)} chapters (summary removed)")
        else:
            log("   ⚠️ no chapters produced — keeping existing data, not overwriting")

        # Save after each item so partial progress persists
        with open(RECORDINGS, "w") as f:
            json.dump(recs, f, indent=2)
            f.write("\n")

    log("\n✅ AI enrichment complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
