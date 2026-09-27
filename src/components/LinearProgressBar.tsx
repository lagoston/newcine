import React from 'react';
import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

interface LinearProgressBarProps {
  progress: number;
  total: number;
  current: number;
  isError: boolean;
  errorMessage?: string;
}

// Barra fina de progresso no padrão noite (violeta → fúcsia).
const LinearProgressBar: React.FC<LinearProgressBarProps> = ({
  progress,
  total,
  current,
  isError,
  errorMessage = 'Error loading data'
}) => {
  // Ensure progress is between 0 and 100
  const safeProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="w-full">
      {isError && (
        <p className="mb-2 flex items-center justify-center gap-2 text-sm text-red-300" role="alert">
          <AlertCircle className="w-4 h-4" aria-hidden />
          {errorMessage}
        </p>
      )}
      <div
        className="w-full h-1.5 rounded-full overflow-hidden relative bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 100}
        aria-valuenow={total ? current : Math.round(safeProgress)}
      >
        <motion.div
          className={`h-full rounded-full absolute top-0 left-0 ${
            isError ? 'bg-red-400' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
          }`}
          initial={{ width: '0%' }}
          animate={{ width: `${safeProgress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
};

export default LinearProgressBar;
