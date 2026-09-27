import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookmarkPlus, Star, X, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { NIGHT, PAPER, MIST, PIXEL, FOCUS_RING } from '../lib/oracleTheme';

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

export const RATING_LABELS: Record<number, { pt: string; en: string }> = {
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

  // Esc fecha a gaveta (e só ela — quem está por baixo continua aberto),
  // a não ser no meio de um salvamento.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || loading !== null) return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, loading, onClose]);

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
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={movieTitle}
        className="fixed bottom-0 left-0 right-0 sm:bottom-6 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 rounded-t-[24px] sm:rounded-[24px] ring-1 ring-white/10 z-[60] shadow-2xl overflow-hidden"
        style={{ background: `radial-gradient(ellipse 80% 60% at 80% 0%, rgba(139,92,246,0.16), transparent 70%), ${NIGHT}` }}
      >
        <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Brilho da nota 10 — sempre montado, só varia a opacidade (montar e
            desmontar um blur causava um "glitch" de composição). */}
        <motion.div
          className="absolute inset-0 bg-pink-500/10 blur-[50px] pointer-events-none"
          animate={{ opacity: committedRating === 10 ? 1 : 0 }}
          transition={{ duration: 0.4 }}
        />

        <div className="relative px-5 sm:px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2 sm:pt-6">
          <p style={{ ...PIXEL, color: PAPER }} className="text-center text-xl leading-tight truncate mb-5 px-6">
            {movieTitle}
          </p>

          <motion.div
            className="relative w-full bg-white/[0.04] border border-white/10 rounded-[20px] p-5 mb-4"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-5">
              <motion.span
                key={label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`relative flex items-center text-sm font-medium px-4 py-1.5 rounded-full border ${
                  committedRating === 10
                    ? 'text-pink-200 border-pink-500/40 bg-pink-500/20'
                    : 'border-white/15 bg-white/5'
                }`}
                style={committedRating === 10 ? undefined : { color: PAPER }}
              >
                {committedRating === 10 && <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-pink-300" />}
                {label}
              </motion.span>

              <motion.div
                key={committedRating}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-4xl leading-none"
                style={{
                  ...PIXEL,
                  color: committedRating === 10 ? '#ff71ce' : PAPER,
                  textShadow: committedRating === 10 ? '0 0 20px rgba(255,113,206,0.6)' : 'none'
                }}
              >
                {committedRating}
                <span className="text-lg" style={{ color: MIST }}>/10</span>
              </motion.div>
            </div>

            <div className="relative h-10 w-full bg-black/40 rounded-full border border-white/10 shadow-inner flex items-center overflow-visible">
              {/* Brilho e preenchimento seguem `rating` (ao vivo) — só o
                  texto acima segue `committedRating` (só no soltar). */}
              <motion.div
                className="absolute left-0 h-full rounded-full blur-md pointer-events-none"
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
                aria-label={isPt ? `Nota para ${movieTitle}` : `Rating for ${movieTitle}`}
                aria-valuetext={`${rating} — ${RATING_LABELS[rating] ? (isPt ? RATING_LABELS[rating].pt : RATING_LABELS[rating].en) : ''}`}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0"
              />
            </div>
          </motion.div>

          <div className="space-y-2">
            <button
              onClick={handleConfirmRating}
              disabled={loading !== null}
              className={`w-full flex items-center justify-center gap-2 px-4 h-12 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-fuchsia-900/30 ${FOCUS_RING}`}
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
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 min-h-[48px] text-[15px] leading-snug text-center border border-sky-400/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-100 font-semibold rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
              >
                {loading === 'watchlist' ? (
                  <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <BookmarkPlus className="w-4 h-4 shrink-0" />
                )}
                {watchlistText}
              </button>
            )}

            <button
              onClick={onClose}
              disabled={loading !== null}
              className={`w-full flex items-center justify-center gap-2 px-4 h-11 hover:bg-white/5 font-medium rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS_RING}`}
              style={{ color: MIST }}
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