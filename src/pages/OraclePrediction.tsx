import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, BrainCircuit, Loader2, Ticket, Plus, Share2, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { searchMovies } from '../lib/tmdb';
import { useDebounce } from 'use-debounce';
import { supabase } from '../lib/supabase';
import html2canvas from 'html2canvas';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface Prediction {
  prediction: string;
  movie: string;
  ticketsRemaining: number;
}

interface TicketError {
  error: string;
  ticketsRemaining: number;
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
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState({
    search: false,
    prediction: false,
    sharing: false
  });
  const [predictionProgress, setPredictionProgress] = useState(0);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<Date | null>(null);
  const shareCardRef = useRef<HTMLDivElement>(null);
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
    if (session?.user?.id) {
      fetchTicketInfo();
    }
  }, [session?.user?.id]);


  useEffect(() => {
    if (!loading.prediction && !prediction) {
      const interval = setInterval(() => {
        setCurrentMessageIndex((prev) => (prev + 1) % mysticalMessages.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [loading.prediction, prediction, mysticalMessages.length]);

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


  const handleSearch = async () => {
    if (!debouncedQuery.trim() || loading.prediction) {
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
    
    // If nextReset is in the past, return "Now"
    if (diff <= 0) return t('common.now');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    return `${hours}h`;
  };

  const getPrediction = async (movieName: string, movieId: number, posterPath?: string) => {
    if (!session?.user?.id) return;

    if (ticketsRemaining !== null && ticketsRemaining < 1) {
      toast.error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
      return;
    }

    // Armazenar poster do filme
    if (posterPath) {
      setSelectedMoviePoster(posterPath);
    }

    try {
      // Verificar se o filme já foi avaliado pelo usuário
      const { data: existingRating, error: ratingError } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('movie_id', movieId)
        .maybeSingle();

      if (ratingError) {
        console.error('Error checking movie rating:', ratingError);
      }

      // Se o filme já foi avaliado (rating não é null), não permitir predição
      if (existingRating && existingRating.rating !== null) {
        // Mostrar mensagem automática do oráculo
        const oracleMessage = t('oracle.prediction.alreadyRated');
        setPrediction({
          prediction: oracleMessage,
          movie: movieName,
          ticketsRemaining: ticketsRemaining || 0
        });
        setSelectedMovie(movieName);
        setSearchQuery('');
        setSearchResults([]);
        return;
      }

      setLoading(prev => ({ ...prev, prediction: true }));
      setPrediction(null);
      setSelectedMovie(movieName);
      setSearchQuery('');
      setSearchResults([]);
      setPredictionProgress(0);

      const progressInterval = setInterval(() => {
        setPredictionProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 15;
        });
      }, 400);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predict-rating`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: session.user.id,
            movieName,
            language: i18n.language
          })
        }
      );

      clearInterval(progressInterval);
      setPredictionProgress(100);

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          const error = data as TicketError;
          setTicketsRemaining(error.ticketsRemaining);
          throw new Error(t('oracle.prediction.notEnough', { time: formatTimeUntilReset() }));
        }
        throw new Error(data.error || t('common.error'));
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.prediction) {
        throw new Error('No prediction received from Oracle');
      }

      setPrediction(data);
      setTicketsRemaining(data.ticketsRemaining);
    } catch (error) {
      console.error('Error getting prediction:', error);
      toast.error(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setLoading(prev => ({ ...prev, prediction: false }));
    }
  };



  const handleShare = async () => {
    if (!prediction?.prediction || !selectedMovie || loading.sharing) return;

    try {
      setLoading(prev => ({ ...prev, sharing: true }));

      // Extrair nota da primeira linha: "📊 Nota Prevista: X/10"
      const ratingMatch = prediction.prediction.match(/📊\s*Nota Prevista:\s*(\d+\.?\d*)\/10/i);

      // Extrair texto de Ponderações
      const ponderacoesMatch = prediction.prediction.match(/⚖️\s*Ponderações[:\s]*\n(.*?)(?=\n🎬|\n🎭|\n📊|$)/s);

      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
      const summary = ponderacoesMatch ? ponderacoesMatch[1].trim() : '';

      console.log('📊 Nota extraída:', rating);
      console.log('⚖️ Ponderações:', summary);

      // Criar canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = 1080;
      canvas.height = 1920;

      // Carregar fundo de predição
      const background = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = '/assets/cineprev.png';
      });

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Desenhar título do filme (topo)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 56px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const titleY = 200;
      const maxWidth = 900;

      // Quebrar título em linhas
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

      // Desenhar poster do filme (esquerda, maior)
      let posterCenterY = currentY + 200; // Centro vertical do poster

      if (selectedMoviePoster) {
        try {
          const posterUrl = `https://image.tmdb.org/t/p/w300${selectedMoviePoster}`;
          const response = await fetch(posterUrl, { cache: 'no-store' });
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          const posterImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = blobUrl;
          });

          // Poster e nota centralizados como conjunto
          const posterWidth = 275;
          const posterHeight = 412;

          // Calcular centro do conjunto (poster + espaço + nota)
          const gapBetween = 80; // Espaço entre poster e área da nota
          const noteAreaWidth = 300; // Largura aproximada da área da nota
          const totalWidth = posterWidth + gapBetween + noteAreaWidth;
          const groupStartX = (canvas.width - totalWidth) / 2; // Centralizar grupo

          const posterX = groupStartX;
          const posterY = currentY + 100;
          posterCenterY = posterY + (posterHeight / 2); // Calcular centro do poster

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
          console.error('Erro ao carregar poster:', error);
        }
      }

      // Desenhar "NOTA PREVISTA:" à direita do poster, centralizados como conjunto
      const gapBetween = 80;
      const noteAreaWidth = 300;
      const totalWidth = 275 + gapBetween + noteAreaWidth;
      const groupStartX = (canvas.width - totalWidth) / 2;
      const noteX = groupStartX + 275 + gapBetween + (noteAreaWidth / 2); // Centro da área da nota
      const noteLabelY = posterCenterY - 120; // Acima da nota (mais espaçado)

      ctx.fillStyle = '#CCCCCC';
      ctx.font = 'bold 36px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('NOTA PREVISTA:', noteX, noteLabelY);

      // Desenhar nota prevista centralizada com o poster (mais abaixo)
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 120px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rating.toFixed(1), noteX, posterCenterY + 20);

      // Desenhar texto de Ponderações (mais abaixo, com sombra escura)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '38px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Adicionar sombra mais escura no texto para facilitar leitura (+50%)
      ctx.shadowColor = 'rgba(0, 0, 0, 1)'; // 0.8 → 1.0 (opacidade máxima)
      ctx.shadowBlur = 12; // 8 → 12 (+50%)
      ctx.shadowOffsetX = 3; // 2 → 3 (+50%)
      ctx.shadowOffsetY = 3; // 2 → 3 (+50%)

      const summaryY = 850; // Movido mais para baixo
      const summaryMaxWidth = 900;
      const lineHeight = 52;
      const maxLines = 14; // Ajustado para novo posicionamento
      const bottomLimit = 1750;

      const summaryWords = summary.split(' ');
      let summaryLine = '';
      let summaryCurrentY = summaryY;
      let lineCount = 0;
      let wasTextCut = false;

      for (let i = 0; i < summaryWords.length; i++) {
        const testLine = summaryLine + summaryWords[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > summaryMaxWidth && i > 0) {
          // Verificar se próxima linha ultrapassa limite
          if (summaryCurrentY + lineHeight > bottomLimit || lineCount >= maxLines) {
            // Adicionar ... na linha atual
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

      // Desenhar última linha se não foi cortado
      if (!wasTextCut && summaryLine.trim()) {
        if (summaryCurrentY + lineHeight > bottomLimit) {
          // Última linha ultrapassa, adicionar ...
          ctx.fillText(summaryLine.trim() + '...', canvas.width / 2, summaryCurrentY);
        } else {
          ctx.fillText(summaryLine.trim(), canvas.width / 2, summaryCurrentY);
        }
      }

      // Resetar sombra
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Converter para blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/png', 1.0);
      });

      if (navigator.share && navigator.canShare({ files: [new File([blob], 'prediction.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([blob], 'prediction.png', { type: 'image/png' })],
          title: `CineOracle Prediction: ${selectedMovie}`,
          text: `Check out this movie prediction from CineOracle!`
        });
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cineoracle-${selectedMovie.toLowerCase().replace(/\s+/g, '-')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        toast.success('Image downloaded successfully!');
      }

      const { error: saveError } = await supabase
        .from('saved_predictions')
        .update({ is_public: true })
        .eq('id', prediction.id);

      if (saveError) throw saveError;

    } catch (error) {
      console.error('Error sharing prediction:', error);
      toast.error('Failed to share prediction');
    } finally {
      setLoading(prev => ({ ...prev, sharing: false }));
    }
  };

  const ShareButton = ({ mobile = false }) => (
    <button
      onClick={handleShare}
      disabled={loading.sharing}
      className={`p-2 text-purple-400 hover:text-purple-300 transition-colors rounded-full hover:bg-purple-500/10 ${
        loading.sharing ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      title={t('oracle.prediction.title')}
    >
      {loading.sharing ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Share2 className="w-5 h-5" />
      )}
    </button>
  );


  const renderCrystalBall = () => {
    if (loading.prediction) {
      return (
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="inline-flex items-center justify-center p-8 rounded-full bg-purple-500/10 backdrop-blur-sm border border-purple-500/20 mb-4 relative">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500/30 to-purple-600/10 blur-md"></div>
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
              <BrainCircuit className="w-12 h-12 text-purple-400 relative z-10" />
            </motion.div>
          </div>
          <h2 className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
            {t('oracle.prediction.consulting')}
          </h2>
          <p className="text-gray-400 mb-4">{t('oracle.prediction.description')}</p>

          <div className="max-w-xs mx-auto">
            <div className="w-full bg-gray-800/50 rounded-full h-2 overflow-hidden backdrop-blur-sm border border-purple-500/20">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                initial={{ width: '0%' }}
                animate={{ width: `${predictionProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {predictionProgress < 30 ? t('oracle.prediction.analyzing') :
               predictionProgress < 60 ? t('oracle.prediction.calculating') :
               predictionProgress < 90 ? t('oracle.prediction.generating') :
               t('oracle.prediction.finalizing')}
            </p>
          </div>
        </motion.div>
      );
    }

    if (prediction) {
      return (
        <motion.div 
          className="relative group"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative p-8 bg-gray-900/90 rounded-lg border border-purple-500/20 backdrop-blur-sm">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <motion.h2 
                  className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  ✨ {t('oracle.speaksTitle')}
                </motion.h2>
                <div className="hidden md:flex items-center gap-2">
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <ShareButton />
                  </motion.div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:hidden">
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ShareButton mobile />
                </motion.div>
              </div>

              <motion.div 
                className="prose prose-lg prose-invert mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {prediction.prediction}
                </p>
              </motion.div>
            </div>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div 
        className="relative group"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
        <div className="relative p-8 bg-gray-900/90 rounded-lg border border-purple-500/20 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-6">
            <motion.h2 
              className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              ✨ {t('oracle.speaksTitle')}
            </motion.h2>
          </div>
          <div className="flex flex-col items-center justify-center py-8">
            <motion.div 
              className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-sm border border-purple-500/30 flex items-center justify-center mb-6"
              animate={{ 
                boxShadow: [
                  '0 0 15px rgba(168, 85, 247, 0.4)',
                  '0 0 25px rgba(168, 85, 247, 0.6)',
                  '0 0 15px rgba(168, 85, 247, 0.4)'
                ],
              }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              <motion.div 
                className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600/40 to-pink-600/40 flex items-center justify-center"
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <div className="relative w-12 h-12 flex items-center justify-center">
                  <div className="absolute w-full h-full rounded-full bg-purple-400/20"></div>
                  <motion.div 
                    className="w-8 h-8 bg-purple-400 rounded-full flex items-center justify-center"
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
                className="text-purple-300 text-lg text-center italic"
                style={{ 
                  textShadow: '0 0 10px rgba(168, 85, 247, 0.2)'
                }}
              >
                {mysticalMessages[currentMessageIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div 
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-gray-900 via-purple-900/30 to-blue-900/30 py-8 px-4 overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      {/* Background particle effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
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
      
      <div className="max-w-2xl mx-auto relative z-10">
        <motion.button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-gray-800/50 backdrop-blur-sm rounded-full transition-colors mb-8"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowLeft className="w-6 h-6 text-gray-400" />
        </motion.button>

        <motion.div 
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <motion.div 
            className="flex justify-center mb-4"
            whileHover={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              initial={{ y: 0 }}
              animate={{ y: [-10, 10, -10] }}
              transition={{ 
                duration: 6,
                repeat: Infinity,
                repeatType: "reverse"
              }}
            >
              <BrainCircuit className="w-20 h-20 text-purple-400 drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
            </motion.div>
          </motion.div>

          <motion.h1 
            className="text-3xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 tracking-widest mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {t('oracle.prediction.title')}
          </motion.h1>

          <motion.p 
            className="text-gray-300 text-lg mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            {t('oracle.prediction.description')}
          </motion.p>

          <motion.div 
            className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-between items-stretch sm:items-center mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <div className="bg-gradient-to-r from-purple-900/50 via-purple-700/50 to-purple-900/50 p-4 rounded-2xl shadow-inner border border-purple-500/30 backdrop-blur-sm flex flex-row items-center justify-between sm:gap-6 text-white text-sm">
              <div className="flex items-center">
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 1 }}
                >
                  <Ticket className="w-5 h-5 mr-2 text-yellow-400" />
                </motion.div>
                <span className="font-semibold">{ticketsRemaining ?? '...'}</span>
                <span>&nbsp;tickets</span>
              </div>
              {nextReset && (
                <>
                  <div className="w-px h-4 bg-purple-400/30 mx-4" />
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

          <motion.div 
            className="relative mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
          >
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-lg blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-gray-900/80 border border-purple-500/30 rounded-lg leading-none backdrop-blur-sm">
                <div className="flex items-center p-4">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={loading.prediction ? t('oracle.prediction.consulting') : t('oracle.prediction.cost', { cost: 1 })}
                    className="w-full px-4 py-3 bg-transparent text-white placeholder-purple-400 text-lg font-medium focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    autoComplete="off"
                    disabled={loading.prediction}
                  />
                  {loading.search ? (
                    <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                  ) : (
                    <Search className="w-6 h-6 text-purple-400" />
                  )}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {searchResults.length > 0 && !loading.prediction && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute z-50 w-full mt-2"
                >
                  <div className="bg-gray-900/90 backdrop-blur-md rounded-lg shadow-xl border border-purple-500/30 overflow-hidden">
                    {searchResults.map((movie) => (
                      <motion.button
                        key={movie.id}
                        onClick={() => getPrediction(movie.title, movie.id, movie.poster_path)}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-purple-500/10 transition-colors text-left"
                        whileHover={{ x: 4, backgroundColor: "rgba(168, 85, 247, 0.1)" }}
                      >
                        <div className="w-12 h-18 rounded-md overflow-hidden shadow-md">
                          <img
                            src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.src = 'https://via.placeholder.com/92x138?text=No+Image';
                            }}
                          />
                        </div>
                        <div>
                          <h3 className="font-medium text-white">
                            {movie.title}
                          </h3>
                          <div className="flex items-center text-sm text-purple-300">
                            <span>{new Date(movie.release_date).getFullYear()}</span>
                            <span className="mx-2">•</span>
                            <div className="flex items-center">
                              <Star className="w-4 h-4 text-yellow-500 fill-current mr-1" />
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