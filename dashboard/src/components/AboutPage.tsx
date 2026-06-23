import { useEffect, useState } from 'react';
import { fetchStatus, type SystemStatus } from '../utils/dataFetcher';
import { fmtRelative } from '../utils/format';

interface P { onClose: () => void; theme: string; onTheme: () => void }

export function AboutPage({ onClose, theme, onTheme }: P) {
  const [s, setS] = useState<SystemStatus | null>(null);
  useEffect(() => { fetchStatus().then(setS); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <nav className="sticky top-0 z-40 glass border-b" style={{ borderColor: 'var(--bd)' }}>
        <div className="max-w-[1100px] mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 h-14">
          <button onClick={onClose} className="flex items-center gap-2.5 group ring-focus rounded-md py-1 -ml-1 pr-2">
            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" style={{ color: 'var(--tx3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <img src="/logo.png" alt="" className="h-9 object-contain" />
          </button>
          <button onClick={onTheme} className="btn-ghost btn !p-2">
            {theme === 'dark' ? '◐' : '◑'}
          </button>
        </div>
      </nav>

      <main className="max-w-[760px] mx-auto px-5 sm:px-8 pt-12 pb-24">
        <p className="text-[11px] font-bold uppercase tracking-[.22em] mb-2" style={{ color: 'var(--red)' }}>About</p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight mb-3">A living archive</h1>
        <p className="text-base leading-relaxed mb-12" style={{ color: 'var(--tx2)' }}>
          The Muslim Lantern Archive is a fully automated, multi-cloud preservation system for
          every live broadcast from <a href="https://youtube.com/@TheMuslimLantern" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--red)' }}>The Muslim Lantern</a>.
          Every stream is recorded, mirrored to 6+ providers, transcribed and chaptered by AI, and made freely available — in perpetuity.
        </p>

        {s && (
          <section className="mesh rounded-2xl border p-6 mb-12" style={{ borderColor: 'var(--bd)' }}>
            <h2 className="font-display text-xl font-bold mb-4">By the numbers</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat label="Recordings" value={s.recordingsTotal.toString()} />
              <Stat label="Hours archived" value={s.totalHours.toFixed(1)} />
              <Stat label="Storage" value={`${s.totalSizeGb.toFixed(1)} GB`} />
              <Stat label="Last update" value={fmtRelative(s.updatedAt)} />
            </div>
          </section>
        )}

        <section className="mb-12">
          <h2 className="font-display text-xl font-bold mb-4">How it works</h2>
          <ol className="space-y-3 text-[14.5px] leading-relaxed list-none" style={{ color: 'var(--tx2)' }}>
            {[
              ['🛰️ Detect', 'A scheduled job polls the channel every 5 minutes via three independent methods.'],
              ['🎬 Record', 'When a live stream is detected, up to 9 different recording methods are tried in series until one succeeds. The primary methods (ytarchive, streamlink, yt-dlp android_vr) are cookieless and bypass YouTube\'s n-challenge.'],
              ['🛠️ Repair', 'Each recording is remuxed for streaming, validated for audio + video integrity, and optionally split at keyframes.'],
              ['☁️ Mirror', 'The file is uploaded in parallel to Archive.org, MEGA, Pixeldrain, Gofile, Telegram, and GitHub Releases — so no single provider going down ever takes a recording offline.'],
              ['🧠 Enrich', 'A nightly job sends each transcript to Gemini for chapter and guest detection, captures live-chat, and generates thumbnails.'],
              ['🌐 Publish', 'A static React + Vite site lists every recording with a multi-source player, live chat replay, full transcript search, and AI chapters.'],
            ].map(([t, d]) => (
              <li key={t} className="flex gap-3.5 items-start">
                <span className="shrink-0 text-xl mt-0.5">{t.split(' ')[0]}</span>
                <div>
                  <p className="font-semibold mb-0.5" style={{ color: 'var(--tx)' }}>{t.split(' ').slice(1).join(' ')}</p>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mb-12">
          <h2 className="font-display text-xl font-bold mb-4">Open source</h2>
          <p className="text-[14.5px] leading-relaxed mb-4" style={{ color: 'var(--tx2)' }}>
            The entire system — recording pipeline, mirroring scripts, AI enrichment, dashboard, the
            Cloudflare Worker, the Vercel edge functions — is open-source under the MIT license.
            Anyone can fork it and archive their own channel.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://github.com/usermuneeb1/Stream-Recorder" target="_blank" rel="noopener noreferrer" className="btn">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 00-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1.1-.8.1-.8.1-.8 1.2.1 1.9 1.3 1.9 1.3 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.4.8-1.7-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.3-3.2-.1-.3-.6-1.6.1-3.3 0 0 1-.3 3.3 1.2a11.5 11.5 0 016 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.7.2 3 .1 3.3.8.8 1.3 1.9 1.3 3.2 0 4.7-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0012 .3"/></svg>
              GitHub
            </a>
            <a href="/feed.xml" className="btn">📡 RSS</a>
            <a href="/podcast.xml" className="btn">🎙️ Podcast</a>
            <a href="/feed.json" className="btn">📦 JSON Feed</a>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold mb-4">Tech stack</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ['Recording',  'yt-dlp · ytarchive · streamlink · ffmpeg'],
              ['Orchestration', 'GitHub Actions · 35 workflows'],
              ['Storage',    'Archive.org · MEGA · Pixeldrain · GitHub Releases · Telegram'],
              ['CDN',        'Cloudflare Workers · Vercel Edge · jsDelivr'],
              ['AI',         'Gemini · Whisper · chat-downloader'],
              ['Dashboard',  'React 19 · Vite 8 · Vidstack · Tailwind'],
            ].map(([t, v]) => (
              <div key={t} className="rounded-lg border p-3" style={{ borderColor: 'var(--bd)', background: 'var(--bg2)' }}>
                <p className="text-[10px] uppercase tracking-[.18em] font-bold mb-1" style={{ color: 'var(--tx3)' }}>{t}</p>
                <p className="text-[12px]" style={{ color: 'var(--tx2)' }}>{v}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[.18em] font-bold mb-1.5" style={{ color: 'var(--tx3)' }}>{label}</p>
      <p className="font-display text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
