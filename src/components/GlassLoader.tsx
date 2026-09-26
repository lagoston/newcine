import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { MIST } from '../lib/oracleTheme';

interface GlassLoaderProps {
  fullPage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

// Carregador único do site. Na versão de página inteira ele não desenha
// fundo próprio: aparece direto sobre o fundo noturno global, então a troca
// carregando → página pronta não pisca outra cor.
export default function GlassLoader({ fullPage = false, size = 'md', label, className = '' }: GlassLoaderProps) {
  const iconSize = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-12 h-12' : 'w-8 h-8';

  const inner = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status">
      <div className="relative">
        <div className={`${iconSize} rounded-full border-2 border-violet-400/20 absolute inset-0 scale-150`} />
        <Loader2 className={`${iconSize} text-fuchsia-400 animate-spin relative z-10`} aria-hidden />
      </div>
      {label !== undefined && (
        <p className="text-sm font-medium" style={{ color: MIST }}>{label}</p>
      )}
    </div>
  );

  if (!fullPage) return inner;

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {inner}
    </motion.div>
  );
}