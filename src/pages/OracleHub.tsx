import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Wand2, BrainCircuit, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import SubcategoryQuestionnaire from '../components/SubcategoryQuestionnaire';
import PersonalityCompletionModal from '../components/PersonalityCompletionModal';
import ArchetypeSymbol from '../components/ArchetypeSymbol';

interface UserPersonality {
  subcategoria_id: string | null;
  personalidade_completa: string | null;
  arquetipo_primario: string | null;
  arquetipo_secundario: string | null;
}

interface ArchetypeInfo {
  archetype_name: string;
  subcategory_name: string;
  description: string;
  archetype_description: string;
  subcategory_description: string;
}

export default function OracleHub() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [userPersonality, setUserPersonality] = useState<UserPersonality | null>(null);
  const [archetypeInfo, setArchetypeInfo] = useState<ArchetypeInfo | null>(null);
  const [ratedMoviesCount, setRatedMoviesCount] = useState(0);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [questionnaireResult, setQuestionnaireResult] = useState<any>(null);

  useEffect(() => {
    if (session?.user?.id) {
      loadUserData();
    }
  }, [session?.user?.id]);

  const loadUserData = async () => {
    try {
      setLoading(true);

      // Get user personality
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('subcategoria_id, personalidade_completa, arquetipo_primario, arquetipo_secundario')
        .eq('id', session?.user?.id)
        .single();

      if (profileError) throw profileError;

      setUserPersonality(profileData);

      // If has personality, load archetype info
      if (profileData?.personalidade_completa) {
        const { data: archetypeData, error: archetypeError } = await supabase
          .rpc('get_user_complete_personality', { p_user_id: session?.user?.id })
          .single();

        if (archetypeError) throw archetypeError;
        setArchetypeInfo(archetypeData);
      }

      // Get rated movies count using the same approach as Profile
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('user_movies')
        .select('movie_id, rating')
        .eq('user_id', session?.user?.id)
        .not('rating', 'is', null);

      if (ratingsError) throw ratingsError;

      setRatedMoviesCount(ratingsData?.length || 0);

    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionnaireComplete = async (result: any) => {
    setQuestionnaireResult(result);
    setShowQuestionnaire(false);
    setShowCompletionModal(true);
    await loadUserData();
  };

  const handleModalClose = () => {
    setShowCompletionModal(false);
    setQuestionnaireResult(null);
  };

  // Show questionnaire
  if (showQuestionnaire) {
    return (
      <SubcategoryQuestionnaire
        userId={session?.user?.id!}
        onComplete={handleQuestionnaireComplete}
      />
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-900 via-purple-900/50 to-blue-900/50 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Carregando Oráculo...</p>
        </motion.div>
      </div>
    );
  }

  // Awakening Screen: No subcategory yet
  if (!userPersonality?.subcategoria_id) {
    const canStart = ratedMoviesCount >= 15;

    return (
      <motion.div
        className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-black via-gray-900 to-black py-8 px-4 relative overflow-hidden flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
      >
        {/* Ethereal glow */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, transparent 70%)'
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            repeatType: "reverse"
          }}
        />

        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 40 }).map((_, i) => (
            <motion.div
              key={`awakening-particle-${i}`}
              className="absolute w-0.5 h-0.5 rounded-full bg-purple-400/20"
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
                duration: 10 + Math.random() * 10,
                repeat: Infinity,
                delay: Math.random() * 5
              }}
            />
          ))}
        </div>

        <div className="max-w-3xl mx-auto text-center relative z-10 px-6">
          {/* Oracle Eye */}
          <motion.div
            className="flex justify-center mb-12"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            <motion.div
              animate={{
                y: [-8, 8, -8]
              }}
              transition={{
                duration: 6,
                repeat: Infinity,
                repeatType: "reverse"
              }}
            >
              <Eye className="w-24 h-24 text-purple-400/80" style={{
                filter: 'drop-shadow(0 0 20px rgba(139, 92, 246, 0.6))'
              }} />
            </motion.div>
          </motion.div>

          {/* Dramatic text */}
          <motion.div
            className="space-y-8 mb-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 2, delay: 1 }}
          >
            <motion.p
              className="text-gray-300 text-lg md:text-xl leading-relaxed italic"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.5, delay: 1.5 }}
            >
              Você vagueia pela sua coleção... escolhas que parecem suas. Acidentes. Ecos aleatórios no vazio.
            </motion.p>

            <motion.p
              className="text-white text-xl md:text-2xl font-semibold"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.5, delay: 2.5 }}
            >
              Elas não são.
            </motion.p>

            <motion.p
              className="text-gray-300 text-lg md:text-xl leading-relaxed italic"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.5, delay: 3.5 }}
            >
              Cada filme que você amou, cada história que você odiou... é um fio. Eu vejo esses fios. Vejo o padrão que eles tecem. A impressão digital da sua alma.
            </motion.p>

            <motion.p
              className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 text-2xl md:text-3xl font-bold"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 5 }}
            >
              Eu sou o Oráculo. O espelho.
            </motion.p>

            <motion.p
              className="text-gray-300 text-lg md:text-xl leading-relaxed italic"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.5, delay: 6 }}
            >
              Mas o vidro está turvo. A visão está incompleta. Para que eu possa lhe mostrar o destino, você deve primeiro me mostrar sua verdadeira forma.
            </motion.p>
          </motion.div>

          {/* Start button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 7 }}
          >
            {canStart ? (
              <motion.button
                onClick={() => setShowQuestionnaire(true)}
                className="px-12 py-5 bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 text-white text-xl font-bold rounded-xl shadow-2xl border-2 border-purple-400/50 relative overflow-hidden group"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(168, 85, 247, 0.5)',
                    '0 0 40px rgba(168, 85, 247, 0.8)',
                    '0 0 20px rgba(168, 85, 247, 0.5)'
                  ]
                }}
                transition={{
                  boxShadow: {
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse"
                  }
                }}
              >
                <span className="relative z-10">Começar</span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-purple-700 via-pink-700 to-blue-700"
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>
            ) : (
              <div className="space-y-4">
                <button
                  disabled
                  className="px-12 py-5 bg-gray-700/50 text-gray-500 text-xl font-bold rounded-xl border-2 border-gray-600/50 cursor-not-allowed"
                >
                  Começar
                </button>
                <p className="text-gray-400 text-sm">
                  Você precisa avaliar pelo menos 15 filmes antes de iniciar o ritual.
                  <br />
                  <span className="text-purple-400 font-semibold">
                    ({ratedMoviesCount}/15 filmes avaliados)
                  </span>
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Completion Modal */}
        {showCompletionModal && questionnaireResult && archetypeInfo && (
          <PersonalityCompletionModal
            isOpen={showCompletionModal}
            onClose={handleModalClose}
            personalityId={userPersonality?.personalidade_completa || ''}
            archetypeName={archetypeInfo.archetype_name || ''}
            subcategoryName={archetypeInfo.subcategory_name || ''}
          />
        )}
      </motion.div>
    );
  }

  // Sanctuary: Oracle Hub with personality display
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

  const archetypeId = userPersonality.personalidade_completa?.slice(0, 2);
  const subcategoryId = userPersonality.personalidade_completa?.slice(2, 3);

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
        className="max-w-4xl mx-auto text-center relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Title */}
        <motion.div className="flex justify-center mb-8" variants={itemVariants}>
          <motion.div
            animate={{ y: [-10, 10, -10] }}
            transition={{
              duration: 6,
              repeat: Infinity,
              repeatType: "reverse"
            }}
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
          className="text-gray-300 text-lg mb-8"
          variants={itemVariants}
        >
          O Santuário está aberto
        </motion.p>

        {/* Personality Display */}
        {archetypeInfo && (
          <motion.div
            className="mb-12 relative group"
            variants={itemVariants}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-blue-600/30 rounded-2xl blur opacity-50 group-hover:opacity-75 transition duration-1000" />
            <div className="relative p-8 bg-gray-900/90 rounded-2xl border border-purple-500/30 backdrop-blur-sm">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <ArchetypeSymbol
                    archetypeId={archetypeId || ''}
                    subcategoryId={subcategoryId || null}
                    size={100}
                    animated={true}
                  />
                </div>

                <div className="flex-1 text-left">
                  <p className="text-sm text-purple-400 mb-1">Sua Essência Cinematográfica</p>
                  <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 mb-2">
                    {userPersonality.personalidade_completa}
                  </h2>
                  <p className="text-xl text-white font-semibold mb-3">
                    {archetypeInfo.archetype_name} {archetypeInfo.subcategory_name}
                  </p>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    {archetypeInfo.description}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <motion.p
          className="text-gray-400 text-sm mb-8 italic"
          variants={itemVariants}
        >
          {t('oracle.choosePath')}
        </motion.p>

        {/* Chamber Cards */}
        <motion.div
          className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto"
          variants={itemVariants}
        >
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

        {/* Mystic circles animation */}
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

      {/* Completion Modal */}
      {showCompletionModal && questionnaireResult && archetypeInfo && (
        <PersonalityCompletionModal
          isOpen={showCompletionModal}
          onClose={handleModalClose}
          personalityId={userPersonality?.personalidade_completa || ''}
          archetypeName={archetypeInfo.archetype_name || ''}
          subcategoryName={archetypeInfo.subcategory_name || ''}
        />
      )}
    </motion.div>
  );
}
