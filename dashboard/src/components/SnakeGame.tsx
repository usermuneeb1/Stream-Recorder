import React, { useState } from 'react';
import { Gamepad2, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const SnakeGame: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group border border-dark-200 dark:border-dark-800 transition-colors h-[400px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 rounded-lg">
              <Gamepad2 className="text-brand-500" size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Game Center</h3>
              <p className="text-xs text-dark-400">Powered by GameSnacks</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <a 
              href="https://gamesnacks.com/" 
              target="_blank" 
              rel="noreferrer"
              className="p-2 text-dark-400 hover:text-brand-500 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors tooltip-trigger"
              title="Open in new tab"
            >
              <ExternalLink size={16} />
            </a>
            <button 
              onClick={() => setIsFullscreen(true)}
              className="p-2 text-dark-400 hover:text-brand-500 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors tooltip-trigger"
              title="Fullscreen"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Iframe Container */}
        <div className="flex-1 bg-dark-100 dark:bg-dark-900 rounded-xl overflow-hidden border border-dark-200 dark:border-dark-800 relative">
          <iframe 
            src="https://gamesnacks.com/embed/games/omnomrun" 
            className="w-full h-full absolute inset-0"
            frameBorder="0"
            scrolling="no"
            allow="fullscreen; autoplay; encrypted-media"
            title="Mini Games Provider"
          />
        </div>
      </div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-dark-50 dark:bg-[#09090b] flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-dark-200 dark:border-dark-800 glass-panel">
              <div className="flex items-center gap-3">
                <Gamepad2 className="text-brand-500" size={24} />
                <h2 className="text-xl font-bold font-display">Command Center Arcade</h2>
              </div>
              <button 
                onClick={() => setIsFullscreen(false)}
                className="btn-secondary flex items-center gap-2"
              >
                <Minimize2 size={16} /> Exit Arcade
              </button>
            </div>
            <div className="flex-1 w-full h-full">
              <iframe 
                src="https://gamesnacks.com/embed/games/omnomrun" 
                className="w-full h-full"
                frameBorder="0"
                allow="fullscreen; autoplay; encrypted-media"
                title="Mini Games Provider Fullscreen"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
