import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

export function ActionBtn({ onClick, icon, color = 'blue', title, ariaLabel, className, disabled = false }) {
  const colors = {
    purple: 'hover:bg-purple-500/20 text-purple-400',
    orange: 'hover:bg-orange-500/20 text-orange-400',
    red: 'hover:bg-red-500/20 text-red-400',
    yellow: 'hover:bg-amber-500/20 text-amber-400',
    green: 'hover:bg-cyan-500/20 text-cyan-400',
    blue: 'hover:bg-blue-500/20 text-blue-400',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={cn(`flex h-10 w-10 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 md:h-8 md:w-8 ${colors[color] || colors.blue}`, className)}
      title={title}
      aria-label={ariaLabel || title}
    >
      {icon}
    </motion.button>
  );
}
