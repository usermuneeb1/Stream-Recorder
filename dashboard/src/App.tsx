import React, { useState } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Home as HomeIcon, Lock, Eye, EyeOff } from 'lucide-react';
import { CommandPalette } from './components/CommandPalette';
import { ParticleField } from './components/ParticleField';

import Home from './pages/Home';
import Gallery from './pages/Gallery';
import Watch from './pages/Watch';
import CommandCenter from './pages/CommandCenter';

function LockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const { login } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(password)) {
      setUnlocking(true);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {!unlocking && (
        <motion.div
          exit={{ scale: 1.1, opacity: 0, filter: 'blur(20px)' }}
          transition={{ duration: 0.5 }}
          className="min-h-screen flex items-center justify-center bg-dark-50 dark:bg-[#09090b] text-dark-900 dark:text-dark-50 p-4 relative overflow-hidden"
        >
          {/* Particles */}
          <ParticleField count={30} color="rgba(239,68,68,0.2)" />

          {/* Ambient glows */}
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-brand-500/8 rounded-full blur-[150px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

          <motion.div
            initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="glass-panel p-10 rounded-3xl max-w-sm w-full text-center relative z-10 border border-white/20 dark:border-white/5"
          >
            {/* Logo with cinematic reveal */}
            <motion.div
              initial={{ scale: 1.3, opacity: 0, filter: 'blur(20px)' }}
              animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
              className="relative mx-auto mb-8 w-fit"
            >
              {/* Glow ring */}
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.3, 0.15] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute inset-0 bg-brand-500/30 rounded-full blur-2xl -m-4"
              />
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="The Muslim Lantern"
                className="h-28 w-auto object-contain mx-auto relative z-10 rounded-full"
              />
            </motion.div>

            {/* Title */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Lock size={18} className="text-brand-500" />
                <h2 className="text-2xl font-bold font-display">Restricted Access</h2>
              </div>
              <p className="text-dark-500 mb-8 text-sm">Enter the passphrase to unlock the archives.</p>
            </motion.div>

            {/* Form */}
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <div className="relative mb-4">
                <motion.input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
                  transition={{ duration: 0.4, type: "spring", stiffness: 500 }}
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

              {/* Error message */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-red-500 text-xs font-medium mb-3"
                  >
                    Incorrect passphrase. Try again.
                  </motion.p>
                )}
              </AnimatePresence>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                className="w-full btn-primary py-3.5 text-base font-bold"
              >
                Unlock Archives
              </motion.button>
            </motion.form>

            {/* Hint */}
            <p className="text-dark-400/50 text-[10px] mt-6">Press Enter to submit</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
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

  if (!role) {
    return <LockScreen />;
  }

  return (
    <Layout>
      <CommandPalette />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/watch/:id" element={<Watch />} />
        {role === 'admin' && <Route path="/command-center" element={<CommandCenter />} />}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

export default App;
