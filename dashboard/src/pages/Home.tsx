import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { AnimatedCounter } from '../components/AnimatedCounter';
import { fetchStats, fetchStreams, StatsData } from '../utils/dataFetcher';

export default function Home() {
  const [stats, setStats] = useState<StatsData>({ total_streams: 0, total_hours: 0, total_gb: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [pieData, setPieData] = useState<any[]>([]);
  
  useEffect(() => {
    fetchStats().then(setStats);
    fetchStreams().then(streams => {
      // Mock historical growth based on stream dates for area chart
      const sorted = [...streams].reverse();
      let accStreams = 0;
      let accHours = 0;
      const history = sorted.map(s => {
        accStreams++;
        // Very basic mock hours assuming average 2h per stream if no exact duration
        const hMatch = s.duration?.match(/(\d+)h/);
        const hrs = hMatch ? parseInt(hMatch[1]) : 2;
        accHours += hrs;
        return {
          date: s.date,
          streams: accStreams,
          hours: accHours
        };
      });
      // sample every N to avoid clutter
      setChartData(history.filter((_, i) => i % Math.max(1, Math.floor(history.length / 10)) === 0));

      // Build pie data based on actual stream sources
      let m = 0, a = 0, p = 0;
      streams.forEach(s => {
        if (s.sources.mega) m++;
        if (s.sources.archive) a++;
        if (s.sources.pixel) p++;
      });
      setPieData([
        { name: 'MEGA.nz', value: m, color: '#dc2626' },
        { name: 'Archive.org', value: a, color: '#6366f1' },
        { name: 'Pixeldrain', value: p, color: '#a855f7' },
      ].filter(x => x.value > 0));
    });
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="mb-12">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-brand-600 to-brand-400 bg-clip-text text-transparent"
        >
          Archive Command Center
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-dark-600 dark:text-dark-400"
        >
          Real-time metrics and orchestration for the automated stream archival system.
        </motion.p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {[
          { label: 'Total Streams', value: stats.total_streams, delay: 0.2 },
          { label: 'Hours Archived', value: stats.total_hours, suffix: '+', delay: 0.3 },
          { label: 'Storage Used', value: stats.total_gb, suffix: ' GB', delay: 0.4 },
        ].map((metric, i) => (
          <motion.div 
            key={metric.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: metric.delay, type: 'spring' }}
            className="glass-panel p-6 rounded-2xl relative overflow-hidden group"
          >
            <div className="absolute -inset-0.5 bg-gradient-to-br from-brand-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <h3 className="text-dark-500 dark:text-dark-400 font-medium mb-2">{metric.label}</h3>
            <div className="text-4xl font-display font-bold text-dark-900 dark:text-white">
              <AnimatedCounter value={metric.value} suffix={metric.suffix} delay={metric.delay} />
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2 glass-panel p-6 rounded-2xl"
        >
          <h3 className="text-lg font-bold mb-6">Archive Growth (Hours)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#dc2626" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
                <Area type="monotone" dataKey="hours" stroke="#dc2626" strokeWidth={3} fillOpacity={1} fill="url(#colorHours)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass-panel p-6 rounded-2xl flex flex-col items-center justify-center"
        >
          <h3 className="text-lg font-bold mb-2 self-start w-full">Cloud Distribution</h3>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(24, 24, 27, 0.9)', border: 'none', borderRadius: '8px', color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-4 mt-4">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                <span>{entry.name}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
