export function Footer(){
  return(
    <footer className="border-t" style={{borderColor:'var(--bd)',background:'var(--bg2)'}}>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/logo-vertical.pn.jpg" alt="" className="w-8 h-8 rounded-lg object-cover"/>
          <span className="text-[12px] font-medium" style={{color:'var(--tx2)'}}>Muslim Lantern Archive</span>
        </div>
        <div className="flex items-center gap-4 text-[11px]" style={{color:'var(--tx3)'}}>
          <a href="https://youtube.com/@TheMuslimLantern" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{color:'var(--red)'}}>YouTube</a>
          <span>© {new Date().getFullYear()} Muneeb Ahmad</span>
        </div>
      </div>
    </footer>
  );
}
