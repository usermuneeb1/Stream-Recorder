import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { StreamData } from '../utils/dataFetcher';

/**
 * ArchiveAnalytics — a lightweight "growth story" of the archive.
 * Reads the already-loaded stream list (no extra network calls) and renders:
 *   • Recordings per month
 *   • Total hours per month
 * Pure client-side, safe, zero dependencies beyond recharts (already installed).
 */
export const ArchiveAnalytics: React.FC<{ streams: StreamData[] }> = ({ streams }) => {
  const data = useMemo(() => {
    const byMonth: Record<string, { month: string; count: number; hours: number }> = {};
    for (const s of streams) {
      const month = (s.date || '').slice(0, 7) || 'unknown';
      if (!byMonth[month]) byMonth[month] = { month, count: 0, hours: 0 };
      byMonth[month].count += 1;
      // duration like "3h 07m" or "1h 22m"
      const h = Number(s.duration?.match(/(\d+)\s*h/)?.[1] || 0);
      const m = Number(s.duration?.match(/(\d+)\s*m/)?.[1] || 0);
      byMonth[month].hours += h + m / 60;
    }
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({ ...d, hours: Math.round(d.hours * 10) / 10 }));
  }, [streams]);

  if (data.length === 0) return null;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-dark-200 dark:border-dark-800">
      <h3 className="text-lg font-bold font-display mb-1">📈 Archive Growth</h3>
      <p className="text-sm text-dark-500 dark:text-dark-400 mb-5">Recordings &amp; hours preserved each month</p>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.6} />
            <Tooltip
              contentStyle={{ background: '#111114', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff' }}
              labelStyle={{ color: '#fff' }}
            />
            <Bar dataKey="count" name="Recordings" fill="#ef4444" radius={[6, 6, 0, 0]} />
            <Bar dataKey="hours" name="Hours" fill="#f59e0b" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
