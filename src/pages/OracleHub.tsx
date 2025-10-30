import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Wand2, BrainCircuit, Loader2, Scroll, Info, X, RefreshCw } from 'lucide-react';
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

// Pentagon Graph Component
const PentagonGraph: React.FC<{ points: { e: number; i: number; c: number; s: number; r: number }; subcategoryId: string }> = ({ points, subcategoryId }) => {
  const size = 280;
  const center = size / 2;
  const radius = size / 2 - 40;

  // Normalize points to percentage (0-100)
  const maxPoint = Math.max(points.e, points.i, points.c, points.s, points.r, 1);
  const normalized = {
    e: (points.e / maxPoint) * 100,
    i: (points.i / maxPoint) * 100,
    c: (points.c / maxPoint) * 100,
    s: (points.s / maxPoint) * 100,
    r: (points.r / maxPoint) * 100,
  };

  // Get color based on subcategory
  const getSubcategoryColor = (id: string) => {
    if (!id) {
      console.warn('No subcategory ID provided for graph color');
      return '#8b5cf6'; // default purple
    }
    const thirdLetter = id?.charAt(2);
    console.log('Subcategory ID:', id, 'Third letter:', thirdLetter);
    const colors: Record<string, string> = {
      'A': '#fbbf24', // amber (Radiante)
      'B': '#8b5cf6', // purple (Sombrio)
      'K': '#ef4444', // red (Clássico)
      'X': '#3b82f6', // blue (Experimental)
      'D': '#6b7280', // gray (Denso)
      'L': '#10b981', // green (Leve)
    };
    return colors[thirdLetter] || '#8b5cf6';
  };

  const color = getSubcategoryColor(subcategoryId);

  // Calculate pentagon points
  const angle = (Math.PI * 2) / 5;
  const labels = ['E', 'I', 'C', 'S', 'R'];
  const values = [normalized.e, normalized.i, normalized.c, normalized.s, normalized.r];

  const getPoint = (index: number, value: number) => {
    const pointRadius = (radius * value) / 100;
    const x = center + pointRadius * Math.sin(angle * index - Math.PI / 2);
    const y = center - pointRadius * Math.cos(angle * index - Math.PI / 2);
    return { x, y };
  };

  const getLabelPoint = (index: number) => {
    const labelRadius = radius + 25;
    const x = center + labelRadius * Math.sin(angle * index - Math.PI / 2);
    const y = center - labelRadius * Math.cos(angle * index - Math.PI / 2);
    return { x, y };
  };

  // Create data points path
  const dataPoints = values.map((value, i) => getPoint(i, value));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Create grid lines (20%, 40%, 60%, 80%, 100%)
  const gridLevels = [20, 40, 60, 80, 100];

  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      {/* Grid lines */}
      {gridLevels.map((level) => {
        const gridPoints = labels.map((_, i) => getPoint(i, level));
        const gridPath = gridPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
        return (
          <path
            key={level}
            d={gridPath}
            fill="none"
            stroke="#ffffff15"
            strokeWidth="1"
          />
        );
      })}

      {/* Axes lines */}
      {labels.map((_, i) => {
        const point = getPoint(i, 100);
        return (
          <line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            stroke="#ffffff15"
            strokeWidth="1"
          />
        );
      })}

      {/* Data area */}
      <path
        d={dataPath}
        fill={`${color}40`}
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {dataPoints.map((point, i) => (
        <circle
          key={`point-${i}`}
          cx={point.x}
          cy={point.y}
          r="4"
          fill={color}
          stroke="#fff"
          strokeWidth="2"
        />
      ))}

      {/* Labels */}
      {labels.map((label, i) => {
        const labelPoint = getLabelPoint(i);
        return (
          <text
            key={`label-${i}`}
            x={labelPoint.x}
            y={labelPoint.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-lg font-bold fill-white"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
};

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
  const [showRevelationModal, setShowRevelationModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showRetakeQuizModal, setShowRetakeQuizModal] = useState(false);
  const [showPremiumRequiredModal, setShowPremiumRequiredModal] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [spectrumPoints, setSpectrumPoints] = useState({ e: 0, i: 0, c: 0, s: 0, r: 0 });

  // Prevent background scroll when modals are open
  useEffect(() => {
    if (showRevelationModal || showInfoModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showRevelationModal, showInfoModal]);

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

      // Get spectrum points separately
      const { data: spectrumData, error: spectrumError } = await supabase
        .from('profiles')
        .select('pontos_e, pontos_i, pontos_c, pontos_s, pontos_r')
        .eq('id', session?.user?.id)
        .single();

      if (!spectrumError && spectrumData) {
        const points = {
          e: Number(spectrumData.pontos_e) || 0,
          i: Number(spectrumData.pontos_i) || 0,
          c: Number(spectrumData.pontos_c) || 0,
          s: Number(spectrumData.pontos_s) || 0,
          r: Number(spectrumData.pontos_r) || 0,
        };
        console.log('Spectrum points loaded:', points);
        setSpectrumPoints(points);
      }

      // Get premium status using RPC function
      const { data: premiumData, error: premiumError } = await supabase
        .rpc('get_user_premium_status', { user_id_input: session?.user?.id });

      if (premiumError) {
        console.error('Error loading premium status:', premiumError);
      }
      console.log('Premium status for user:', session?.user?.id, '=', premiumData);
      setIsPremium(premiumData || false);

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
            className="flex justify-center"
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
              <div className="space-y-4 flex flex-col items-center">
                <button
                  disabled
                  className="px-12 py-5 bg-gray-700/50 text-gray-500 text-xl font-bold rounded-xl border-2 border-gray-600/50 cursor-not-allowed"
                >
                  Começar
                </button>
                <p className="text-gray-400 text-sm text-center">
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
          className="text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 tracking-wider mb-12 relative"
          variants={itemVariants}
          style={{
            textShadow: '0 0 30px rgba(168, 85, 247, 0.4), 0 0 60px rgba(168, 85, 247, 0.2)',
            fontFamily: 'serif'
          }}
        >
          O Santuário
        </motion.h1>

        {/* Personality Display */}
        {archetypeInfo && (
          <motion.div
            className="mb-12 relative group"
            variants={itemVariants}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/30 via-pink-600/30 to-blue-600/30 rounded-2xl blur opacity-50 group-hover:opacity-75 transition duration-1000" />
            <div className="relative p-8 bg-gray-900/90 rounded-2xl border border-purple-500/30 backdrop-blur-sm">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
                <div className="flex-shrink-0">
                  <ArchetypeSymbol
                    archetypeId={archetypeId || ''}
                    subcategoryId={subcategoryId || null}
                    size={100}
                    animated={true}
                  />
                </div>

                <div className="flex-1 text-center md:text-left">
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

                {/* Action Buttons - Right Side on desktop, centered on mobile */}
                <div className="flex md:flex-col gap-3 md:ml-auto w-full md:w-auto justify-center md:justify-start">
                  <motion.button
                    onClick={() => setShowRevelationModal(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
                  >
                    <Scroll className="w-4 h-4" />
                    <span className="text-sm font-semibold">Revelação</span>
                  </motion.button>

                  <motion.button
                    onClick={() => setShowInfoModal(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 transition-all shadow-lg"
                  >
                    <Info className="w-4 h-4" />
                    <span className="text-sm font-semibold">Info</span>
                  </motion.button>
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

      {/* Revelation Modal - Personality Description */}
      <AnimatePresence>
        {showRevelationModal && archetypeInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowRevelationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Crystal ball glass effect - matching Info modal */}
              <div className="relative bg-gradient-to-br from-purple-950/95 via-pink-950/95 to-blue-950/95 backdrop-blur-md rounded-3xl shadow-2xl border-2 border-purple-400/30 p-8">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-blue-500/10 rounded-3xl blur-xl" />

                {/* Close button - increased size and better positioning */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRevelationModal(false);
                  }}
                  className="absolute top-4 right-4 z-50 p-3 bg-purple-500/20 hover:bg-purple-500/40 rounded-full transition-colors group"
                  aria-label="Fechar"
                >
                  <X className="w-6 h-6 text-purple-200 group-hover:text-white transition-colors" />
                </button>

                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-center mb-6">
                    <div className="relative">
                      <Scroll className="w-10 h-10 text-purple-400 mr-3" style={{
                        filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))'
                      }} />
                    </div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400">
                      Revelação
                    </h2>
                  </div>

                  {/* Personality Code */}
                  <div className="text-center mb-6 bg-purple-900/30 rounded-xl p-6 border border-purple-500/20">
                    <p className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
                      {userPersonality?.personalidade_completa}
                    </p>
                    <p className="text-xl text-purple-200 font-semibold">
                      {archetypeInfo.archetype_name} {archetypeInfo.subcategory_name}
                    </p>
                  </div>

                  {/* Archetype Description */}
                  <div className="space-y-6 text-gray-200">
                    <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-500/20">
                      <h3 className="text-xl font-bold text-purple-300 mb-3">
                        Sua Essência (As Duas Primeiras Letras)
                      </h3>
                      <p className="text-gray-300 leading-relaxed">
                        {archetypeInfo.archetype_description}
                      </p>
                    </div>

                    <div className="bg-pink-900/30 rounded-xl p-6 border border-pink-500/20">
                      <h3 className="text-xl font-bold text-pink-300 mb-3">
                        Sua Sintonia (A Terceira Letra)
                      </h3>
                      <p className="text-gray-300 leading-relaxed">
                        {archetypeInfo.subcategory_description}
                      </p>
                    </div>
                  </div>

                  {/* Decorative bottom */}
                  <div className="flex items-center justify-center gap-3 pt-6 mt-6">
                    <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
                    <div className="w-2 h-2 rounded-full bg-pink-400" />
                    <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-pink-400 to-transparent" />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal - Methodology Explanation */}
      <AnimatePresence>
        {showInfoModal && userPersonality && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 50 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Crystal ball glass effect */}
              <div className="relative bg-gradient-to-br from-blue-950/95 via-purple-950/95 to-indigo-950/95 backdrop-blur-md rounded-3xl shadow-2xl border-2 border-blue-400/30 p-8">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-xl" />

                {/* Close button - increased size and better positioning */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowInfoModal(false);
                  }}
                  className="absolute top-4 right-4 z-50 p-3 bg-blue-500/20 hover:bg-blue-500/40 rounded-full transition-colors group"
                  aria-label="Fechar"
                >
                  <X className="w-6 h-6 text-blue-200 group-hover:text-white transition-colors" />
                </button>

                {/* Content */}
                <div className="relative z-10">
                  <div className="flex items-center justify-center mb-6">
                    <div className="relative">
                      <Eye className="w-10 h-10 text-blue-400 mr-3" style={{
                        filter: 'drop-shadow(0 0 10px rgba(96, 165, 250, 0.5))'
                      }} />
                    </div>
                    <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                      A Arquitetura da Alma
                    </h2>
                  </div>

                  <div className="space-y-6 text-gray-200">
                    <p className="text-center italic text-gray-300 text-lg">
                      Seu Arquétipo não é adivinhação. É a arquitetura de seus gostos, construída em duas etapas:
                    </p>

                    {/* Section 1: Essence */}
                    <div className="bg-blue-900/30 rounded-xl p-6 border border-blue-500/20">
                      <h3 className="text-2xl font-bold text-blue-300 mb-3 flex items-center gap-2">
                        <span className="text-3xl">1.</span>
                        A Essência (As Duas Primeiras Letras)
                      </h3>
                      <p className="text-gray-300 leading-relaxed mb-3">
                        Seu perfil principal <span className="font-bold text-white">({userPersonality?.arquetipo_primario}{userPersonality?.arquetipo_secundario})</span> é a soma matemática do que você ama e odeia. Cada filme que você avalia move cinco balanças: <span className="font-semibold text-white">Emocional (E)</span>, <span className="font-semibold text-white">Intelectual (I)</span>, <span className="font-semibold text-white">Cultural (C)</span>, <span className="font-semibold text-white">Sensorial (S)</span> e <span className="font-semibold text-white">Recreativa (R)</span>.
                      </p>

                      <div className="bg-black/30 rounded-lg p-4 mb-3">
                        <h4 className="font-bold text-blue-200 mb-2">A Lógica:</h4>
                        <p className="text-gray-300 text-sm leading-relaxed">
                          Uma nota <span className="font-bold text-green-400">10.0</span> (apreço máximo) em um 'Drama' (gênero Emocional) adiciona peso máximo à sua balança E. Uma nota <span className="font-bold text-red-400">0.0</span> (rejeição máxima) em uma 'Comédia' (gênero Recreativo) remove peso da sua balança R. A nota <span className="font-bold text-yellow-400">5.0</span> é o equilíbrio neutro.
                        </p>
                      </div>

                      <div className="bg-black/30 rounded-lg p-4">
                        <h4 className="font-bold text-blue-200 mb-2">O Resultado:</h4>
                        <p className="text-gray-300 text-sm leading-relaxed">
                          Seu Arquétipo é formado pelas duas balanças com maior pontuação, as forças que hoje brilham mais forte em você.
                        </p>
                      </div>
                    </div>

                    {/* Section 2: Attunement */}
                    <div className="bg-purple-900/30 rounded-xl p-6 border border-purple-500/20">
                      <h3 className="text-2xl font-bold text-purple-300 mb-3 flex items-center gap-2">
                        <span className="text-3xl">2.</span>
                        A Sintonia (A Terceira Letra)
                      </h3>
                      <p className="text-gray-300 leading-relaxed mb-3">
                        O Sub-arquétipo <span className="font-bold text-white">({userPersonality?.subcategoria_id})</span> representa sua inclinação ou tom. Ela não é calculada pelos gêneros, mas pela <span className="font-semibold text-white">Calibragem</span> que você fez ao responder o questionário inicial.
                      </p>

                      <div className="bg-black/30 rounded-lg p-4">
                        <p className="text-gray-300 text-sm leading-relaxed mb-3">
                          Ao responder às balanças, você definiu sua tendência em três eixos opostos:
                        </p>
                        <ul className="space-y-2 text-sm">
                          <li className="flex items-start gap-2">
                            <span className="text-amber-400 font-bold">•</span>
                            <span className="text-gray-300"><span className="font-semibold text-amber-300">Radiante (A)</span> vs. <span className="font-semibold text-purple-300">Sombrio (B)</span> (Otimismo vs. Melancolia).</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-red-400 font-bold">•</span>
                            <span className="text-gray-300"><span className="font-semibold text-red-300">Clássico (K)</span> vs. <span className="font-semibold text-blue-300">Experimental (X)</span> (Tradição vs. Ousadia).</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-gray-400 font-bold">•</span>
                            <span className="text-gray-300"><span className="font-semibold text-gray-100">Denso (D)</span> vs. <span className="font-semibold text-green-300">Leve (L)</span> (Complexidade vs. Acessibilidade).</span>
                          </li>
                        </ul>
                        <p className="text-gray-300 text-sm leading-relaxed mt-3">
                          O eixo onde sua preferência foi mais forte se tornou sua subcategoria dominante, adicionando o foco final ao seu perfil.
                        </p>
                      </div>
                    </div>

                    {/* Section 3: Graph */}
                    <div className="bg-indigo-900/30 rounded-xl p-6 border border-indigo-500/20">
                      <h3 className="text-2xl font-bold text-indigo-300 mb-4 flex items-center gap-2">
                        <span className="text-3xl">3.</span>
                        O Gráfico
                      </h3>

                      {/* Pentagon Graph */}
                      <div className="flex justify-center mb-4">
                        <PentagonGraph
                          points={spectrumPoints}
                          subcategoryId={userPersonality?.subcategoria_id || ''}
                        />
                      </div>

                      {/* Retake Quiz Button */}
                      <div className="flex justify-center mt-4">
                        <button
                          onClick={() => {
                            if (isPremium) {
                              setShowRetakeQuizModal(true);
                            } else {
                              setShowPremiumRequiredModal(true);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg text-sm"
                        >
                          <RefreshCw className="w-4 h-4" />
                          <span className="font-semibold">Refazer Questionário</span>
                        </button>
                      </div>
                    </div>

                    {/* Decorative bottom */}
                    <div className="flex items-center justify-center gap-3 pt-4">
                      <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent" />
                      <div className="w-2 h-2 rounded-full bg-pink-400" />
                      <div className="w-12 h-0.5 bg-gradient-to-r from-transparent via-pink-400 to-transparent" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Retake Quiz Confirmation Modal (Premium) */}
      <AnimatePresence>
        {showRetakeQuizModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowRetakeQuizModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full bg-gradient-to-br from-purple-950/95 to-blue-950/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-purple-400/30 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-white mb-4 text-center">Refazer Questionário?</h3>
              <p className="text-gray-300 text-center mb-6">
                Tem certeza que deseja refazer o questionário de personalidade? Isso irá atualizar sua subcategoria.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRetakeQuizModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    setShowRetakeQuizModal(false);
                    // Reset subcategory to null so user can retake questionnaire
                    await supabase
                      .from('profiles')
                      .update({ subcategoria_id: null })
                      .eq('id', session?.user?.id);

                    // Reload data to show questionnaire screen
                    await loadUserData();
                  }}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg transition-all"
                >
                  Confirmar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Required Modal (Free Users) */}
      <AnimatePresence>
        {showPremiumRequiredModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPremiumRequiredModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full bg-gradient-to-br from-amber-950/95 to-orange-950/95 backdrop-blur-md rounded-2xl shadow-2xl border-2 border-amber-400/30 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-amber-400 mb-4 text-center">Função Premium</h3>
              <p className="text-gray-300 text-center mb-6">
                Refazer o questionário de personalidade é uma função exclusiva para usuários Premium.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPremiumRequiredModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-all"
                >
                  Fechar
                </button>
                <Link
                  to="/premium"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-lg transition-all text-center"
                >
                  Ver Premium
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
