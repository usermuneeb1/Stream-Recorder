/* ════ THE MUSLIM LANTERN — CINEMATIC ARCHIVE ════ */
'use strict';

const REC_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main/data/recordings.json';
const STS_URL = 'https://raw.githubusercontent.com/usermuneeb1/Stream-Recorder/main/stats.json';

let allRecs = [], filtered = [];
let player = null, chatData = [], chatPtr = 0;
let currentRec = null, deleteTarget = null;

const LS = {
  g: (k,d) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } },
  s: (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch{} },
  set: (k) => new Set(LS.g(k, [])),
  addS: (k,v) => { const s = LS.set(k); s.add(v); LS.s(k, [...s]) },
  delS: (k,v) => { const s = LS.set(k); s.delete(v); LS.s(k, [...s]) }
};

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initModals();
  loadData();
});

// Utility
const X = (s) => { const d=document.createElement('div'); d.innerText=s||''; return d.innerHTML; };
function fmtDate(s) {
  if(!s) return '';
  const d=new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// Nav Scroll
function initNav() {
  window.addEventListener('scroll', () => {
    document.querySelector('nav').classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });

  const input = document.getElementById('srch');
  input.addEventListener('input', () => {
    applyFilter(input.value);
  });
}

// Data Fetch
async function loadData() {
  try {
    const res = await fetch(`${REC_URL}?_=${Date.now()}`);
    if (!res.ok) throw new Error();
    allRecs = await res.json();
    if (!Array.isArray(allRecs)) allRecs = [];
    applyFilter('');
  } catch (e) {
    console.warn(e);
    document.getElementById('hero').innerHTML = `<div style="padding-top:150px; text-align:center;">Could not load data.</div>`;
  }
}

// Filter & Render
function applyFilter(q) {
  const hidden = LS.set('ml_hidden');
  const perm = LS.set('ml_perm');

  filtered = allRecs.filter(r => {
    const id = r.video_id || '';
    if (perm.has(id)) return false;
    if (hidden.has(id)) return false; // Not supporting complex toggles in this minimalist clone UI currently
    if (q && !`${r.title} ${r.channel} ${r.date}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  renderTray();
  if (filtered.length > 0) {
    setHero(filtered[0]);
  }
}

function renderTray() {
  const tray = document.getElementById('grid');
  tray.innerHTML = '';
  filtered.forEach((r, i) => {
    const id = r.video_id || `r${i}`;
    const thumb = r.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
    const dlUrl = r.pixeldrain_link || r.archive_link || r.gofile_link || '';
    
    // Check progress
    const prog = LS.g(`ml_p_${id}`, null);
    const pct = prog ? Math.min(100, (prog.t / (prog.d || 1)) * 100) : 0;

    const c = document.createElement('article');
    c.className = 'card';
    c.dataset.id = id;
    
    c.innerHTML = `
      <img src="${X(thumb)}" class="c-thumb" alt="${X(r.title)}" loading="lazy">
      ${r.duration_fmt ? `<div class="c-dur">${X(r.duration_fmt)}</div>` : ''}
      <div class="c-overlay">
        <div class="c-acts">
          <button data-act="del" data-id="${X(id)}" data-title="${X(r.title)}" title="Remove">🗑</button>
        </div>
        <div class="c-info">
          <div class="c-info-title">${X(r.title)}</div>
          <div class="c-info-meta">${fmtDate(r.date)} ${r.resolution ? ` • ${X(r.resolution)}` : ''}</div>
        </div>
      </div>
      <div class="c-pbar"><div class="c-pbar-fill" style="width:${pct}%"></div></div>
    `;

    c.addEventListener('mouseenter', () => setHero(r));
    c.onclick = (e) => {
      if (e.target.closest('button')) return;
      openPlayer(r);
    };

    const delBtn = c.querySelector('[data-act="del"]');
    delBtn.onclick = (e) => {
      e.stopPropagation();
      openDelModal(id, r.title, c);
    };

    tray.appendChild(c);
  });
}

function setHero(r) {
  const bg = document.getElementById('hero-bg');
  const title = document.getElementById('hero-title');
  const meta = document.getElementById('hero-meta');
  const chan = document.getElementById('hero-chan');
  
  const id = r.video_id || '';
  const thumb = r.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  
  bg.style.backgroundImage = `url('${thumb}')`;
  title.innerHTML = X(r.title || 'Untitled');
  chan.innerHTML = X(r.channel || 'The Muslim Lantern');
  
  let mHTML = '';
  if (r.duration_fmt) mHTML += `<span>${X(r.duration_fmt)}</span>`;
  if (r.date) mHTML += `<span>${fmtDate(r.date)}</span>`;
  if (r.resolution) mHTML += `<span class="res">${X(r.resolution)}</span>`;
  if (r.size_human) mHTML += `<span>${X(r.size_human)}</span>`;
  
  meta.innerHTML = mHTML;
  document.getElementById('btn-play').onclick = () => openPlayer(r);
}

// Modals
function initModals() {
  document.getElementById('pm-close').onclick = closePlayer;
  
  const dm = document.getElementById('del-bg');
  document.getElementById('del-cancel').onclick = () => dm.classList.remove('act');
  document.getElementById('del-hide').onclick = () => execDel('hide');
  document.getElementById('del-perm').onclick = () => execDel('perm');
}

function openDelModal(id, title, cardNode) {
  deleteTarget = { id, title, cardNode };
  document.getElementById('del-bg').classList.add('act');
}

function execDel(type) {
  if (!deleteTarget) return;
  const { id, cardNode } = deleteTarget;
  if(type==='hide') LS.addS('ml_hidden', id);
  if(type==='perm') LS.addS('ml_perm', id);
  
  cardNode.style.opacity = '0';
  cardNode.style.transform = 'scale(0.8)';
  setTimeout(() => {
    cardNode.remove();
    applyFilter(document.getElementById('srch').value);
  }, 300);
  
  document.getElementById('del-bg').classList.remove('act');
  toast('Stream removed from view.');
}

// Player
async function openPlayer(r) {
  currentRec = r;
  document.getElementById('player-bg').classList.add('act');
  document.body.style.overflow = 'hidden';
  
  const wrap = document.getElementById('player-container');
  const pd = r.pixeldrain_link;
  const ar = r.archive_link;
  const gf = r.gofile_link;
  
  document.getElementById('vi-title').innerHTML = X(r.title);
  
  const srcCont = document.getElementById('vi-sources');
  srcCont.innerHTML = '';
  
  if (pd) srcCont.innerHTML += `<button class="vi-src" onclick="window.open('${pd}','_blank')">Pixeldrain</button>`;
  if (gf) srcCont.innerHTML += `<button class="vi-src gofile" onclick="window.open('${gf}','_blank')">Gofile ↗</button>`;
  if (ar) srcCont.innerHTML += `<button class="vi-src" onclick="window.open('${ar}','_blank')">Archive.org</button>`;
  
  // Set up video native
  let vUrl = null;
  if (pd) {
    const id = pd.split('/').pop();
    vUrl = `https://pixeldrain.com/api/file/${id}`;
  } else if (ar) {
    try {
      const match = ar.match(/details\/([^\/]+)/);
      if(match) {
        const arId = match[1];
        const m = await fetch(`https://archive.org/metadata/${arId}`).then(x=>x.json());
        const f = m.files.find(f=>f.name.endsWith('.mp4'));
        if(f) vUrl = `https://archive.org/download/${arId}/${f.name}`;
      }
    } catch(e){}
  }

  wrap.innerHTML = '';
  if (!vUrl) {
    wrap.innerHTML = `<div style="color:white;padding:2rem;text-align:center;">No direct stream available. Use download links below.</div>`;
  } else {
    const vd = document.createElement('video');
    vd.src = vUrl;
    vd.controls = true;
    vd.style.width = '100%';
    vd.style.height = '100%';
    vd.style.outline = 'none';
    vd.autoplay = true;
    wrap.appendChild(vd);
    
    // simple plyr init
    player = new Plyr(vd, {
      speed: { selected: 1, options: [0.5, 1, 1.25, 1.5, 2, 5, 10] },
      keyboard: { global: true }
    });
    
    // Local storage progression tracking
    const lk = `ml_p_${r.video_id}`;
    const pInfo = LS.g(lk, null);
    player.on('loadedmetadata', () => {
      if(pInfo && pInfo.t < player.duration - 10) {
        player.currentTime = pInfo.t;
      }
    });
    player.on('timeupdate', () => {
      if(!player.paused && player.duration) {
        LS.s(lk, { t: player.currentTime, d: player.duration });
      }
    });
  }
}

function closePlayer() {
  document.getElementById('player-bg').classList.remove('act');
  document.body.style.overflow = '';
  if (player) {
    player.destroy();
    player = null;
  }
  document.getElementById('player-container').innerHTML = '';
  // re-render the tray to update progress bar lines instantly
  applyFilter(document.getElementById('srch').value);
}
