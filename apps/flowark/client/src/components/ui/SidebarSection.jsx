import { motion } from 'framer-motion';

export function SidebarSection({ label }) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="text-[9px] uppercase tracking-[0.15em] text-gray-600 font-semibold mt-5 mb-1.5 px-3 select-none"
    >
      {label}
    </motion.p>
  );
}
