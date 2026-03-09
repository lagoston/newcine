import React, { useEffect, useState } from 'react';
import { Star, Ticket, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

interface PredictMenuSheetProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

const PredictMenuSheet: React.FC<PredictMenuSheetProps> = ({ movieTitle, isOpen, onClose }) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language === 'pt';
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPrediction(null);
      setError(null);
      setLoading(true);
      return;
    }
    fetchPrediction();
  }, [isOpen]);

  const fetchPrediction = async () => {
    setLoading(true);
    setPrediction(null);
    setError(null);

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
            language: i18n.language,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          setTicketsRemaining(data.ticketsRemaining ?? 0);
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
    } catch (err) {
      const message =
        err instanceof Error ? err.message : isPt ? 'Erro inesperado' : 'Unexpected error';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

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
              <div className="flex items-center gap-1.5 bg-gray-800/80 px-2.5 py-1.5 rounded-full border border-yellow-500/30">
                <Ticket className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-300">{ticketsRemaining}</span>
              </div>
            )}
          </div>

          <p className="text-center text-sm font-semibold text-white truncate mb-5 px-4">
            {movieTitle}
          </p>

          {loading && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Star className="w-7 h-7 text-purple-400 fill-purple-400/30" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 border-t-purple-400 animate-spin" />
              </div>
              <p className="text-gray-400 text-sm">
                {isPt ? 'O Oráculo está consultando...' : 'The Oracle is consulting...'}
              </p>
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
