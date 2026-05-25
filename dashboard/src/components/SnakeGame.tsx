import React, { useState } from 'react';
import { Gamepad2, Maximize2, Minimize2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const SnakeGame: React.FC = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <>
      <div className={`glass-panel rounded-2xl relative overflow-hidden group border border-dark-200 dark:border-dark-800 transition-colors flex flex-col ${isFullscreen ? 'fixed inset-0 z-[100] bg-dark-50 dark:bg-[#09090b] rounded-none border-none' : 'h-[600px] lg:h-[700px] p-6'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between ${isFullscreen ? 'p-4 border-b border-dark-200 dark:border-dark-800' : 'mb-4'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-500/10 rounded-lg">
              <Gamepad2 className="text-brand-500" size={isFullscreen ? 24 : 20} />
            </div>
            <div>
              <h3 className={`font-semibold ${isFullscreen ? 'text-xl font-bold font-display' : 'text-lg'}`}>Command Center Arcade</h3>
              {!isFullscreen && <p className="text-xs text-dark-400">Powered by GameSnacks</p>}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isFullscreen && (
              <a 
                href="https://gamesnacks.com/" 
                target="_blank" 
                rel="noreferrer"
                className="p-2 text-dark-400 hover:text-brand-500 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors tooltip-trigger"
                title="Open in new tab"
              >
                <ExternalLink size={16} />
              </a>
            )}
            
            {isFullscreen ? (
              <button 
                onClick={() => setIsFullscreen(false)}
                className="btn-secondary flex items-center gap-2"
              >
                <Minimize2 size={16} /> Exit Arcade
              </button>
            ) : (
              <button 
                onClick={() => setIsFullscreen(true)}
                className="p-2 text-dark-400 hover:text-brand-500 hover:bg-dark-100 dark:hover:bg-dark-800 rounded-lg transition-colors tooltip-trigger"
                title="Fullscreen"
              >
                <Maximize2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Iframe Container */}
        <div className={`flex-1 bg-dark-100 dark:bg-dark-900 relative ${isFullscreen ? 'w-full h-full' : 'rounded-xl overflow-hidden border border-dark-200 dark:border-dark-800'}`}>
          <iframe 
            src="https://gamesnacks.com/embed/games/stackbounce" 
            className="w-full h-full absolute inset-0"
            frameBorder="0"
            scrolling="no"
            allow="fullscreen"
            title="Mini Games Provider"
          />
        </div>
      </div>
    </>
  );
};
