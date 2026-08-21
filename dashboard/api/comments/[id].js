/**
 * 💬 Comments API — settled design (Batch 2)
 *
 * Storage:   GitHub-repo-backed data/comments.json (keyed by videoId).
 *            Zero external services — survives on the same CI the archive
 *            trusts. Old catbox-index design retired.
 * Access:    reads PUBLIC, writes PASSPHRASE-GATED ("special people" share
 *            one secret word; they pick their own display name).
 * Secrets:   GH_TOKEN        — PAT with repo contents write (already configured)
 *            COMMENTS_PASSPHRASE — the shared secret word
 *
 * Shape of data/comments.json:
 *   { "_comment": "...", "<videoId>": [ { n, t, at }, ... ] }
 *
 * Endpoints:
 *   GET  /api/comments/<videoId>  → { comments: [{n,t,at}] }   (public)
 *   POST /api/comments/<videoId>  { name, text, passphrase }   (gated)
 */

export const config = { runtime: 'edge' };

const REPO     = process.env.GH_REPO   || 'usermuneeb1/Stream-Recorder';
const BRANCH   = process.env.GH_BRANCH || 'main';
const GH_TOKEN = process.env.GH_TOKEN  || '';
const PASSPHRASE = process.env.COMMENTS_PASSPHRASE || '';

const FILE_PATH  = 'data/comments.json';
const ID_RE      = /^[\w-]{11}$/;          // YouTube ids only
const MAX_NAME   = 32;
const MAX_TEXT   = 600;
const MAX_PER_VID = 500;

// Per-IP throttle: 5 writes/min (edge instances are ephemeral; this blunts
// bursts — the real gate is the passphrase).
const rate = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const cap = 5;
  const arr = (rate.get(ip) || []).filter(t => now - t < windowMs);
  if (arr.length >= cap) return true;
  arr.push(now);
  rate.set(ip, arr);
  return false;
}

const SLUR_RE = /\b(n[i1]gg[ae3]r|f[a4]gg?[o0]t|k[i1]ke|ch[i1]nk|sp[i1]c|tr[a4]nn[yi]|ret[a4]rd)\b/i;

function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    ...extra,
  };
}

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: cors(extraHeaders) });
}

function sanitize(str, max) {
  return String(str || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// ── UTF-8 safe base64 ───────────────────────────────────────────────────────
function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function b64decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function ghGetFile() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, {
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'comments-api',
    },
  });
  if (r.status === 404) return { sha: null, data: {} };
  if (!r.ok) throw new Error(`github get: ${r.status}`);
  const j = await r.json();
  let data;
  try { data = JSON.parse(b64decode((j.content || '').replace(/\n/g, ''))); }
  catch { data = {}; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  return { sha: j.sha, data };
}

async function ghPutFile(sha, data, message) {
  return fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'comments-api',
    },
    body: JSON.stringify({
      message,
      content: b64encode(JSON.stringify(data, null, 1) + '\n'),
      sha: sha || undefined,
      branch: BRANCH,
    }),
  });
}

// CAS retry: another write may land between our GET and PUT (409/422).
async function appendComment(videoId, comment, maxAttempts = 5) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { sha, data } = await ghGetFile();
    const list = Array.isArray(data[videoId]) ? data[videoId] : [];
    list.unshift(comment);                       // newest first
    data[videoId] = list.slice(0, MAX_PER_VID);  // rolling cap
    const r = await ghPutFile(sha, data, `💬 comment on ${videoId} by ${comment.n}`);
    if (r.ok) return;
    if (r.status !== 409 && r.status !== 422) {
      throw new Error(`github put ${r.status}`);
    }
    await new Promise(res => setTimeout(res, 150 * attempt));
  }
  throw new Error('CAS retry exhausted');
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors() });
  }

  const url = new URL(request.url);
  const videoId = (url.pathname.split('/').filter(Boolean).pop() || '').replace(/[^\w-]/g, '');
  if (!ID_RE.test(videoId)) return json(400, { error: 'Invalid videoId' });

  // ── GET: public read (CDN fallback when token absent, e.g. preview deploys)
  if (request.method === 'GET') {
    if (!GH_TOKEN) {
      try {
        const r = await fetch(`https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/${FILE_PATH}?_=${Date.now()}`);
        if (r.ok) {
          const data = await r.json();
          return json(200, { comments: data?.[videoId] || [] }, { 'Cache-Control': 'public, max-age=30, s-maxage=30' });
        }
      } catch { /* fall through */ }
      return json(200, { comments: [] });
    }
    try {
      const { data } = await ghGetFile();
      return json(200, { comments: data[videoId] || [] }, { 'Cache-Control': 'public, max-age=30, s-maxage=30' });
    } catch {
      return json(200, { comments: [] });
    }
  }

  // ── POST: passphrase-gated write
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!GH_TOKEN) return json(500, { error: 'Comments backend not configured' });
  if (!PASSPHRASE) return json(500, { error: 'Comments are not enabled (no passphrase configured)' });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json(429, { error: 'Too fast — wait a minute.' });

  let payload;
  try { payload = await request.json(); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  // Constant-time-ish compare (length leak is harmless for a shared word)
  const given = String(payload.passphrase || '');
  if (given.length !== PASSPHRASE.length ||
      ![...given].every((ch, i) => ch === PASSPHRASE[i])) {
    return json(401, { error: 'Wrong passphrase' });
  }

  const name = sanitize(payload.name, MAX_NAME) || 'Guest';
  const text = sanitize(payload.text, MAX_TEXT);
  if (text.length < 2) return json(400, { error: 'Comment too short' });
  if (SLUR_RE.test(text) || SLUR_RE.test(name)) return json(400, { error: 'Rejected by filter' });

  const comment = { n: name, t: text, at: new Date().toISOString() };

  try {
    await appendComment(videoId, comment);
  } catch (e) {
    return json(502, { error: `Could not save comment: ${e.message}` });
  }

  return json(200, { ok: true });
}
