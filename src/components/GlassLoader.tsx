import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface GlassLoaderProps {
  fullPage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export default function GlassLoader({ fullPage = false, size = 'md', label, className = '' }: GlassLoaderProps) {
  const { t } = useTranslation();

  const iconSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';

  const inner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <div className="relative">
        <div className={`${iconSize} rounded-full border-2 border-blue-400/20 dark:border-blue-500/20 absolute inset-0 scale-150`} />
        <Loader2 className={`${iconSize} text-blue-500 dark:text-blue-400 animate-spin relative z-10`} />
      </div>
      {label !== undefined && (
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      )}
    </div>
  );

  if (!fullPage) return inner;

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-blue-50/80 via-slate-50/50 to-blue-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-gray-900 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/15 to-cyan-400/15 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-gradient-to-br from-sky-400/15 to-blue-400/15 dark:from-sky-600/10 dark:to-blue-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      <div className="relative z-10 p-10 rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl">
        {inner}
      </div>
    </motion.div>
  );
}
