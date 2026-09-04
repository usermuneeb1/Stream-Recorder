/**
 * 📑 YouTube metadata — chapters + storyboard for GHOST playback.
 *
 * Archive recordings carry AI chapters + storyboard sprites in
 * data/recordings.json, but channel-only videos (and archive records whose
 * AI enrichment hasn't run yet) have neither — so the player shows no
 * chapters and no seek-preview thumbnails on the YouTube copy.
 *
 * This endpoint reads both from YouTube's own data via Invidious
 * (verified against https://docs.invidious.io/api/):
 *   GET /api/ytmeta/<id>            → JSON { videoId, duration, chapters[], hasStoryboard }
 *   GET /api/ytmeta/<id>?format=vtt → text/vtt storyboard (same shape the
 *                                     Vidstack `thumbnails` prop already
 *                                     consumes for archive sprites)
 *   - chapters: parsed from the description's timestamp lines
 *     (00:00 Intro / 12:34 Topic). Needs ≥3 chapters with the first at
 *     ~0:00, mirroring YouTube's own chapter rules — else [].
 *   - storyboard: converted from the `storyboards[]` spec
 *     ({templateUrl with $M image index, width/height, count,
 *     interval ms, storyboardWidth/Height}) into #xywh cues.
 *
 * Same-origin endpoint, so no CORS issues in the player. Failures are
 * graceful (502 / empty) — the player simply shows no chapters/preview,
 * exactly today's behavior. Storyboard googlevideo URLs expire within
 * hours, hence the short 1h edge cache (chapters cache 24h).
 */

export const config = { runtime: 'edge' };

const INVIDIOUS = [
  'https://invidious.private.coffee',
  'https://invidious.nerdvpn.de',
  'https://invidious.f5.si',
  'https://invidious.jing.rocks',
  'https://yewtu.be',
  'https://invidious.lunar.icu',
];

const ID_RE = /^[\w-]{11}$/;
const MAX_CUES = 1500;

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    ...extra,
  };
}

async function fetchMeta(id, signal) {
  const probes = INVIDIOUS.map(async (inst) => {
    const r = await fetch(`${inst}/api/v1/videos/${id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 ytmeta/1' },
      signal,
    });
    if (!r.ok) throw new Error('not ok');
    const j = await r.json();
    if (!j || typeof j !== 'object' || j.error || j.videoId !== id) throw new Error('bad payload');
    return j;
  });
  return Promise.any(probes);
}

/** "00:00 Intro" / "12:34 - Topic" description lines → [{time,label}]. */
export function parseChapters(description) {
  const out = [];
  for (const raw of String(description || '').split('\n')) {
    const line = raw.replace(/https?:\/\/\S+/g, ' ');
    const m = line.match(/(?:^|[\s([])(\d{1,3}):([0-5]\d)(?::([0-5]\d))?(?=[\s)\],;]|$)/);
    if (!m) continue;
    const t = m[3] !== undefined
      ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])
      : (+m[1]) * 60 + (+m[2]);
    const before = line.slice(0, m.index).trim();
    const after = line.slice(m.index + m[0].length).trim();
    let label = (after || before)
      .replace(/^[-–—_|•·:▶▸]+\s*/, '')
      .replace(/\s*[-–—_|•·:▶▸]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label || label.length > 120 || /^\d+$/.test(label)) continue;
    out.push({ time: t, label });
  }
  out.sort((a, b) => a.time - b.time);
  const dedup = [];
  for (const c of out) {
    const last = dedup[dedup.length - 1];
    if (last && c.time <= last.time) continue;
    dedup.push(c);
  }
  // YouTube's own bar: ≥3 chapters and the first at the very start.
  if (dedup.length < 3 || dedup[0].time > 10) return [];
  return dedup;
}

export function fmtVtt(sec) {
  const s = Math.max(0, sec);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(Math.floor(s % 60))}.${p(Math.floor((s % 1) * 1000), 3)}`;
}

/** Invidious `storyboards[]` spec → WebVTT with #xywh sprite cues. */
export function buildStoryboardVtt(storyboards, lengthSeconds) {
  if (!Array.isArray(storyboards) || !storyboards.length) return '';
  const boards = storyboards
    .map((s) => ({
      templateUrl: typeof s.templateUrl === 'string' ? s.templateUrl : '',
      url: typeof s.url === 'string' ? s.url : '',
      w: +s.width || 0,
      h: +s.height || 0,
      count: +s.count || 0,
      intervalMs: +s.interval || +s['interval '] || 0,
      cols: +s.width > 0 ? Math.max(1, Math.floor((+s.storyboardWidth || +s.width) / +s.width)) : 0,
      rows: +s.height > 0 ? Math.max(1, Math.floor((+s.storyboardHeight || +s.height) / +s.height)) : 0,
    }))
    .filter((s) => (s.templateUrl || s.url) && s.w > 0 && s.h > 0 && s.cols > 0 && s.rows > 0);
  if (!boards.length) return '';

  const totalFrames = boards.reduce((n, s) => n + (s.count > 0 ? s.count : 1) * s.cols * s.rows, 0);
  let step = 0;
  for (const s of boards) {
    if (s.intervalMs > 0) { step = s.intervalMs / 1000; break; }
  }
  if (!(step > 0)) step = lengthSeconds > 0 && totalFrames > 0 ? lengthSeconds / totalFrames : 5;
  const end = lengthSeconds > 0 ? lengthSeconds : totalFrames * step;

  const cues = ['WEBVTT', ''];
  let f = 0;
  let done = false;
  for (let h = 0; h < boards.length && !done; h++) {
    const s = boards[h];
    const images = s.count > 0 ? s.count : 1;
    for (let mi = 0; mi < images && !done; mi++) {
      const img = s.templateUrl
        ? s.templateUrl.replace(/\$M/g, String(mi)).replace(/\$H/g, String(h))
        : s.url;
      for (let r = 0; r < s.rows && !done; r++) {
        for (let c = 0; c < s.cols && !done; c++) {
          const start = f * step;
          if (start >= end || f >= MAX_CUES) { done = true; break; }
          cues.push(`${fmtVtt(start)} --> ${fmtVtt(Math.min(start + step, end))}`);
          cues.push(`${img}#xywh=${c * s.w},${r * s.h},${s.w},${s.h}`);
          cues.push('');
          f++;
        }
      }
    }
  }
  return f > 0 ? cues.join('\n') : '';
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const id = (url.pathname.split('/').filter(Boolean).pop() || '')
    .replace(/[^A-Za-z0-9_-]/g, '').slice(0, 11);

  if (!ID_RE.test(id)) {
    return new Response(JSON.stringify({ error: 'Invalid YouTube id' }), {
      status: 400, headers: cors({ 'Content-Type': 'application/json' }),
    });
  }

  const wantVtt = url.searchParams.get('format') === 'vtt';
  const ctrl = new AbortController();
  const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(9000)]);

  let meta = null;
  try {
    meta = await fetchMeta(id, signal);
  } catch { /* all instances failed — graceful empty below */ }
  ctrl.abort();

  if (!meta) {
    return new Response(wantVtt ? 'WEBVTT\n\n' : JSON.stringify({ videoId: id, chapters: [], hasStoryboard: false }), {
      status: 502,
      headers: cors({ 'Content-Type': wantVtt ? 'text/vtt; charset=utf-8' : 'application/json' }),
    });
  }

  const duration = Number(meta.lengthSeconds) || 0;
  if (wantVtt) {
    const vtt = buildStoryboardVtt(meta.storyboards, duration);
    if (!vtt) {
      return new Response('WEBVTT\n\n', {
        status: 502, headers: cors({ 'Content-Type': 'text/vtt; charset=utf-8' }),
      });
    }
    return new Response(vtt, {
      headers: cors({
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      }),
    });
  }

  return new Response(JSON.stringify({
    videoId: id,
    duration,
    chapters: parseChapters(meta.description),
    hasStoryboard: Array.isArray(meta.storyboards) && meta.storyboards.length > 0,
  }), {
    headers: cors({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    }),
  });
}
