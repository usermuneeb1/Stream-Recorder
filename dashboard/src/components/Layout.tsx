import React from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun, Settings, Video, LayoutDashboard } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Header = () => {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Home', icon: <LayoutDashboard size={18} /> },
    { path: '/gallery', label: 'Gallery', icon: <Video size={18} /> },
    { path: '/command-center', label: 'Command Center', icon: <Settings size={18} /> },
  ];

  return (
    <header className="sticky top-0 z-50 glass-panel border-b-0 border-x-0 rounded-none">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img 
            src="/logo-vertical.png" 
            alt="Logo" 
            className="w-10 h-10 object-contain drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" 
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <img 
            src="/logo-horizontal.png" 
            alt="The Muslim Lantern" 
            className="h-8 object-contain hidden sm:block" 
            onError={(e) => { 
              e.currentTarget.style.display = 'none'; 
              e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<span class="font-display font-bold text-lg tracking-tight">The Muslim Lantern</span>');
            }}
          />
        </Link>
        
        <nav className="hidden md:flex items-center gap-1 bg-dark-100/50 dark:bg-dark-800/50 p-1 rounded-full border border-dark-200 dark:border-dark-700">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path || (link.path === '/gallery' && location.pathname.startsWith('/watch'));
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`relative px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 rounded-full z-10 ${
                  isActive ? 'text-white' : 'text-dark-600 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 bg-brand-600 rounded-full -z-10 shadow-lg shadow-brand-500/20"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                {link.icon}
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2.5 rounded-full hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors text-dark-600 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white active:scale-95"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  
  return (
    <div className="min-h-screen flex flex-col selection:bg-brand-500/30">
      <Header />
      <main className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
};
