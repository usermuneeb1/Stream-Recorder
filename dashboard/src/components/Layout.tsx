import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Terminal, LogOut, Sun, Moon, Gamepad2 } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from 'framer-motion';
import { ScrollProgress } from './ScrollProgress';
import { IslamicPattern } from './IslamicPattern';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { role, logout } = useAuth();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > previous && latest > 150) {
      setHidden(true);
    } else {
      setHidden(false);
    }
    setScrolled(latest > 20);
  });

  // ── Cursor Glow ──────────────────────────────────────────────
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
    document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
  }, []);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 relative group ${
      isActive
        ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 shadow-sm'
        : 'text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-dark-800'
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-dark-50 dark:bg-[#09090b] text-dark-900 dark:text-dark-50 transition-colors duration-300" onMouseMove={handleMouseMove}>
      {/* Scroll Progress Bar */}
      <ScrollProgress />

      {/* Aurora Background */}
      <div className="aurora-bg" aria-hidden="true">
        <div className="aurora-blob-3" />
      </div>

      {/* Cursor Glow */}
      <div className="cursor-glow hidden lg:block" aria-hidden="true" />

      {/* ── Navbar ────────────────────────────────────────────────── */}
      <motion.nav
        variants={{ visible: { y: 0 }, hidden: { y: "-100%" } }}
        animate={hidden ? "hidden" : "visible"}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-white/80 dark:bg-dark-900/80 backdrop-blur-2xl shadow-lg shadow-black/5 dark:shadow-black/20'
            : 'bg-white/50 dark:bg-dark-900/50 backdrop-blur-xl'
        }`}
      >
        {/* Animated gradient line at bottom */}
        <div className="navbar-gradient-line" />

        <div className="w-full px-4 md:px-8 lg:px-12 h-16 flex items-center justify-between">
          {/* Logo */}
          <NavLink to="/" className="flex items-center group -ml-2 focus:outline-none outline-none">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="relative"
            >
              {/* Logo glow */}
              <motion.div
                animate={{
                  opacity: [0.3, 0.6, 0.3],
                  scale: [1, 1.1, 1],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-brand-500/20 rounded-full blur-xl pointer-events-none"
              />
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="The Muslim Lantern"
                className="h-10 md:h-12 lg:h-14 w-auto object-contain relative z-10 transition-all duration-500"
              />
            </motion.div>
          </NavLink>

          {/* Nav Links */}
          <div className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/" className={navLinkClass}>
              <Home size={18} />
              <span className="hidden sm:block">Home</span>
            </NavLink>

            <NavLink to="/gallery" className={navLinkClass}>
              <LayoutGrid size={18} />
              <span className="hidden sm:block">Gallery</span>
            </NavLink>

            {role === 'admin' && (
              <NavLink to="/command-center" className={navLinkClass}>
                <Terminal size={18} />
                <span className="hidden sm:block">Command Center</span>
              </NavLink>
            )}

            <div className="w-px h-6 bg-dark-200 dark:bg-dark-800 mx-1 sm:mx-2" />

            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.1, rotate: 15 }}
              whileTap={{ scale: 0.9 }}
              onClick={toggleTheme}
              className="p-2 rounded-xl hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
            >
              <AnimatePresence mode="wait">
                {theme === 'dark' ? (
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun size={18} />
                  </motion.div>
                ) : (
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon size={18} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Logout */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={logout}
              title="Lock Archives"
              className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={18} />
            </motion.button>
          </div>
        </div>
      </motion.nav>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <main className="flex-1 relative z-10 pt-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Premium Footer ────────────────────────────────────────── */}
      <footer className="relative z-10 mt-16">
        {/* Islamic Pattern Divider */}
        <IslamicPattern />

        <div className="py-10 px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-2xl mx-auto"
          >
            {/* Logo */}
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="The Muslim Lantern"
              className="h-8 w-auto object-contain mx-auto mb-4 opacity-40"
            />

            <p className="text-dark-400 text-sm mb-2">
              Built with <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="inline-block text-brand-500"
              >❤️</motion.span> by Muneeb Ahmad
            </p>

            <p className="text-dark-400/60 text-xs">
              Preserving dawah content for the Ummah • est. May 2026
            </p>

            {/* System status */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-dark-400/60">Recording system active</span>
            </div>
          </motion.div>
        </div>
      </footer>
    </div>
  );
};
