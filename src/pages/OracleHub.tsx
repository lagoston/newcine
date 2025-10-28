import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, Wand2, BrainCircuit } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function OracleHub() {
  const { t } = useTranslation();
  
  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  const floatAnimation = {
    initial: { y: 0 },
    animate: {
      y: [-10, 10, -10],
      transition: { 
        duration: 6, 
        repeat: Infinity, 
        repeatType: "reverse" as const,
        ease: "easeInOut"
      }
    }
  };
  
  return (
    <motion.div 
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-900 via-purple-900/50 to-blue-900/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Background particle effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-purple-500/30"
            initial={{ 
              x: Math.random() * 100 + "%", 
              y: Math.random() * 100 + "%",
              opacity: 0.3 + Math.random() * 0.3
            }}
            animate={{ 
              y: [
                Math.random() * 100 + "%", 
                Math.random() * 100 + "%",
                Math.random() * 100 + "%"
              ],
              opacity: [
                0.3 + Math.random() * 0.3,
                0.1 + Math.random() * 0.2,
                0.3 + Math.random() * 0.3
              ]
            }}
            transition={{ 
              duration: 15 + Math.random() * 15,
              repeat: Infinity
            }}
          />
        ))}
      </div>

      <motion.div 
        className="max-w-2xl mx-auto text-center relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div 
          className="flex justify-center mb-8"
          variants={itemVariants}
        >
          <motion.div 
            variants={floatAnimation}
            initial="initial"
            animate="animate"
            className="relative"
          >
            <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-lg"></div>
            <Eye className="w-20 h-20 text-purple-400 relative z-10" />
          </motion.div>
        </motion.div>

        <motion.h1 
          className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 tracking-widest mb-4"
          variants={itemVariants}
        >
          {t('oracle.title')}
        </motion.h1>

        <motion.p 
          className="text-gray-300 text-lg mb-12 max-w-2xl mx-auto"
          variants={itemVariants}
        >
          {t('oracle.choosePath')}
        </motion.p>

        <motion.div 
          className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto"
          variants={itemVariants}
        >
          {/* Make both cards exactly equal in styling */}
          {/* Recommendation Card */}
          <motion.div
            whileHover={{ scale: 1.03, y: -5 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="h-full"
          >
            <Link
              to="/oracle/recommend"
              className="block h-full relative bg-gradient-to-br from-pink-500/80 to-pink-700/80 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-pink-600/50 to-pink-800/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Background particle effects */}
              <div className="absolute inset-0 overflow-hidden">
                {Array.from({ length: 15 }).map((_, i) => (
                  <motion.div
                    key={`rec-particle-${i}`}
                    className="absolute w-1.5 h-1.5 rounded-full bg-white/20"
                    initial={{ 
                      x: Math.random() * 100 + "%", 
                      y: Math.random() * 100 + "%",
                      opacity: 0.3 + Math.random() * 0.4
                    }}
                    animate={{ 
                      y: [
                        Math.random() * 100 + "%", 
                        Math.random() * 100 + "%"
                      ],
                      opacity: [
                        0.3 + Math.random() * 0.4,
                        0.1 + Math.random() * 0.2
                      ]
                    }}
                    transition={{ 
                      duration: 4 + Math.random() * 6,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                  />
                ))}
              </div>
              
              <div className="relative z-10 h-full flex flex-col">
                <motion.div
                  initial={{ scale: 1 }}
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <Wand2 className="w-12 h-12 text-white mb-4" />
                </motion.div>
                
                <h2 className="text-2xl font-bold text-white mb-2">
                  {t('oracle.recommend.title')}
                </h2>
                
                <p className="text-pink-200 mb-4">
                  {t('oracle.recommend.description')}
                </p>
                
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-pink-200 text-sm font-medium mt-auto">
                  50 tickets
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Prediction Card */}
          <motion.div
            whileHover={{ scale: 1.03, y: -5 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 17 }}
            className="h-full"
          >
            <Link
              to="/oracle/prediction"
              className="block h-full relative bg-gradient-to-br from-violet-500/80 to-violet-700/80 rounded-xl p-6 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-violet-600/50 to-violet-800/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              {/* Background particle effects */}
              <div className="absolute inset-0 overflow-hidden">
                {Array.from({ length: 15 }).map((_, i) => (
                  <motion.div
                    key={`pred-particle-${i}`}
                    className="absolute w-1.5 h-1.5 rounded-full bg-white/20"
                    initial={{ 
                      x: Math.random() * 100 + "%", 
                      y: Math.random() * 100 + "%",
                      opacity: 0.3 + Math.random() * 0.4
                    }}
                    animate={{ 
                      y: [
                        Math.random() * 100 + "%", 
                        Math.random() * 100 + "%"
                      ],
                      opacity: [
                        0.3 + Math.random() * 0.4,
                        0.1 + Math.random() * 0.2
                      ]
                    }}
                    transition={{ 
                      duration: 4 + Math.random() * 6,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                  />
                ))}
              </div>
              
              <div className="relative z-10 h-full flex flex-col">
                <motion.div
                  initial={{ scale: 1 }}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <BrainCircuit className="w-12 h-12 text-white mb-4" />
                </motion.div>
                
                <h2 className="text-2xl font-bold text-white mb-2">
                  {t('oracle.prediction.title')}
                </h2>
                
                <p className="text-violet-200 mb-4">
                  {t('oracle.prediction.description')}
                </p>
                
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-violet-200 text-sm font-medium mt-auto">
                  100 tickets
                </div>
              </div>
            </Link>
          </motion.div>
        </motion.div>
        
        {/* Mystic circles animation - absolute positioning to prevent scrolling */}
        <div className="absolute left-1/2 transform -translate-x-1/2 -bottom-64 -z-10 pointer-events-none">
          <motion.div 
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.2, 0.25, 0.2],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: "reverse"
            }}
            className="relative w-[500px] h-[500px] opacity-20"
          >
            <div className="absolute inset-0 border-2 border-purple-400 rounded-full"></div>
            <div className="absolute inset-4 border border-blue-400 rounded-full"></div>
            <div className="absolute inset-10 border border-pink-400 rounded-full"></div>
            <div className="absolute inset-20 border border-indigo-400 rounded-full"></div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}