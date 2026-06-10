import React, { useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Home as HomeIcon, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { ParticleField } from './components/ParticleField';

import Home from './pages/Home';
import Gallery from './pages/Gallery';
import Watch from './pages/Watch';
import CommandCenter from './pages/CommandCenter';

function AdminLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login, role } = useAuth();
  const navigate = useNavigate();

  if (role === 'admin') {
    return <Navigate to="/command-center" replace />;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(password)) {
      navigate('/command-center', { replace: true });
    } else {
      setError(true);
      setTimeout(() => setError(false), 2200);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 relative overflow-hidden">
      <ParticleField count={20} color="rgba(239,68,68,0.16)" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-brand-500/10 rounded-full blur-[130px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 28, scale: 0.96, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 180, damping: 22 }}
        className="glass-panel p-8 sm:p-10 rounded-3xl max-w-sm w-full text-center relative z-10 border border-white/20 dark:border-white/5 shadow-2xl"
      >
        <motion.div
          animate={{ y: [-4, 4, -4] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="relative mx-auto mb-7 w-fit"
        >
          <div className="absolute inset-0 bg-brand-500/25 rounded-full blur-2xl -m-4" />
          <div className="relative w-20 h-20 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <ShieldCheck size={34} className="text-brand-500" />
          </div>
        </motion.div>

        <div className="flex items-center justify-center gap-2 mb-2">
          <Lock size={18} className="text-brand-500" />
          <h2 className="text-2xl font-bold font-display">Admin Access</h2>
        </div>
        <p className="text-dark-500 mb-7 text-sm">Public browsing is open. This passphrase is only for archive administration.</p>

        <motion.form onSubmit={handleSubmit}>
          <div className="relative mb-4">
            <motion.input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin passphrase"
              animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4, type: 'spring', stiffness: 500 }}
              className={`w-full px-4 py-3.5 rounded-2xl bg-dark-100 dark:bg-dark-900 border-2 transition-all duration-300 text-center tracking-widest font-mono focus:outline-none ${
                error
                  ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                  : 'border-dark-200 dark:border-dark-700 focus:border-brand-500 focus:shadow-[0_0_20px_rgba(239,68,68,0.1)]'
              }`}
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-dark-400 hover:text-dark-600 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-red-500 text-xs font-medium mb-3"
              >
                Incorrect admin passphrase.
              </motion.p>
            )}
          </AnimatePresence>

          <button type="submit" className="w-full btn-primary py-3.5 text-base font-bold">
            Unlock Admin Tools
          </button>
        </motion.form>
      </motion.div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <div className="text-8xl font-display font-bold text-gradient-animated mb-4">404</div>
        <h2 className="text-2xl font-bold font-display mb-3">Page Not Found</h2>
        <p className="text-dark-500 mb-8 max-w-md">The page you're looking for doesn't exist or has been moved.</p>
        <Link to="/" className="btn-primary inline-flex items-center gap-2">
          <HomeIcon size={18} /> Back to Home
        </Link>
      </motion.div>
    </div>
  );
}

function App() {
  const { role } = useAuth();

  return (
    <Layout>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/watch/:id" element={<Watch />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/command-center" element={role === 'admin' ? <CommandCenter /> : <AdminLogin />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default App;
