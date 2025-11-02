import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, Ticket, Plus, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getMoodGenres } from '../lib/mood-genres';

type CardType = 'bogart' | 'fincher' | 'cypher';

export default function OracleRecommend() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardType>('bogart');
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<Date | null>(null);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [libraryMovies, setLibraryMovies] = useState<number[]>([]);

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
      name: 'BOGART',
      image: '/assets/BOGART.png',
      description: t('oracle.cards.bogart', { defaultValue: 'Classic & Popular' })
    },
    {
      id: 'fincher' as CardType,
      name: 'FINCHER',
      image: '/assets/FINCHER.png',
      description: t('oracle.cards.fincher', { defaultValue: 'Underground Gems' })
    },
    {
      id: 'cypher' as CardType,
      name: 'CYPHER',
      image: '/assets/CYPHER.png',
      description: t('oracle.cards.cypher', { defaultValue: 'Paradox & Surprise' })
    }
  ];

  useEffect(() => {
    if (session?.user?.id) {
      fetchTicketInfo();
      fetchMovieData();
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (!loading && !prediction) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % mysticalMessages.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [loading, prediction, mysticalMessages.length]);

  const fetchMovieData = async () => {
    try {
      const { data: libraryData, error: libraryError } = await supabase
        .rpc('get_user_library', { user_id_input: session?.user?.id });

      if (libraryError) throw libraryError;

      const userMovieIds = libraryData.map((item: { movie_id: number }) => item.movie_id);
      setLibraryMovies(userMovieIds);
    } catch (error) {
      console.error('Error fetching movie data:', error);
      toast.error(t('common.error'));
    }
  };

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
      setPrediction(null);

      const moodGenres = getMoodGenres(selectedMood);

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
            moodGenres,
            libraryMovieIds: libraryMovies,
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

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.recommendation) {
        throw new Error('No recommendation received from Oracle');
      }

      console.log('=== RECOMMENDATION DEBUG ===');
      console.log('Card Type:', data.debug?.cardType);
      console.log('Mood Genres:', data.debug?.moodGenres);
      console.log('Movie Pool Size:', data.debug?.moviePoolSize);
      console.log('Movie Pool:', data.debug?.moviePool);
      console.log('Recommendation:', data.recommendation);
      console.log('=== END DEBUG ===');

      setPrediction(data.recommendation);
      setTicketsRemaining(data.ticketsRemaining);
    } catch (error) {
      console.error('Error getting recommendation:', error);
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
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
          <h2 className="text-xl font-bold text-pink-300 mb-4 text-center">
            {t('oracle.cards.title', { defaultValue: 'Choose Your Oracle' })}
          </h2>
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
                <span>{t('oracle.recommend.cost', { cost: 50 })}</span>
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

        {prediction && (
          <motion.div
            className="relative group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
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
                className="prose prose-lg prose-invert"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {prediction}
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}

        {!loading && !prediction && (
          <motion.div
            className="relative group"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
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
    </motion.div>
  );
}
