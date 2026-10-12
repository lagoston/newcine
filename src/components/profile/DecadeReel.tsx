import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Star, Film, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import { PAPER, MIST, PIXEL, VELVET, NIGHT, FOCUS_RING, POSTER_TITLE, glassPanel, ratingTone } from '../../lib/oracleTheme';
import { DECADE_ERA_COLORS, RANK_MEDALS, decadeBadge, decadeEra } from '../../lib/libraryLayouts';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import type { DecadeBand } from '../../lib/tasteStats';
import MovieDetailsModal from '../MovieDetailsModal';
import { ModuleTitle, affinityColor, formatOne } from './observatoryKit';

// As décadas da pessoa numa linha do tempo: a altura de cada barra é
// quantos títulos ela avaliou da década, a cor é a média que dá a eles. A
// favorita (a mais vista) começa escolhida; tocar em outra troca a fileira
// de baixo — os melhores títulos daquela década, na mesma ordem dos
// Melhores da Década da Biblioteca (pela nota ou na ordem que a pessoa
// arrumou).

interface DecadeReelProps {
  bands: DecadeBand[];
  favorite: DecadeBand | null;
  ownerName?: string;
}

const BAR_AREA = 92;
const REEL_SIZE = 12;

const DecadeReel: React.FC<DecadeReelProps> = ({ bands, favorite, ownerName }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<number | null>(favorite?.decade ?? null);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const reelRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    setSelected((prev) => (prev !== null && bands.some((b) => b.decade === prev) ? prev : favorite?.decade ?? null));
  }, [bands, favorite]);

  useEffect(() => {
    if (reelRef.current) reelRef.current.scrollLeft = 0;
  }, [selected]);

  if (bands.length === 0 || !favorite) return null;
  const band = bands.find((b) => b.decade === selected) || favorite;
  const maxCount = Math.max(1, ...bands.map((b) => b.count));
  const era = decadeEra(band.decade);
  const eraColor = DECADE_ERA_COLORS[era];
  const isFavorite = band.decade === favorite.decade;

  const open = async (item: DecadeBand['items'][number]) => {
    const key = `${item.media_type}:${item.id}`;
    setOpening(key);
    try {
      setMovie(await getMovieDetailsFromDB(item.id, item.media_type === 'tv' ? 'tv' : 'movie'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOpening(null);
    }
  };

  return (
    <section className="h-full rounded-3xl p-5 sm:p-7" style={glassPanel(eraColor)}>
      <ModuleTitle title={t('profile.observatory.decadesTitle')} hint={t('profile.observatory.decadesHint')} />

      <div className="mt-5 grid sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] gap-6 sm:gap-8 items-end">
        {/* ---------- a década escolhida ---------- */}
        <AnimatePresence mode="wait">
          <motion.div
            key={band.decade}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <p className="flex items-center gap-2 text-[13px]" style={{ color: MIST }}>
              {isFavorite && <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />}
              {isFavorite
                ? ownerName
                  ? t('profile.observatory.favoriteDecadeOf', { name: ownerName })
                  : t('profile.observatory.favoriteDecade')
                : t('profile.observatory.otherDecade')}
            </p>
            <p style={{ ...PIXEL, color: PAPER }} className="mt-1 text-5xl sm:text-6xl leading-none">
              {band.decade}s
            </p>
            <p className="mt-2 font-semibold" style={{ color: eraColor }}>
              {t(`profile.decadeLabels.${era}`)}
            </p>
            <p className="mt-1 text-[13px]" style={{ color: MIST }}>
              {band.avg != null
                ? t('profile.observatory.decadeSummary', { count: band.count, avg: formatOne(band.avg, i18n.language) })
                : t('library.titleCount', { count: band.count })}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* ---------- linha do tempo ---------- */}
        <ol className="flex items-end gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mb-1" aria-label={t('profile.observatory.decadesTitle')}>
          {bands.map((b, i) => {
            const height = Math.max(6, Math.round((b.count / maxCount) * BAR_AREA));
            const color = affinityColor(b.avg);
            const isSel = b.decade === band.decade;
            const label = t('profile.observatory.decadeBar', {
              decade: b.decade,
              count: b.count,
              avg: b.avg != null ? formatOne(b.avg, i18n.language) : '–',
            });
            return (
              <li key={b.decade} className="flex-1 min-w-[30px] max-w-[64px]">
                <button
                  type="button"
                  onClick={() => setSelected(b.decade)}
                  aria-pressed={isSel}
                  aria-label={label}
                  title={label}
                  className={`group w-full flex flex-col items-center rounded-lg pt-1 transition hover:bg-white/[0.04] ${FOCUS_RING}`}
                >
                  <span className="relative w-full flex items-end justify-center" style={{ height: BAR_AREA + 18 }}>
                    <span
                      className={`absolute left-1/2 -translate-x-1/2 text-[11px] tabular-nums transition-opacity ${isSel ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      style={{ bottom: height + 4, color: PAPER }}
                      aria-hidden
                    >
                      {b.count}
                    </span>
                    <motion.span
                      className="block w-[70%] rounded-t-md rounded-b-sm"
                      style={{
                        height,
                        background: color,
                        transformOrigin: 'bottom',
                        boxShadow: isSel ? `0 0 0 2px ${NIGHT}, 0 0 0 3.5px #F0ABFC, 0 0 18px ${color}` : `0 0 12px ${color}55`,
                        opacity: isSel ? 1 : 0.78,
                      }}
                      initial={reduceMotion ? false : { scaleY: 0 }}
                      whileInView={{ scaleY: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.1 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </span>
                  <span className="mt-1.5 flex items-center gap-0.5 text-[12px] leading-none" style={{ ...PIXEL, color: isSel ? PAPER : MIST }}>
                    {decadeBadge(b.decade)}
                    {b.decade === favorite.decade && <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" aria-hidden />}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* ---------- os melhores da década ---------- */}
      <div className="mt-6 pt-5 border-t border-white/[0.07]">
        <p className="flex items-center gap-2 text-sm font-medium" style={{ color: PAPER }}>
          {t('profile.observatory.bestOfDecade', { decade: `${band.decade}s` })}
          {band.customized && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(240,171,252,0.12)', color: '#F0ABFC' }}>
              <ListOrdered className="w-3 h-3" aria-hidden />
              {ownerName ? t('profile.observatory.orderOf', { name: ownerName }) : t('profile.observatory.yourOrder')}
            </span>
          )}
        </p>
        <AnimatePresence mode="wait">
          <motion.ol
            key={band.decade}
            ref={reelRef}
            className="mt-3 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {band.items.slice(0, REEL_SIZE).map((item, i) => {
              const rating = typeof item.userRating === 'number' ? item.userRating : null;
              const tone = ratingTone(rating);
              const key = `${item.media_type}:${item.id}`;
              const medal = RANK_MEDALS[i] as string | undefined;
              return (
                <motion.li
                  key={key}
                  className="snap-start shrink-0 w-[92px] sm:w-[100px]"
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.04 }}
                >
                  <button type="button" onClick={() => open(item)} className={`group block w-full text-left rounded-xl ${FOCUS_RING}`} aria-label={`${i + 1}. ${item.title}`}>
                    <span className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-white/30 transition" style={{ background: VELVET }}>
                      {item.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${item.poster_path}`}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                        />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                          <Film className="w-5 h-5" aria-hidden />
                        </span>
                      )}
                      <span
                        className="absolute top-1.5 left-1.5 min-w-[22px] h-[22px] px-1 grid place-items-center rounded-md text-[13px] leading-none"
                        style={{ ...PIXEL, background: 'rgba(18,13,34,0.82)', color: medal || PAPER, boxShadow: medal ? `inset 0 0 0 1px ${medal}` : undefined }}
                      >
                        {i + 1}
                      </span>
                      {rating !== null && (
                        <span
                          className="absolute bottom-1.5 right-1.5 h-[22px] min-w-[22px] px-1 grid place-items-center rounded-md text-[13px] leading-none"
                          style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                        >
                          {rating}
                        </span>
                      )}
                      {opening === key && <span className="absolute inset-0 bg-black/50 animate-pulse" />}
                    </span>
                    <span className={`mt-1.5 block text-[12px] ${POSTER_TITLE}`} style={{ color: PAPER }}>
                      {item.title}
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </motion.ol>
        </AnimatePresence>
      </div>

      {movie && <MovieDetailsModal movie={movie} isOpen={true} onClose={() => setMovie(null)} />}
    </section>
  );
};

export default DecadeReel;
