import React, { useState, useEffect } from 'react';
import { getEssenceLabel, getSubcategoryName } from '../lib/mood-genres';
import { Link } from 'react-router-dom';
import { Eye, Swords, Loader2, Scroll, Info, X, RefreshCw, Sparkles, LayoutGrid, Share2, LibraryBig } from 'lucide-react';
import GlassLoader from '../components/GlassLoader';
import PentagonGraph from '../components/PentagonGraph';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import SubcategoryQuestionnaire from '../components/SubcategoryQuestionnaire';
import PersonalityCompletionModal from '../components/PersonalityCompletionModal';
import ArchetypeSymbol from '../components/ArchetypeSymbol';
import CinematicPersonaCard from '../components/CinematicPersonaCard';
import PersonasModal from '../components/PersonasModal';
import PersonaShareModal from '../components/PersonaShareModal';

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

const getSubcategoryColor = (personalityId: string | null) => {
  if (!personalityId || personalityId.length < 3) return '#3b82f6';
  const subcategoryId = personalityId.charAt(2);
  const colors: Record<string, string> = {
    'A': '#fbbf24',
    'B': '#8b5cf6',
    'K': '#ef4444',
    'X': '#3b82f6',
    'D': '#6b7280',
    'L': '#10b981',
  };
  return colors[subcategoryId] || '#3b82f6';
};

export default function OracleHub() {
  const { t, i18n } = useTranslation();
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
  const [showPersonasModal, setShowPersonasModal] = useState(false);
  const [showPersonaShare, setShowPersonaShare] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    if (showRevelationModal || showInfoModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showRevelationModal, showInfoModal]);

  useEffect(() => {
    if (session?.user?.id) {
      loadUserData();
    }
  }, [session?.user?.id, i18n.language]);

  const loadUserData = async () => {
    try {
      setLoading(true);
            const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('username, subcategoria_id, personalidade_completa, arquetipo_primario, arquetipo_secundario')
        .eq('id', session?.user?.id)
        .single();

      if (profileError) throw profileError;

      setUserPersonality(profileData);
      setUsername(profileData.username);

      const { data: spectrumData, error: spectrumError } = await supabase
        .from('profiles')
        .select('pontos_e, pontos_i, pontos_c, pontos_s, pontos_r')
        .eq('id', session?.user?.id)
        .single();

      if (!spectrumError && spectrumData) {
        setSpectrumPoints({
          e: Number(spectrumData.pontos_e) || 0,
          i: Number(spectrumData.pontos_i) || 0,
          c: Number(spectrumData.pontos_c) || 0,
          s: Number(spectrumData.pontos_s) || 0,
          r: Number(spectrumData.pontos_r) || 0,
        });
      }

      const { data: premiumData } = await supabase
        .rpc('get_user_premium_status', { user_id_input: session?.user?.id });
      setIsPremium(premiumData || false);

      if (profileData?.personalidade_completa) {
        const { data: archetypeData, error: archetypeError } = await supabase
          .rpc('get_user_complete_personality', { p_user_id: session?.user?.id, p_language: i18n.language.startsWith('pt') ? 'pt' : 'en' })
          .single();
        if (archetypeError) throw archetypeError;
        setArchetypeInfo(archetypeData);
      }

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

  if (showQuestionnaire) {
    return (
      <SubcategoryQuestionnaire
        userId={session?.user?.id!}
        onComplete={handleQuestionnaireComplete}
      />
    );
  }

  if (loading) {
    return <GlassLoader fullPage size="lg" label={t('oracle.loadingOracle')} />;
  }

  if (!userPersonality?.subcategoria_id) {
    const canStart = ratedMoviesCount >= 15;

    return (
      <motion.div
        className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
        </div>

        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
          backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />

        <motion.div
          className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden max-w-2xl w-full p-8 sm:p-12"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10 text-center">
            <motion.div
              className="flex justify-center mb-8"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <motion.div
                animate={{ y: [-8, 8, -8] }}
                transition={{ duration: 6, repeat: Infinity, repeatType: "reverse" }}
                className="p-6 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 dark:from-blue-500/30 dark:to-cyan-500/30 border border-blue-400/30"
              >
                <Eye className="w-16 h-16 text-blue-500 dark:text-blue-400" style={{ filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.5))' }} />
              </motion.div>
            </motion.div>

            <motion.div
              className="space-y-6 mb-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.6 }}
            >
              <motion.p
                className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed italic"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.8 }}
              >
                {t('oracle.intro.line1')}
              </motion.p>

              <motion.p
                className="text-gray-800 dark:text-white text-xl font-semibold"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 1.2 }}
              >
                {t('oracle.intro.line2')}
              </motion.p>

              <motion.p
                className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed italic"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 1.6 }}
              >
                {t('oracle.intro.line3')}
              </motion.p>

              <motion.p
                className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 text-2xl font-bold"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 2 }}
              >
                {t('oracle.intro.line4')}
              </motion.p>

              <motion.p
                className="text-gray-600 dark:text-gray-300 text-lg leading-relaxed italic"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 2.4 }}
              >
                {t('oracle.intro.line5')}
              </motion.p>
            </motion.div>

            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 2.8 }}
            >
              {canStart ? (
                <motion.button
                  onClick={() => setShowQuestionnaire(true)}
                  className="px-10 py-4 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 text-white text-lg font-bold rounded-2xl shadow-xl hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 border border-blue-400/30 relative overflow-hidden group"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative z-10 flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    {t('oracle.intro.begin')}
                  </span>
                </motion.button>
              ) : (
                <div className="space-y-4 flex flex-col items-center">
                  <button
                    disabled
                    className="px-10 py-4 bg-gray-300/50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-lg font-bold rounded-2xl cursor-not-allowed border border-gray-400/30"
                  >
                    {t('oracle.intro.begin')}
                  </button>
                  <p className="text-gray-500 dark:text-gray-400 text-sm text-center">
                    {t('oracle.intro.ratingRequired')}
                    <br />
                    <span className="text-blue-500 dark:text-blue-400 font-semibold">
                      {t('oracle.intro.ratedCount', { count: ratedMoviesCount })}
                    </span>
                  </p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  const archetypeId = userPersonality.personalidade_completa?.slice(0, 2);
  const subcategoryId = userPersonality.personalidade_completa?.slice(2, 3);

  return (
    <>
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-pink-400/20 dark:from-purple-600/10 dark:to-pink-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]" style={{
        backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
        backgroundSize: '30px 30px'
      }} />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Cabeçalho — ícone e título lado a lado (não mais empilhados
            verticalmente), ocupando bem menos altura na tela. */}
        <motion.div
          className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden mb-8 p-5 sm:p-6 flex items-center justify-center gap-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-56 h-56 bg-gradient-to-br from-blue-400/15 to-cyan-500/15 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-cyan-400/10 to-blue-500/10 rounded-full blur-3xl" />
          </div>

          <motion.div
            className="relative z-10 flex-shrink-0 p-3 rounded-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 dark:from-blue-500/30 dark:to-cyan-500/30 border border-blue-400/30"
            animate={{
              boxShadow: [
                '0 0 20px rgba(59,130,246,0.25)',
                '0 0 40px rgba(59,130,246,0.5)',
                '0 0 20px rgba(59,130,246,0.25)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.div
              animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
              transition={{ duration: 5, repeat: Infinity, times: [0, 0.9, 0.93, 0.96, 1], ease: 'easeInOut' }}
            >
              <Eye className="w-8 h-8 sm:w-9 sm:h-9 text-blue-500 dark:text-blue-400" style={{ filter: 'drop-shadow(0 0 15px rgba(59, 130, 246, 0.4))' }} />
            </motion.div>
          </motion.div>

          <h1 className="relative z-10 text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-cyan-500 to-blue-500 tracking-wide">
            {t('oracle.title')}
          </h1>
        </motion.div>

        {archetypeInfo && (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden mb-8 p-6 sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-purple-400/10 to-pink-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="flex-shrink-0">
                <ArchetypeSymbol
                  archetypeId={archetypeId || ''}
                  subcategoryId={subcategoryId || null}
                  size={100}
                  animated={true}
                />
              </div>

              <div className="flex-1 text-center md:text-left">
                <p className="text-sm mb-1 font-semibold" style={{ color: getSubcategoryColor(userPersonality.personalidade_completa) }}>
                  {t('oracle.cinematicEssence')}
                </p>
                <h2 className="text-3xl font-bold mb-2" style={{ color: getSubcategoryColor(userPersonality.personalidade_completa) }}>
                  {userPersonality.personalidade_completa}
                </h2>
                <p className="text-xl text-gray-800 dark:text-white font-semibold mb-3">
                  {archetypeInfo.archetype_name} {archetypeInfo.subcategory_name}
                </p>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  {archetypeInfo.description}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 md:ml-auto w-full md:w-auto mt-4 md:mt-0">
                <motion.button
                  onClick={() => setShowRevelationModal(true)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl hover:shadow-lg hover:shadow-pink-500/25 transition-all text-sm font-semibold"
                >
                  <Scroll className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden md:inline">{t('oracle.revelation')}</span>
                </motion.button>

                <motion.button
                  onClick={() => setShowInfoModal(true)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/25 transition-all text-sm font-semibold"
                >
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden md:inline">Info</span>
                </motion.button>

                <motion.button
                  onClick={() => setShowPersonasModal(true)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:shadow-lg hover:shadow-emerald-500/25 transition-all text-sm font-semibold"
                >
                  <LayoutGrid className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden md:inline">{i18n.language.startsWith('pt') ? 'Arquétipos' : 'Archetypes'}</span>
                </motion.button>

                <motion.button
                  onClick={() => setShowPersonaShare(true)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all text-sm font-semibold"
                >
                  <Share2 className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden md:inline">{i18n.language.startsWith('pt') ? 'Compartilhar' : 'Share'}</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* "Bibliotecas do Oráculo" — agora é uma feature real, navegando
            pra /oracle/libraries. Mantém o design de destaque (primeiro,
            largura total, gradiente âmbar/roxo) condizente com o papel
            de carro-chefe do hub. */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <Link to="/oracle/libraries" className="block">
            <motion.div
              whileHover={{ scale: 1.01, y: -3 }}
              animate={{
                boxShadow: [
                  '0 0 0px rgba(245,158,11,0)',
                  '0 0 35px rgba(245,158,11,0.35)',
                  '0 0 0px rgba(245,158,11,0)',
                ],
              }}
              transition={{ boxShadow: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
              className="relative rounded-3xl bg-gradient-to-br from-amber-500/10 via-white/40 to-purple-500/10 dark:from-amber-500/15 dark:via-gray-800/40 dark:to-purple-500/15 backdrop-blur-xl border border-amber-300/50 dark:border-amber-500/40 shadow-2xl overflow-hidden p-6 sm:p-8"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-amber-400/25 to-yellow-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-56 h-56 bg-gradient-to-tr from-purple-400/20 to-violet-500/15 rounded-full blur-3xl pointer-events-none" />

              {/* Reflexo de luz atravessando o card periodicamente — mesma
                  técnica já usada nos banners dourados de perfil, dando
                  um brilho vivo em vez de estático. */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)',
                }}
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3, ease: 'easeInOut' }}
              />

              <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-5">
                <div className="flex-shrink-0 p-4 rounded-2xl bg-gradient-to-br from-amber-500/25 to-yellow-500/25 border border-amber-400/40 shadow-lg">
                  <LibraryBig className="w-10 h-10 text-amber-600 dark:text-amber-400" style={{ filter: 'drop-shadow(0 0 10px rgba(245,158,11,0.4))' }} />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500 mb-1.5">
                    {t('oracle.libraries.title', { defaultValue: 'Biblioteca dos Oráculos' })}
                  </h2>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed max-w-xl">
                    {t('oracle.libraries.description', { defaultValue: 'Coleções e trilhas curadas pelos Oráculos, construídas a partir de tudo que eles já aprenderam sobre o seu gosto cinematográfico.' })}
                  </p>
                </div>
              </div>
            </motion.div>
          </Link>
        </motion.div>

        <motion.div
          className="grid md:grid-cols-2 gap-6 mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          {/* Era o card "Recomendação" com 2 modos internos (Duelo/
              Clássico) — a recomendação clássica foi aposentada, então
              esse card virou só o acesso direto ao Duelo, com o símbolo
              de espadas cruzadas como identidade central, não mais um
              atalho secundário dentro de uma grade de opções. */}
          <motion.div whileHover={{ scale: 1.03, y: -5 }} whileTap={{ scale: 0.98 }} className="h-full">
            <Link
              to="/oracle/duel"
              className="block h-full relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden p-6 group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-pink-500/10 to-rose-500/10 dark:from-pink-500/20 dark:to-rose-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-400/20 to-rose-500/20 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 h-full flex flex-col">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-400/30 w-fit mb-4">
                  <Swords className="w-8 h-8 text-pink-500 dark:text-pink-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                  {t('duel.modeToggleDuel')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-1">
                  {t('oracle.recommend.description')}
                </p>
                <div className="flex items-center gap-2 text-pink-500 dark:text-pink-400 text-sm font-semibold">
                  <span>3 tickets</span>
                </div>
              </div>
            </Link>
          </motion.div>

          {/* Duelo de Watchlist — a recomendação clássica saiu, e no lugar
              dela ganhamos aqui um segundo acesso pra uma função que já
              existe de verdade dentro da Biblioteca: mesmo modal, só que
              acessível também a partir do hub. Reaproveita o mesmo padrão
              de navegação com state que a Home já usa pra abrir o Duelo
              de Watchlist direto na Biblioteca, sem duplicar nenhuma
              lógica nova. */}
          <motion.div whileHover={{ scale: 1.03, y: -5 }} whileTap={{ scale: 0.98 }} className="h-full">
            <Link
              to="/library"
              state={{ openWatchlistDuel: true }}
              className="block h-full relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl overflow-hidden p-6 group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-400/20 to-cyan-500/20 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 h-full flex flex-col">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-400/30 w-fit mb-4">
                  <Swords className="w-8 h-8 text-blue-500 dark:text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                  {t('watchlistDuel.title')}
                </h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 flex-1">
                  {t('watchlistDuel.description', { defaultValue: 'Deixe seus próprios filmes da watchlist competirem entre si até sobrar só um vencedor.' })}
                </p>
                <div className="flex items-center gap-2 text-blue-500 dark:text-blue-400 text-sm font-semibold">
                  <span>{t('library.watchList')}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        </motion.div>

        {userPersonality?.personalidade_completa && userPersonality.personalidade_completa.length >= 3 && (
          <CinematicPersonaCard
            personalityId={userPersonality.personalidade_completa}
            language={i18n.language}
          />
        )}
      </div>

      <AnimatePresence>
        {showCompletionModal && questionnaireResult && archetypeInfo && (
          <PersonalityCompletionModal
            isOpen={showCompletionModal}
            onClose={handleModalClose}
            personalityId={userPersonality?.personalidade_completa || ''}
            archetypeName={archetypeInfo.archetype_name || ''}
            subcategoryName={archetypeInfo.subcategory_name || ''}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRevelationModal && archetypeInfo && !showCompletionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+4rem)]"
            onClick={() => setShowRevelationModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative max-w-2xl w-full max-h-[calc(100vh-6rem)] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative rounded-3xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8">
                <button
                  onClick={() => setShowRevelationModal(false)}
                  className="absolute top-4 right-4 z-10 p-2.5 bg-gray-200/60 dark:bg-gray-700/60 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>

                {/* Antes: o código da personalidade ("REI", por exemplo)
                    ganhava um card próprio, destacado, em fonte enorme
                    (text-3xl) — o maior elemento visual do modal inteiro,
                    ofuscando o conteúdo de verdade (as duas seções
                    abaixo, que são a parte realmente útil/funcional).
                    Agora o código+nome viram uma linha de identificação
                    compacta, integrada ao próprio cabeçalho — visível,
                    mas sem competir pelo protagonismo do modal. */}
                <div className="flex items-center gap-3 mb-2">
                  <Scroll className="w-6 h-6 text-pink-500 flex-shrink-0" style={{ filter: 'drop-shadow(0 0 8px rgba(236,72,153,0.5))' }} />
                  <h2 className="text-xl font-bold text-gray-800 dark:text-white">{t('oracle.revelation')}</h2>
                </div>
                <div className="flex items-center gap-2 mb-6 pl-9 flex-wrap">
                  <span className="text-lg font-bold" style={{ color: getSubcategoryColor(userPersonality?.personalidade_completa) }}>
                    {userPersonality?.personalidade_completa}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {archetypeInfo.archetype_name} {archetypeInfo.subcategory_name}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl p-5 border border-pink-300/50 dark:border-pink-500/30 bg-pink-50/50 dark:bg-pink-500/10">
                    <h3 className="text-base font-bold text-pink-600 dark:text-pink-400 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 flex-shrink-0" />
                      {t('oracle.yourEssence')} ({getEssenceLabel(userPersonality?.arquetipo_primario, userPersonality?.arquetipo_secundario, i18n.language.startsWith('pt') ? 'pt' : 'en')})
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{archetypeInfo.archetype_description}</p>
                  </div>
                  <div className="rounded-xl p-5 border border-blue-300/50 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/10">
                    <h3 className="text-base font-bold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-2">
                      <Eye className="w-4 h-4 flex-shrink-0" />
                      {t('oracle.yourAttunement')} ({getSubcategoryName(archetypeInfo.subcategory_name, i18n.language.startsWith('pt') ? 'pt' : 'en')})
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{archetypeInfo.subcategory_description}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showInfoModal && userPersonality && !showCompletionModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+4rem)]"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative max-w-2xl w-full max-h-[calc(100vh-6rem)] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative rounded-3xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="absolute top-4 right-4 z-10 p-2.5 bg-gray-200/60 dark:bg-gray-700/60 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>

                <div className="flex items-center justify-center gap-3 mb-6">
                  <Eye className="w-8 h-8 text-blue-500" style={{ filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' }} />
                  <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{t('oracle.architectureTitle')}</h2>
                </div>

                <div className="space-y-5 text-gray-700 dark:text-gray-200">
                  <p className="text-center italic text-gray-600 dark:text-gray-400">
                    {t('oracle.architectureIntro')}
                  </p>

                  <div className="rounded-xl p-5 border border-blue-300/50 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/10">
                    <h3 className="text-base font-bold text-blue-600 dark:text-blue-300 mb-2 flex items-center gap-2">
                      <span>1.</span>
                      {t('oracle.theEssence')} ({getEssenceLabel(userPersonality?.arquetipo_primario, userPersonality?.arquetipo_secundario, i18n.language.startsWith('pt') ? 'pt' : 'en')})
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-3">
                      {t('oracle.essenceProfileText', { profile: `${userPersonality?.arquetipo_primario}${userPersonality?.arquetipo_secundario}` })}
                    </p>
                    <div className="bg-black/10 dark:bg-black/30 rounded-lg p-3 mb-2">
                      <p className="text-gray-500 dark:text-gray-400 text-xs font-bold mb-1">{t('oracle.essenceLogicLabel')}</p>
                      <p className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                        {t('oracle.essenceLogicText')}
                      </p>
                    </div>
                    <div className="bg-black/10 dark:bg-black/30 rounded-lg p-3">
                      <p className="text-gray-500 dark:text-gray-400 text-xs font-bold mb-1">{t('oracle.essenceResultLabel')}</p>
                      <p className="text-gray-700 dark:text-gray-300 text-xs leading-relaxed">
                        {t('oracle.essenceResultText')}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl p-5 border border-amber-300/50 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5">
                    <h3 className="text-base font-bold text-amber-600 dark:text-amber-300 mb-2 flex items-center gap-2">
                      <span>2.</span>
                      {t('oracle.theAttunement')} ({getSubcategoryName(archetypeInfo.subcategory_name, i18n.language.startsWith('pt') ? 'pt' : 'en')})
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-3">
                      {t('oracle.subarchetypeText', { id: userPersonality?.subcategoria_id })}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 text-xs mb-2">
                      {t('oracle.axesListTitle')}
                    </p>
                    <ul className="space-y-1.5 text-xs">
                      {[
                        { a: t('oracle.axisRadiant'), b: t('oracle.axisShadowy'), desc: t('oracle.axisOptimismMelancholy'), ca: '#fbbf24', cb: '#8b5cf6' },
                        { a: t('oracle.axisClassic'), b: t('oracle.axisExperimental'), desc: t('oracle.axisTraditionBoldness'), ca: '#ef4444', cb: '#3b82f6' },
                        { a: t('oracle.axisDense'), b: t('oracle.axisLight'), desc: t('oracle.axisComplexityAccessibility'), ca: '#6b7280', cb: '#10b981' },
                      ].map((row, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-gray-400 mt-0.5">•</span>
                          <span className="text-gray-700 dark:text-gray-300">
                            <span className="font-semibold" style={{ color: row.ca }}>{row.a}</span>
                            {' vs. '}
                            <span className="font-semibold" style={{ color: row.cb }}>{row.b}</span>
                            {' — '}{row.desc}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl p-5 border border-cyan-300/50 dark:border-cyan-500/30 bg-cyan-50/50 dark:bg-cyan-500/10">
                    <h3 className="text-lg font-bold text-cyan-600 dark:text-cyan-400 mb-4 flex items-center gap-2">
                      <span className="text-2xl">3.</span>
                      {t('oracle.theGraph')}
                    </h3>

                    <div className="flex justify-center mb-4">
                      <PentagonGraph points={spectrumPoints} subcategoryId={userPersonality?.personalidade_completa || ''} />
                    </div>

                    <div className="flex justify-center">
                      <button
                        onClick={() => {
                          if (isPremium) {
                            setShowRetakeQuizModal(true);
                          } else {
                            setShowPremiumRequiredModal(true);
                          }
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white rounded-xl hover:shadow-lg transition-all text-sm font-semibold"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>{t('oracle.retakeQuiz')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRetakeQuizModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowRetakeQuizModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-2xl border border-white/60 dark:border-gray-700/60 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 text-center">
                {t('oracle.retakeQuizTitle')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
                {t('oracle.retakeQuizConfirm')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRetakeQuizModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl transition-all font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={async () => {
                    setShowRetakeQuizModal(false);
                    setShowInfoModal(false);
                    await supabase
                      .from('profiles')
                      .update({ subcategoria_id: null })
                      .eq('id', session?.user?.id);
                    await loadUserData();
                  }}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl transition-all font-medium"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPremiumRequiredModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            onClick={() => setShowPremiumRequiredModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-md w-full rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-2xl border border-amber-300/50 dark:border-amber-500/30 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-4 text-center">
                {t('oracle.premiumFeatureTitle')}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
                {t('oracle.premiumFeatureRetake')}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPremiumRequiredModal(false)}
                  className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white rounded-xl transition-all font-medium"
                >
                  {t('common.close')}
                </button>
                <Link
                  to="/premium"
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl transition-all text-center font-medium"
                >
                  {t('oracle.viewPremium')}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>

    {session?.user?.id && (
      <PersonasModal
        isOpen={showPersonasModal}
        onClose={() => setShowPersonasModal(false)}
        viewerId={session.user.id}
        viewerPersonaCode={userPersonality?.personalidade_completa ?? null}
      />
    )}

    {userPersonality?.personalidade_completa && archetypeInfo && (
      <PersonaShareModal
        isOpen={showPersonaShare}
        onClose={() => setShowPersonaShare(false)}
        personaCode={userPersonality.personalidade_completa}
        archetypeName={archetypeInfo.archetype_name}
        subcategoryName={archetypeInfo.subcategory_name}
        username={username}
      />
    )}
    </>
  );
}