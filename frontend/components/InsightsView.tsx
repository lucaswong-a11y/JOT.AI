
import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, Cell, PieChart, Pie, Legend
} from 'recharts';
import { 
  Clock, Zap, FileText, DollarSign
} from 'lucide-react';
import { motion } from 'framer-motion';
import { MeetingSession } from '../types';
import { COST_PER_1M_TOKENS, BILLING_MULTIPLIER } from '../constants';

interface InsightsViewProps {
  sessions: MeetingSession[];
}

const InsightsView: React.FC<InsightsViewProps> = ({ sessions }) => {
  const usageData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    return last7Days.map(date => {
      const daySessions = sessions.filter(s => s.date.startsWith(date));
      
      const realMinutes = daySessions.reduce((acc, s) => {
        if (s.transcription.length < 2) return acc;
        const start = s.transcription[0].timestamp;
        const end = s.transcription[s.transcription.length - 1].timestamp;
        return acc + Math.max(1, (end - start) / 60000);
      }, 0);

      const realTokens = daySessions.reduce((acc, s) => {
        const text = s.transcription.map(t => t.text).join(' ');
        return acc + Math.ceil(text.length / 4);
      }, 0);

      // Fallback for visual demo if no data
      const displayMinutes = Math.round(realMinutes) || (daySessions.length > 0 ? 5 : 0);
      const displayTokens = realTokens || (daySessions.length > 0 ? 1200 : 0);
      
      // Billing = (tokens / 1,000,000) * cost * 1.33
      const calculatedCost = (displayTokens / 1000000) * COST_PER_1M_TOKENS * BILLING_MULTIPLIER;

      return {
        date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        minutes: displayMinutes,
        tokens: displayTokens,
        notesCount: daySessions.length,
        cost: Number(calculatedCost.toFixed(6))
      };
    });
  }, [sessions]);

  const totals = useMemo(() => {
    return usageData.reduce((acc, curr) => ({
      minutes: acc.minutes + curr.minutes,
      tokens: acc.tokens + curr.tokens,
      notes: acc.notes + curr.notesCount,
      cost: acc.cost + curr.cost
    }), { minutes: 0, tokens: 0, notes: 0, cost: 0 });
  }, [usageData]);

  const COLORS = ['#1a1a1e', '#4f46e5', '#818cf8', '#c7d2fe'];

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-6 rounded-2xl border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} bg-opacity-10`}>
          <Icon className={`w-5 h-5 ${color.replace('bg-', 'text-')}`} />
        </div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live</div>
      </div>
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
      </div>
    </motion.div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-[#fbfbfc]">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Insights</h2>
        <p className="text-sm text-slate-500">Analytics and resource consumption overview.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Minutes" value={`${totals.minutes}m`} icon={Clock} color="bg-indigo-600" />
        <StatCard title="Tokens" value={totals.tokens.toLocaleString()} icon={Zap} color="bg-amber-600" />
        <StatCard title="Notes" value={totals.notes} icon={FileText} color="bg-emerald-600" />
        <StatCard title="Cost" value={`$${totals.cost.toFixed(4)}`} icon={DollarSign} color="bg-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-6">Activity (Minutes)</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usageData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                <Bar dataKey="minutes" fill="#1a1a1e" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h4 className="text-sm font-bold text-slate-800 mb-6">Billing Trend</h4>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageData}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }} />
                <Area type="monotone" dataKey="cost" stroke="#4f46e5" strokeWidth={2} fill="url(#colorCost)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <h4 className="text-sm font-bold text-slate-800">Usage Breakdown</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-400 font-bold uppercase tracking-widest">
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Tokens</th>
                <th className="px-6 py-3 text-right">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {usageData.slice().reverse().map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-600">{row.date}</td>
                  <td className="px-6 py-4 font-bold text-slate-800">{row.tokens.toLocaleString()}</td>
                  <td className="px-6 py-4 font-black text-slate-900 text-right">${row.cost.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InsightsView;
