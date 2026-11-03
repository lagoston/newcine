import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PIXEL } from '../../../lib/oracleTheme';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import { cache, CACHE_KEYS } from '../../../lib/cache';
import { ensureMovieCachedIfMissing } from '../../../lib/tmdb';
import { loadTitleCards, titleKey } from '../../../lib/titleCards';
import type { IntervalPick } from '../../../lib/poker/client/apiTypes';
import { cardArt, ORACLE_COLOR } from '../../../lib/poker/client/cosmetics';
import { langOf } from '../../../lib/poker/client/format';
import RateMenuSheet from '../../RateMenuSheet';

// Intervalo (SPEC §7.8, só na livre): depois de 5 partidas seguidas ou 45 min de
// mesa, a próxima partida abre com este cartão. O título vem da watchlist
// (poker_interval_pick) e é apresentado pelo oráculo dele. A nota grava pelo
// mesmo caminho do CalibrateRow (título no banco → gêneros → user_movies), então
// conta para as missões que já existem. [Continuar jogando] sempre visível.

const IntervalCard: React.FC<{
  pick: IntervalPick;
  cardStyle: string;
  reduced: boolean;
  onRated: () => void;
  onContinue: () => void;
}> = ({ pick, cardStyle, reduced, onRated, onContinue }) => {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const { session } = useAuth();
  const [rating, setRating] = useState(false);
  const title = (lang === 'pt' ? pick.title_pt || pick.title : pick.title) || pick.title;
  const oracle = (['bogart', 'cypher', 'fincher'] as const).includes(pick.oracle as 'bogart') ? pick.oracle : 'fincher';

  const save = async (value: number | null) => {
    const uid = session?.user?.id;
    if (!uid || value == null) return;
    const ref = { id: pick.movie_id, media_type: pick.media_type };
    await ensureMovieCachedIfMissing(pick.movie_id, pick.media_type);
    loadTitleCards([ref])
      .then((cards) => {
        const genres = cards.get(titleKey(ref))?.genres;
        if (genres && genres.length > 0) return supabase.rpc('cache_movie_genres', { p_movie_id: pick.movie_id, p_genres: genres });
      })
      .then(
        () => {},
        () => {},
      );
    const { error } = await supabase.from('user_movies').insert({ movie_id: pick.movie_id, media_type: pick.media_type, user_id: uid, rating: value });
    if (error) {
      // 23505: já está na biblioteca (é da watchlist) — só põe a nota.
      if (error.code !== '23505') throw error;
      const { error: up } = await supabase
        .from('user_movies')
        .update({ rating: value })
        .eq('user_id', uid)
        .eq('movie_id', pick.movie_id)
        .eq('media_type', pick.media_type);
      if (up) throw up;
    }
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(uid));
    cache.invalidatePattern('stats:');
    toast.success(t('library.inLibrary'));
    setRating(false);
    onRated();
  };

  return (
    <div className="pk-overlay" role="dialog" aria-modal="true" aria-label={t('poker.interval.title')}>
      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[360px] rounded-[18px] p-5 text-center"
        style={{ background: 'linear-gradient(180deg, #121a52, #0a0e2c)', boxShadow: '0 0 0 1.5px #F4C454, 0 30px 60px -30px #000' }}
      >
        <h2 className="pk-display text-[22px] font-bold" style={{ color: '#FFE8A3' }}>{t('poker.interval.title')}</h2>
        <p className="mt-2 text-[14.5px] leading-snug" style={{ color: '#F3EAD3' }}>{t('poker.interval.body')}</p>
        <div className="mt-4 flex items-center gap-3 text-left rounded-[14px] p-3" style={{ background: 'rgba(0,0,0,0.3)' }}>
          {pick.poster_path ? (
            <img src={`https://image.tmdb.org/t/p/w185${pick.poster_path}`} alt="" className="w-[56px] h-[84px] rounded-[6px] object-cover flex-none" />
          ) : (
            <img src={cardArt(oracle, cardStyle)} alt="" className="w-[56px] rounded-[6px] flex-none" />
          )}
          <div className="min-w-0">
            <p className="text-[12px]" style={{ ...PIXEL, color: ORACLE_COLOR[oracle] }}>
              {t('poker.interval.presents', { oracle: t(`poker.oracles.${oracle}.short`) })}
            </p>
            <p className="text-[16px] font-bold leading-tight mt-0.5" style={{ color: '#F3EAD3' }}>{title}</p>
          </div>
        </div>
        <div className="grid gap-2 mt-4">
          <button type="button" className="pk-cta-gold" onClick={() => setRating(true)}>{t('poker.interval.rate')}</button>
          <button type="button" className="pk-cta-ghost" onClick={onContinue} autoFocus>{t('poker.interval.continue')}</button>
        </div>
      </motion.div>
      {rating &&
        createPortal(
          <div className="relative z-[10000]">
            <RateMenuSheet movieTitle={title} isOpen onClose={() => setRating(false)} onRate={save} showMoveToWatchlist={false} />
          </div>,
          document.body,
        )}
    </div>
  );
};

export default IntervalCard;
