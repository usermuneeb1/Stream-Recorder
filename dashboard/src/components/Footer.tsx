export function Footer() {
  return (
    <footer className="border-t transition-colors" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-12 py-10 flex flex-col items-center gap-4">
        <img src="/logo-vertical.pn.jpg" alt="" className="w-16 h-16 rounded-2xl object-cover" />
        <img src="/logo.png" alt="Muslim Lantern Archive" className="h-6 object-contain opacity-70" />
        <p className="text-[12px] text-center max-w-sm" style={{ color: 'var(--text-muted)' }}>Preserving daʿwah content for the Ummah</p>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>© {new Date().getFullYear()} Muneeb Ahmad</p>
      </div>
    </footer>
  );
}
