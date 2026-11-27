import { motion } from 'framer-motion';

export function MiniStat({ icon, label, value, bg, className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`dashboard-card flex min-h-[74px] items-center gap-3 rounded-lg border border-zinc-800 bg-[#18181b] p-3 hover:border-zinc-700 transition-all duration-300 sm:p-3.5 ${className || ''}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${bg}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[9px] text-zinc-500 uppercase tracking-[0.15em] font-medium">{label}</p>
        <p className="truncate text-lg font-bold text-white tracking-tight sm:text-xl" title={String(value ?? '')}>{value}</p>
      </div>
    </motion.div>
  );
}
