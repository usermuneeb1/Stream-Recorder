export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5 bg-[#0a0a0a]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Left */}
          <div className="flex items-center gap-3">
            <img
              src="/logo-vertical.pn.jpg"
              alt="The Muslim Lantern"
              className="w-7 h-7 rounded-full object-cover"
            />
            <div>
              <p className="text-[13px] text-[#aaa]">
                ☪️ The Muslim Lantern — Stream Archive
              </p>
              <p className="text-[11px] text-[#555]">
                Preserving daʿwah content for the Ummah
              </p>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-6 text-[11px] text-[#555]">
            <a
              href="https://youtube.com/@TheMuslimLantern"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              YouTube
            </a>
            <span>© {year} Muneeb Ahmad. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
