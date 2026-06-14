#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  👁️  GUEST DETECTION VIA ON-SCREEN TEXT (OCR) — not audio                     ║
# ║                                                                              ║
# ║  The Muslim Lantern debate streams show each speaker's NAME in a caption box ║
# ║  at the bottom of their video tile (e.g. "Rocco Donofrio", "Josh Bandeira"). ║
# ║  Reading that text is far more reliable than guessing names from audio.       ║
# ║                                                                              ║
# ║  How it works:                                                               ║
# ║    1. Sample one frame every SAMPLE_STEP seconds from the recording          ║
# ║    2. OCR each frame (tesseract) to read the name-caption boxes              ║
# ║    3. Drop the host's own name + chat/garbage lines                          ║
# ║    4. Fuzzy-merge OCR variants of the same guest name                        ║
# ║    5. Emit YouTube-style chapters: "<Guest> joins" / "<Guest> leaves"        ║
# ║       (if NO guests are ever found, emit nothing — caller leaves chapters    ║
# ║        to the audio Q&A fallback)                                            ║
# ║                                                                              ║
# ║  Requires: ffmpeg, tesseract-ocr   (installed in the workflow)               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

import os
import re
import subprocess
import sys
from collections import defaultdict
from difflib import SequenceMatcher

# ── Tunables (env-overridable) ────────────────────────────────────────────────
SAMPLE_STEP = int(os.environ.get("GUEST_SAMPLE_STEP", "20"))   # seconds between frames
MIN_HITS = int(os.environ.get("GUEST_MIN_HITS", "2"))          # appearances to be "real"
# The name caption sits in the BOTTOM band of each tile. Only text below this
# fraction of frame height is read — rejects mid-frame logos/posters/background.
NAME_BAND_FRAC = float(os.environ.get("GUEST_NAME_BAND_FRAC", "0.62"))
MIN_CONF = float(os.environ.get("GUEST_MIN_CONF", "70"))       # OCR confidence floor
# Host name fragments — these caption lines are the channel itself, never a guest.
HOST_HINTS = [h.strip().lower() for h in os.environ.get(
    "GUEST_HOST_HINTS", "muslimlantern,themuslimlantern,lantern,m.a").split(",") if h.strip()]


def log(m):
    print(m, flush=True)


def _clean(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9 @._-]", "", s)
    s = re.sub(r"\s+", " ", s).strip(" |.-_")
    # Strip a stray leading single letter that OCR adds (e.g. "I Kainat" -> the
    # icon/avatar misread as "I"). Only when followed by a real word.
    s = re.sub(r"^[A-Za-z]\s+(?=[A-Z][a-z])", "", s)
    return s


# Words that are NEVER guest names — clothing logos, UI text, donation/chat junk
# that the OCR picks up from the host's shirt or on-screen overlays. Matched
# FUZZILY so OCR misreads (e.g. "Columbu" for "Columbia") are still caught.
_DENY_WORDS = {
    "columbia", "montrail", "montrad", "nike", "adidas", "youtube", "subscribe",
    "live", "chat", "superchat", "super", "donation", "member", "joined",
    "themuslimlantern", "muslimlantern", "lantern", "verified", "loading",
}


def _is_denied(word: str) -> bool:
    """True if word matches a denylist entry exactly OR is a close OCR misread
    of one (>=80% similar), so 'Columbu' is rejected like 'Columbia'."""
    w = word.lower().strip("@._-")
    if w in _DENY_WORDS:
        return True
    for d in _DENY_WORDS:
        if abs(len(w) - len(d)) <= 2 and SequenceMatcher(None, w, d).ratio() >= 0.8:
            return True
    return False


def _has_vowel(w: str) -> bool:
    return bool(re.search(r"[aeiouAEIOU]", w))


def _looks_like_name(c: str) -> bool:
    if not (3 <= len(c) <= 28):
        return False
    if not re.search(r"[A-Za-z]", c):
        return False

    words = c.split()
    if len(words) > 4:                     # full sentences = chat messages
        return False

    letters = sum(ch.isalpha() for ch in c)
    if letters / max(len(c), 1) < 0.65:    # too much OCR garbage / symbols
        return False

    low = c.lower()

    # Reject money / donation overlays (e.g. "@RANDOM €2.49", "$5.00").
    if re.search(r"[€$£₹]\s?\d|\d+[.,]\d{2}\b", c):
        return False

    # Reject anything that is a known logo / UI word (fuzzy — catches OCR
    # misreads like "Columbu" for "Columbia"). Check every token.
    if any(_is_denied(w) for w in words):
        return False

    # A real caption name has at least 3 letters in its main token and is not a
    # lone ALL-CAPS spam token. Single-word logos like "Columbia" are rejected
    # unless they look like a proper @handle.
    if len(words) == 1:
        w = words[0]
        if w.startswith("@"):
            # Real YouTube handles: letters/digits/dot/underscore only (NO dash).
            # Real ones are usually a name followed by trailing digits
            # (e.g. @albinamirzaeva2070). Garbage like "az-fy3mp" has dashes or
            # digits mixed INTO the letters — reject those.
            handle = w[1:]
            if not re.fullmatch(r"[A-Za-z0-9._]{3,30}", handle):
                return False
            # Strip trailing digits (allowed), then the rest must be clean letters.
            core = re.sub(r"\d+$", "", handle)
            if re.search(r"[0-9]", core):          # digits mixed mid-handle = junk
                return False
            return len(core) >= 3 and _has_vowel(core)
        # single plain word: Capitalised, 4-18 chars, has a vowel, not denied,
        # and not a code-like token (mix of letters+digits+dashes = garbage).
        if not (w[:1].isupper() and 4 <= len(w) <= 18):
            return False
        if not _has_vowel(w):
            return False
        if re.search(r"[a-z][0-9]|[0-9][a-z]|-", w):   # "az-fy3mp" style junk
            return False
    else:
        # Multi-word: at least one token must be Capitalised (a real name),
        # and the whole thing must contain a vowel.
        if not any(w[:1].isupper() for w in words if w):
            return False
        if not _has_vowel(c):
            return False

    # Reject lines that are mostly digits.
    digits = sum(ch.isdigit() for ch in c)
    if digits > letters:
        return False

    return True


def _is_host(name: str) -> bool:
    x = name.lower().replace(" ", "")
    return any(h.replace(" ", "") in x for h in HOST_HINTS)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def ocr_frame(url: str, t: int):
    """Return candidate name strings read from the NAME CAPTION BAND of the frame.

    Two-layer filtering for accuracy:
      • POSITION: tesseract TSV gives each word's x/y/confidence. We only keep
        words in the bottom name-band (y >= 62% of height) at caption font-size
        with decent confidence. This rejects shirt logos, posters and background
        text in the middle of the frame (the old whole-frame OCR false positives).
      • CONTENT: the kept words are still passed through _looks_like_name / the
        denylist so any stray junk is dropped too.
    Words on the same caption line (same screen side + similar y) are merged so a
    first+last name like 'Rocco' + 'Donofrio' becomes one 'Rocco Donofrio'.
    Upscaled 1.5x — small caption text OCRs noticeably better when enlarged."""
    fr = subprocess.run(
        ["ffmpeg", "-y", "-ss", str(t), "-i", url, "-frames:v", "1",
         "-vf", "scale=iw*1.5:ih*1.5", "-f", "image2", "-vcodec", "png", "pipe:1"],
        capture_output=True)
    if fr.returncode != 0 or not fr.stdout:
        return []
    oc = subprocess.run(["tesseract", "stdin", "stdout", "tsv"],
                        input=fr.stdout, capture_output=True)
    rows = oc.stdout.decode("utf-8", "ignore").splitlines()
    if len(rows) < 2:
        return []

    words = []
    max_bottom = 1
    for ln in rows[1:]:
        f = ln.split("\t")
        if len(f) < 12:
            continue
        try:
            conf = float(f[10]); x = int(f[6]); y = int(f[7]); w = int(f[8]); h = int(f[9])
        except ValueError:
            continue
        txt = f[11].strip()
        if not txt:
            continue
        words.append({"conf": conf, "x": x, "y": y, "w": w, "h": h, "txt": txt})
        max_bottom = max(max_bottom, y + h)

    band_y = NAME_BAND_FRAC * max_bottom
    kept = [wd for wd in words
            if wd["conf"] >= MIN_CONF and wd["y"] >= band_y
            and 0.012 * max_bottom <= wd["h"] <= 0.06 * max_bottom]
    if not kept:
        return []

    # Merge words into caption lines by screen-side (left/right tile) + y-proximity.
    half = max_bottom * 16 / 9 / 2
    tol = max(18, 0.03 * max_bottom)
    kept.sort(key=lambda d: (d["y"], d["x"]))
    groups = []
    for wd in kept:
        side = 0 if wd["x"] < half else 1
        for g in groups:
            if g["side"] == side and abs(wd["y"] - g["y"]) <= tol:
                g["words"].append(wd)
                break
        else:
            groups.append({"side": side, "y": wd["y"], "words": [wd]})

    out = []
    for g in groups:
        g["words"].sort(key=lambda d: d["x"])
        text = " ".join(w["txt"] for w in g["words"])
        if "|" in text:
            text = text.split("|")[-1]
        c = _clean(text)
        if _looks_like_name(c):
            out.append(c)
    return out


def video_duration(url: str) -> int:
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", url],
        capture_output=True)
    try:
        return int(float(p.stdout.decode().strip()))
    except Exception:
        return 0


def detect(url: str, duration: int = 0):
    """Return a list of chapter dicts: {time, label}."""
    if not duration:
        duration = video_duration(url)
    if not duration:
        log("   ⚠️ could not determine duration — skipping OCR guest detection")
        return []

    # 1. Collect (time, name) sightings across the whole video.
    sightings = []
    t = 0
    while t < duration:
        for name in ocr_frame(url, t):
            if not _is_host(name):
                sightings.append((t, name))
        t += SAMPLE_STEP

    if not sightings:
        return []

    # 2. Fuzzy-merge OCR variants of the same person into canonical groups.
    #    Two names belong together if one normalised form contains the other,
    #    or they are >=80% similar.
    groups = []  # each: {"key": norm, "display": {form:count}, "times": [..]}

    def find_group(nm):
        k = _norm(nm)
        if len(k) < 4:
            return None
        for g in groups:
            gk = g["key"]
            if k in gk or gk in k or SequenceMatcher(None, k, gk).ratio() >= 0.8:
                return g
        return None

    for ti, nm in sightings:
        g = find_group(nm)
        if g is None:
            g = {"key": _norm(nm), "display": defaultdict(int), "times": []}
            groups.append(g)
        g["display"][nm] += 1
        g["times"].append(ti)
        # keep the longest normalised key (most complete OCR read)
        if len(_norm(nm)) > len(g["key"]):
            g["key"] = _norm(nm)

    # 3. Build join/leave chapters for groups seen enough times to be real.
    chapters = []
    for g in groups:
        if len(g["times"]) < MIN_HITS:
            continue
        display = max(g["display"], key=g["display"].get)
        display = re.sub(r"^@", "", display).strip()           # drop leading @
        if not display or _is_host(display):
            continue
        times = sorted(g["times"])
        join_t = times[0]
        # "leave" = one sample step after the last time we saw them (they're gone
        # by the next sample). Cap at the video end.
        leave_t = min(times[-1] + SAMPLE_STEP, duration)
        chapters.append({"time": join_t, "label": f"{display} joins"})
        # Only add a "leaves" if they actually disappeared before the end.
        if leave_t < duration - SAMPLE_STEP:
            chapters.append({"time": leave_t, "label": f"{display} leaves"})

    chapters.sort(key=lambda c: c["time"])

    # Always have a first marker at/near 0 for clean UX.
    if not chapters or chapters[0]["time"] > 30:
        chapters.insert(0, {"time": 0, "label": "Stream starts"})
    return chapters


# Allow standalone testing:  python3 detect-guests.py <video_url> [duration]
if __name__ == "__main__":
    if len(sys.argv) < 2:
        log("usage: detect-guests.py <video_url> [duration_seconds]")
        sys.exit(1)
    dur = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    for c in detect(sys.argv[1], dur):
        log(f"{c['time']:6}s ({c['time']//60:02d}:{c['time']%60:02d})  {c['label']}")
