export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo-vertical.pn.jpg" alt="" className="w-8 h-8 rounded-full object-cover" />
            <div>
              <p className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                ☪️ The Muslim Lantern — Stream Archive
              </p>
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                Preserving daʿwah content for the Ummah
              </p>
            </div>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            © {year} Muneeb Ahmad. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
