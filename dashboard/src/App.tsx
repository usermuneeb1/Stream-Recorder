// The Lantern Archive — app shell.
// Hash routing, archive + YouTube-channel data loading, overlays, toasts,
// and the home composition: trailer billboard → continue → channel shelves.
// Shorts live in their own snap-scroll cinema (#/shorts).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Ep, Route, StreamPrediction, SystemStatus } from './types';
import { enrichRecordings, enrichYouTube } from './lib/enrich';
import { fetchAllYouTube, fetchMirrorHealth, fetchPrediction, fetchRecordings, fetchStatus, fetchTopics, fetchYouTubeFeed } from './lib/fetcher';
import { getList, toggleList as toggleStore } from './lib/storage';
import { initAnalytics, track } from './lib/analytics';
import { nav } from './components/Nav';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import Hero from './components/Hero';
import Shelf from './components/Shelf';
import ContinueShelf from './components/ContinueShelf';
import BrowsePage from './components/BrowsePage';
import ChannelPage from './components/ChannelPage';
import WatchPage from './components/WatchPage';
import ShortsPage from './components/ShortsPage';
import SystemPage from './components/SystemPage';
import InsightsPage from './components/InsightsPage';
import SearchOverlay from './components/SearchOverlay';
import CommandPalette from './components/CommandPalette';
import DetailsModal from './components/DetailsModal';
import Footer from './components/Footer';
import Splash from './components/Splash';
import Toast from './components/Toast';
import NotFound from './components/NotFound';
import { HomeSkeleton } from './components/Skeletons';

function parseHash(all: Ep[]): Route {
  const h = decodeURIComponent(window.location.hash || '#/');
  if (h.startsWith('#/watch/')) {
    const id = h.slice('#/watch/'.length).split('?')[0];
    const rec = all.find(r => r.videoId === id);
    return rec ? { kind: 'watch', rec } : all.length ? { kind: 'notfound' } : { kind: 'watch-pending', id };
  }
  if (h.startsWith('#/browse')) return { kind: 'browse' };
  if (h.startsWith('#/channel')) return { kind: 'channel' };
  if (h.startsWith('#/shorts')) return { kind: 'shorts' };
  if (h.startsWith('#/system')) return { kind: 'system' };
  if (h.startsWith('#/stats')) return { kind: 'stats' };
  if (h.startsWith('#/my-list')) return { kind: 'mylist' };
  if (h.startsWith('#/404')) return { kind: 'notfound' };
  return { kind: 'home' };
}

export default function App() {
  const [recs, setRecs] = useState<Ep[]>([]);      // archive recordings (forced ones excluded)
  const [ytLong, setYtLong] = useState<Ep[]>([]);  // channel long-form videos
  const [ytShorts, setYtShorts] = useState<Ep[]>([]); // channel shorts
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<Route>(() => parseHash([]));
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [prediction, setPrediction] = useState<StreamPrediction | null>(null);
  const [live, setLive] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [details, setDetails] = useState<Ep | null>(null);
  const [listTick, setListTick] = useState(0);

  /* ── Data ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    initAnalytics();
    let alive = true;
    (async () => {
      const [raw, st, pr, all, fed, topics, mh] = await Promise.all([
        fetchRecordings(),
        fetchStatus().catch(() => null),
        fetchPrediction().catch(() => null),
        fetchAllYouTube().catch(() => []),
        fetchYouTubeFeed().catch(() => ({ videos: [], shorts: [] })),
        fetchTopics().catch(() => ({})),
        fetchMirrorHealth().catch(() => ({} as Record<string, string[]>)),
      ]);
      if (!alive) return;
      setRecs(enrichRecordings(raw, topics)
        .filter(r => !r.isForced)
        .map(r => ({ ...r, deadMirrors: mh[r.videoId] })));
      setStatus(st);
      setPrediction(pr);
      setYtLong(all.map(v => enrichYouTube(v, false, topics)));
      setYtShorts(fed.shorts.map(v => enrichYouTube(v, true, topics)));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  /* ── Derived library ──────────────────────────────────────────────── */
  // Watchable library, newest first: archive (richest metadata) + channel
  // long-form. Shorts stay out — they live in their own cinema.
  const all = useMemo(() => {
    const seen = new Set(recs.map(r => r.videoId));
    return [...recs, ...ytLong.filter(f => !seen.has(f.videoId))]
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [recs, ytLong]);

  /* ── Routing ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const apply = () => setRoute(parseHash(all));
    const sync = () => {
      // Crossfade route changes through the View Transitions API where
      // supported (progressive enhancement — instant switch elsewhere).
      const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      if (typeof doc.startViewTransition === 'function') {
        doc.startViewTransition(() => flushSync(apply));
      } else {
        apply();
      }
      if (!window.location.hash.startsWith('#/watch')) window.scrollTo({ top: 0 });
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [all]);

  /* ── Global keyboard ──────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (searchOpen) { setSearchOpen(false); return; }
        setSearchOpen(false);
        setCmdOpen(v => !v);
      } else if (e.key === '/' && !typing && !searchOpen && !cmdOpen && !details) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen, cmdOpen, details]);

  /* ── Actions ──────────────────────────────────────────────────────── */
  const toast = useCallback((msg: string) => setToastMsg(msg), []);

  const open = useCallback((ep: Ep) => {
    track('watch', { id: ep.videoId });
    nav(`#/watch/${encodeURIComponent(ep.videoId)}`);
  }, []);

  const toggleList = useCallback((id: string) => {
    const now = toggleStore(id);
    setListTick(t => t + 1);
    toast(now ? 'Added to My List' : 'Removed from My List');
  }, [toast]);

  const surprise = useCallback(() => {
    if (!all.length) return;
    const pick = all[Math.floor(Math.random() * all.length)];
    toast(`🎲 Surprise: ${pick.title.slice(0, 40)}…`);
    open(pick);
  }, [all, open, toast]);

  const listedIds = useMemo(() => new Set(getList()), [listTick, route.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeWatch = useCallback(() => nav('#/'), []);

  /* ── Render ───────────────────────────────────────────────────────── */
  const isWatch = route.kind === 'watch' || route.kind === 'watch-pending';

  return (
    <div className="relative min-h-dvh" style={{ background: 'var(--ink-0)' }}>
      <Splash />
      <div className="ambient-light" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      {!isWatch && (
        <TopBar
          route={route.kind}
          listCount={listedIds.size}
          onSearch={() => setSearchOpen(true)}
          onCommand={() => setCmdOpen(true)}
          onLive={setLive}
        />
      )}

      <main className="relative z-[1]">
        {loading ? (
          <HomeSkeleton />
        ) : route.kind === 'home' ? (
          <div className="page-enter" key="home">
            <Hero
              recs={[...recs, ...ytLong.filter(v => !recs.some(r => r.videoId === v.videoId))]}
              live={live}
              prediction={prediction}
              listedIds={listedIds}
              onOpen={open}
              onDetails={setDetails}
              onToggleList={toggleList}
            />

            <div className="relative z-[2] -mt-[6vh] lg:-mt-[8vh] pb-10 flex flex-col gap-10 md:gap-12">
              <ContinueShelf recs={all} onOpen={open} />
              {recs.length > 0 && (
                <Shelf
                  label="The Archive"
                  hint={`${recs.length} preserved recording${recs.length === 1 ? '' : 's'}`}
                  recs={recs}
                  listedIds={listedIds}
                  onOpen={open}
                  onDetails={setDetails}
                  onToggleList={toggleList}
                />
              )}
              {ytLong.length > 0 && (
                <>
                  <Shelf
                    label="Latest from YouTube"
                    hint="straight from the channel"
                    recs={ytLong.slice(0, 14)}
                    listedIds={listedIds}
                    onOpen={open}
                    onDetails={setDetails}
                    onToggleList={toggleList}
                  />
                  {ytLong.length > 14 && (
                    <Shelf
                      label="More from the channel"
                      hint={`${ytLong.length - 14} more video${ytLong.length - 14 === 1 ? '' : 's'}`}
                      recs={ytLong.slice(14)}
                      listedIds={listedIds}
                      onOpen={open}
                      onDetails={setDetails}
                      onToggleList={toggleList}
                    />
                  )}
                </>
              )}
              {ytShorts.length > 0 && (
                <section className="shelf reveal-on-scroll">
                  <div className="shelf-head">
                    <span className="shelf-tick" />
                    <span className="eyebrow">Shorts</span>
                    <span className="mono text-[10px]" style={{ color: 'var(--shade)' }}>
                      {ytShorts.length} vertical cuts
                    </span>
                    <a href="#/shorts" className="mono text-[10px] ml-auto flex items-center gap-1.5 transition-colors"
                      style={{ color: 'var(--flame-1)' }}>
                      Open the shorts cinema
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                    </a>
                  </div>
                  <div className="relative">
                    <div className="shelf-track">
                      {ytShorts.slice(0, 12).map((s, i) => (
                        <a
                          key={s.videoId}
                          href="#/shorts"
                          className="card group !w-[132px] md:!w-[150px] reveal-on-scroll"
                          style={{ animationDelay: `${i * 45}ms` }}
                          aria-label={`Shorts: ${s.title}`}
                        >
                          <div className="card-art !aspect-[9/16]">
                            <img src={s.thumbnail} alt="" loading="lazy" draggable={false}
                              onError={e => { (e.target as HTMLImageElement).src = '/thumbnail.jpg'; }} />
                            <div className="card-shade" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="orb" style={{ width: 40, height: 40 }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
                              </span>
                            </div>
                            <span className="mono absolute bottom-2 left-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded line-clamp-2 leading-tight"
                              style={{ background: 'rgba(8,4,5,.72)', color: '#fff' }}>
                              {s.title}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </section>
              )}
            </div>

            <Footer recs={recs} status={status} />
          </div>
        ) : route.kind === 'browse' ? (
          <div className="page-enter" key="browse">
            <BrowsePage
              title="The Archive"
              subtitle="Every preserved recording — filter by month and quality, or search by title and date."
              recs={recs}
              listedIds={listedIds}
              onOpen={open}
              onDetails={setDetails}
              onToggleList={toggleList}
            />
            <Footer recs={recs} status={status} />
          </div>
        ) : route.kind === 'channel' ? (
          <div className="page-enter" key="channel">
            <ChannelPage
              videos={ytLong}
              listedIds={listedIds}
              onOpen={open}
              onDetails={setDetails}
              onToggleList={toggleList}
            />
            <Footer recs={recs} status={status} />
          </div>
        ) : route.kind === 'shorts' ? (
          <div key="shorts">
            <ShortsPage shorts={ytShorts} />
          </div>
        ) : route.kind === 'system' ? (
          <div className="page-enter" key="system">
            <SystemPage recs={recs} status={status} prediction={prediction} ytCount={ytLong.length} />
            <Footer recs={recs} status={status} />
          </div>
        ) : route.kind === 'stats' ? (
          <div className="page-enter" key="stats">
            <InsightsPage recs={recs} status={status} prediction={prediction} />
            <Footer recs={recs} status={status} />
          </div>
        ) : route.kind === 'mylist' ? (
          <div className="page-enter" key="mylist">
            <BrowsePage
              title="My List"
              subtitle={`${all.filter(r => listedIds.has(r.videoId)).length} saved video${all.filter(r => listedIds.has(r.videoId)).length === 1 ? '' : 's'} — kept on this device, ready when you are.`}
              recs={all.filter(r => listedIds.has(r.videoId))}
              listedIds={listedIds}
              onOpen={open}
              onDetails={setDetails}
              onToggleList={toggleList}
            />
            <Footer recs={recs} status={status} />
          </div>
        ) : route.kind === 'watch' ? (
          <WatchPage
            key={route.rec.videoId}
            rec={route.rec}
            recs={all}
            onClose={closeWatch}
            onOpen={open}
            toast={toast}
          />
        ) : route.kind === 'watch-pending' ? (
          <div className="min-h-dvh flex flex-col items-center justify-center gap-6">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--flame-1)', boxShadow: '0 0 22px 7px var(--flame-glow)', animation: 'flame-flicker 2s ease-in-out infinite' }} />
            <span className="mono text-[11px] tracking-[0.24em] uppercase" style={{ color: 'var(--mist)' }}>Loading recording…</span>
          </div>
        ) : (
          <div className="page-enter" key="notfound">
            <NotFound />
          </div>
        )}
      </main>

      {!isWatch && (
        <TabBar route={route.kind} onSearch={() => setSearchOpen(true)} />
      )}

      {/* Overlays */}
      {searchOpen && (
        <SearchOverlay
          recs={all}
          listedIds={listedIds}
          onOpen={open}
          onDetails={setDetails}
          onToggleList={toggleList}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {cmdOpen && (
        <CommandPalette
          recs={all}
          onOpen={open}
          onSearch={() => setSearchOpen(true)}
          onSurprise={surprise}
          onClose={() => setCmdOpen(false)}
        />
      )}
      {details && (
        <DetailsModal
          ep={details}
          recs={all}
          listed={listedIds.has(details.videoId)}
          onOpen={open}
          onToggleList={toggleList}
          onClose={() => setDetails(null)}
        />
      )}
      {toastMsg && <Toast msg={toastMsg} onDone={() => setToastMsg('')} />}
    </div>
  );
}
