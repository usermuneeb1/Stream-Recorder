import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Trash2, Plus, Clock, HardDrive, FileVideo, Link2, AlertTriangle, Check, Edit3 } from 'lucide-react';
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
    }
  }, [isOpen, stream]);

  const handleSave = () => {
    // Save to localStorage as override
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
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 1200);
  };

  const handleSourceChange = (key: string, field: keyof StreamSource, value: string) => {
    setForm(prev => ({
      ...prev,
      sources: {
        ...prev.sources,
        [key]: { ...prev.sources[key], [field]: value }
      }
    }));
  };

  const handleRemoveSource = (key: string) => {
    setForm(prev => {
      const newSources = { ...prev.sources };
      delete newSources[key];
      return { ...prev, sources: newSources };
    });
  };

  const handleAddSource = () => {
    const key = `custom_${Date.now()}`;
    setForm(prev => ({
      ...prev,
      sources: {
        ...prev.sources,
        [key]: { label: 'New Source', url: '', type: 'archive' as const }
      }
    }));
  };

  const tabs = [
    { key: 'details' as const, label: 'Details', icon: <Edit3 size={14} /> },
    { key: 'sources' as const, label: 'Sources', icon: <Link2 size={14} /> },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[85vh] overflow-y-auto glass-panel rounded-3xl z-50 shadow-2xl border border-dark-200 dark:border-dark-800"
          >
            {/* Header */}
            <div className="sticky top-0 bg-white/80 dark:bg-dark-900/80 backdrop-blur-xl p-6 pb-4 border-b border-dark-200 dark:border-dark-800 rounded-t-3xl z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center">
                    <Edit3 size={20} className="text-brand-500" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold font-display">Edit Recording</h2>
                    <p className="text-xs text-dark-400">ID: {stream.videoId}</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-dark-100 dark:bg-dark-800 rounded-xl p-1">
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? 'bg-white dark:bg-dark-700 shadow-sm text-dark-900 dark:text-white'
                        : 'text-dark-400 hover:text-dark-600 dark:hover:text-dark-300'
                    }`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* ─── Details Tab ────────────────────────────────────── */}
              {activeTab === 'details' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                  {/* Thumbnail Preview */}
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-dark-200 dark:bg-dark-800 mb-4">
                    <img
                      src={form.thumbnail}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `${import.meta.env.BASE_URL}thumbnail.jpg`;
                      }}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs font-semibold px-2 py-1 rounded-md">
                      {form.duration || 'No duration'}
                    </div>
                  </div>

                  {/* Title */}
                  <div>
                    <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-1.5">Title</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={e => setForm({ ...form, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Date */}
                    <div>
                      <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-1.5">
                        <Clock size={12} className="inline mr-1" /> Date
                      </label>
                      <input
                        type="text"
                        value={form.date}
                        onChange={e => setForm({ ...form, date: e.target.value })}
                        placeholder="YYYY-MM-DD"
                        className="w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all text-sm"
                      />
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-1.5">
                        <FileVideo size={12} className="inline mr-1" /> Duration
                      </label>
                      <input
                        type="text"
                        value={form.duration}
                        onChange={e => setForm({ ...form, duration: e.target.value })}
                        placeholder="2h 30m"
                        className="w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all text-sm"
                      />
                    </div>
                  </div>

                  {/* File Size */}
                  <div>
                    <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-1.5">
                      <HardDrive size={12} className="inline mr-1" /> File Size
                    </label>
                    <input
                      type="text"
                      value={form.size}
                      onChange={e => setForm({ ...form, size: e.target.value })}
                      placeholder="4.2 GB"
                      className="w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all text-sm"
                    />
                  </div>

                  {/* Thumbnail URL */}
                  <div>
                    <label className="block text-xs font-semibold text-dark-500 uppercase tracking-wider mb-1.5">Thumbnail URL</label>
                    <input
                      type="text"
                      value={form.thumbnail}
                      onChange={e => setForm({ ...form, thumbnail: e.target.value })}
                      placeholder="https://..."
                      className="w-full px-4 py-3 rounded-xl bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none transition-all text-sm font-mono text-xs"
                    />
                  </div>
                </motion.div>
              )}

              {/* ─── Sources Tab ────────────────────────────────────── */}
              {activeTab === 'sources' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  {Object.entries(form.sources).map(([key, source]) => (
                    <div key={key} className="p-4 bg-dark-50 dark:bg-dark-800 rounded-xl border border-dark-200 dark:border-dark-700 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-dark-400">{key}</span>
                        <button
                          onClick={() => handleRemoveSource(key)}
                          className="p-1.5 text-dark-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <input
                        type="text"
                        value={source.label}
                        onChange={e => handleSourceChange(key, 'label', e.target.value)}
                        placeholder="Label"
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 text-sm focus:border-brand-500 focus:outline-none"
                      />
                      <input
                        type="text"
                        value={source.url}
                        onChange={e => handleSourceChange(key, 'url', e.target.value)}
                        placeholder="URL"
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 text-xs font-mono focus:border-brand-500 focus:outline-none"
                      />
                    </div>
                  ))}

                  <button
                    onClick={handleAddSource}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-dark-300 dark:border-dark-600 text-dark-400 hover:border-brand-500 hover:text-brand-500 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Plus size={16} /> Add Source
                  </button>
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white/80 dark:bg-dark-900/80 backdrop-blur-xl p-6 pt-4 border-t border-dark-200 dark:border-dark-800 rounded-b-3xl flex gap-3">
              <button onClick={onClose} className="btn-secondary flex-1 py-3">Cancel</button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saved}
                className={`flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                  saved
                    ? 'bg-green-500 text-white'
                    : 'btn-primary'
                }`}
              >
                {saved ? <><Check size={18} /> Saved!</> : <><Save size={18} /> Save Changes</>}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Helper: Apply admin overrides to stream data ────────────────────
export function applyAdminOverrides(streams: StreamData[]): StreamData[] {
  try {
    const overrides = JSON.parse(localStorage.getItem('admin_overrides') || '{}');
    return streams.map(stream => {
      const override = overrides[stream.videoId];
      if (!override) return stream;
      return {
        ...stream,
        title: override.title || stream.title,
        date: override.date || stream.date,
        duration: override.duration || stream.duration,
        size: override.size || stream.size,
        thumbnail: override.thumbnail || stream.thumbnail,
        sources: override.customSources || stream.sources,
      };
    });
  } catch {
    return streams;
  }
}
