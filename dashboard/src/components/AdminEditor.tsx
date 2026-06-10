import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Trash2, Plus, Clock, HardDrive, FileVideo, Check, Edit3 } from 'lucide-react';
import { StreamData, StreamSource } from '../utils/dataFetcher';

interface AdminEditorProps {
  stream: StreamData;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: StreamData) => void;
}

export function AdminEditor({ stream, isOpen, onClose, onSave }: AdminEditorProps) {
  const [form, setForm] = useState<StreamData>({ ...stream });
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'sources'>('details');

  useEffect(() => {
    if (isOpen) {
      setForm({ ...stream });
      setSaved(false);
      setActiveTab('details');
    }
  }, [isOpen, stream]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  const handleSave = () => {
    const overrides = JSON.parse(localStorage.getItem('admin_overrides') || '{}');
    overrides[form.videoId] = {
      title: form.title,
      date: form.date,
      duration: form.duration,
      size: form.size,
      thumbnail: form.thumbnail,
      customSources: form.sources,
      lastEdited: new Date().toISOString(),
    };
    localStorage.setItem('admin_overrides', JSON.stringify(overrides));
    onSave(form);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1000);
  };

  const handleSourceChange = (key: string, field: keyof StreamSource, value: string) => {
    setForm(prev => ({
      ...prev,
      sources: { ...prev.sources, [key]: { ...prev.sources[key], [field]: value } }
    }));
  };

  const handleRemoveSource = (key: string) => {
    setForm(prev => {
      const s = { ...prev.sources };
      delete s[key];
      return { ...prev, sources: s };
    });
  };

  const handleAddSource = () => {
    const key = `custom_${Date.now()}`;
    setForm(prev => ({
      ...prev,
      sources: { ...prev.sources, [key]: { label: 'New Source', url: '', type: 'archive' as const } }
    }));
  };

  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm bg-white dark:bg-[#1a1a1f] border border-gray-200 dark:border-gray-700 focus:border-red-500 focus:ring-1 focus:ring-red-500/30 focus:outline-none transition-all placeholder-gray-400";

  return (
    <AnimatePresence>
      {isOpen && (
        /* ── Full-screen centering wrapper ── */
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 30 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-white dark:bg-[#111114] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden"
          >
            {/* ── Header ── */}
            <div className="flex-shrink-0 p-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Edit3 size={18} className="text-red-500" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">Edit Recording</h2>
                    <p className="text-[11px] text-gray-400 font-mono">{stream.videoId}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-0.5">
                {(['details', 'sources'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all ${
                      activeTab === tab
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {tab === 'details' ? '📝 Details' : '🔗 Sources'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Body (scrollable) ── */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {activeTab === 'details' && (
                <>
                  {/* Thumbnail Preview */}
                  <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <img
                      src={form.thumbnail}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}thumbnail.jpg`; }}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                      {form.duration || '—'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Title</label>
                    <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputCls} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        <Clock size={10} className="inline mr-1" />Date
                      </label>
                      <input type="text" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} placeholder="2026-01-15" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                        <FileVideo size={10} className="inline mr-1" />Duration
                      </label>
                      <input type="text" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="2h 30m" className={inputCls} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      <HardDrive size={10} className="inline mr-1" />File Size
                    </label>
                    <input type="text" value={form.size} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="4.2 GB" className={inputCls} />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Thumbnail URL</label>
                    <input type="text" value={form.thumbnail} onChange={e => setForm({ ...form, thumbnail: e.target.value })} placeholder="https://..." className={`${inputCls} font-mono text-xs`} />
                  </div>
                </>
              )}

              {activeTab === 'sources' && (
                <>
                  {Object.entries(form.sources).map(([key, source]) => (
                    <div key={key} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{key}</span>
                        <button onClick={() => handleRemoveSource(key)} className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <input type="text" value={source.label} onChange={e => handleSourceChange(key, 'label', e.target.value)} placeholder="Label" className={inputCls} />
                      <input type="text" value={source.url} onChange={e => handleSourceChange(key, 'url', e.target.value)} placeholder="https://..." className={`${inputCls} font-mono text-xs`} />
                    </div>
                  ))}
                  <button onClick={handleAddSource} className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-500 transition-colors flex items-center justify-center gap-2 text-xs font-semibold">
                    <Plus size={14} /> Add Source
                  </button>
                </>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex-shrink-0 p-4 border-t border-gray-100 dark:border-gray-800 flex gap-2">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={saved}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                  saved ? 'bg-green-500 text-white' : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              >
                {saved ? <><Check size={16} /> Saved!</> : <><Save size={16} /> Save</>}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function applyAdminOverrides(streams: StreamData[]): StreamData[] {
  try {
    const overrides = JSON.parse(localStorage.getItem('admin_overrides') || '{}');
    return streams.map(stream => {
      const o = overrides[stream.videoId];
      if (!o) return stream;
      return { ...stream, title: o.title || stream.title, date: o.date || stream.date, duration: o.duration || stream.duration, size: o.size || stream.size, thumbnail: o.thumbnail || stream.thumbnail, sources: o.customSources || stream.sources };
    });
  } catch { return streams; }
}
