import React, { useEffect, useRef, useState } from 'react';
import { Star, Ticket, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

interface PredictMenuSheetProps {
  movieTitle: string;
  movieId?: number;
  isOpen: boolean;
  onClose: () => void;
}

const PredictMenuSheet: React.FC<PredictMenuSheetProps> = ({ movieTitle, movieId, isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language === 'pt';
  const [loading, setLoading] = useState(true);
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/predict-rating`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
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

  if (!isOpen) return null;

  const progressLabel =
    progress < 30
      ? t('oracle.prediction.analyzing')
      : progress < 60
      ? t('oracle.prediction.calculating')
      : t('oracle.prediction.generating');

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />

      <div className="fixed bottom-0 left-0 right-0 bg-gray-950 rounded-t-2xl z-50 shadow-2xl border-t border-purple-500/30">
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
