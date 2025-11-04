import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, Ticket, Plus, ArrowLeft, HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getMoodGenres } from '../lib/mood-genres';
import MovieDetailsModal from '../components/MovieDetailsModal';

type CardType = 'bogart' | 'fincher' | 'cypher';

export default function OracleRecommend() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardType>('bogart');
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<{
    movieId: number;
    characterPhrase: string;
    movieData: any;
  } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<Date | null>(null);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [selectedMovieForDetails, setSelectedMovieForDetails] = useState<any>(null);
  const [showOracleInfoModal, setShowOracleInfoModal] = useState(false);

  // Debug: Log state changes
  useEffect(() => {
    console.log('📊 State Update - recommendation:', recommendation);
    console.log('📊 State Update - loading:', loading);
  }, [recommendation, loading]);

  const moods = [
    t('oracle.moods.feelGood'),
    t('oracle.moods.needCry'),
    t('oracle.moods.adrenaline'),
    t('oracle.moods.mindBlowing'),
    t('oracle.moods.laughOutLoud'),
    t('oracle.moods.slowCalm'),
    t('oracle.moods.romantic'),
    t('oracle.moods.darkScary'),
    t('oracle.moods.familyTime'),
    t('oracle.moods.randomSurprise')
  ];

  const moodColors = {
    [t('oracle.moods.feelGood')]: {
      bg: 'from-sky-500/80 to-sky-700/80',
      hover: 'from-sky-600/80 to-sky-800/80',
      text: 'text-sky-100'
    },
    [t('oracle.moods.needCry')]: {
      bg: 'from-blue-500/80 to-blue-700/80',
      hover: 'from-blue-600/80 to-blue-800/80',
      text: 'text-blue-100'
    },
    [t('oracle.moods.adrenaline')]: {
      bg: 'from-red-500/80 to-red-700/80',
      hover: 'from-red-600/80 to-red-800/80',
      text: 'text-red-100'
    },
    [t('oracle.moods.mindBlowing')]: {
      bg: 'from-pink-500/80 to-pink-700/80',
      hover: 'from-pink-600/80 to-pink-800/80',
      text: 'text-pink-100'
    },
    [t('oracle.moods.laughOutLoud')]: {
      bg: 'from-green-500/80 to-green-700/80',
      hover: 'from-green-600/80 to-green-800/80',
      text: 'text-green-100'
    },
    [t('oracle.moods.slowCalm')]: {
      bg: 'from-emerald-500/80 to-emerald-700/80',
      hover: 'from-emerald-600/80 to-emerald-800/80',
      text: 'text-emerald-100'
    },
    [t('oracle.moods.romantic')]: {
      bg: 'from-orange-500/80 to-orange-700/80',
      hover: 'from-orange-600/80 to-orange-800/80',
      text: 'text-orange-100'
    },
    [t('oracle.moods.darkScary')]: {
      bg: 'from-gray-500/80 to-gray-700/80',
      hover: 'from-gray-600/80 to-gray-800/80',
      text: 'text-gray-100'
    },
    [t('oracle.moods.familyTime')]: {
      bg: 'from-yellow-500/80 to-yellow-700/80',
      hover: 'from-yellow-600/80 to-yellow-800/80',
      text: 'text-yellow-50'
    },
    [t('oracle.moods.randomSurprise')]: {
      bg: 'from-purple-500/80 to-purple-700/80',
      hover: 'from-purple-600/80 to-purple-800/80',
      text: 'text-purple-100'
    }
  };

  const mysticalMessages = [
    t('oracle.mysticalMessages.1'),
    t('oracle.mysticalMessages.2'),
    t('oracle.mysticalMessages.3'),
    t('oracle.mysticalMessages.4'),
    t('oracle.mysticalMessages.5'),
    t('oracle.mysticalMessages.6'),
    t('oracle.mysticalMessages.7'),
    t('oracle.mysticalMessages.8'),
    t('oracle.mysticalMessages.9'),
    t('oracle.mysticalMessages.10'),
    t('oracle.mysticalMessages.11'),
    t('oracle.mysticalMessages.12')
  ];

  const cards = [
    {
      id: 'bogart' as CardType,
      name: t('oracle.cards.bogart'),
      image: '/assets/BOGART.png',
      description: t('oracle.cards.bogartSubtitle')
    },
    {
      id: 'fincher' as CardType,
      name: t('oracle.cards.fincher'),
      image: '/assets/FINCHER.png',
      description: t('oracle.cards.fincherSubtitle')
    },
    {
      id: 'cypher' as CardType,
      name: t('oracle.cards.cypher'),
      image: '/assets/CYPHER.png',
      description: t('oracle.cards.cypherSubtitle')
    }
  ];

  useEffect(() => {
    if (session?.user?.id) {
      fetchTicketInfo();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!loading && !recommendation) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % mysticalMessages.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [loading, recommendation, mysticalMessages.length]);


  const fetchTicketInfo = async () => {
    try {
      const { data, error } = await supabase
        .rpc('check_and_reset_tickets', { user_id_param: session?.user?.id });

      if (error) throw error;

      if (data && data.length > 0) {
        const ticketInfo = data[0];
        setTicketsRemaining(ticketInfo.tickets_remaining);
        setNextReset(new Date(ticketInfo.next_reset));
      }
    } catch (error) {
      console.error('Error fetching ticket info:', error);
      toast.error(t('oracle.prediction.notEnough'));
      setTicketsRemaining(0);
      setNextReset(null);
    }
  };

  const formatTimeUntilReset = () => {
    if (!nextReset) return '';

    const now = new Date();
    const diff = nextReset.getTime() - now.getTime();

    if (diff <= 0) return t('common.now');

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  const handleGetRecommendation = async () => {
    if (!session?.user?.id || !selectedMood) return;

    if (ticketsRemaining !== null && ticketsRemaining < 50) {
      toast.error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
      return;
    }

    try {
      setLoading(true);
      setRecommendation(null);
      setInfoMessage(null);

      // Map mood to moodKey for backend
      const moodKeyMap: Record<string, string> = {
        [t('oracle.moods.feelGood')]: 'feel-good',
        [t('oracle.moods.needCry')]: 'need-to-cry',
        [t('oracle.moods.adrenaline')]: 'adrenaline',
        [t('oracle.moods.mindBlowing')]: 'mind-blowing',
        [t('oracle.moods.laughOutLoud')]: 'laugh-out-loud',
        [t('oracle.moods.slowCalm')]: 'slow-and-calm',
        [t('oracle.moods.romantic')]: 'romantic',
        [t('oracle.moods.darkScary')]: 'dark-and-scary',
        [t('oracle.moods.familyTime')]: 'family-time',
        [t('oracle.moods.randomSurprise')]: 'random-surprise'
      };

      const moodKey = moodKeyMap[selectedMood] || 'random-surprise';

      console.log('🎯 Requesting recommendation with:', {
        userId: session.user.id,
        mood: selectedMood,
        cardType: selectedCard,
        moodKey
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommend-movie`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: session.user.id,
            mood: selectedMood,
            cardType: selectedCard,
            moodKey,
            language: i18n.language
          })
        }
      );

      if (!response.ok) {
        if (response.status === 403) {
          const error = await response.json();
          setTicketsRemaining(error.ticketsRemaining);
          throw new Error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
        }
        throw new Error(t('common.error'));
      }

      const data = await response.json();

      console.log('✅ Recommendation response received:', data);
      console.log('📊 Response structure:', {
        hasMovieId: !!data.movieId,
        hasMovieData: !!data.movieData,
        hasCharacterPhrase: !!data.characterPhrase,
        ticketsRemaining: data.ticketsRemaining
      });

      if (data.error) {
        throw new Error(data.error);
      }

      // Update ticket count
      setTicketsRemaining(data.ticketsRemaining);

      // If no movieId, this is a text-only response (not enough ratings, pool empty, etc.)
      if (!data.movieId || !data.movieData) {
        console.log('⚠️ No movie data in response, showing text only');
        setInfoMessage(data.recommendation || t('common.error'));
        return;
      }

      console.log('✅ Movie details received from backend:', data.movieData.title);

      // Set the complete recommendation object
      const recommendationObject = {
        movieId: data.movieId,
        characterPhrase: data.characterPhrase,
        movieData: data.movieData
      };

      console.log('🎯 Setting recommendation state:', recommendationObject);
      setRecommendation(recommendationObject);
      console.log('✅ Recommendation state set successfully!');

    } catch (error) {
      console.error('❌ Error getting recommendation:', error);
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      console.log('🏁 Finally block - setting loading to false');
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
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

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-900 via-pink-900/30 to-purple-900/30 py-8 px-4 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-pink-500/30"
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
        className="max-w-4xl mx-auto relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-800/50 backdrop-blur-sm rounded-full transition-colors mb-8"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          variants={itemVariants}
        >
          <ArrowLeft className="w-6 h-6 text-gray-400" />
        </motion.button>

        <motion.div className="text-center mb-12" variants={itemVariants}>
          <motion.div
            className="flex justify-center mb-4"
            initial={{ y: 0 }}
            animate={{ y: [-10, 10, -10] }}
            transition={{
              duration: 6,
              repeat: Infinity,
              repeatType: "reverse"
            }}
          >
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-pink-500/20 blur-lg"></div>
              <Wand2 className="w-20 h-20 text-pink-400 relative z-10" />
            </div>
          </motion.div>

          <motion.h1
            className="text-3xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 tracking-widest mb-4"
            variants={itemVariants}
          >
            {t('oracle.recommend.title')}
          </motion.h1>

          <motion.p
            className="text-gray-300 text-lg mb-6"
            variants={itemVariants}
          >
            {t('oracle.recommend.description')}
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-between items-stretch sm:items-center mb-10"
            variants={itemVariants}
          >
            <div className="bg-gradient-to-r from-purple-900/50 via-pink-700/50 to-purple-900/50 p-4 rounded-2xl shadow-inner border border-pink-500/30 backdrop-blur-sm flex flex-row items-center justify-between sm:gap-6 text-white text-sm">
              <div className="flex items-center">
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 1 }}
                >
                  <Ticket className="w-5 h-5 mr-2 text-yellow-400" />
                </motion.div>
                <span className="font-semibold">{ticketsRemaining}</span>
                <span>&nbsp;tickets</span>
              </div>
              {nextReset && (
                <>
                  <div className="w-px h-4 bg-pink-400/30 mx-4" />
                  <div>
                    <span className="font-semibold">Next reset:</span> {formatTimeUntilReset()}
                  </div>
                </>
              )}
            </div>
            <motion.button
              onClick={() => navigate('/premium')}
              className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl border border-yellow-300 dark:border-yellow-600/50"
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-5 h-5 mr-2" />
              {t('oracle.prediction.addMore')}
            </motion.button>
          </motion.div>
        </motion.div>

        {/* Cards Selection */}
        <motion.div variants={itemVariants} className="mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h2 className="text-xl font-bold text-pink-300 text-center">
              {t('oracle.cards.title', { defaultValue: 'Choose Your Oracle' })}
            </h2>
            <button
              onClick={() => setShowOracleInfoModal(true)}
              className="text-pink-400 hover:text-pink-300 transition-colors"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {cards.map((card) => (
              <motion.button
                key={card.id}
                onClick={() => setSelectedCard(card.id)}
                className={`relative overflow-hidden rounded-lg transition-all ${
                  selectedCard === card.id
                    ? 'ring-2 ring-pink-400 shadow-lg shadow-pink-500/50'
                    : 'opacity-50 grayscale hover:opacity-70'
                }`}
                whileHover={{ scale: 1.05, y: -5 }}
                whileTap={{ scale: 0.98 }}
              >
                <img
                  src={card.image}
                  alt={card.name}
                  className="w-full h-auto"
                />
                <div className={`absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent ${
                  selectedCard === card.id ? '' : 'opacity-70'
                }`}>
                  <p className="text-white font-bold text-sm text-center">{card.name}</p>
                  <p className="text-gray-300 text-xs text-center">{card.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-8"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {moods.map((mood) => {
            const isSelected = selectedMood === mood;
            const moodStyle = moodColors[mood] || moodColors[t('oracle.moods.randomSurprise')];

            return (
              <motion.button
                key={mood}
                onClick={() => setSelectedMood(mood)}
                className={`relative px-4 py-3 rounded-lg transition-all text-center overflow-hidden border ${
                  isSelected
                    ? 'border-white/30 shadow-lg scale-105 z-10'
                    : 'border-transparent shadow-md hover:shadow-lg'
                }`}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.98 }}
                variants={itemVariants}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${
                  isSelected
                    ? moodStyle.hover
                    : moodStyle.bg
                } transition-all duration-300`}></div>

                {isSelected && (
                  <div className="absolute inset-0 overflow-hidden">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <motion.div
                        key={`mood-particle-${mood}-${i}`}
                        className="absolute w-1 h-1 rounded-full bg-white/40"
                        initial={{
                          x: Math.random() * 100 + "%",
                          y: Math.random() * 100 + "%"
                        }}
                        animate={{
                          x: [
                            Math.random() * 100 + "%",
                            Math.random() * 100 + "%",
                            Math.random() * 100 + "%"
                          ],
                          y: [
                            Math.random() * 100 + "%",
                            Math.random() * 100 + "%",
                            Math.random() * 100 + "%"
                          ]
                        }}
                        transition={{
                          duration: 5 + Math.random() * 5,
                          repeat: Infinity
                        }}
                      />
                    ))}
                  </div>
                )}

                <span className={`relative z-10 font-medium ${moodStyle.text}`}>
                  {mood}
                </span>
              </motion.button>
            );
          })}
        </motion.div>

        <motion.div
          className="flex justify-center mb-8"
          variants={itemVariants}
        >
          <motion.button
            onClick={handleGetRecommendation}
            disabled={!selectedMood || loading}
            className="px-8 py-4 bg-gradient-to-r from-pink-500 to-pink-700 text-white rounded-lg hover:from-pink-600 hover:to-pink-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg hover:shadow-xl disabled:shadow-none border border-pink-400/30"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t('oracle.recommend.consulting')}</span>
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                <span>{t('oracle.recommend.cost', { cost: 25 })}</span>
              </>
            )}
          </motion.button>
        </motion.div>

        {loading && (
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            {console.log('🔄 Rendering LOADING state')}
            <div className="inline-flex items-center justify-center p-8 rounded-full bg-pink-500/10 backdrop-blur-sm border border-pink-500/20 mb-4 relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-pink-500/30 to-pink-600/10 blur-md"></div>
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.8, 1, 0.8]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
              >
                <Wand2 className="w-12 h-12 text-pink-400 relative z-10" />
              </motion.div>
            </div>
            <h2 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 mb-2">
              {t('oracle.recommend.consulting')}
            </h2>
            <p className="text-gray-400">{t('oracle.recommend.description')}</p>
          </motion.div>
        )}

        {infoMessage && !loading && (
          <motion.div
            className="relative group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-600/30 to-orange-600/30 rounded-lg blur opacity-25"></div>
            <div className="relative p-8 bg-gray-900/90 rounded-lg border border-yellow-500/30 backdrop-blur-sm">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="text-5xl">⚠️</div>
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
                  {t('oracle.speaksTitle')}
                </h2>
                <p className="text-gray-300 leading-relaxed text-lg max-w-2xl">
                  {infoMessage}
                </p>
                <button
                  onClick={() => setInfoMessage(null)}
                  className="mt-4 px-6 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 rounded-lg text-yellow-300 transition-all"
                >
                  {t('common.ok') || 'OK'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {recommendation && (
          <motion.div
            className="relative group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {console.log('✅ Rendering RECOMMENDATION state:', recommendation)}
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-600/30 to-purple-600/30 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative p-8 bg-gray-900/90 rounded-lg border border-pink-500/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <motion.h2
                  className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  ✨ {t('oracle.speaksTitle')}
                </motion.h2>
              </div>
              <motion.div
                className="flex flex-col items-center gap-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                {/* Show character phrase */}
                <p className="text-gray-300 leading-relaxed text-center italic max-w-2xl text-lg mb-8">
                  {recommendation.characterPhrase}
                </p>

                {/* Movie details container - Poster left, info right */}
                <div className="flex flex-col md:flex-row gap-6 items-start max-w-4xl mx-auto">
                  {/* Movie poster - Left side */}
                  <motion.div
                    className="cursor-pointer group/poster relative flex-shrink-0"
                    onClick={() => setSelectedMovieForDetails(recommendation.movieData)}
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <img
                      src={`https://image.tmdb.org/t/p/w500${recommendation.movieData.poster_path}`}
                      alt={recommendation.movieData.title}
                      className="rounded-lg shadow-2xl w-48 h-auto border-2 border-pink-500/30 group-hover/poster:border-pink-500/60 transition-all"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/poster:opacity-100 transition-opacity rounded-lg flex items-end justify-center pb-4">
                      <p className="text-white text-sm font-semibold">Click for details</p>
                    </div>
                  </motion.div>

                  {/* Movie info - Right side */}
                  <div className="flex-1 text-left">
                    {/* Title and year */}
                    <div className="mb-4">
                      <h3 className="text-2xl font-bold text-pink-400 mb-1">
                        {recommendation.movieData.title}
                      </h3>
                      {recommendation.movieData.release_date && (
                        <p className="text-gray-400 text-lg">
                          ({recommendation.movieData.release_date.substring(0, 4)})
                        </p>
                      )}
                    </div>

                    {/* Synopsis */}
                    <p className="text-gray-300 leading-relaxed">
                      {recommendation.movieData.overview || 'No synopsis available.'}
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}

        {!loading && !recommendation && (
          <motion.div
            className="relative group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {console.log('💤 Rendering IDLE state')}
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-600/30 to-purple-600/30 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <div className="relative p-8 bg-gray-900/90 rounded-lg border border-pink-500/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <motion.h2
                  className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  ✨ {t('oracle.speaksTitle')}
                </motion.h2>
              </div>
              <div className="flex flex-col items-center justify-center py-8">
                <motion.div
                  className="w-32 h-32 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 backdrop-blur-sm border border-pink-500/30 flex items-center justify-center mb-6"
                  animate={{
                    boxShadow: [
                      '0 0 15px rgba(236, 72, 153, 0.4)',
                      '0 0 25px rgba(236, 72, 153, 0.6)',
                      '0 0 15px rgba(236, 72, 153, 0.4)'
                    ],
                  }}
                  transition={{ duration: 4, repeat: Infinity }}
                >
                  <motion.div
                    className="w-24 h-24 rounded-full bg-gradient-to-br from-pink-600/40 to-purple-600/40 flex items-center justify-center"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <div className="relative w-12 h-12 flex items-center justify-center">
                      <div className="absolute w-full h-full rounded-full bg-pink-400/20"></div>
                      <motion.div
                        className="w-8 h-8 bg-pink-400 rounded-full flex items-center justify-center"
                        animate={{ scaleY: [1, 0.1, 1] }}
                        transition={{
                          duration: 0.1,
                          times: [0, 0.5, 1],
                          repeat: Infinity,
                          repeatDelay: 4
                        }}
                      >
                        <div className="absolute w-4 h-4 bg-gray-900 rounded-full"></div>
                        <motion.div
                          className="absolute w-2 h-2 bg-white rounded-full"
                          style={{ top: '25%', right: '25%' }}
                        />
                      </motion.div>
                    </div>
                  </motion.div>
                </motion.div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentMessageIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-pink-300 text-lg text-center italic"
                    style={{
                      textShadow: '0 0 10px rgba(236, 72, 153, 0.2)'
                    }}
                  >
                    {mysticalMessages[currentMessageIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        <div className="relative mt-20">
          <motion.div
            className="absolute left-1/2 top-0 -translate-x-1/2 -z-10 w-[500px] h-[500px] opacity-20"
            animate={{
              scale: [1, 1.05, 1],
              opacity: [0.2, 0.25, 0.2],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              repeatType: "reverse"
            }}
          >
            <div className="absolute inset-0 border-2 border-pink-400 rounded-full"></div>
            <div className="absolute inset-4 border border-purple-400 rounded-full"></div>
            <div className="absolute inset-10 border border-pink-400 rounded-full"></div>
            <div className="absolute inset-20 border border-purple-400 rounded-full"></div>
          </motion.div>
        </div>
      </motion.div>

      {/* Oracle Info Modal */}
      <AnimatePresence>
        {showOracleInfoModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowOracleInfoModal(false)}
          >
            <motion.div
              className="bg-gradient-to-b from-gray-900 to-black border border-pink-500/30 rounded-2xl p-4 sm:p-8 max-w-2xl w-full shadow-2xl relative overflow-hidden max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Decorative background */}
              <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute top-0 left-0 w-32 h-32 bg-pink-500 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-0 w-32 h-32 bg-purple-500 rounded-full blur-3xl" />
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowOracleInfoModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-20 p-2 bg-gray-800/80 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Content */}
              <div className="relative z-10">
                <h2 className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400 mb-6 text-center pr-10">
                  {t('oracle.cards.infoTitle', { defaultValue: 'Meet The Oracles' })}
                </h2>

                <div className="space-y-4 sm:space-y-6">
                  {/* Bogart - The Frog */}
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-emerald-500/30">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="text-3xl sm:text-4xl flex-shrink-0">🐸</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-emerald-400 mb-2">
                          {t('oracle.cards.bogart')} — {t('oracle.cards.bogartSubtitle', { defaultValue: 'Popular and Modern' })}
                        </h3>
                        <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
                          {t('oracle.cards.bogartDesc', { defaultValue: 'They say the Frog was an old critic who, after watching so many films, sank into his own armchair and was reborn in the swamp waters.' })}
                        </p>
                        <p className="text-emerald-300 text-xs sm:text-sm mt-2 font-medium">
                          {t('oracle.cards.bogartRec', { defaultValue: 'Recommends films after the 2000s, popular and well-rated' })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Fincher - The Fox */}
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-red-500/30">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="text-3xl sm:text-4xl flex-shrink-0">🦊</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-red-400 mb-2">
                          {t('oracle.cards.fincher')} — {t('oracle.cards.fincherSubtitle', { defaultValue: 'Classic and Cult' })}
                        </h3>
                        <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
                          {t('oracle.cards.fincherDesc', { defaultValue: 'The Fox was born among film reels and cigar smoke. Some say he was an assistant to directors that time has erased.' })}
                        </p>
                        <p className="text-red-300 text-xs sm:text-sm mt-2 font-medium">
                          {t('oracle.cards.fincherRec', { defaultValue: 'Recommends films before the 2000s, popular and cult gems.' })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cypher - The Snake */}
                  <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 sm:p-6 border border-orange-500/30">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="text-3xl sm:text-4xl flex-shrink-0">🐍</div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg sm:text-xl font-bold text-orange-400 mb-2">
                          {t('oracle.cards.cypher')} — {t('oracle.cards.cypherSubtitle', { defaultValue: 'Underground and Bombs' })} ☠️
                        </h3>
                        <p className="text-gray-300 text-xs sm:text-sm leading-relaxed">
                          {t('oracle.cards.cypherDesc', { defaultValue: 'The Snake crawls through the damp corridors where films are banned, forgotten or booed. She worships error as art and chaos as style.' })}
                        </p>
                        <p className="text-orange-300 text-xs sm:text-sm mt-2 font-medium">
                          {t('oracle.cards.cypherRec', { defaultValue: 'Recommends unpopular films regardless of their rating.' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {selectedMovieForDetails && (
        <MovieDetailsModal
          movie={selectedMovieForDetails}
          isOpen={true}
          onClose={() => setSelectedMovieForDetails(null)}
        />
      )}
    </motion.div>
  );
}
