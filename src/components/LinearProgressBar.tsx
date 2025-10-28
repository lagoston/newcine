import React from 'react';
import { motion } from 'framer-motion';

interface LinearProgressBarProps {
  progress: number;
  total: number;
  current: number;
  isError: boolean;
  errorMessage?: string;
}

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
    <div className="w-full max-w-lg mx-auto mb-8">
      {isError ? (
        <motion.p 
          className="text-center text-red-500 mb-2 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {errorMessage}
        </motion.p>
      ) : (
        <motion.p 
          className="text-center text-gray-700 dark:text-gray-300 mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          {current > 0 ? `Carregando ${current} de ${total} filmes` : 'Preparando para carregar filmes...'}
        </motion.p>
      )}
      <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div 
          className={`h-full rounded-full ${
            isError 
              ? 'bg-red-500' 
              : 'bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-400 dark:to-purple-400'
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${safeProgress}%` }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
        ></motion.div>
      </div>
      <motion.p 
        className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        {safeProgress.toFixed(0)}%
      </motion.p>
    </div>
  );
};

export default LinearProgressBar;