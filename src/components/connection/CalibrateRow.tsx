import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import RatingSliderSheet from '../RatingSliderSheet';
import { PosterArt } from './connectionBits';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { cache, CACHE_KEYS } from '../../lib/cache';
import { ensureMovieCachedIfMissing } from '../../lib/tmdb';
import { loadTitleCards, titleKey } from '../../lib/titleCards';
import { connectionPoster, connectionTitleName, type ConnectionSide, type ConnectionTitle } from '../../lib/connection';
import { PAPER, MIST, FOCUS_RING, ratingTone } from '../../lib/oracleTheme';

// "Afine a conexão" (13/10/2026): até 6 títulos populares que a outra
// pessoa avaliou e você ainda não. Tocar abre a gaveta de nota de sempre;
// salvo, aparece a nota dela (escondida antes, para não puxar a sua) e a
// gaveta pede a conexão de novo (o número reconta).
//
// A lista é uma foto tirada ao abrir: depois de avaliar, o título sai da
// lista do servidor, mas continua aqui com as duas notas.

interface CalibrateRowProps {
  items: ConnectionTitle[];
  other: ConnectionSide;
  // Depois de salvar uma nota (a gaveta pede a conexão de novo).
  onRated: () => void;
  // A gaveta de nota abriu/fechou (a gaveta Conexão desliga o Esc dela).
  onSheetChange?: (open: boolean) => void;
}

const CalibrateRow: React.FC<CalibrateRowProps> = ({ items, other, onRated, onSheetChange }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { session } = useAuth();
  const myId = session?.user?.id ?? null;
  const reduceMotion = useReducedMotion();
  const [list] = useState(() => items.slice(0, 6));
  const [rated, setRated] = useState<Record<string, number>>({});
  const [active, setActive] = useState<ConnectionTitle | null>(null);

  const open = (item: ConnectionTitle) => {
    setActive(item);
    onSheetChange?.(true);
  };
  const close = () => {
    setActive(null);
    onSheetChange?.(false);
  };

  // O mesmo caminho das outras telas: título no banco, gêneros (para o
  // Espectrograma) e a linha na biblioteca. Se o título já estiver na sua
  // watchlist, só ganha a nota.
  const save = async (item: ConnectionTitle, rating: number) => {
    if (!myId) return;
    const ref = { id: item.movie_id, media_type: item.media_type };
    await ensureMovieCachedIfMissing(item.movie_id, item.media_type);
    loadTitleCards([ref])
      .then((cards) => {
        const genres = cards.get(titleKey(ref))?.genres;
        if (genres && genres.length > 0) return supabase.rpc('cache_movie_genres', { p_movie_id: item.movie_id, p_genres: genres });
      })
      .then(
        () => {},
        () => {},
      );
    const { error } = await supabase.from('user_movies').insert({ movie_id: item.movie_id, media_type: item.media_type, user_id: myId, rating });
    if (error) {
      // 23505: já estava na biblioteca (watchlist) — só põe a nota.
      if (error.code !== '23505') throw error;
      const { error: updateError } = await supabase
        .from('user_movies')
        .update({ rating })
        .eq('user_id', myId)
        .eq('movie_id', item.movie_id)
        .eq('media_type', item.media_type);
      if (updateError) throw updateError;
    }
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(myId));
    cache.invalidatePattern('stats:');
    setRated((prev) => ({ ...prev, [titleKey(ref)]: rating }));
    toast.success(t('library.inLibrary'));
    onRated();
  };

  return (
    <>
      <ul className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-4">
        {list.map((item) => {
          const key = titleKey({ id: item.movie_id, media_type: item.media_type });
          const mine = rated[key];
          const done = typeof mine === 'number';
          const title = connectionTitleName(item, lang);
          return (
            <li key={key} className="min-w-0">
              <button
                type="button"
                onClick={() => !done && open(item)}
                disabled={done}
                aria-label={done ? `${title}: ${t('connection.rated.you', { rating: mine })}` : t('connection.calibrate.rate', { title })}
                className={`relative block w-full min-h-0 min-w-0 text-left rounded-lg transition ${done ? 'cursor-default' : 'hover:brightness-110'} ${FOCUS_RING}`}
              >
                <PosterArt path={connectionPoster(item, lang)} className={done ? 'opacity-70' : ''} />
                <span
                  className="absolute right-1.5 bottom-1.5 grid place-items-center w-7 h-7 rounded-full"
                  style={{
                    background: done ? 'rgba(48,164,108,0.92)' : 'rgba(18,13,34,0.82)',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
                    color: PAPER,
                  }}
                  aria-hidden
                >
                  {done ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </span>
              </button>
              <p className="mt-1.5 text-[12px] leading-tight truncate" style={{ color: PAPER }} title={title}>
                {title}
              </p>
              {done ? (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35 }}
                  className="mt-0.5 text-[12px] leading-snug"
                >
                  <p className="truncate" style={{ color: ratingTone(mine).color }}>
                    {t('connection.rated.you', { rating: mine })}
                  </p>
                  <p className="truncate" style={{ color: ratingTone(item.rating_other).color }}>
                    {t('connection.rated.other', { username: other.username, rating: item.rating_other })}
                  </p>
                </motion.div>
              ) : (
                <p className="mt-0.5 text-[12px]" style={{ color: MIST }}>
                  {t('connection.calibrate.cta')}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {/* A gaveta de nota fica por cima da gaveta Conexão (z 9990). */}
      {active &&
        createPortal(
          <div className="relative z-[10000]">
            <RatingSliderSheet
              movieTitle={connectionTitleName(active, lang)}
              isOpen={true}
              onClose={close}
              onConfirmRating={(rating) => save(active, rating)}
            />
          </div>,
          document.body,
        )}
    </>
  );
};

export default CalibrateRow;
