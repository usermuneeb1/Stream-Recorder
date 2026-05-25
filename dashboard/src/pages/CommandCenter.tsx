import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Cloud, Film, Database, HardDrive, RefreshCcw, Play, CheckCircle2, XCircle, Clock, Link, ServerCrash, Video, Edit3 } from 'lucide-react';
import { useGithub } from '../contexts/GithubContext';

const WORKFLOWS = [
  { id: 'manual-entry', name: 'Manual Link Entry', icon: <Edit3 /> },
  { id: 'stream-recorder.yml', name: 'Stream Recorder', icon: <Video /> },
  { id: 'url-to-cloud.yml', name: 'URL to Cloud', icon: <Cloud /> },
  { id: 'youtube-to-archive.yml', name: 'YouTube Archiver', icon: <Film /> },
  { id: 'archive-to-mega.yml', name: 'Archive to MEGA', icon: <Database /> },
  { id: 'mega-account-manager.yml', name: 'MEGA Manager', icon: <HardDrive /> },
  { id: 'cloud-refresh.yml', name: 'Cloud Refresh', icon: <Link /> },
  { id: 'account-keepalive.yml', name: 'Account Keep-Alive', icon: <ServerCrash /> },
];

export default function CommandCenter() {
  const { pat, setPat, dispatchWorkflow, getWorkflowRuns, addManualEntry } = useGithub();
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

  const [patError, setPatError] = useState(false);
  const [patLoading, setPatLoading] = useState(false);

  const handleSavePat = async (e: React.FormEvent) => {
    e.preventDefault();
    setPatLoading(true);
    setPatError(false);
    const success = await setPat(inputPat);
    setPatLoading(false);
    if (!success) {
      setPatError(true);
      setTimeout(() => setPatError(false), 3000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    if (activeTab === 'manual-entry') {
      const vUrl = formData.get('video_url') as string || '';
      let vId = vUrl;
      const ytMatch = vUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&?]+)/);
      if (ytMatch) vId = ytMatch[1];

      const entry = {
        video_id: vId,
        title: formData.get('title'),
        channel: 'The Muslim Lantern',
        video_url: formData.get('video_url'),
        duration_fmt: formData.get('duration_fmt'),
        size_human: formData.get('size_human'),
        date: formData.get('date'),
        archive_link: formData.get('archive_link'),
        mega_link: formData.get('mega_link'),
        pixeldrain_link: formData.get('pixeldrain_link'),
        gofile_link: formData.get('gofile_link'),
      };
      
      const success = await addManualEntry(entry);
      if (success) {
        alert('Manual entry added to database successfully!');
      } else {
        alert('Failed to add entry. Check PAT or network.');
      }
      return;
    }

    let inputs: any = {};
    if (activeTab === 'stream-recorder.yml') {
      inputs = {
        force_record: formData.get('force_record'),
        wait_for_live: formData.get('wait_for_live'),
        wait_max_hours: formData.get('wait_max_hours'),
        custom_duration_minutes: formData.get('custom_duration_minutes'),
        save_test_links: formData.get('save_test_links'),
      };
    }
    if (activeTab === 'url-to-cloud.yml') inputs = urlData;
    if (activeTab === 'youtube-to-archive.yml') inputs = ytData;
    if (activeTab === 'archive-to-mega.yml') inputs = arcData;
    if (activeTab === 'mega-account-manager.yml') inputs = megaData;
    if (activeTab === 'cloud-refresh.yml') {
      inputs = { dry_run: formData.get('dry_run') };
    }
    if (activeTab === 'account-keepalive.yml') inputs = {};

    const { success, error } = await dispatchWorkflow(activeTab, inputs);
    if (success) {
      alert('Workflow dispatched successfully on master branch!');
      setTimeout(fetchRuns, 2000);
    } else {
      alert(`Failed to dispatch workflow: ${error || 'Unknown API Error'}`);
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
              className={`w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-900 border ${patError ? 'border-red-500' : 'border-dark-200 dark:border-dark-700'} focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4 transition-all`}
              required
              disabled={patLoading}
            />
            {patError && <p className="text-red-500 text-sm mb-4">Invalid PAT or GitHub API Error.</p>}
            <button type="submit" disabled={patLoading} className="w-full btn-primary py-3 text-base">
              {patLoading ? 'Validating...' : 'Unlock Command Center'}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <img 
            src="/Stream-Recorder/logo-vertical.pn.jpg" 
            alt="The Muslim Lantern" 
            className="h-14 md:h-16 w-auto object-contain drop-shadow-lg"
          />
          <div>
            <h1 className="text-3xl font-bold font-display mb-2">Command Center</h1>
            <p className="text-dark-500">Orchestrate GitHub Actions workflows directly from the dashboard.</p>
          </div>
        </div>
        <button onClick={() => setPat('')} className="text-sm text-brand-600 hover:underline px-4 py-2 bg-brand-500/10 rounded-lg font-medium">
          Lock Dashboard
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
              {activeTab === 'manual-entry' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Video Title</label>
                      <input type="text" name="title" required placeholder="My Awesome Stream" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Original URL (or custom ID)</label>
                      <input type="text" name="video_url" required placeholder="https://youtube.com/watch?v=..." className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Date (YYYY-MM-DD)</label>
                      <input type="text" name="date" required placeholder="2026-05-17" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Duration</label>
                      <input type="text" name="duration_fmt" placeholder="03:07:45 or 3h 7m" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Size</label>
                      <input type="text" name="size_human" placeholder="603 MB" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Archive.org Link</label>
                      <input type="text" name="archive_link" placeholder="https://archive.org/details/..." className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">MEGA Link</label>
                      <input type="text" name="mega_link" placeholder="https://mega.nz/file/..." className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Pixeldrain Link</label>
                      <input type="text" name="pixeldrain_link" placeholder="https://pixeldrain.com/u/..." className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Gofile Link</label>
                      <input type="text" name="gofile_link" placeholder="https://gofile.io/d/..." className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'stream-recorder.yml' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Force Record</label>
                      <select name="force_record" defaultValue="false" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                        <option value="false">False (Live Only)</option>
                        <option value="true">True (Bypass Live Check)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Wait For Live</label>
                      <select name="wait_for_live" defaultValue="false" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                        <option value="false">False</option>
                        <option value="true">True</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Max Wait Hours</label>
                      <input type="number" name="wait_max_hours" defaultValue="5" min="1" max="5" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Custom Duration (Mins)</label>
                      <input type="number" name="custom_duration_minutes" defaultValue="0" min="0" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Save Test Links</label>
                    <select name="save_test_links" defaultValue="true" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  </div>
                </>
              )}

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

              {activeTab === 'cloud-refresh.yml' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Refresh Mode</label>
                    <select defaultValue="false" name="dry_run" className="w-full px-4 py-2.5 rounded-lg bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700">
                      <option value="false">Full Refresh (Ping APIs to extend life)</option>
                      <option value="true">Dry Run (Check for dead links only)</option>
                    </select>
                    <p className="text-xs text-dark-500 mt-2">This workflow automatically scans all Gofile and Pixeldrain links in your archive and pings them to reset their expiration timers.</p>
                  </div>
                </>
              )}

              {activeTab === 'account-keepalive.yml' && (
                <>
                  <div className="p-4 bg-brand-50 dark:bg-brand-500/10 rounded-xl border border-brand-200 dark:border-brand-500/20">
                    <p className="text-sm text-brand-600 dark:text-brand-400">
                      This workflow runs automatically to keep your MEGA accounts from expiring due to inactivity. You can trigger it manually to force a keep-alive event right now. No inputs required.
                    </p>
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
