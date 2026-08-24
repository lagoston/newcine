import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, PenLine, Loader2, Ticket, Plus, Instagram, ArrowLeft, Sparkles, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { searchMovies } from '../lib/tmdb';
import { useDebounce } from 'use-debounce';
import { supabase, supabaseUrl } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface HypotheticalReview {
  review: string;
  rating: number;
  movieTitle: string;
  basedOnReviewCount: number;
  id?: string;
}

interface TicketError {
  error: string;
  ticketsRemaining: number;
}

// Mesma escala de cor do ClassInd usada no resto do site (verde→preto
// conforme a nota sobe) — aqui adaptada pra 0-10 direto, sem faixa etária,
// só pra dar uma pista visual rápida da nota antes mesmo de ler o texto.
function getRatingColor(rating: number): string {
  if (rating >= 8.5) return 'text-emerald-500';
  if (rating >= 7) return 'text-green-500';
  if (rating >= 5.5) return 'text-blue-500';
  if (rating >= 4) return 'text-amber-500';
  if (rating >= 2.5) return 'text-orange-500';
  return 'text-red-500';
}

export default function OraclePrediction() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<string | null>(null);
  const [selectedMoviePoster, setSelectedMoviePoster] = useState<string | null>(null);
  const [result, setResult] = useState<HypotheticalReview | null>(null);
  const [loading, setLoading] = useState({ search: false, generating: false, sharing: false });
  const [progress, setProgress] = useState(0);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<Date | null>(null);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);

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

  useEffect(() => {
    if (session?.user?.id) fetchTicketInfo();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!loading.generating && !result) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % mysticalMessages.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [loading.generating, result, mysticalMessages.length]);

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
      setTicketsRemaining(0);
      setNextReset(null);
    }
  };

  const handleSearch = async () => {
    if (!debouncedQuery.trim() || loading.generating) {
      setSearchResults([]);
      return;
    }
    try {
      setLoading(prev => ({ ...prev, search: true }));
      const results = await searchMovies(debouncedQuery);
      setSearchResults(results.slice(0, 5));
    } catch (error) {
      console.error('Error searching movies:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(prev => ({ ...prev, search: false }));
    }
  };

  React.useEffect(() => {
    handleSearch();
  }, [debouncedQuery]);

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

  const generateReview = async (movieName: string, movieId: number, posterPath?: string) => {
    if (!session?.user?.id) return;
    if (ticketsRemaining !== null && ticketsRemaining < 1) {
      toast.error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
      return;
    }

    if (posterPath) setSelectedMoviePoster(posterPath);

    try {
      const { data: existingRating, error: ratingError } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('movie_id', movieId)
        .maybeSingle();

      if (ratingError) console.error('Error checking movie rating:', ratingError);

      if (existingRating && existingRating.rating !== null) {
        toast.error(t('oracle.prediction.alreadyRated'));
        return;
      }

      setLoading(prev => ({ ...prev, generating: true }));
      setResult(null);
      setSelectedMovie(movieName);
      setSearchQuery('');
      setSearchResults([]);
      setProgress(0);

      const progressInterval = setInterval(() => {
        setProgress(prev => (prev >= 90 ? prev : prev + Math.random() * 15));
      }, 400);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/generate-hypothetical-review`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ movieId, mediaType: 'movie', language: i18n.language })
        }
      );

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.ticketsRemaining !== undefined) {
          const error = data as TicketError;
          setTicketsRemaining(error.ticketsRemaining);
          throw new Error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
        }
        throw new Error(data.error || t('common.error'));
      }

      if (data.error) throw new Error(data.error);
      if (!data.review) throw new Error('No review received from Oracle');

      setResult(data);
      setTicketsRemaining(data.ticketsRemaining);
    } catch (error) {
      console.error('Error generating hypothetical review:', error);
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setLoading(prev => ({ ...prev, generating: false }));
    }
  };

  const handleShare = async () => {
    if (!result || !selectedMovie || loading.sharing) return;

    try {
      setLoading(prev => ({ ...prev, sharing: true }));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = 1080;
      canvas.height = 1920;

      const background = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = '/assets/cineprev.webp';
      });

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const titleY = 200;
      const maxWidth = 900;
      const words = selectedMovie.split(' ');
      let line = '';
      let currentY = titleY;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), canvas.width / 2, currentY);
          line = words[i] + ' ';
          currentY += 70;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), canvas.width / 2, currentY);

      let posterCenterY = currentY + 200;

      if (selectedMoviePoster) {
        try {
          const posterUrl = `https://image.tmdb.org/t/p/w300${selectedMoviePoster}`;
          const posterResponse = await fetch(posterUrl, { cache: 'no-store' });
          const blob = await posterResponse.blob();
          const blobUrl = URL.createObjectURL(blob);

          const posterImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = blobUrl;
          });

          const posterWidth = 275;
          const posterHeight = 412;
          const gapBetween = 80;
          const noteAreaWidth = 300;
          const totalWidth = posterWidth + gapBetween + noteAreaWidth;
          const groupStartX = (canvas.width - totalWidth) / 2;
          const posterX = groupStartX;
          const posterY = currentY + 100;
          posterCenterY = posterY + (posterHeight / 2);

          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;

          URL.revokeObjectURL(blobUrl);
        } catch (error) {
          console.error('Error loading poster:', error);
        }
      }

      const gapBetween = 80;
      const noteAreaWidth = 300;
      const totalWidth = 275 + gapBetween + noteAreaWidth;
      const groupStartX = (canvas.width - totalWidth) / 2;
      const noteX = groupStartX + 275 + gapBetween + (noteAreaWidth / 2);
      const noteLabelY = posterCenterY - 120;

      ctx.fillStyle = '#CCCCCC';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(i18n.language.startsWith('pt') ? 'NOTA PREVISTA:' : 'PREDICTED RATING:', noteX, noteLabelY);

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 120px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(result.rating.toFixed(1), noteX, posterCenterY + 20);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '38px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0, 0, 0, 1)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;

      const summaryY = 850;
      const summaryMaxWidth = 900;
      const lineHeight = 52;
      const maxLines = 14;
      const bottomLimit = 1750;

      const summaryWords = result.review.split(' ');
      let summaryLine = '';
      let summaryCurrentY = summaryY;
      let lineCount = 0;
      let wasTextCut = false;

      for (let i = 0; i < summaryWords.length; i++) {
        const testLine = summaryLine + summaryWords[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > summaryMaxWidth && i > 0) {
          if (summaryCurrentY + lineHeight > bottomLimit || lineCount >= maxLines) {
            ctx.fillText(summaryLine.trim() + '...', canvas.width / 2, summaryCurrentY);
            wasTextCut = true;
            break;
          }
          ctx.fillText(summaryLine.trim(), canvas.width / 2, summaryCurrentY);
          summaryLine = summaryWords[i] + ' ';
          summaryCurrentY += lineHeight;
          lineCount++;
        } else {
          summaryLine = testLine;
        }
      }

      if (!wasTextCut && summaryLine.trim()) {
        if (summaryCurrentY + lineHeight > bottomLimit) {
          ctx.fillText(summaryLine.trim() + '...', canvas.width / 2, summaryCurrentY);
        } else {
          ctx.fillText(summaryLine.trim(), canvas.width / 2, summaryCurrentY);
        }
      }

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      const imageBlob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
      });

      if (navigator.share && navigator.canShare({ files: [new File([imageBlob], 'review.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([imageBlob], 'review.png', { type: 'image/png' })],
          title: `CineOracle: ${selectedMovie}`,
          text: `Check out my hypothetical review from CineOracle!`
        });
      } else {
        const url = URL.createObjectURL(imageBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cineoracle-${selectedMovie.toLowerCase().replace(/\s+/g, '-')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(t('common.imageDownloaded', 'Image downloaded successfully!'));
      }
    } catch (error) {
      console.error('Error sharing:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(prev => ({ ...prev, sharing: false }));
    }
  };

  const ShareButton = () => (
    <button
      onClick={handleShare}
      disabled={loading.sharing}
      className={`p-1 text-purple-500 hover:text-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${loading.sharing ? 'opacity-50 cursor-not-allowed' : ''}`}
      title="Compartilhar no Instagram"
    >
      {loading.sharing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Instagram className="w-6 h-6" />}
    </button>
  );

  const renderCrystalBall = () => {
    if (loading.generating) {
      return (
        <motion.div
          className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col items-center gap-4">
            <div className="p-6 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-400/30">
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <PenLine className="w-10 h-10 text-violet-500" />
              </motion.div>
            </div>
            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-purple-500">
              {t('oracle.prediction.consulting')}
            </h2>
            <p className="text-gray-500 dark:text-gray-400">{t('oracle.prediction.description')}</p>

            <div className="w-full max-w-xs">
              <div className="w-full bg-gray-200/50 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden border border-violet-400/20">
                <motion.div
                  className="h-full bg-gradient-to-r from-violet-500 to-purple-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {progress < 30 ? t('oracle.prediction.analyzing') :
                 progress < 60 ? t('oracle.prediction.calculating') :
                 progress < 90 ? t('oracle.prediction.generating') :
                 t('oracle.prediction.finalizing')}
              </p>
            </div>
          </div>
        </motion.div>
      );
    }

    if (result) {
      return (
        <motion.div
          className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-6 sm:p-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="absolute inset-0 pointer-events-none rounded-3xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-violet-400/10 to-purple-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-blue-400/10 to-cyan-500/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-purple-500 flex items-center gap-2">
                  <Sparkles className="w-6 h-6 text-violet-500" /> {t('oracle.speaksTitle')}
                </h2>
                <div className="hidden md:flex items-center gap-2">
                  <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                    <ShareButton />
                  </motion.div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:hidden">
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <ShareButton />
                </motion.div>
              </div>

              {/* Nota — vem da matemática confiável, nunca da IA */}
              <div className="flex items-center gap-3">
                <div className={`text-5xl font-extrabold ${getRatingColor(result.rating)}`}>
                  {result.rating.toFixed(1)}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5" />
                    {t('oracle.prediction.reliableRating')}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {t('oracle.prediction.styleBasedOn', { count: result.basedOnReviewCount })}
                  </span>
                </div>
              </div>

              <div className="prose prose-lg prose-gray dark:prose-invert">
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {result.review}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="relative rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-2xl p-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 to-purple-500 mb-6 text-center flex items-center justify-center gap-2">
          <Sparkles className="w-6 h-6 text-violet-500" /> {t('oracle.speaksTitle')}
        </h2>

        <div className="flex flex-col items-center justify-center py-6">
          <motion.div
            className="w-28 h-28 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-400/30 flex items-center justify-center mb-6"
            animate={{ boxShadow: ['0 0 15px rgba(139,92,246,0.3)', '0 0 25px rgba(139,92,246,0.5)', '0 0 15px rgba(139,92,246,0.3)'] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/30 to-purple-500/30 flex items-center justify-center"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <div className="relative w-10 h-10 flex items-center justify-center">
                <div className="absolute w-full h-full rounded-full bg-violet-400/20" />
                <motion.div
                  className="w-7 h-7 bg-violet-500 rounded-full flex items-center justify-center"
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
              className="text-violet-600 dark:text-violet-300 text-lg text-center italic"
            >
              {mysticalMessages[currentMessageIndex]}
            </motion.p>
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50/80 via-purple-50/50 to-pink-50/80 dark:from-gray-900 dark:via-blue-950/50 dark:to-purple-950/50 py-8 px-4 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-violet-400/20 to-purple-400/20 dark:from-violet-600/10 dark:to-purple-600/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-60 right-20 w-80 h-80 bg-gradient-to-br from-blue-400/20 to-cyan-400/20 dark:from-blue-600/10 dark:to-cyan-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-20 left-1/3 w-72 h-72 bg-gradient-to-br from-pink-400/15 to-rose-400/15 dark:from-pink-600/8 dark:to-rose-600/8 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.02]" style={{
        backgroundImage: 'linear-gradient(rgba(99, 102, 241, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(99, 102, 241, 0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="max-w-2xl mx-auto relative z-10">
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
            <div className="p-4 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 dark:from-violet-500/30 dark:to-purple-500/30 border border-violet-400/30">
              <PenLine className="w-12 h-12 text-violet-500 dark:text-violet-400" style={{ filter: 'drop-shadow(0 0 15px rgba(139, 92, 246, 0.4))' }} />
            </div>
          </motion.div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-violet-500 via-purple-500 to-violet-500 tracking-wide mb-3">
            {t('oracle.prediction.title')}
          </h1>

          <p className="text-gray-600 dark:text-gray-300 text-lg mb-8">
            {t('oracle.prediction.description')}
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

          <motion.div
            className="relative mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="relative rounded-2xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-lg overflow-hidden">
              <div className="flex items-center p-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={loading.generating ? t('oracle.prediction.consulting') : t('oracle.prediction.cost', { cost: 1 })}
                  className="w-full px-4 py-3 bg-transparent text-gray-800 dark:text-white placeholder-violet-400 dark:placeholder-violet-300 text-lg font-medium focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  autoComplete="off"
                  disabled={loading.generating}
                />
                {loading.search ? (
                  <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                ) : (
                  <Search className="w-6 h-6 text-violet-500" />
                )}
              </div>
            </div>

            <AnimatePresence>
              {searchResults.length > 0 && !loading.generating && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute z-50 w-full mt-2"
                >
                  <div className="rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl shadow-xl border border-white/60 dark:border-gray-700/60 overflow-hidden">
                    {searchResults.map((movie) => (
                      <motion.button
                        key={movie.id}
                        onClick={() => generateReview(movie.title, movie.id, movie.poster_path)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-violet-500/10 transition-colors text-left"
                        whileHover={{ x: 4 }}
                      >
                        <div className="w-12 h-18 rounded-lg overflow-hidden shadow-md">
                          <img
                            src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/92x138?text=No+Image'; }}
                          />
                        </div>
                        <div>
                          <h3 className="font-medium text-gray-800 dark:text-white">{movie.title}</h3>
                          <div className="flex items-center text-sm text-violet-600 dark:text-violet-300">
                            <span>{new Date(movie.release_date).getFullYear()}</span>
                            <span className="mx-2">-</span>
                            <div className="flex items-center">
                              <Star className="w-4 h-4 text-amber-500 fill-current mr-1" />
                              <span>{movie.vote_average.toFixed(1)}</span>
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {renderCrystalBall()}
        </motion.div>
      </div>
    </motion.div>
  );
}