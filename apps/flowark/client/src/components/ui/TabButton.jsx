import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

export function TabButton({ icon, label, isActive, onClick, badge, badgeColor }) {
  return (
    <motion.button
      aria-current={isActive ? 'page' : undefined}
      onClick={onClick}
      className={cn(
        "relative flex min-h-11 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-lg px-3 py-2 text-[13px] transition-all group md:min-h-10",
        isActive
          ? "bg-cyan-500/[0.1] text-cyan-400 font-medium"
          : "hover:bg-zinc-800/80 text-zinc-400 hover:text-zinc-200"
      )}
    >
      {isActive && (
        <motion.div
          layoutId="sidebarActiveIndicator"
          className="absolute left-0 w-[3px] h-5 bg-cyan-500 rounded-r-full shadow-[0_0_8px_rgba(16,185,129,0.4)]"
        />
      )}
      <span className={cn(
          "relative z-10 flex min-w-0 items-center gap-2.5 w-full transition-colors",
          isActive ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-zinc-400'
      )}>
        {icon}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {badge && (
          <span className={cn(
            "flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1.5 text-[9px] font-bold text-white shadow-md",
            badgeColor || "bg-cyan-500"
          )}>
            {badge}
          </span>
        )}
      </span>
    </motion.button>
  );
}
