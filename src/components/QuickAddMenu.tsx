import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, Star, X, Sparkles, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface QuickAddMenuProps {
  movieTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onAdd: (rating?: number) => Promise<void>;
}

// Cores por faixa de nota — mesmo espírito do modelo de referência (0=cinza,
// 1-3=vermelho, 4-6=amarelo, 7-9=verde, 10=holográfico), levemente ajustado
// pra bater com a paleta que o resto do site já usa em notas perfeitas
// (rosa/roxo/azul, igual às bolhas de amigo no MovieDetailsModal).
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

const QuickAddMenu: React.FC<QuickAddMenuProps> = ({ movieTitle, isOpen, onClose, onAdd }) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const [loading, setLoading] = useState<'rate' | 'watchlist' | null>(null);
  const [rating, setRating] = useState(5);
  const [isWantToWatch, setIsWantToWatch] = useState(false);

  if (!isOpen) return null;

  const handleConfirmRating = async () => {
    if (loading !== null) return;
    setLoading('rate');
    try {
      await onAdd(rating);
      onClose();
    } catch (err) {
      console.error('Error adding to library:', err);
      toast.error(isPt ? 'Erro ao adicionar à biblioteca' : 'Error adding to library');
    } finally {
      setLoading(null);
    }
  };

  const handleWatchlist = async () => {
    if (loading !== null) return;
    setLoading('watchlist');
    try {
      await onAdd(undefined);
      onClose();
    } catch (err) {
      console.error('Error adding to watchlist:', err);
      toast.error(isPt ? 'Erro ao adicionar à Watchlist' : 'Error adding to watchlist');
    } finally {
      setLoading(null);
    }
  };

  const label = RATING_LABELS[rating] ? (isPt ? RATING_LABELS[rating].pt : RATING_LABELS[rating].en) : '';

  return (
    <>
      {/* Classes customizadas (holo-gradient/animate-holo) não existem no
          Tailwind padrão — definidas aqui via <style>, mesma técnica já
          usada em outras animações pausadas do site. */}
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

        {/* Glow ambiente de fundo — mesmo efeito do modelo de referência,
            reagindo à nota máxima ou ao modo watchlist. */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-72 h-72 bg-purple-600/20 rounded-full blur-[80px] mix-blend-screen" />
          <div className="absolute bottom-[-20%] right-[-10%] w-72 h-72 bg-blue-600/20 rounded-full blur-[80px] mix-blend-screen" />
          <AnimatePresence>
            {rating === 10 && !isWantToWatch && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-pink-500/10 blur-[90px]"
              />
            )}
            {isWantToWatch && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-blue-500/10 blur-[90px]"
              />
            )}
          </AnimatePresence>
        </div>

        <div className="relative px-5 pb-6 pt-2">
          <p className="text-center text-sm font-semibold text-white truncate mb-5 px-8">
            {movieTitle}
          </p>

          {/* Cartão de vidro com o slider — adaptado do modelo de
              referência, trocando a grade de 11 botões antiga por uma
              barra arrastável com nota confirmada só ao tocar "Avaliar". */}
          <motion.div
            className="relative w-full bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[20px] p-5 shadow-2xl mb-4"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className={`flex items-center ${isWantToWatch ? 'justify-center' : 'justify-between'} ${!isWantToWatch ? 'mb-5' : ''}`}>
              <motion.span
                key={isWantToWatch ? 'want-to-watch' : label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className={`relative flex items-center text-sm font-medium px-4 py-1.5 rounded-full border backdrop-blur-md ${
                  isWantToWatch
                    ? 'text-blue-200 border-blue-500/40 bg-blue-500/20'
                    : rating === 10
                      ? 'text-pink-200 border-pink-500/40 bg-pink-500/20'
                      : 'text-white/80 border-white/10 bg-white/5'
                }`}
              >
                {isWantToWatch ? (
                  <Film className="w-3.5 h-3.5 inline mr-1.5 text-blue-300" />
                ) : rating === 10 ? (
                  <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-pink-300" />
                ) : null}
                {isWantToWatch ? (isPt ? 'Vou Assistir...' : "Let's Watch...") : label}
              </motion.span>

              {!isWantToWatch && (
                <motion.div
                  key={rating}
                  initial={{ y: -8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="text-3xl font-bold tracking-tighter leading-none"
                  style={{
                    color: rating === 10 ? '#ff71ce' : 'white',
                    textShadow: rating === 10 ? '0 0 20px rgba(255,113,206,0.6)' : 'none'
                  }}
                >
                  {rating}
                  <span className="text-lg text-white/40 font-normal">/10</span>
                </motion.div>
              )}
            </div>

            {!isWantToWatch && (
              <div className="relative h-10 w-full bg-black/40 rounded-full border border-white/10 shadow-inner flex items-center overflow-visible">
                {/* Camada de brilho */}
                <motion.div
                  className="absolute left-0 h-full rounded-full blur-xl pointer-events-none"
                  animate={{
                    width: `calc(2.5rem + ${(rating / 10)} * (100% - 2.5rem))`,
                    backgroundColor: getGlowColor(rating)
                  }}
                  transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
                />

                {/* Preenchimento sólido */}
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

                {/* Marcadores */}
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

                {/* Input de arrastar, invisível, por cima de tudo */}
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={rating}
                  onChange={(e) => setRating(parseInt(e.target.value))}
                  disabled={loading !== null}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 m-0"
                />
              </div>
            )}
          </motion.div>

          {/* Alterna entre modo "Avaliar" (slider) e "Quero Assistir" —
              mesmo comportamento do modelo de referência. */}
          <div className="flex items-center justify-center mb-4">
            <button
              onClick={() => setIsWantToWatch(!isWantToWatch)}
              disabled={loading !== null}
              className="flex items-center gap-2 px-5 py-2 bg-white/5 hover:bg-white/10 text-white/80 text-sm rounded-full backdrop-blur-md transition-all border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isWantToWatch ? <Star className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
              {isWantToWatch ? (isPt ? 'Avaliar em vez disso' : 'Rate instead') : (isPt ? 'Só quero assistir depois' : "I just want to watch it later")}
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={isWantToWatch ? handleWatchlist : handleConfirmRating}
              disabled={loading !== null}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-blue-600/20"
            >
              {loading !== null ? (
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : isWantToWatch ? (
                <BookmarkPlus className="w-4 h-4" />
              ) : (
                <Star className="w-4 h-4" />
              )}
              {isWantToWatch
                ? (isPt ? 'Adicionar à Watchlist' : 'Add to Watchlist')
                : (isPt ? `Confirmar nota ${rating}` : `Confirm rating ${rating}`)}
            </button>

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

export default QuickAddMenu;