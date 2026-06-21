export function Footer() {
  return (
    <footer className="border-t" style={{borderColor:'var(--bd)',background:'var(--bg2)'}}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-12 flex flex-col items-center gap-5">
        <img src="/logo-vertical.pn.jpg" alt="" className="w-20 h-20 rounded-3xl object-cover shadow-xl ring-1 ring-white/10"/>
        <img src="/logo.png" alt="Muslim Lantern Archive" className="h-7 object-contain opacity-50"/>
        <p className="text-[13px] text-center max-w-sm leading-relaxed" style={{color:'var(--tx3)'}}>Preserving dawah content for the Ummah.<br/>All recordings are archived permanently.</p>
        <a href="https://youtube.com/@TheMuslimLantern" target="_blank" rel="noopener noreferrer" className="text-xs font-bold hover:underline" style={{color:'var(--red)'}}>YouTube Channel</a>
        <p className="text-[11px]" style={{color:'var(--tx3)'}}>© {new Date().getFullYear()} Muneeb Ahmad. All rights reserved.</p>
      </div>
    </footer>
  );
}
