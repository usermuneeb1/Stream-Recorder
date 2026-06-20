import { useState, useEffect, useCallback, useRef } from 'react';
import { MediaPlayer, MediaProvider, type MediaPlayerInstance } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import type { Recording } from '../utils/dataFetcher';

interface Props {
  rec: Recording;
  onClose: () => void;
  allRecordings: Recording[];
  onNavigate: (rec: Recording) => void;
}

function getPlaybackUrl(rec: Recording): string {
  return (
    rec.githubDirect || rec.githubRelease ||
    rec.archiveNode || rec.archiveDirect ||
    rec.r2Link || ''
  );
}

function getDownloads(rec: Recording): { label: string; url: string; icon: string }[] {
  const links: { label: string; url: string; icon: string }[] = [];
  if (rec.githubRelease) links.push({ label: 'Fast Download', url: rec.githubRelease, icon: '⚡' });
  if (rec.archiveLink) links.push({ label: 'Archive.org', url: rec.archiveLink, icon: '🏛️' });
  if (rec.megaLink) links.push({ label: 'MEGA', url: rec.megaLink, icon: '🔴' });
  if (rec.pixeldrainLink) links.push({ label: 'Pixeldrain', url: rec.pixeldrainLink, icon: '📥' });
  if (rec.gofileLink) links.push({ label: 'Gofile', url: rec.gofileLink, icon: '📁' });
  if (rec.gdriveLink) links.push({ label: 'Google Drive', url: rec.gdriveLink, icon: '🟢' });
  if (rec.telegramLink) links.push({ label: 'Telegram', url: rec.telegramLink, icon: '📱' });
  return links;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function WatchModal({ rec, onClose, allRecordings, onNavigate }: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const [tab, setTab] = useState<'downloads' | 'chapters'>('downloads');
  const playUrl = getPlaybackUrl(rec);
  const downloads = getDownloads(rec);
  const chapters = rec.aiChapters || [];
  const others = allRecordings.filter(r => r.videoId !== rec.videoId).slice(0, 6);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const seekTo = useCallback((sec: number) => {
    const player = playerRef.current;
    if (player) {
      player.currentTime = sec;
      player.play().catch(() => {});
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-[#0f0f0f] overflow-y-auto" onClick={onClose}>
      <div className="min-h-screen flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#0f0f0f]">
          <button onClick={onClose} className="text-white/70 hover:text-white flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <a
            href={rec.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#717171] hover:text-white text-xs"
          >
            Watch on YouTube ↗
          </a>
        </div>

        {/* Vidstack Player */}
        <div className="w-full max-w-5xl mx-auto px-4">
          {playUrl ? (
            <MediaPlayer
              ref={playerRef}
              src={playUrl}
              viewType="video"
              streamType="on-demand"
              crossOrigin=""
              playsInline
              autoPlay
              className="w-full aspect-video rounded-xl overflow-hidden bg-black"
            >
              <MediaProvider />
              <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>
          ) : (
            <div className="w-full aspect-video rounded-xl bg-[#181818] flex items-center justify-center text-[#717171]">
              <div className="text-center">
                <p className="text-lg mb-2">No direct playback available</p>
                <p className="text-sm">Use the download links below</p>
              </div>
            </div>
          )}
        </div>

        {/* Info + Sidebar */}
        <div className="max-w-5xl mx-auto w-full px-4 mt-4 pb-12">
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Left */}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-white leading-snug">{rec.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-[13px] text-[#aaa]">
                <span>{rec.date}</span>
                <span className="text-[#555]">•</span>
                <span>{rec.durationFmt}</span>
                <span className="text-[#555]">•</span>
                <span>{rec.sizeHuman}</span>
                {rec.resolution && (
                  <>
                    <span className="text-[#555]">•</span>
                    <span className="text-red-500 font-medium">{rec.resolution.includes('1080') ? 'HD' : rec.resolution}</span>
                  </>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-5 border-b border-[#272727]">
                <button
                  onClick={() => setTab('downloads')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    tab === 'downloads'
                      ? 'text-white border-b-2 border-red-500'
                      : 'text-[#717171] hover:text-white'
                  }`}
                >
                  Downloads ({downloads.length})
                </button>
                {chapters.length > 0 && (
                  <button
                    onClick={() => setTab('chapters')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      tab === 'chapters'
                        ? 'text-white border-b-2 border-red-500'
                        : 'text-[#717171] hover:text-white'
                    }`}
                  >
                    Chapters ({chapters.length})
                  </button>
                )}
              </div>

              <div className="mt-4">
                {tab === 'downloads' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {downloads.map((dl, i) => (
                      <a
                        key={i}
                        href={dl.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#252525] rounded-lg px-3 py-2.5 text-sm text-white transition-colors"
                      >
                        <span>{dl.icon}</span>
                        <span className="truncate">{dl.label}</span>
                      </a>
                    ))}
                    {downloads.length === 0 && (
                      <p className="text-[#717171] text-sm col-span-full">No download links available yet.</p>
                    )}
                  </div>
                )}

                {tab === 'chapters' && (
                  <div className="space-y-1">
                    {chapters.map((ch, i) => (
                      <button
                        key={i}
                        onClick={() => seekTo(ch.time)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#1a1a1a] text-left transition-colors group"
                      >
                        <span className="text-xs text-red-400 font-mono w-14 shrink-0 tabular-nums">
                          {formatTime(ch.time)}
                        </span>
                        <span className="text-sm text-[#ddd] group-hover:text-white">{ch.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: More streams */}
            {others.length > 0 && (
              <div className="lg:w-80 shrink-0">
                <h3 className="text-sm font-medium text-[#aaa] mb-3">More Streams</h3>
                <div className="space-y-3">
                  {others.map(o => (
                    <button
                      key={o.videoId}
                      onClick={() => onNavigate(o)}
                      className="flex gap-3 w-full text-left group"
                    >
                      <div className="w-40 shrink-0 aspect-video rounded-lg overflow-hidden bg-[#181818]">
                        <img
                          src={o.thumbnail}
                          alt={o.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] text-white font-medium line-clamp-2 leading-snug">{o.title}</p>
                        <p className="text-[11px] text-[#717171] mt-1">{o.date} • {o.durationFmt}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
