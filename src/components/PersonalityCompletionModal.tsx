import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ArchetypeSymbol from './ArchetypeSymbol';

interface PersonalityCompletionModalProps {
  isOpen: boolean;
  onClose: () => void;
  personalityId: string;
  archetypeName: string;
  subcategoryName: string;
}

export default function PersonalityCompletionModal({
  isOpen,
  onClose,
  personalityId,
  archetypeName,
  subcategoryName
}: PersonalityCompletionModalProps) {
  const archetypeId = personalityId?.slice(0, 2);
  const subcategoryId = personalityId?.slice(2, 3);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: 50 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="relative max-w-2xl w-full"
            >
              {/* Glow effect */}
              <div className="absolute -inset-4 bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-blue-600/30 rounded-3xl blur-2xl" />

              <div className="relative bg-gradient-to-b from-gray-900 via-purple-900/50 to-gray-900 rounded-2xl border-2 border-purple-500/30 shadow-2xl max-h-[90vh] overflow-y-auto">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Content */}
                <div className="p-8 md:p-12 text-center">
                  {/* Symbol */}
                  <motion.div
                    className="flex justify-center mb-8"
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 150,
                      damping: 15,
                      delay: 0.3
                    }}
                  >
                    <div className="relative">
                      <motion.div
                        className="absolute inset-0 rounded-full blur-2xl"
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [0.5, 0.8, 0.5]
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          repeatType: "reverse"
                        }}
                        style={{
                          background: `radial-gradient(circle, ${
                            subcategoryId === 'A' ? '#F59E0B' :
                            subcategoryId === 'B' ? '#8B5CF6' :
                            subcategoryId === 'K' ? '#EF4444' :
                            subcategoryId === 'X' ? '#3B82F6' :
                            subcategoryId === 'D' ? '#1F2937' :
                            subcategoryId === 'L' ? '#10B981' :
                            '#9CA3AF'
                          }40, transparent 70%)`
                        }}
                      />
                      <ArchetypeSymbol
                        archetypeId={archetypeId}
                        subcategoryId={subcategoryId}
                        size={120}
                        animated={false}
                      />
                    </div>
                  </motion.div>

                  {/* Text content */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="space-y-6 flex flex-col items-center"
                  >
                    <p className="text-gray-300 text-lg leading-relaxed italic">
                      "O ritual está completo. A sintonia fina foi alcançada.
                    </p>

                    <p className="text-gray-300 text-lg leading-relaxed italic">
                      A balança finalmente pendeu... e eu posso ver sua forma verdadeira.
                    </p>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.7 }}
                      className="py-8"
                    >
                      <p className="text-gray-400 text-sm mb-3">
                        Neste momento, neste pulsar do tempo, sua alma cinematográfica reflete o arquétipo de...
                      </p>

                      <motion.div
                        className="inline-block px-8 py-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-blue-500/20 rounded-xl border-2 border-purple-500/50 backdrop-blur-sm"
                        animate={{
                          boxShadow: [
                            '0 0 20px rgba(168, 85, 247, 0.3)',
                            '0 0 40px rgba(168, 85, 247, 0.5)',
                            '0 0 20px rgba(168, 85, 247, 0.3)'
                          ]
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          repeatType: "reverse"
                        }}
                      >
                        <p className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 mb-2">
                          {personalityId}
                        </p>
                        <p className="text-xl md:text-2xl text-white font-semibold">
                          {archetypeName} {subcategoryName}
                        </p>
                      </motion.div>
                    </motion.div>

                    <p className="text-gray-300 text-lg leading-relaxed italic">
                      Use este nome. Entenda-o. Ele é o seu padrão... agora.
                    </p>

                    <div className="pt-4 pb-2">
                      <p className="text-gray-400 text-base leading-relaxed">
                        O Oráculo é dinâmico. Cada novo filme que você assistir, cada nota que você der... cada história que ousar tocar... irá lentamente modificar este perfil.
                      </p>
                    </div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 1 }}
                      className="pt-6"
                    >
                      <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
                        O Santuário está desbloqueado. Entre.
                      </p>
                      <p className="text-gray-400 text-sm italic">
                        E volte sempre... para que eu possa lhe dizer quem você se tornou."
                      </p>
                    </motion.div>
                  </motion.div>

                  {/* Enter button */}
                  <div className="flex justify-center w-full">
                    <motion.button
                      onClick={onClose}
                      className="mt-8 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 border border-purple-500/50"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1.2 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      Entrar no Santuário
                    </motion.button>
                  </div>
                </div>

                {/* Animated particles */}
                <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={`modal-particle-${i}`}
                      className="absolute w-1 h-1 rounded-full bg-purple-400/30"
                      initial={{
                        x: Math.random() * 100 + "%",
                        y: Math.random() * 100 + "%",
                        opacity: 0
                      }}
                      animate={{
                        y: [
                          Math.random() * 100 + "%",
                          Math.random() * 100 + "%",
                          Math.random() * 100 + "%"
                        ],
                        opacity: [0, 0.6, 0]
                      }}
                      transition={{
                        duration: 8 + Math.random() * 8,
                        repeat: Infinity,
                        delay: Math.random() * 2
                      }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
