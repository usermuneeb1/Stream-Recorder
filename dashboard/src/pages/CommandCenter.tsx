import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Cloud, Film, Database, HardDrive, RefreshCcw, Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useGithub } from '../contexts/GithubContext';

const WORKFLOWS = [
  { id: 'url-to-cloud.yml', name: 'URL to Cloud', icon: <Cloud /> },
  { id: 'youtube-to-archive.yml', name: 'YouTube Archiver', icon: <Film /> },
  { id: 'archive-to-mega.yml', name: 'Archive to MEGA', icon: <Database /> },
  { id: 'mega-account-manager.yml', name: 'MEGA Manager', icon: <HardDrive /> },
];

export default function CommandCenter() {
  const { pat, setPat, dispatchWorkflow, getWorkflowRuns } = useGithub();
  const [inputPat, setInputPat] = useState(pat);
  const [activeTab, setActiveTab] = useState(WORKFLOWS[0].id);
  const [runs, setRuns] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Form States
  const [urlData, setUrlData] = useState({ file_url: '', filename: '', destination: 'all', quality: 'best' });
  const [ytData, setYtData] = useState({ url: '', mode: 'upload' });
  const [arcData, setArcData] = useState({ mega_email: '', mega_password: '', archive_query: 'identifier:tml-2026-*' });
  const [megaData, setMegaData] = useState({ action: 'both' });

  const fetchRuns = async () => {
    setRefreshing(true);
    const data = await getWorkflowRuns();
    setRuns(data.slice(0, 5)); // Top 5 recent runs
    setRefreshing(false);
  };

  useEffect(() => {
    if (pat) fetchRuns();
  }, [pat]);

  const handleSavePat = (e: React.FormEvent) => {
    e.preventDefault();
    setPat(inputPat);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let inputs: any = {};
    if (activeTab === 'url-to-cloud.yml') inputs = urlData;
    if (activeTab === 'youtube-to-archive.yml') inputs = ytData;
    if (activeTab === 'archive-to-mega.yml') inputs = arcData;
    if (activeTab === 'mega-account-manager.yml') inputs = megaData;

    const success = await dispatchWorkflow(activeTab, inputs);
    if (success) {
      alert('Workflow dispatched successfully on main branch!');
      setTimeout(fetchRuns, 2000);
    } else {
      alert('Failed to dispatch workflow. Check PAT or inputs.');
    }
  };

  if (!pat) {
    return (
      <div className="max-w-md mx-auto mt-20 px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-3xl text-center shadow-2xl"
        >
          <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900/30 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold font-display mb-2">Secure Access</h2>
          <p className="text-dark-500 mb-8 text-sm">Enter your GitHub Personal Access Token to unlock the Command Center and orchestrate workflows.</p>
          
          <form onSubmit={handleSavePat}>
            <input 
              type="password" 
              value={inputPat}
              onChange={(e) => setInputPat(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              className="w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4 transition-all"
              required
            />
            <button type="submit" className="w-full btn-primary py-3 text-base">Unlock Command Center</button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display mb-2">Command Center</h1>
          <p className="text-dark-500">Orchestrate GitHub Actions workflows directly from the dashboard.</p>
        </div>
        <button onClick={() => setPat('')} className="text-sm text-brand-600 hover:underline">
          Lock & Remove Token
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {WORKFLOWS.map(wf => (
              <button
                key={wf.id}
                onClick={() => setActiveTab(wf.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all ${
                  activeTab === wf.id 
                    ? 'bg-brand-600 text-white shadow-lg shadow-brand-500/30' 
                    : 'glass-panel hover:bg-dark-50 dark:hover:bg-dark-800'
                }`}
              >
                {wf.icon} {wf.name}
              </button>
            ))}
          </div>

          {/* Form */}
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass-panel p-6 sm:p-8 rounded-3xl"
          >
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <Play size={20} className="text-brand-500" />
              Configure {WORKFLOWS.find(w => w.id === activeTab)?.name}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              {activeTab === 'url-to-cloud.yml' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">File or Video URL *</label>
                    <input type="url" required value={urlData.file_url} onChange={e => setUrlData({...urlData, file_url: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Custom Filename (Optional)</label>
                    <input type="text" value={urlData.filename} onChange={e => setUrlData({...urlData, filename: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" placeholder="video.mp4" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Destination</label>
                      <select value={urlData.destination} onChange={e => setUrlData({...urlData, destination: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                        <option value="all">All Clouds</option>
                        <option value="mega">MEGA.nz</option>
                        <option value="archive">Archive.org</option>
                        <option value="pixeldrain">Pixeldrain</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Quality (YT)</label>
                      <select value={urlData.quality} onChange={e => setUrlData({...urlData, quality: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                        <option value="best">Best Quality</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'youtube-to-archive.yml' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Channel/Playlist URL *</label>
                    <input type="url" required value={ytData.url} onChange={e => setYtData({...ytData, url: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Mode</label>
                    <select value={ytData.mode} onChange={e => setYtData({...ytData, mode: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                      <option value="upload">Upload & Archive</option>
                      <option value="list-only">Dry Run (List Only)</option>
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'archive-to-mega.yml' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">MEGA Email *</label>
                    <input type="email" required value={arcData.mega_email} onChange={e => setArcData({...arcData, mega_email: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">MEGA Password *</label>
                    <input type="password" required value={arcData.mega_password} onChange={e => setArcData({...arcData, mega_password: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Archive Query</label>
                    <input type="text" value={arcData.archive_query} onChange={e => setArcData({...arcData, archive_query: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                  </div>
                </>
              )}

              {activeTab === 'mega-account-manager.yml' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Action</label>
                    <select value={megaData.action} onChange={e => setMegaData({...megaData, action: e.target.value})} className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                      <option value="both">Generate & Sign-in (Keep-alive)</option>
                      <option value="generate">Generate Only</option>
                      <option value="signin">Sign-in Only (Keep-alive)</option>
                    </select>
                  </div>
                </>
              )}

              <div className="pt-4 border-t border-dark-200 dark:border-dark-700">
                <button type="submit" className="w-full btn-primary py-3">Launch on 'main' branch</button>
              </div>
            </form>
          </motion.div>
        </div>

        {/* Live Pipeline */}
        <div className="glass-panel p-6 rounded-3xl h-fit">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg">Live Pipeline</h3>
            <button onClick={fetchRuns} className={`p-2 rounded-full hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors ${refreshing ? 'animate-spin text-brand-500' : ''}`}>
              <RefreshCcw size={16} />
            </button>
          </div>
          
          <div className="space-y-4">
            {runs.length === 0 ? (
              <p className="text-sm text-dark-500">No recent runs found.</p>
            ) : (
              runs.map((run) => (
                <div key={run.id} className="p-4 rounded-xl bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm truncate pr-2">{run.name}</span>
                    {run.status === 'in_progress' || run.status === 'queued' ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
                        <Clock size={12} className="animate-pulse" /> Running
                      </span>
                    ) : run.conclusion === 'success' ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                        <CheckCircle2 size={12} /> Success
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                        <XCircle size={12} /> Failed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-dark-500 flex justify-between">
                    <span>{new Date(run.created_at).toLocaleString()}</span>
                    <span>#{run.run_number}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
