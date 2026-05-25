import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, LayoutGrid, Terminal, LogOut, Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { role, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-dark-50 dark:bg-[#09090b] text-dark-900 dark:text-dark-50 transition-colors duration-300">
      <nav className="sticky top-0 z-50 glass-panel border-b border-dark-200 dark:border-dark-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <NavLink to="/" className="flex items-center group -translate-x-4 md:-translate-x-6 lg:-translate-x-12 overflow-visible">
            <img 
              src="/Stream-Recorder/logo.png" 
              alt="The Muslim Lantern" 
              className="h-10 md:h-14 w-auto object-contain transition-transform group-hover:scale-105 drop-shadow-md"
            />
          </NavLink>

          <div className="flex items-center gap-1 sm:gap-2">
            <NavLink to="/" className={({isActive}) => `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-500' : 'hover:bg-dark-100 dark:hover:bg-dark-800'}`}>
              <Home size={18} /> <span className="hidden sm:block">Home</span>
            </NavLink>
            <NavLink to="/gallery" className={({isActive}) => `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-500' : 'hover:bg-dark-100 dark:hover:bg-dark-800'}`}>
              <LayoutGrid size={18} /> <span className="hidden sm:block">Gallery</span>
            </NavLink>
            {role === 'admin' && (
              <NavLink to="/command-center" className={({isActive}) => `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-500' : 'hover:bg-dark-100 dark:hover:bg-dark-800'}`}>
                <Terminal size={18} /> <span className="hidden sm:block">Command Center</span>
              </NavLink>
            )}
            
            <div className="w-px h-6 bg-dark-200 dark:bg-dark-800 mx-2"></div>
            
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={logout} title="Lock Archives" className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {children}
      </main>

      <footer className="py-8 text-center text-dark-500 text-sm mt-12 border-t border-dark-200 dark:border-dark-800">
        <p>All rights reserved to Muneeb Ahmad.</p>
        <p className="mt-1">Made by Muneeb Ahmad with ❤️ est. May 2026.</p>
      </footer>
    </div>
  );
};
