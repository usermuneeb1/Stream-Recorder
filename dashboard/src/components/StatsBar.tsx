import type { Stats } from '../utils/dataFetcher';

interface Props {
  stats: Stats;
  loading: boolean;
}

export function StatsBar({ stats, loading }: Props) {
  const items = [
    { label: 'Streams', value: stats.totalStreams, icon: '🎬' },
    { label: 'Hours', value: `${stats.totalHours}+`, icon: '⏱️' },
    { label: 'Archived', value: `${stats.totalGb} GB`, icon: '💾' },
  ];

  return (
    <div className="border-b border-white/5 bg-[#0f0f0f]">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center justify-center gap-8 sm:gap-16">
          {items.map(item => (
            <div key={item.label} className="flex items-center gap-2 text-center">
              <span className="text-lg">{item.icon}</span>
              <div>
                {loading ? (
                  <div className="skeleton h-5 w-10 rounded mb-0.5" />
                ) : (
                  <span className="text-white font-bold text-lg tabular-nums">{item.value}</span>
                )}
                <p className="text-[11px] text-[#717171] uppercase tracking-wider">{item.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
