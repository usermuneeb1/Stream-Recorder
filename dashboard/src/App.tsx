import React, { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { useAuth } from './contexts/AuthContext';
import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

import Home from './pages/Home';
import Gallery from './pages/Gallery';
import Watch from './pages/Watch';
import CommandCenter from './pages/CommandCenter';

function LockScreen() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { login } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!login(password)) {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-50 dark:bg-[#09090b] text-dark-900 dark:text-dark-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-8 rounded-3xl max-w-sm w-full text-center"
      >
        <div className="w-20 h-20 bg-brand-500/10 text-brand-600 dark:text-brand-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-500/20">
          <Shield size={40} />
        </div>
        <h2 className="text-2xl font-bold font-display mb-2">Restricted Access</h2>
        <p className="text-dark-500 mb-8 text-sm">Enter the passphrase to unlock the archives.</p>
        
        <form onSubmit={handleSubmit}>
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`w-full px-4 py-3 rounded-xl bg-dark-100 dark:bg-dark-900 border ${error ? 'border-red-500' : 'border-dark-200 dark:border-dark-700'} focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4 text-center tracking-widest font-mono transition-all`}
            required
            autoFocus
          />
          <button type="submit" className="w-full btn-primary py-3">Unlock</button>
        </form>
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
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/watch/:id" element={<Watch />} />
        {role === 'admin' && <Route path="/command-center" element={<CommandCenter />} />}
      </Routes>
    </Layout>
  );
}

export default App;
