import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Clock, Gem, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import RatingSpectrum from './RatingSpectrum';
import WorldMapCard from './WorldMapCard';
import MovieDetailsModal from './MovieDetailsModal';
import { getMovieDetailsFromDB, type Movie } from '../lib/tmdb';
import type { Genre, Keyword, FavoriteDecade, DirectorCount, LeastKnownGem } from '../hooks/useProfileData';
import { SURFACE, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../lib/oracleTheme';
import { formatWatchTime } from '../lib/profileStats';

// Peças do "retrato de gosto" de um perfil — usadas no seu Perfil e no
// perfil de outra pessoa, pra que os dois falem exatamente a mesma língua:
//   • ProfileStatTiles: os dois números (filmes avaliados e tempo assistindo)
//   • ProfileTasteGrid: espectro de notas, gêneros/palavras-chave, década,
//     diretores, joia menos conhecida e o atlas
//   • ProfileSectionHeading: título Pixelify + dica de cada seção

export const PROFILE_CARD = 'rounded-2xl ring-1 ring-white/10 p-5 sm:p-6';

export const ProfileSectionHeading: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 text-sm" style={{ color: MIST }}>
          {hint}
        </p>
      )}
    </div>
    {action}
  </div>
);

const CardTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">
    {children}
  </h3>
);

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

// A média de notas já aparece no espectro de notas e os países no atlas —
// aqui ficam só os dois números que não aparecem em outro lugar.
interface ProfileStatTilesProps {
  ratedCount: number;
  watchMinutes: number;
  label?: string;
}

export const ProfileStatTiles: React.FC<ProfileStatTilesProps> = ({ ratedCount, watchMinutes, label }) => {
  const { t } = useTranslation();
  const tiles = [
    { icon: Star, label: t('profile.stats.ratedMovies'), value: String(ratedCount) },
    { icon: Clock, label: t('profile.stats.timeWatching'), value: formatWatchTime(watchMinutes) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:gap-4" aria-label={label ?? t('profile.numbersLabel')}>
      {tiles.map(({ icon: Icon, label: tileLabel, value }) => (
        <div key={tileLabel} className="rounded-2xl px-4 py-4 ring-1 ring-white/10" style={{ background: SURFACE }}>
          <dt className="flex items-center gap-2 text-sm" style={{ color: MIST }}>
            <Icon className="w-4 h-4 shrink-0 text-violet-300" aria-hidden />
            <span className="min-w-0 leading-tight">{tileLabel}</span>
          </dt>
          <dd style={{ ...PIXEL, color: PAPER }} className="mt-2 text-3xl leading-none truncate">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
};

// ---------------------------------------------------------------------------
// Retrato de gosto
// ---------------------------------------------------------------------------

interface ProfileTasteGridProps {
  ratingCounts: number[];
  average: number | null;
  favoriteGenres: Genre[];
  favoriteKeywords: Keyword[];
  favoriteDecade: FavoriteDecade | null;
  topDirectors: DirectorCount[];
  leastKnownGem: LeastKnownGem | null;
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;
  onViewCountryMovies?: (countryCode: string, countryName: string) => void;
  // Rótulo da nota do dono do perfil na joia ("Sua nota" / "Nota de @fulano").
  ownerRatingLabel?: string;
  // Título do espectro de notas (padrão: "Distribuição de notas") e o que
  // fazer ao tocar numa nota (ex.: ir pra prateleira dela na Coleção).
  ratingTitle?: string;
  onJumpToRating?: (rating: number) => void;
  // Cartões extras no fim da grade (ex.: pins de outra pessoa).
  extra?: React.ReactNode;
}

export const ProfileTasteGrid: React.FC<ProfileTasteGridProps> = ({
  ratingCounts,
  average,
  favoriteGenres,
  favoriteKeywords,
  favoriteDecade,
  topDirectors,
  leastKnownGem,
  countryCounts,
  countryAvgRatings,
  onViewCountryMovies,
  ownerRatingLabel,
  ratingTitle,
  onJumpToRating,
  extra,
}) => {
  const { t, i18n } = useTranslation();
  const [gemMovie, setGemMovie] = useState<Movie | null>(null);
  const [gemLoading, setGemLoading] = useState(false);
  const ratingLabel = ownerRatingLabel ?? t('home.desk.yourRating');
  const formatNumber = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Joia menos conhecida — abre os detalhes do filme ao tocar no cartão.
  const openGem = async () => {
    if (!leastKnownGem || gemLoading) return;
    setGemLoading(true);
    try {
      setGemMovie(await getMovieDetailsFromDB(leastKnownGem.id));
    } catch (error) {
      console.error('Error loading gem details:', error);
      toast.error(t('common.error'));
    } finally {
      setGemLoading(false);
    }
  };

  // Década favorita: as três décadas mais vistas + "outras".
  const decadeView = (() => {
    if (!favoriteDecade) return null;
    const sorted = Object.entries(favoriteDecade.allDecades || {})
      .map(([decade, count]) => ({ decade, count: count as number }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
    const total = sorted.reduce((a, b) => a + b.count, 0) || 1;
    const top3 = sorted.slice(0, 3);
    const othersCount = sorted.slice(3).reduce((a, b) => a + b.count, 0);
    const kind = favoriteDecade.label === 'Grandpa Cinema' ? 'grandpa' : favoriteDecade.label === 'Nostalgic' ? 'nostalgic' : 'modern';
    const accent = kind === 'grandpa' ? '#F59E0B' : kind === 'nostalgic' ? '#38BDF8' : '#34D399';
    const descKey = kind === 'grandpa' ? 'classicFilm' : kind;
    const segments = [
      ...top3.map((d, i) => ({ key: d.decade, label: d.decade, count: d.count, rank: i })),
      ...(othersCount > 0 ? [{ key: 'others', label: t('profile.stats.otherDecades'), count: othersCount, rank: 3 }] : []),
    ].map((s) => ({ ...s, pct: (s.count / total) * 100 }));
    return { accent, labelKey: kind, descKey, segments };
  })();

  return (
    <>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className={`${PROFILE_CARD} md:col-span-2`} style={{ background: SURFACE }}>
          <RatingSpectrum counts={ratingCounts} average={average} onJump={onJumpToRating} title={ratingTitle ?? t('profile.stats.ratingDistribution')} />
        </div>

        <div className={PROFILE_CARD} style={{ background: SURFACE }}>
          <div className="grid grid-cols-2 gap-5">
            {[
              { title: t('profile.stats.favoriteGenres'), items: favoriteGenres, empty: t('profile.stats.noGenresYet'), capitalize: false },
              { title: t('profile.stats.favoriteKeywords'), items: favoriteKeywords, empty: t('profile.stats.noKeywordsYet'), capitalize: true },
            ].map((col) => (
              <div key={col.title} className="min-w-0">
                <CardTitle>{col.title}</CardTitle>
                {col.items.length > 0 ? (
                  <ol className="mt-4 space-y-1.5">
                    {col.items.map((item, index) => (
                      <li
                        key={item.id}
                        className={`truncate ${col.capitalize ? 'capitalize' : ''} ${index === 0 ? 'text-base font-semibold' : 'text-sm'}`}
                        style={{ color: index === 0 ? PAPER : MIST }}
                        title={item.name}
                      >
                        {item.name}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 text-sm" style={{ color: MIST }}>
                    {col.empty}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {favoriteDecade && decadeView && (
          <div className={PROFILE_CARD} style={{ background: SURFACE }}>
            <CardTitle>{t('profile.stats.favoriteDecade')}</CardTitle>
            <div className="mt-4 flex items-baseline gap-3">
              <span style={{ ...PIXEL, color: PAPER }} className="text-5xl leading-none">
                {favoriteDecade.decade}
              </span>
              <span className="text-sm" style={{ color: MIST }}>
                {t('library.titleCount', { count: favoriteDecade.count })}
              </span>
            </div>
            <p className="mt-3 font-semibold" style={{ color: decadeView.accent }}>
              {t(`profile.decadeLabels.${decadeView.labelKey}`)}
            </p>
            <p className="mt-1 text-sm leading-snug" style={{ color: MIST }}>
              {t(`profile.stats.${decadeView.descKey}`)}
            </p>
            <div
              className="mt-4 flex h-3 gap-[2px] rounded-full overflow-hidden"
              role="img"
              aria-label={decadeView.segments.map((s) => `${s.label}: ${Math.round(s.pct)}%`).join(', ')}
            >
              {decadeView.segments.map((seg) => (
                <span
                  key={seg.key}
                  className="h-full"
                  style={{
                    width: `${seg.pct}%`,
                    background: seg.rank === 0 ? decadeView.accent : `rgba(189,180,214,${seg.rank === 3 ? 0.22 : 0.45 - seg.rank * 0.1})`,
                  }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: MIST }}>
              {decadeView.segments.map((seg) => (
                <li key={seg.key} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="w-2 h-2 rounded-full"
                    style={{ background: seg.rank === 0 ? decadeView.accent : `rgba(189,180,214,${seg.rank === 3 ? 0.3 : 0.55 - seg.rank * 0.1})` }}
                  />
                  <span style={seg.rank === 0 ? { color: PAPER } : undefined}>{seg.label}</span>
                  <span className="tabular-nums">{Math.round(seg.pct)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={PROFILE_CARD} style={{ background: SURFACE }}>
          <CardTitle>{t('profile.stats.favoriteDirectors')}</CardTitle>
          {topDirectors.length > 0 ? (
            <ol className="mt-4 space-y-2.5">
              {topDirectors.map((director, index) => (
                <li key={`${director.name}-${index}`} className="flex items-center gap-3 min-w-0">
                  <span style={{ ...PIXEL, color: index === 0 ? PAPER : MIST }} className="w-5 shrink-0 text-base leading-none text-right">
                    {index + 1}
                  </span>
                  <span className={`flex-1 min-w-0 truncate ${index === 0 ? 'font-semibold' : ''}`} style={{ color: PAPER }}>
                    {director.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums" style={{ color: MIST }}>
                    {t('library.titleCount', { count: director.count })}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-sm" style={{ color: MIST }}>
              {t('common.no_data')}
            </p>
          )}
        </div>

        <div className={PROFILE_CARD} style={{ background: SURFACE }}>
          <CardTitle>{t('profile.stats.leastKnownGem')}</CardTitle>
          {leastKnownGem ? (
            <button
              onClick={openGem}
              aria-busy={gemLoading || undefined}
              className={`group mt-4 -mx-2 w-[calc(100%+1rem)] flex-col items-start justify-start gap-1 px-2 py-2 rounded-xl text-left hover:bg-white/[0.04] transition ${FOCUS_RING}`}
            >
              <span className="flex items-center gap-2 w-full">
                <Gem className="w-5 h-5 shrink-0 text-emerald-300" aria-hidden />
                <span className="flex-1 min-w-0 font-semibold leading-snug group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                  {leastKnownGem.title}
                </span>
                {gemLoading ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin text-violet-300" aria-hidden />
                ) : (
                  <ArrowRight className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
                )}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" style={{ color: MIST }}>
                {leastKnownGem.release_date && <span>{leastKnownGem.release_date.slice(0, 4)}</span>}
                <span className="inline-flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                  {formatNumber(leastKnownGem.vote_average)}
                </span>
                {typeof leastKnownGem.userRating === 'number' && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[13px] leading-none"
                    style={{
                      ...PIXEL,
                      color: ratingTone(leastKnownGem.userRating).color,
                      boxShadow: `inset 0 0 0 1.5px ${ratingTone(leastKnownGem.userRating).ring}`,
                    }}
                    title={ratingLabel}
                  >
                    <span className="sr-only">{ratingLabel}:</span>
                    {leastKnownGem.userRating}
                  </span>
                )}
              </span>
              <span className="mt-1 text-xs" style={{ color: MIST }}>
                {t('profile.stats.onlyVotes', { count: leastKnownGem.vote_count })} {t('profile.stats.votesOnTmdb')}
              </span>
            </button>
          ) : (
            <p className="mt-4 text-sm" style={{ color: MIST }}>
              {t('profile.stats.noHiddenGems')}
            </p>
          )}
        </div>

        {extra}

        <div className="md:col-span-2 lg:col-span-3">
          <WorldMapCard countryCounts={countryCounts} countryAvgRatings={countryAvgRatings} language={i18n.language} onViewMovies={onViewCountryMovies} />
        </div>
      </div>

      {gemMovie && <MovieDetailsModal movie={gemMovie} isOpen={true} onClose={() => setGemMovie(null)} />}
    </>
  );
};
