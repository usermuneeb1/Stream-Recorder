#!/usr/bin/env python3
"""
Generate RSS feed, podcast feed (RSS 2.0 + iTunes), JSON Feed, and sitemap.xml
from data/recordings.json.

Run from repo root:
    python3 scripts/generate-feeds.py

Output:
    dashboard/public/feed.xml      — RSS 2.0
    dashboard/public/podcast.xml   — RSS 2.0 with <itunes:*> tags
    dashboard/public/feed.json     — JSON Feed 1.1
    dashboard/public/sitemap.xml   — sitemap for crawlers

These files are committed to git so Vercel serves them as static assets — no
server-side rendering needed.
"""

from __future__ import annotations
import json
import pathlib
import re
import sys
from datetime import datetime, timezone
from html import escape
from xml.sax.saxutils import quoteattr

ROOT = pathlib.Path(__file__).resolve().parent.parent
RECS = ROOT / "data" / "recordings.json"
OUT = ROOT / "dashboard" / "public"

SITE = "https://muslim-lantern-archive.vercel.app"
TITLE = "The Muslim Lantern — Stream Archive"
DESC = "Live stream archive of The Muslim Lantern. Recorded, mirrored, and chaptered automatically."
AUTHOR = "Muneeb Ahmad"
EMAIL = "noreply@muslim-lantern-archive.invalid"
LANG = "en"
COVER = f"{SITE}/logo.png"


def load_recordings() -> list[dict]:
    data = json.loads(RECS.read_text())
    by_id: dict[str, dict] = {}
    for r in data:
        if "muslim lantern" not in r.get("channel", "").lower():
            continue
        m = re.search(r"(?:v=|/)([\w-]{11})", r.get("video_url", ""))
        if not m:
            continue
        yt = m.group(1)
        ex = by_id.get(yt)
        if not ex or len(json.dumps(r)) > len(json.dumps(ex)):
            by_id[yt] = {**(ex or {}), **r}
            by_id[yt]["video_id"] = yt
    return sorted(by_id.values(), key=lambda r: r.get("date", ""), reverse=True)


def best_audio_or_video_url(r: dict) -> str:
    """Pick the single most reliable, publicly streamable URL."""
    for k in ("archive_node", "archive_direct", "github_direct", "github_release"):
        u = r.get(k)
        if u:
            return u
    return r.get("video_url", "")


def watch_url(r: dict) -> str:
    return f"{SITE}/#/watch/{r['video_id']}"


def thumb_url(r: dict) -> str:
    t = r.get("thumbnail", "")
    if t and t.startswith("http"):
        return t
    return f"https://i.ytimg.com/vi/{r['video_id']}/hqdefault.jpg"


def pubdate(r: dict) -> str:
    d = r.get("recorded_at") or (r.get("date", "") + "T00:00:00Z")
    try:
        dt = datetime.fromisoformat(d.replace("Z", "+00:00"))
    except Exception:
        dt = datetime.now(timezone.utc)
    return dt.strftime("%a, %d %b %Y %H:%M:%S +0000")


def iso(r: dict) -> str:
    d = r.get("recorded_at") or (r.get("date", "") + "T00:00:00Z")
    try:
        return datetime.fromisoformat(d.replace("Z", "+00:00")).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def make_rss(items: list[dict], podcast: bool) -> str:
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    extra_ns = ' xmlns:itunes="http://www.itunes.apple.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/"' if podcast else ""
    itunes_channel = ""
    if podcast:
        itunes_channel = f"""
    <itunes:author>{escape(AUTHOR)}</itunes:author>
    <itunes:summary>{escape(DESC)}</itunes:summary>
    <itunes:owner><itunes:name>{escape(AUTHOR)}</itunes:name><itunes:email>{escape(EMAIL)}</itunes:email></itunes:owner>
    <itunes:image href={quoteattr(COVER)}/>
    <itunes:category text="Religion &amp; Spirituality"><itunes:category text="Islam"/></itunes:category>
    <itunes:explicit>false</itunes:explicit>"""

    item_xml = []
    for r in items[:50]:
        link = watch_url(r)
        media = best_audio_or_video_url(r)
        size = r.get("size_bytes", 0)
        dur = int(r.get("duration_sec", 0))
        guid = r["video_id"]
        title = r.get("title", "Untitled")
        thumb = thumb_url(r)

        itunes_item = ""
        if podcast:
            hh, mm, ss = dur // 3600, (dur % 3600) // 60, dur % 60
            itunes_item = f"""
      <itunes:duration>{hh:02d}:{mm:02d}:{ss:02d}</itunes:duration>
      <itunes:image href={quoteattr(thumb)}/>
      <itunes:explicit>false</itunes:explicit>"""

        enclosure = f'<enclosure url={quoteattr(media)} length="{size}" type="video/mp4"/>' if media else ""

        item_xml.append(f"""    <item>
      <title>{escape(title)}</title>
      <link>{escape(link)}</link>
      <guid isPermaLink="false">{escape(guid)}</guid>
      <pubDate>{pubdate(r)}</pubDate>
      <description>{escape(title + ' — ' + DESC)}</description>
      {enclosure}{itunes_item}
    </item>""")

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"{extra_ns}>
  <channel>
    <title>{escape(TITLE)}</title>
    <link>{escape(SITE)}</link>
    <description>{escape(DESC)}</description>
    <language>{LANG}</language>
    <lastBuildDate>{now}</lastBuildDate>
    <generator>generate-feeds.py</generator>
    <image><url>{escape(COVER)}</url><title>{escape(TITLE)}</title><link>{escape(SITE)}</link></image>{itunes_channel}
{chr(10).join(item_xml)}
  </channel>
</rss>
"""


def make_json_feed(items: list[dict]) -> str:
    out = {
        "version": "https://jsonfeed.org/version/1.1",
        "title": TITLE,
        "home_page_url": SITE,
        "feed_url": f"{SITE}/feed.json",
        "description": DESC,
        "icon": COVER,
        "favicon": f"{SITE}/logo-vertical.pn.jpg",
        "authors": [{"name": AUTHOR}],
        "language": LANG,
        "items": [
            {
                "id": r["video_id"],
                "url": watch_url(r),
                "title": r.get("title", "Untitled"),
                "summary": r.get("title", ""),
                "image": thumb_url(r),
                "date_published": iso(r),
                "attachments": [
                    {
                        "url": best_audio_or_video_url(r),
                        "mime_type": "video/mp4",
                        "size_in_bytes": r.get("size_bytes", 0),
                        "duration_in_seconds": int(r.get("duration_sec", 0)),
                    }
                ] if best_audio_or_video_url(r) else [],
            }
            for r in items[:100]
        ],
    }
    return json.dumps(out, indent=2, ensure_ascii=False)


def make_sitemap(items: list[dict]) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls = [f"<url><loc>{SITE}/</loc><lastmod>{now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>"]
    for r in items:
        urls.append(
            f"<url><loc>{escape(watch_url(r))}</loc>"
            f"<lastmod>{iso(r)[:10]}</lastmod>"
            f"<changefreq>monthly</changefreq>"
            f"<priority>0.8</priority></url>"
        )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>
"""


def main() -> int:
    items = load_recordings()
    print(f"Loaded {len(items)} unique recordings")
    OUT.mkdir(parents=True, exist_ok=True)

    (OUT / "feed.xml").write_text(make_rss(items, podcast=False))
    (OUT / "podcast.xml").write_text(make_rss(items, podcast=True))
    (OUT / "feed.json").write_text(make_json_feed(items))
    (OUT / "sitemap.xml").write_text(make_sitemap(items))

    print(f"  ✓ feed.xml      ({(OUT / 'feed.xml').stat().st_size:,} bytes)")
    print(f"  ✓ podcast.xml   ({(OUT / 'podcast.xml').stat().st_size:,} bytes)")
    print(f"  ✓ feed.json     ({(OUT / 'feed.json').stat().st_size:,} bytes)")
    print(f"  ✓ sitemap.xml   ({(OUT / 'sitemap.xml').stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
