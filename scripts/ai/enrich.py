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

    `segments` is a list of {start, end, text}. We feed the model a
    timestamped transcript so chapters use REAL timestamps (not guesses) and
    can mark meaningful moments — especially when a guest/caller joins or a new
    topic begins (YouTube-style chapters)."""
    # Build a compact timestamped transcript (mm:ss | text), trimmed to fit.
    lines = []
    for s in segments:
        t = int(s.get("start", 0))
        stamp = f"{t // 60:02d}:{t % 60:02d}"
        txt = (s.get("text") or "").strip()
        if txt:
            lines.append(f"[{t}s {stamp}] {txt}")
    ts_transcript = "\n".join(lines)[:46000]

    prompt = (
        "You are creating YouTube-style chapters and a summary for a recorded "
        "Islamic live-stream / Q&A / debate video for an archive website.\n"
        f"Video title: {title}\n\n"
        "The transcript below is timestamped as [SECONDS mm:ss].\n"
        "Return STRICT JSON with keys:\n"
        '  "summary": a 2-3 sentence neutral summary,\n'
        '  "tags": array of 4-8 short topic tags,\n'
        '  "chapters": array of {"time": SECONDS_INT, "label": "short title"}.\n'
        "CHAPTER RULES:\n"
        " - Use the REAL second value from the transcript timestamps, not round guesses.\n"
        " - Create a NEW chapter whenever a guest/caller JOINS or is introduced "
        "(label it with their name if mentioned, e.g. 'Ahmed joins'), and whenever "
        "the topic clearly changes.\n"
        " - 6-15 chapters, in chronological order, first chapter at or near 0.\n"
        "Return ONLY the JSON object, no markdown.\n\n"
        f"TIMESTAMPED TRANSCRIPT:\n{ts_transcript}"
    )
    res = groq_post(
        "/chat/completions",
        headers={"Content-Type": "application/json"},
        data=json.dumps({
            "model": LLM_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
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

    todo = [r for r in recs if (FORCE or not r.get("ai_summary")) and archive_audio_url(r)][:MAX_ITEMS]
    if not todo:
        log("✅ All recordings already enriched (nothing to do).")
        return 0

    log(f"🧠 Enriching {len(todo)} recording(s)...")
    for rec in todo:
        ident = (rec.get("archive_link") or "").split("/details/")[-1]
        log(f"\n──── {rec.get('date')} {ident} ────")
        src = archive_audio_url(rec)
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "audio.wav")
            log("   extracting audio...")
            if not extract_audio(src, wav):
                log("   ⏭️ audio extraction failed, skipping")
                continue
            chunks = split_audio(wav, tmp) or [wav]
            segments, text = transcribe(chunks)
            if not text:
                log("   ⏭️ transcription empty, skipping")
                continue
            log(f"   transcript: {len(text)} chars, {len(segments)} segments")

            enrich = llm_enrich(rec.get("title", ""), segments)
            transcript_obj = {"segments": segments, "text": text}

            # Upload transcript + srt to Archive
            t_url = upload_to_archive(ident, "transcript.json",
                                      json.dumps(transcript_obj).encode(), "application/json")
            upload_to_archive(ident, "subtitles.srt",
                              segments_to_srt(segments).encode(), "text/plain")

            # SAFETY: only overwrite existing AI fields when the new result is
            # actually valid. A failed/rate-limited LLM call returns {} — never
            # let that wipe previously-good summaries/chapters.
            new_summary = enrich.get("summary", "")
            new_chapters = enrich.get("chapters", [])
            if new_summary:
                rec["ai_summary"] = new_summary
                rec["ai_tags"] = enrich.get("tags", [])
                if new_chapters:
                    rec["ai_chapters"] = new_chapters
                if t_url:
                    rec["transcript_url"] = t_url
                rec["ai_enriched_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ")
                log(f"   ✅ summary + {len(rec.get('ai_tags', []))} tags + {len(rec.get('ai_chapters', []))} chapters")
            else:
                log("   ⚠️ LLM returned no summary — keeping existing AI data, not overwriting")

        # Save after each item so partial progress persists
        with open(RECORDINGS, "w") as f:
            json.dump(recs, f, indent=2)
            f.write("\n")

    log("\n✅ AI enrichment complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
