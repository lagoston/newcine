import React, { useEffect, useState } from 'react';
import { motion, useIsPresent } from 'framer-motion';
import { X, Loader2, Film } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMovieTrailer } from '../../lib/tmdb';
import { NIGHT, PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import { useLayerEntry } from '../../overlays';

// A camada do trailer (por cima do menu do título). Monta quando abre e busca
// o trailer nessa hora, como antes; dentro do <AnimatePresence> da casca, para
// a saída continuar animada.

interface TrailerLayerProps {
  movieId: number;
  // o tipo como veio no título (sem ele vale filme)
  rawMediaType: 'movie' | 'tv' | undefined;
  title: string;
  onClose: () => void;
}

const TrailerLayer: React.FC<TrailerLayerProps> = ({ movieId, rawMediaType, title, onClose }) => {
  const { t } = useTranslation();
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const trailer = await getMovieTrailer(movieId, rawMediaType || 'movie');
        if (alive) setTrailerKey(trailer?.key || null);
      } catch (error) {
        console.error('Error fetching trailer:', error);
        if (alive) setTrailerKey(null);
      } finally {
        if (alive) setLoadingTrailer(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [movieId, rawMediaType]);

  // 19/11/2026 (onda 2b): o trailer é uma camada da pilha do app (src/overlays):
  // o Esc e o voltar fecham só ele. `z: null`: fica dentro do menu do título
  // (não vai em portal), então o z-[10000] continua valendo ali dentro.
  // (sai da pilha assim que começa a animação de saída)
  const present = useIsPresent();
  const layer = useLayerEntry(present, onClose, { z: null });

  return (
    <div {...layer.rootProps} className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${t('movieModal.trailer')} — ${title}`}>
      <motion.div
        className="absolute inset-0 bg-black/85"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-3xl rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl"
        style={{ background: NIGHT }}
      >
        <div className="flex items-center justify-between gap-4 pl-5 pr-2 py-2 border-b border-white/[0.07]">
          <div className="min-w-0">
            <p style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{t('movieModal.trailer')}</p>
            <p className="mt-1 text-sm truncate" style={{ color: MIST }}>{title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className={`shrink-0 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
            style={{ color: MIST }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="aspect-video bg-black grid place-items-center">
          {loadingTrailer ? (
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: MIST }} aria-hidden />
          ) : trailerKey ? (
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${trailerKey}`}
              title={`${t('movieModal.trailer')} — ${title}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <Film className="w-8 h-8" style={{ color: MIST }} aria-hidden />
              <p style={{ color: MIST }}>{t('duel.noTrailer')}</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default React.memo(TrailerLayer);
