import { motion } from 'framer-motion';

export function StatCard({ title, value, color = "text-white", icon, iconBg = "bg-indigo-500/[0.08]", className }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={`dashboard-card min-h-[96px] bg-[#18181b] border border-zinc-800 p-3.5 sm:p-4 rounded-lg hover:border-zinc-700 transition-all duration-300 shadow-sm relative overflow-hidden group ${className || ''}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      <div className="relative z-10 min-w-0">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-[10px] font-semibold text-zinc-500 uppercase tracking-[0.12em]">{title}</h3>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${iconBg}`}>
            {icon}
          </div>
        </div>
        <p className={`min-w-0 truncate text-xl font-bold tracking-tight sm:text-2xl ${color}`} title={String(value ?? '')}>{value}</p>
      </div>
    </motion.div>
  );
}
