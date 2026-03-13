import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wand2, Loader2, Ticket, Plus, ArrowLeft, HelpCircle, X, Sparkles, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { getMovieDetails } from '../lib/tmdb';
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
  const [cardStyle, setCardStyle] = useState<'default' | 'yugioh'>('default');

  const moods = [
    t('oracle.moods.adventures'),
    t('oracle.moods.catharsis'),
    t('oracle.moods.adrenaline'),
    t('oracle.moods.mindBlowing'),
    t('oracle.moods.laughOutLoud'),
    t('oracle.moods.drugTrip'),
    t('oracle.moods.romantic'),
    t('oracle.moods.darkScary'),
    t('oracle.moods.familyTime'),
    t('oracle.moods.randomSurprise')
  ];

  const moodColors: Record<string, { bg: string; hover: string; text: string; border: string }> = {
    [t('oracle.moods.adventures')]: {
      bg: 'bg-sky-500/20 dark:bg-sky-500/30',
      hover: 'hover:bg-sky-500/30 dark:hover:bg-sky-500/40',
      text: 'text-sky-700 dark:text-sky-300',
      border: 'border-sky-400/50 dark:border-sky-500/50'
    },
    [t('oracle.moods.catharsis')]: {
      bg: 'bg-blue-500/20 dark:bg-blue-500/30',
      hover: 'hover:bg-blue-500/30 dark:hover:bg-blue-500/40',
      text: 'text-blue-700 dark:text-blue-300',
      border: 'border-blue-400/50 dark:border-blue-500/50'
    },
    [t('oracle.moods.adrenaline')]: {
      bg: 'bg-red-500/20 dark:bg-red-500/30',
      hover: 'hover:bg-red-500/30 dark:hover:bg-red-500/40',
      text: 'text-red-700 dark:text-red-300',
      border: 'border-red-400/50 dark:border-red-500/50'
    },
    [t('oracle.moods.mindBlowing')]: {
      bg: 'bg-pink-500/20 dark:bg-pink-500/30',
      hover: 'hover:bg-pink-500/30 dark:hover:bg-pink-500/40',
      text: 'text-pink-700 dark:text-pink-300',
      border: 'border-pink-400/50 dark:border-pink-500/50'
    },
    [t('oracle.moods.laughOutLoud')]: {
      bg: 'bg-green-500/20 dark:bg-green-500/30',
      hover: 'hover:bg-green-500/30 dark:hover:bg-green-500/40',
      text: 'text-green-700 dark:text-green-300',
      border: 'border-green-400/50 dark:border-green-500/50'
    },
    [t('oracle.moods.drugTrip')]: {
      bg: 'bg-emerald-500/20 dark:bg-emerald-500/30',
      hover: 'hover:bg-emerald-500/30 dark:hover:bg-emerald-500/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-400/50 dark:border-emerald-500/50'
    },
    [t('oracle.moods.romantic')]: {
      bg: 'bg-orange-500/20 dark:bg-orange-500/30',
      hover: 'hover:bg-orange-500/30 dark:hover:bg-orange-500/40',
      text: 'text-orange-700 dark:text-orange-300',
      border: 'border-orange-400/50 dark:border-orange-500/50'
    },
    [t('oracle.moods.darkScary')]: {
      bg: 'bg-gray-500/20 dark:bg-gray-500/30',
      hover: 'hover:bg-gray-500/30 dark:hover:bg-gray-500/40',
      text: 'text-gray-700 dark:text-gray-300',
      border: 'border-gray-400/50 dark:border-gray-500/50'
    },
    [t('oracle.moods.familyTime')]: {
      bg: 'bg-yellow-500/20 dark:bg-yellow-500/30',
      hover: 'hover:bg-yellow-500/30 dark:hover:bg-yellow-500/40',
      text: 'text-yellow-700 dark:text-yellow-300',
      border: 'border-yellow-400/50 dark:border-yellow-500/50'
    },
    [t('oracle.moods.randomSurprise')]: {
      bg: 'bg-violet-500/20 dark:bg-violet-500/30',
      hover: 'hover:bg-violet-500/30 dark:hover:bg-violet-500/40',
      text: 'text-violet-700 dark:text-violet-300',
      border: 'border-violet-400/50 dark:border-violet-500/50'
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

  const getCardImage = (cardId: CardType) => {
    const suffix = cardStyle === 'yugioh' ? '2' : '';
    const cardNames = { bogart: 'BOGART', fincher: 'FINCHER', cypher: 'CYPHER' };
    return `/assets/${cardNames[cardId]}${suffix}.png`;
  };

  const cards = [
    { id: 'bogart' as CardType, name: t('oracle.cards.bogart'), get image() { return getCardImage('bogart'); }, description: t('oracle.cards.bogartSubtitle') },
    { id: 'fincher' as CardType, name: t('oracle.cards.fincher'), get image() { return getCardImage('fincher'); }, description: t('oracle.cards.fincherSubtitle') },
    { id: 'cypher' as CardType, name: t('oracle.cards.cypher'), get image() { return getCardImage('cypher'); }, description: t('oracle.cards.cypherSubtitle') }
  ];

  useEffect(() => {
    if (session?.user?.id) {
      fetchTicketInfo();
      fetchCardStyle();
    }
  }, [session?.user?.id]);

  const fetchCardStyle = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase.from('profiles').select('card_style').eq('id', session.user.id).single();
      if (error) throw error;
      if (data?.card_style) setCardStyle(data.card_style as 'default' | 'yugioh');
    } catch (error) {
      console.error('Error fetching card style:', error);
    }
  };

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
      const { data, error } = await supabase.rpc('check_and_reset_tickets', { user_id_param: session?.user?.id });
      if (error) throw error;
      if (data && data.length > 0) {
        setTicketsRemaining(data[0].tickets_remaining);
        setNextReset(new Date(data[0].next_reset));
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
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  const handleGetRecommendation = async () => {
    if (!session?.user?.id || !selectedMood) return;
    if (ticketsRemaining !== null && ticketsRemaining < 1) {
      toast.error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
      return;
    }

    try {
      setLoading(true);
      setRecommendation(null);
      setInfoMessage(null);

      const moodKeyMap: Record<string, string> = {
        [t('oracle.moods.adventures')]: 'adventures',
        [t('oracle.moods.catharsis')]: 'catharsis',
        [t('oracle.moods.adrenaline')]: 'adrenaline',
        [t('oracle.moods.mindBlowing')]: 'mind-blowing',
        [t('oracle.moods.laughOutLoud')]: 'laugh-out-loud',
        [t('oracle.moods.drugTrip')]: 'drug-trip',
        [t('oracle.moods.romantic')]: 'romantic',
        [t('oracle.moods.darkScary')]: 'dark-and-scary',
        [t('oracle.moods.familyTime')]: 'family-time',
        [t('oracle.moods.randomSurprise')]: 'random-surprise'
      };

      const moodKey = moodKeyMap[selectedMood] || 'random-surprise';

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
      if (data.error) throw new Error(data.error);

      setTicketsRemaining(data.ticketsRemaining);

      if (!data.movieId || !data.movieData) {
        setInfoMessage(data.recommendation || t('common.error'));
        return;
      }

      const mediaType = data.movieData.media_type || 'movie';
      const completeMovieData = await getMovieDetails(data.movieId, mediaType);

      setRecommendation({
        movieId: data.movieId,
        characterPhrase: data.characterPhrase,
        movieData: completeMovieData
      });

    } catch (error) {
      console.error('Error getting recommendation:', error);
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-pink-400/20 to-rose-400/20 dark:from-pink-600/10 dark:to-rose-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-purple-400/20 to-violet-400/20 dark:from-purple-600/10 dark:to-violet-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-blue-400/15 to-cyan-400/15 dark:from-blue-600/8 dark:to-cyan-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="max-w-4xl mx-auto relative z-10">
        <motion.button
          onClick={() => navigate(-1)}
          className="p-2.5 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl hover:bg-white/60 dark:hover:bg-gray-800/60 border border-white/60 dark:border-gray-700/60 rounded-full transition-colors mb-8"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </motion.button>

        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <motion.div
            className="flex justify-center mb-4"
            animate={{ y: [-5, 5, -5] }}
            transition={{ duration: 4, repeat: Infinity, repeatType: "reverse" }}
          >
            <div className="p-4 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 dark:from-pink-500/30 dark:to-rose-500/30 border border-pink-400/30">
              <Wand2 className="w-12 h-12 text-pink-500 dark:text-pink-400" style={{ filter: 'drop-shadow(0 0 15px rgba(236, 72, 153, 0.4))' }} />
            </div>
          </motion.div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-rose-500 to-pink-500 tracking-wide mb-3">
            {t('oracle.recommend.title')}
          </h1>

          <p className="text-gray-600 dark:text-gray-300 text-lg mb-8">
            {t('oracle.recommend.description')}
          </p>

          <motion.div
            className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 p-4 mb-8 inline-flex flex-col sm:flex-row items-center gap-4 sm:gap-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-amber-500" />
              <span className="font-semibold text-gray-700 dark:text-gray-200">{ticketsRemaining ?? '...'}</span>
              <span className="text-gray-500 dark:text-gray-400">tickets</span>
            </div>
            {nextReset && (
              <>
                <div className="hidden sm:block w-px h-5 bg-gray-300 dark:bg-gray-600" />
                <div className="text-gray-600 dark:text-gray-300 text-sm">
                  <span className="font-semibold">Reset:</span> {formatTimeUntilReset()}
                </div>
              </>
            )}
            <motion.button
              onClick={() => navigate('/premium')}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all text-sm flex items-center gap-2"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <Plus className="w-4 h-4" />
              {t('oracle.prediction.addMore')}
            </motion.button>
          </motion.div>
        </motion.div>

        <motion.div
          className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-center gap-2 mb-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              {t('oracle.cards.title', { defaultValue: 'Choose Your Oracle' })}
            </h2>
            <button onClick={() => setShowOracleInfoModal(true)} className="text-pink-500 hover:text-pink-400 transition-colors">
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {cards.map((card) => (
              <motion.button
                key={card.id}
                onClick={() => setSelectedCard(card.id)}
                className={`relative overflow-hidden rounded-xl transition-all ${
                  selectedCard === card.id
                    ? 'ring-2 ring-pink-500 shadow-lg shadow-pink-500/30'
                    : 'opacity-60 grayscale hover:opacity-80 hover:grayscale-0'
                }`}
                whileHover={{ scale: 1.03, y: -3 }}
                whileTap={{ scale: 0.98 }}
              >
                <img src={card.image} alt={card.name} className="w-full h-auto" />
                <div className={`absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent ${selectedCard === card.id ? '' : 'opacity-70'}`}>
                  <p className="text-white font-bold text-xs sm:text-sm text-center">{card.name}</p>
                  <p className="text-gray-300 text-[10px] sm:text-xs text-center hidden sm:block">{card.description}</p>
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        <motion.div
          className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xl font-bold text-gray-800 dark:text-white mb-6 text-center">
            {t('oracle.selectMood', { defaultValue: 'Select Your Mood' })}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {moods.map((mood) => {
              const isSelected = selectedMood === mood;
              const moodStyle = moodColors[mood] || moodColors[t('oracle.moods.randomSurprise')];

              return (
                <motion.button
                  key={mood}
                  onClick={() => setSelectedMood(mood)}
                  className={`px-3 py-3 rounded-xl transition-all text-center border backdrop-blur-sm ${moodStyle.bg} ${moodStyle.hover} ${moodStyle.text} ${
                    isSelected ? `${moodStyle.border} ring-2 ring-offset-2 ring-offset-transparent shadow-lg` : 'border-transparent'
                  }`}
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <span className="font-medium text-sm">{mood}</span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          className="flex justify-center mb-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <motion.button
            onClick={handleGetRecommendation}
            disabled={!selectedMood || loading}
            className="px-10 py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-lg rounded-2xl hover:shadow-xl hover:shadow-pink-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-3 border border-pink-400/30"
            whileHover={!loading && selectedMood ? { scale: 1.03 } : {}}
            whileTap={!loading && selectedMood ? { scale: 0.97 } : {}}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t('oracle.recommend.consulting')}</span>
              </>
            ) : (
              <>
                <Wand2 className="w-5 h-5" />
                <span>{t('oracle.recommend.cost', { cost: 1 })}</span>
              </>
            )}
          </motion.button>
        </motion.div>

        {loading && (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-6 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-400/30">
                <motion.div
                  animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Wand2 className="w-10 h-10 text-pink-500" />
                </motion.div>
              </div>
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500">
                {t('oracle.recommend.consulting')}
              </h2>
              <p className="text-gray-500 dark:text-gray-400">{t('oracle.recommend.description')}</p>
            </div>
          </motion.div>
        )}

        {infoMessage && !loading && (
          <motion.div
            className="relative rounded-3xl bg-amber-50/60 dark:bg-amber-900/20 backdrop-blur-xl border border-amber-300/50 dark:border-amber-500/30 shadow-2xl p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col items-center text-center gap-4">
              <div className="text-5xl">Warning</div>
              <h2 className="text-2xl font-bold text-amber-600 dark:text-amber-400">{t('oracle.attention')}</h2>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed text-lg max-w-2xl">{infoMessage}</p>
              <button
                onClick={() => setInfoMessage(null)}
                className="mt-4 px-6 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-300 transition-all font-medium"
              >
                {t('common.ok') || 'OK'}
              </button>
            </div>
          </motion.div>
        )}

        {recommendation && !loading && (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="absolute inset-0 pointer-events-none rounded-3xl">
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-pink-400/10 to-rose-500/10 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-purple-400/10 to-violet-500/10 rounded-full blur-3xl" />
            </div>

            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-6 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-pink-500" /> {t('oracle.speaksTitle')}
              </h2>

              <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-center italic text-lg mb-8 max-w-2xl mx-auto">
                {recommendation.characterPhrase}
              </p>

              <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                <motion.div
                  className="cursor-pointer group relative flex-shrink-0"
                  onClick={() => setSelectedMovieForDetails(recommendation.movieData)}
                  whileHover={{ scale: 1.03 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                >
                  <img
                    src={`https://image.tmdb.org/t/p/w500${recommendation.movieData.poster_path}`}
                    alt={recommendation.movieData.title}
                    className="rounded-2xl shadow-2xl w-48 h-auto border-2 border-pink-400/30 group-hover:border-pink-500/60 transition-all"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-end justify-center pb-4">
                    <p className="text-white text-sm font-semibold">Click for details</p>
                  </div>
                </motion.div>

                <div className="flex-1 text-center md:text-left">
                  <h3 className="text-2xl font-bold text-pink-600 dark:text-pink-400 mb-1">
                    {recommendation.movieData.title}
                  </h3>
                  {recommendation.movieData.release_date && (
                    <p className="text-gray-500 dark:text-gray-400 text-lg mb-4">
                      ({recommendation.movieData.release_date.substring(0, 4)})
                    </p>
                  )}
                  <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                    {recommendation.movieData.overview || 'No synopsis available.'}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {!loading && !recommendation && !infoMessage && (
          <motion.div
            className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-6 text-center flex items-center justify-center gap-2">
              <Sparkles className="w-6 h-6 text-pink-500" /> {t('oracle.speaksTitle')}
            </h2>

            <div className="flex flex-col items-center justify-center py-6">
              <motion.div
                className="w-28 h-28 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 border border-pink-400/30 flex items-center justify-center mb-6"
                animate={{ boxShadow: ['0 0 15px rgba(236,72,153,0.3)', '0 0 25px rgba(236,72,153,0.5)', '0 0 15px rgba(236,72,153,0.3)'] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <motion.div
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-pink-500/30 to-rose-500/30 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <div className="relative w-10 h-10 flex items-center justify-center">
                    <div className="absolute w-full h-full rounded-full bg-pink-400/20" />
                    <motion.div
                      className="w-7 h-7 bg-pink-500 rounded-full flex items-center justify-center"
                      animate={{ scaleY: [1, 0.1, 1] }}
                      transition={{ duration: 0.1, times: [0, 0.5, 1], repeat: Infinity, repeatDelay: 4 }}
                    >
                      <div className="absolute w-3.5 h-3.5 bg-gray-900 rounded-full" />
                      <motion.div className="absolute w-1.5 h-1.5 bg-white rounded-full" style={{ top: '25%', right: '25%' }} />
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
                  className="text-pink-600 dark:text-pink-300 text-lg text-center italic"
                >
                  {mysticalMessages[currentMessageIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showOracleInfoModal && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowOracleInfoModal(false)}
          >
            <motion.div
              className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-3xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowOracleInfoModal(false)}
                className="absolute top-4 right-4 p-2.5 bg-gray-200/60 dark:bg-gray-700/60 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500 mb-6 text-center pr-10">
                {t('oracle.cards.infoTitle', { defaultValue: 'Meet The Oracles' })}
              </h2>

              <div className="space-y-4">
                <div className="rounded-xl p-4 border-2 border-pink-400/60 dark:border-pink-500/50 bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/30 dark:to-rose-900/30 shadow-lg">
                  <div className="flex items-center gap-3">
                    <Info className="w-5 h-5 text-pink-500 flex-shrink-0" />
                    <p className="text-pink-700 dark:text-pink-300 text-sm font-medium leading-relaxed">
                      {t('oracle.cards.disclaimer', { defaultValue: 'Nenhum oraculo recomenda filmes que estao adicionados em sua biblioteca.' })}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-emerald-300/50 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 dark:bg-emerald-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🐸
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-2">
                        {t('oracle.cards.bogart')} - {t('oracle.cards.bogartSubtitle', { defaultValue: 'Popular and Modern' })}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.bogartDesc', { defaultValue: 'They say the Frog was an old critic who, after watching so many films, sank into his own armchair and was reborn in the swamp waters.' })}
                      </p>
                      <p className="text-emerald-600 dark:text-emerald-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.bogartRec', { defaultValue: 'Recommends films after the 2000s, popular and well-rated' })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-red-300/50 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-red-500/20 dark:bg-red-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🦊
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">
                        {t('oracle.cards.fincher')} - {t('oracle.cards.fincherSubtitle', { defaultValue: 'Classic and Cult' })}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.fincherDesc', { defaultValue: 'The Fox was born among film reels and cigar smoke. Some say he was an assistant to directors that time has erased.' })}
                      </p>
                      <p className="text-red-600 dark:text-red-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.fincherRec', { defaultValue: 'Recommends films before the 2000s, popular and cult gems.' })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl p-5 border border-orange-300/50 dark:border-orange-500/30 bg-orange-50/50 dark:bg-orange-500/10">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-orange-500/20 dark:bg-orange-500/30 flex items-center justify-center flex-shrink-0 text-2xl">
                      🐍
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-orange-600 dark:text-orange-400 mb-2">
                        {t('oracle.cards.cypher')} - {t('oracle.cards.cypherSubtitle', { defaultValue: 'Underground and Bombs' })}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                        {t('oracle.cards.cypherDesc', { defaultValue: 'The Snake crawls through the damp corridors where films are banned, forgotten or booed. She worships error as art and chaos as style.' })}
                      </p>
                      <p className="text-orange-600 dark:text-orange-400 text-sm mt-2 font-medium">
                        {t('oracle.cards.cypherRec', { defaultValue: 'Recommends unpopular films regardless of their rating.' })}
                      </p>
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
