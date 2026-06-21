export function Header({ q, setQ, theme, toggle }: { q: string; setQ: (v: string)=>void; theme: string; toggle: ()=>void }) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-2xl border-b" style={{background:'var(--glass)',borderColor:'var(--bd)'}}>
      <div className="max-w-[1400px] mx-auto flex items-center gap-4 px-4 sm:px-6 lg:px-10 h-[72px]">
        <a href="#" onClick={()=>{window.location.hash='';}} className="shrink-0">
          <img src="/logo.png" alt="Muslim Lantern Archive" className="h-14 sm:h-16 object-contain"/>
        </a>
        <div className="flex-1"/>
        <div className="w-full max-w-xs relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{color:'var(--tx3)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search..."
            className="w-full rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 transition-all"
            style={{background:'var(--bg3)',border:'1px solid var(--bd2)',color:'var(--tx)'}}/>
        </div>
        <button onClick={toggle} className="p-2.5 rounded-xl transition-all hover:scale-105" style={{background:'var(--bg3)',color:'var(--tx3)'}}>
          {theme==='dark'
            ?<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="5" strokeWidth={2}/><path strokeLinecap="round" strokeWidth={2} d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            :<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>}
        </button>
      </div>
    </header>
  );
}
