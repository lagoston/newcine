import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, Star, X, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface RatingSliderSheetProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  /** Chamado ao confirmar a nota escolhida no slider. */
  onConfirmRating: (rating: number) => Promise<void>;
  /** Se fornecido, mostra o botão azul de watchlist (clique único, sem
      confirmação dupla). Se omitido, o botão simplesmente não aparece —
      usado pra telas onde o filme já ESTÁ na watchlist (não faz sentido
      "adicionar à watchlist" de novo). */
  onAddToWatchlist?: () => Promise<void>;
  /** Nota inicial do slider — 5 por padrão (novo filme), ou a nota atual
      do filme quando o usuário está reavaliando algo já pontuado. */
  initialRating?: number;
  /** Texto do botão de watchlist, pra cada contexto poder ajustar a
      palavra ("Adicionar" vs "Mover para" Watchlist, por exemplo). */
  watchlistLabel?: { pt: string; en: string };
}

const getFillColorClass = (val: number) => {
  if (val === 0) return 'bg-gray-500';
  if (val <= 3) return 'bg-red-500';
  if (val <= 6) return 'bg-amber-400';
  if (val <= 9) return 'bg-green-500';
  return 'holo-gradient';
};

const getGlowColor = (val: number) => {
  if (val === 0) return 'rgba(107, 114, 128, 0)';
  if (val <= 3) return 'rgba(239, 68, 68, 0.6)';
  if (val <= 6) return 'rgba(250, 204, 21, 0.6)';
  if (val <= 9) return 'rgba(34, 197, 94, 0.6)';
  return 'rgba(255, 0, 127, 0.8)';
};

const RATING_LABELS: Record<number, { pt: string; en: string }> = {
  10: { pt: 'Obra-Prima', en: 'Masterpiece' },
  9: { pt: 'Excepcional', en: 'Exceptional' },
  8: { pt: 'Ótimo', en: 'Great' },
  7: { pt: 'Bom', en: 'Good' },
  6: { pt: 'Razoável', en: 'Decent' },
  5: { pt: 'Mediano', en: 'Mediocre' },
  4: { pt: 'Fraco', en: 'Weak' },
  3: { pt: 'Ruim', en: 'Bad' },
  2: { pt: 'Péssimo', en: 'Awful' },
  1: { pt: 'Doloroso', en: 'Painful' },
  0: { pt: 'Crime Cinematográfico', en: 'Cinematic Crime' },
};

const RatingSliderSheet: React.FC<RatingSliderSheetProps> = ({
  movieTitle,
  isOpen,
  onClose,
  onConfirmRating,
  onAddToWatchlist,
  initialRating = 5,
  watchlistLabel
}) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [loading, setLoading] = useState<'rate' | 'watchlist' | null>(null);

  // `rating` é o valor AO VIVO, atualizado a cada movimento do dedo/mouse —
  // controla só a POSIÇÃO do preenchimento/thumb, que precisa se mover de
  // forma contínua e fluida durante o arraste.
  //
  // `committedRating` só atualiza quando o usuário SOLTA o slider — controla
  // o rótulo de texto e o número grande, que usam `key` pra animar a troca
  // (motion remonta o elemento a cada key diferente). Antes, os dois
  // estavam amarrados no mesmo valor, e arrastar rápido por várias notas
  // disparava uma animação de troca PRA CADA valor intermediário — todas
  // enfileiradas, dando a impressão de "empilhado". Separando os dois, o
  // preenchimento acompanha o dedo em tempo real, mas o texto/cor grande só
  // troca (e anima) uma vez, no final do gesto.
  const [rating, setRating] = useState(initialRating);
  const [committedRating, setCommittedRating] = useState(initialRating);

  if (!isOpen) return null;

  const commit = () => setCommittedRating(rating);

  const handleConfirmRating = async () => {
    if (loading !== null) return;
    setLoading('rate');
    try {
      await onConfirmRating(committedRating);
      onClose();
    } catch (err) {
      console.error('Error confirming rating:', err);
      toast.error(isPt ? 'Erro ao classificar' : 'Error rating');
    } finally {
      setLoading(null);
    }
  };

  const handleWatchlist = async () => {
    if (loading !== null || !onAddToWatchlist) return;
    setLoading('watchlist');
    try {
      await onAddToWatchlist();
      onClose();
    } catch (err) {
      console.error('Error adding to watchlist:', err);
      toast.error(isPt ? 'Erro ao adicionar à Watchlist' : 'Error adding to watchlist');
    } finally {
      setLoading(null);
    }
  };

  const label = RATING_LABELS[committedRating]
    ? (isPt ? RATING_LABELS[committedRating].pt : RATING_LABELS[committedRating].en)
    : '';

  const watchlistText = watchlistLabel
    ? (isPt ? watchlistLabel.pt : watchlistLabel.en)
    : (isPt ? 'Só quero assistir depois - Watchlist' : "I'll just watch it later - Watchlist");

  return (
    <>
      <style>{`
        .holo-gradient {
          background: linear-gradient(90deg, #ff71ce, #b967ff, #01cdfe, #05ffa1, #ff71ce);
          background-size: 300% 100%;
        }
        @keyframes holo-shift {
          0% { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
        .animate-holo {
          animation: holo-shift 3s linear infinite;
        }
      `}</style>

      <div
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-neutral-950 rounded-t-[24px] z-[60] shadow-2xl overflow-hidden">
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1" />

        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-72 h-72 bg-purple-600/20 rounded-full blur-[80px] mix-blend-screen" />
          <div className="absolute bottom-[-20%] right-[-10%] w-72 h-72 bg-blue-600/20 rounded-full blur-[80px] mix-blend-screen" />
          <AnimatePresence>
            {committedRating === 10 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-pink-500/10 blur-[90px]"
              />
            )}
          </AnimatePresence>
        </div>

        <div className="relative px-5 pb-6 pt-2">
          <p className="text-center text-sm font-semibold text-white truncate mb-5 px-8">
            {movieTitle}
          </p>

          <motion.div
            className="relative w-full bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[20px] p-5 shadow-2xl mb-4"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-5">
              <motion.span
                key={label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`relative flex items-center text-sm font-medium px-4 py-1.5 rounded-full border backdrop-blur-md ${
                  committedRating === 10
                    ? 'text-pink-200 border-pink-500/40 bg-pink-500/20'
                    : 'text-white/80 border-white/10 bg-white/5'
                }`}
              >
                {committedRating === 10 && <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-pink-300" />}
                {label}
              </motion.span>

              <motion.div
                key={committedRating}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-3xl font-bold tracking-tighter leading-none"
                style={{
                  color: committedRating === 10 ? '#ff71ce' : 'white',
                  textShadow: committedRating === 10 ? '0 0 20px rgba(255,113,206,0.6)' : 'none'
                }}
              >
                {committedRating}
                <span className="text-lg text-white/40 font-normal">/10</span>
              </motion.div>
            </div>

            <div className="relative h-10 w-full bg-black/40 rounded-full border border-white/10 shadow-inner flex items-center overflow-visible">
              {/* Brilho e preenchimento seguem `rating` (ao vivo) — só o
                  texto acima segue `committedRating` (só no soltar). */}
              <motion.div
                className="absolute left-0 h-full rounded-full blur-xl pointer-events-none"
                animate={{
                  width: `calc(2.5rem + ${(rating / 10)} * (100% - 2.5rem))`,
                  backgroundColor: getGlowColor(rating)
                }}
                transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
              />

              <motion.div
                className={`absolute left-0 h-full rounded-full pointer-events-none overflow-hidden ${getFillColorClass(rating)} ${rating === 10 ? 'animate-holo' : ''}`}
                animate={{ width: `calc(2.5rem + ${(rating / 10)} * (100% - 2.5rem))` }}
                transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent rounded-full" />
                <div className="absolute right-1 top-1 bottom-1 w-8 bg-white rounded-full shadow-md flex items-center justify-center">
                  <div className="w-1 h-3.5 bg-black/20 rounded-full" />
                </div>
              </motion.div>

              <div className="absolute inset-0 pointer-events-none">
                {[...Array(11)].map((_, i) => (
                  <div
                    key={i}
                    className={`absolute top-1/2 w-1.5 h-1.5 rounded-full transition-colors duration-300 z-10 ${
                      i <= rating ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,1)]' : 'bg-white/20'
                    }`}
                    style={{
                      left: `calc(1.25rem + ${(i / 10)} * (100% - 2.5rem))`,
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                ))}
              </div>

              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={rating}
                onChange={(e) => setRating(parseInt(e.target.value))}
                onMouseUp={commit}
                onTouchEnd={commit}
                onKeyUp={commit}
                disabled={loading !== null}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0"
              />
            </div>
          </motion.div>

          <div className="space-y-2">
            <button
              onClick={handleConfirmRating}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
            >
              {loading === 'rate' ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <Star className="w-4 h-4" />
              )}
              {isPt ? `Confirmar nota ${committedRating}` : `Confirm rating ${committedRating}`}
            </button>

            {onAddToWatchlist && (
              <button
                onClick={handleWatchlist}
                disabled={loading !== null}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 text-white font-semibold rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-sky-500/30"
              >
                {loading === 'watchlist' ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <BookmarkPlus className="w-4 h-4" />
                )}
                {watchlistText}
              </button>
            )}

            <button
              onClick={onClose}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 font-medium rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4" />
              {isPt ? 'Cancelar' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default RatingSliderSheet;