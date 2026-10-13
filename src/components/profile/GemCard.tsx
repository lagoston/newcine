import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Film, Clapperboard } from 'lucide-react';
import { toast } from 'sonner';
import { PAPER, MIST, PIXEL, VELVET, FOCUS_RING, glassPanel, ratingTone } from '../../lib/oracleTheme';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import { GEM_MIN_RATING } from '../../lib/tasteStats';
import type { MovieWithRating } from '../../hooks/useProfileData';
import MovieDetailsModal from '../MovieDetailsModal';
import { ModuleTitle, Ring } from './observatoryKit';

// A joia menos conhecida: entre os títulos que a pessoa deu 7 ou mais, o que
// menos gente conhece (o de menos votos no TMDB — o número em si não
// aparece). Com a capa, ano, duração, gêneros, quem dirigiu, a nota dela no
// anel e, embaixo, as duas joias seguintes.

interface GemCardProps {
  gems: MovieWithRating[];
  ownerRatingLabel: string;
}

const GEM = '#34D399';

const GemCard: React.FC<GemCardProps> = ({ gems, ownerRatingLabel }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
  const [main, ...others] = gems;

  const open = async (item: MovieWithRating) => {
    setOpening(item.id);
    try {
      setMovie(await getMovieDetailsFromDB(item.id, item.media_type === 'tv' ? 'tv' : 'movie'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOpening(null);
    }
  };

  // "1998 · 2h 10min" (filme) ou "2019 · 3 temporadas" (série)
  const facts = (item: MovieWithRating) => {
    const parts: string[] = [];
    const year = (item.release_date || '').slice(0, 4);
    if (year) parts.push(year);
    if (item.media_type === 'tv') {
      if (item.number_of_seasons) parts.push(t('profile.observatory.gemSeasons', { count: item.number_of_seasons }));
    } else if (item.runtime) {
      const h = Math.floor(item.runtime / 60);
      const m = item.runtime % 60;
      parts.push(h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`);
    }
    return parts.join(' · ');
  };
  const genresOf = (item: MovieWithRating) =>
    ((item.genres || []) as unknown[])
      .map((g) => (typeof g === 'string' ? g : (g as { name?: string })?.name || ''))
      .filter(Boolean)
      .slice(0, 2);
  const directorOf = (item: MovieWithRating) => item.credits?.crew?.find((p) => p.job === 'Director' || p.job === 'Creator')?.name || null;

  return (
    <section className="h-full rounded-3xl p-5 sm:p-6 flex flex-col" style={glassPanel(GEM)}>
      <ModuleTitle title={t('profile.stats.leastKnownGem')} hint={t('profile.observatory.gemHint', { min: GEM_MIN_RATING })} />
      {!main ? (
        <p className="mt-5 text-[13px]" style={{ color: MIST }}>
          {t('profile.observatory.gemEmpty', { min: GEM_MIN_RATING })}
        </p>
      ) : (
        <>
          <button type="button" onClick={() => open(main)} className={`group mt-5 w-full flex items-stretch justify-start gap-4 text-left rounded-2xl ${FOCUS_RING}`}>
            <motion.span
              className="relative shrink-0 w-[112px] sm:w-[124px] aspect-[2/3] rounded-xl overflow-hidden"
              style={{ background: VELVET, boxShadow: `0 0 0 1px ${GEM}66, 0 14px 34px -12px ${GEM}88` }}
              initial={reduceMotion ? false : { rotate: -4, y: 8, opacity: 0 }}
              whileInView={{ rotate: 0, y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 160, damping: 16 }}
            >
              {main.poster_path ? (
                <img src={`https://image.tmdb.org/t/p/w342${main.poster_path}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300" />
              ) : (
                <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                  <Film className="w-6 h-6" aria-hidden />
                </span>
              )}
              <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18), transparent 38%)' }} />
              {opening === main.id && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
            </motion.span>
            <span className="min-w-0 flex flex-col">
              <span className="font-semibold leading-snug group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                {main.title}
              </span>
              <span className="mt-0.5 text-[13px]" style={{ color: MIST }}>
                {facts(main)}
              </span>
              {directorOf(main) && (
                <span className="mt-2 inline-flex items-center gap-1.5 text-[13px]" style={{ color: PAPER }}>
                  <Clapperboard className="w-4 h-4 shrink-0" style={{ color: GEM }} aria-hidden />
                  <span className="min-w-0 truncate">
                    {main.media_type === 'tv' ? t('profile.observatory.gemCreatedBy', { name: directorOf(main) }) : t('profile.observatory.gemDirectedBy', { name: directorOf(main) })}
                  </span>
                </span>
              )}
              {genresOf(main).length > 0 && (
                <span className="mt-2 flex flex-wrap gap-1">
                  {genresOf(main).map((genre) => (
                    <span key={genre} className="px-2 py-0.5 rounded-full text-[11px]" style={{ color: PAPER, background: 'rgba(52,211,153,0.1)', boxShadow: 'inset 0 0 0 1px rgba(52,211,153,0.3)' }}>
                      {genre}
                    </span>
                  ))}
                </span>
              )}
              {typeof main.userRating === 'number' && (
                <span className="mt-auto pt-3 flex items-center gap-2.5">
                  <Ring size={40} stroke={3} fraction={main.userRating / 10} color={ratingTone(main.userRating).color}>
                    <span style={{ ...PIXEL, color: PAPER }} className="text-[15px] leading-none">
                      {main.userRating}
                    </span>
                  </Ring>
                  <span className="text-[12px]" style={{ color: MIST }}>
                    {ownerRatingLabel}
                  </span>
                </span>
              )}
            </span>
          </button>

          {others.length > 0 && <div aria-hidden className="h-5 shrink-0" />}
          {others.length > 0 && (
            <div className="mt-auto pt-4 border-t border-white/[0.07]">
              <p className="text-[12px]" style={{ color: MIST }}>
                {t('profile.observatory.moreGems')}
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-3">
                {others.map((item) => (
                  <li key={`${item.media_type}:${item.id}`} className="min-w-0">
                    <button type="button" onClick={() => open(item)} className={`group w-full flex items-center justify-start gap-2.5 text-left rounded-lg ${FOCUS_RING}`}>
                      <span className="relative shrink-0 w-11 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                        {item.poster_path && <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium group-hover:underline" style={{ color: PAPER }}>
                          {item.title}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color: MIST }}>
                          {[(item.release_date || '').slice(0, 4), genresOf(item)[0]].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {movie && <MovieDetailsModal movie={movie} isOpen={true} onClose={() => setMovie(null)} />}
    </section>
  );
};

export default GemCard;
