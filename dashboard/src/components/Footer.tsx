export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t transition-colors" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 py-10">
        <div className="flex flex-col items-center gap-5">
          {/* Vertical Logo */}
          <img src="/logo-vertical.pn.jpg" alt="The Muslim Lantern" className="w-20 h-20 rounded-2xl object-cover shadow-lg" />
          <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            ☪️ The Muslim Lantern — Stream Archive
          </p>
          <p className="text-[13px] text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
            Preserving daʿwah content for the Ummah. All recordings are archived permanently for the benefit of the community.
          </p>
          <div className="flex items-center gap-5 mt-1">
            <a href="https://youtube.com/@TheMuslimLantern" target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium transition-colors hover:underline" style={{ color: 'var(--text-secondary)' }}>YouTube Channel</a>
          </div>
          <p className="text-[12px] mt-2" style={{ color: 'var(--text-muted)' }}>© {year} Muneeb Ahmad. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
