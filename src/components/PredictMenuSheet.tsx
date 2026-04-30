import React, { useEffect, useRef, useState } from 'react';
import { Star, Ticket, Timer, X, Instagram, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

interface PredictMenuSheetProps {
  movieTitle: string;
  movieId?: number;
  moviePoster?: string;
  isOpen: boolean;
  onClose: () => void;
}

const PredictMenuSheet: React.FC<PredictMenuSheetProps> = ({ movieTitle, movieId, moviePoster, isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language === 'pt';
  const [loading, setLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [nextReset, setNextReset] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPrediction(null);
      setError(null);
      setLoading(true);
      setProgress(0);
      setNextReset(null);
      setCountdown('');
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    fetchPrediction();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!nextReset) return;
    const tick = () => {
      const diff = new Date(nextReset).getTime() - Date.now();
      if (diff <= 0) { setCountdown('00:00:00'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [nextReset]);

  const fetchPrediction = async () => {
    setLoading(true);
    setPrediction(null);
    setError(null);
    setProgress(0);

    intervalRef.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 12;
      });
    }, 400);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      if (!userId) {
        setError(isPt ? 'Sessão inválida' : 'Invalid session');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/predict-rating`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId,
            movieName: movieTitle,
            movieId,
            language: i18n.language,
          }),
        }
      );

      if (intervalRef.current) clearInterval(intervalRef.current);
      setProgress(100);

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setTicketsRemaining(data.ticketsRemaining ?? 0);
          setNextReset(data.nextReset ?? null);
          setError(
            isPt
              ? 'Tickets insuficientes. Retorne amanhã para novas previsões.'
              : 'Insufficient tickets. Come back tomorrow for new predictions.'
          );
          return;
        }
        throw new Error(data.error || (isPt ? 'Erro na previsão' : 'Prediction error'));
      }

      if (!data.prediction) {
        throw new Error(isPt ? 'Nenhuma previsão recebida' : 'No prediction received');
      }

      setPrediction(data.prediction);
      setTicketsRemaining(data.ticketsRemaining ?? null);
      setNextReset(data.nextReset ?? null);
    } catch (err) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      const message =
        err instanceof Error ? err.message : isPt ? 'Erro inesperado' : 'Unexpected error';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!prediction || isSharing) return;
    try {
      setIsSharing(true);

      const ratingMatch = prediction.match(/(?:Nota Prevista|Predicted Rating|Calificación Predicha)[:\s]*(\d+\.?\d*)\/10/i);
      const verdictMatch = prediction.match(/🎬[^:]*:\s*(.+)/s);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0;
      const summary = verdictMatch ? verdictMatch[1].trim() : '';

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
      const words = movieTitle.split(' ');
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

      if (moviePoster) {
        try {
          const posterUrl = `https://image.tmdb.org/t/p/w300${moviePoster}`;
          const response = await fetch(posterUrl, { cache: 'no-store' });
          const blob = await response.blob();
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
        } catch {
          // continue without poster
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
      ctx.textBaseline = 'top';
      ctx.fillText(isPt ? 'NOTA PREVISTA:' : 'PREDICTED RATING:', noteX, noteLabelY);

      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 120px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rating.toFixed(1), noteX, posterCenterY + 20);

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

      const summaryWords = summary.split(' ');
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

      if (navigator.share && navigator.canShare({ files: [new File([imageBlob], 'prediction.png', { type: 'image/png' })] })) {
        await navigator.share({
          files: [new File([imageBlob], 'prediction.png', { type: 'image/png' })],
          title: `CineOracle: ${movieTitle}`,
          text: `CineOracle prediction for ${movieTitle}`
        });
      } else {
        const url = URL.createObjectURL(imageBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cineoracle-${movieTitle.toLowerCase().replace(/\s+/g, '-')}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success(isPt ? 'Imagem salva!' : 'Image saved!');
      }
    } catch (error) {
      console.error('Error sharing prediction:', error);
      toast.error(isPt ? 'Erro ao compartilhar' : 'Failed to share');
    } finally {
      setIsSharing(false);
    }
  };

  if (!isOpen) return null;

  const progressLabel =
    progress < 30
      ? t('oracle.prediction.analyzing')
      : progress < 60
      ? t('oracle.prediction.calculating')
      : t('oracle.prediction.generating');

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 bg-gray-950 rounded-t-2xl z-[60] shadow-2xl border-t border-purple-500/30">
        <div className="w-12 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-1" />

        <div className="px-4 pb-8 pt-3 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30">
                <Star className="w-4 h-4 text-purple-400 fill-purple-400" />
              </div>
              <span className="text-sm font-semibold text-purple-300">
                {isPt ? 'Previsão do Oráculo' : 'Oracle Prediction'}
              </span>
            </div>

            {ticketsRemaining !== null && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-gray-800/80 px-2.5 py-1.5 rounded-full border border-yellow-500/30">
                  <Ticket className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs font-bold text-yellow-300">{ticketsRemaining}</span>
                </div>
                {countdown && (
                  <div className="flex items-center gap-1 bg-gray-800/80 px-2.5 py-1.5 rounded-full border border-gray-600/40">
                    <Timer className="w-3 h-3 text-gray-400" />
                    <span className="text-xs font-mono text-gray-300">{countdown}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-center text-sm font-semibold text-white truncate mb-5 px-4">
            {movieTitle}
          </p>

          {loading && (
            <div className="flex flex-col gap-3 py-6">
              <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-purple-600 to-pink-500"
                  initial={{ width: '0%' }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
              <p className="text-center text-xs text-gray-400">{progressLabel}</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-950/60 border border-red-500/30 rounded-xl p-4 text-center mb-4">
              <p className="text-red-300 text-sm leading-relaxed">{error}</p>
            </div>
          )}

          {prediction && !loading && (
            <div className="relative mb-4">
              <div className="absolute -inset-px bg-gradient-to-r from-purple-600/30 to-pink-600/30 rounded-xl blur-sm" />
              <div className="relative bg-gray-900/90 border border-purple-500/20 rounded-xl p-4">
                <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {prediction}
                </p>
                <div className="flex justify-end mt-3 pt-3 border-t border-purple-500/20">
                  <button
                    onClick={handleShare}
                    disabled={isSharing}
                    className="p-1 text-purple-500 hover:text-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Compartilhar no Instagram"
                  >
                    {isSharing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Instagram className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            {isPt ? 'Fechar' : 'Close'}
          </button>
        </div>
      </div>
    </>
  );
};

export default PredictMenuSheet;
