import React from 'react';
import { motion, AnimatePresence, useIsPresent } from 'framer-motion';
import { X, Star, Loader2, Tv, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import type { TitleSeason } from './shared';
import { useLayerEntry } from '../../overlays';

// A gaveta "Temporadas e episódios" (por cima do menu do título): progresso
// da série, cada temporada recolhida com a sua contagem e, ao expandir, os
// episódios com o botão de marcar. Dentro do <AnimatePresence> da casca,
// para a saída continuar animada.

interface SeasonsLayerProps {
  // id do <h2> (o aria-labelledby do diálogo aponta para ele)
  titleId: string;
  title: string;
  // a série ainda vai ter episódios novos (muda a cor de "completa")
  stillAiring: boolean;
  seasons: TitleSeason[];
  loadingSeasons: boolean;
  hasRated: boolean;
  isOtherUserProfile: boolean;
  loggedIn: boolean;
  watchedEpisodes: Set<string>;
  pendingEpisodes: Set<string>;
  // as temporadas com a lista de episódios aberta (guardado na casca: fechar
  // e reabrir a gaveta mantém o que estava aberto)
  expandedSeasons: Set<number>;
  onToggleExpanded: (seasonNumber: number) => void;
  onToggleSeason: (season: TitleSeason) => void;
  onToggleEpisode: (seasonNumber: number, episodeNumber: number) => void;
  onClose: () => void;
}

const SeasonsLayer: React.FC<SeasonsLayerProps> = ({
  titleId,
  title,
  stillAiring,
  seasons,
  loadingSeasons,
  hasRated,
  isOtherUserProfile,
  loggedIn,
  watchedEpisodes,
  pendingEpisodes,
  expandedSeasons,
  onToggleExpanded,
  onToggleSeason,
  onToggleEpisode,
  onClose,
}) => {
  const { t, i18n } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);

  const formatScore = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // 19/11/2026 (onda 2b): as temporadas são uma camada da pilha do app
  // (src/overlays): o Esc e o voltar fecham só elas. `z: null`: ficam dentro
  // do menu do título (sem portal), com o z-[70] de sempre ali dentro.
  // (sai da pilha assim que começa a animação de saída)
  const present = useIsPresent();
  const layer = useLayerEntry(present, onClose, { z: null });

  return (
    <div {...layer.rootProps} className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <motion.div
        className="absolute inset-0 bg-black/75"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 32 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto relative w-full sm:max-w-3xl max-h-[92dvh] sm:max-h-[calc(100dvh-6rem)] flex flex-col rounded-t-2xl sm:rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden"
          style={{ background: `radial-gradient(ellipse 70% 40% at 85% 0%, rgba(139,92,246,0.14), transparent 70%), ${NIGHT}` }}
        >
          <div className="shrink-0 flex items-start justify-between gap-4 px-5 sm:px-7 pt-5 pb-4 border-b border-white/[0.07]">
            <div className="min-w-0">
              <h2 id={titleId} style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-[1.7rem] leading-tight">
                {t('movies.seasonsAndEpisodes')}
              </h2>
              <p className="mt-1 text-sm truncate" style={{ color: MIST }}>{title}</p>
            </div>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className={`shrink-0 -mr-2 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
              style={{ color: MIST }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 py-5 space-y-4">
            {loadingSeasons ? (
              <div className="py-12 flex flex-col items-center gap-3" style={{ color: MIST }}>
                <Loader2 className="w-7 h-7 animate-spin" aria-hidden />
                <p className="text-sm">{t('movies.loadingSeasons')}</p>
              </div>
            ) : !seasons || seasons.length === 0 ? (
              <p className="py-12 text-center text-sm" style={{ color: MIST }}>{t('movies.noSeasonsAvailable')}</p>
            ) : (
              <>
                {!hasRated && !isOtherUserProfile && loggedIn && (
                  <p className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
                    <Star className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" aria-hidden />
                    {t('movieModal.rateToTrack')}
                  </p>
                )}

                {/* Progresso da série — só conta episódios que já foram
                    ao ar. Cores da Biblioteca: azul em andamento, roxo
                    quando em dia com uma série ainda no ar, rosa quando
                    completa e encerrada. */}
                {hasRated && (() => {
                  const totalEpisodes = seasons.reduce(
                    (sum, s) => sum + (s.episodes?.filter((ep) => ep.air_date && ep.air_date <= today).length || 0),
                    0
                  );
                  const watchedCount = Array.from(watchedEpisodes).length;
                  const progress = totalEpisodes > 0 ? Math.min(100, (watchedCount / totalEpisodes) * 100) : 0;
                  const isComplete = progress >= 100;
                  const barGradient = isComplete
                    ? (stillAiring ? 'from-violet-500 to-violet-400' : 'from-pink-500 to-pink-400')
                    : 'from-sky-400 to-cyan-300';
                  const labelColor = isComplete ? (stillAiring ? 'text-violet-300' : 'text-pink-300') : '';

                  return (
                    <div className="rounded-xl px-4 py-3.5 ring-1 ring-white/10" style={{ background: VELVET }}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium" style={{ color: PAPER }}>{t('movies.progress')}</span>
                        <span className="text-sm" style={{ color: MIST }}>
                          <span style={{ ...PIXEL, color: PAPER }} className="text-base">{watchedCount}</span>
                          {' / '}{totalEpisodes} {t('movies.episodes').toLowerCase()}
                        </span>
                      </div>
                      <div className="mt-2.5 w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full bg-gradient-to-r ${barGradient}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      </div>
                      <p className={`mt-2 text-xs ${labelColor}`} style={labelColor ? undefined : { color: MIST }}>
                        {progress.toLocaleString(i18n.language, { maximumFractionDigits: 1 })}%{' '}
                        {isComplete && stillAiring
                          ? t('movies.upToDate', { defaultValue: 'em dia — aguardando novos episódios' })
                          : t('movies.complete')}
                      </p>
                    </div>
                  );
                })()}

                {seasons.map((season) => {
                  if (!season.episodes || season.episodes.length === 0) return null;

                  const allWatched = season.episodes.every((ep) =>
                    watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
                  );
                  const isSeasonPending = pendingEpisodes.has(`season-${season.season_number}-all`);
                  const isExpanded = expandedSeasons.has(season.season_number);
                  const toggleExpanded = () => onToggleExpanded(season.season_number);

                  // Progresso só dessa temporada, contando episódios já lançados.
                  const airedInSeason = season.episodes.filter((ep) => ep.air_date && ep.air_date <= today).length;
                  const watchedInSeason = season.episodes.filter((ep) =>
                    watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
                  ).length;
                  const seasonComplete = airedInSeason > 0 && watchedInSeason >= airedInSeason;
                  const sealClasses = seasonComplete
                    ? (stillAiring ? 'bg-violet-500/20 text-violet-200' : 'bg-pink-500/20 text-pink-200')
                    : 'bg-sky-500/15 text-sky-200';
                  const seasonYear = season.air_date ? season.air_date.slice(0, 4) : null;

                  return (
                    <div
                      key={season.season_number}
                      className={`rounded-xl overflow-hidden ring-1 ${allWatched && hasRated ? 'ring-emerald-400/30' : 'ring-white/10'}`}
                      style={{ background: VELVET }}
                    >
                      <div className="flex items-start gap-3.5 p-3.5">
                        {season.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${season.poster_path}`}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="w-14 h-[84px] shrink-0 object-cover rounded-md ring-1 ring-white/10"
                          />
                        ) : (
                          <span className="grid place-items-center w-14 h-[84px] shrink-0 rounded-md" style={{ background: NIGHT, color: MIST }}>
                            <Tv className="w-5 h-5" aria-hidden />
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold leading-snug" style={{ color: PAPER }}>{season.name}</h3>
                          <p className="mt-0.5 text-sm" style={{ color: MIST }}>
                            {season.episode_count} {t('movies.episodes').toLowerCase()}
                            {seasonYear && ` · ${seasonYear}`}
                          </p>
                          {hasRated && airedInSeason > 0 && (
                            <span className={`inline-flex items-center gap-1 mt-2 h-6 px-2 rounded-full text-xs font-semibold ${sealClasses}`}>
                              {seasonComplete ? <Check className="w-3 h-3" aria-hidden /> : <Tv className="w-3 h-3" aria-hidden />}
                              {watchedInSeason}/{airedInSeason}
                            </span>
                          )}
                          {season.overview && (
                            <p className="mt-2 text-sm line-clamp-2" style={{ color: 'rgba(243,234,211,0.72)' }}>{season.overview}</p>
                          )}
                        </div>
                        {hasRated && !isOtherUserProfile && (
                          <button
                            onClick={() => onToggleSeason(season)}
                            disabled={isSeasonPending}
                            aria-pressed={allWatched}
                            aria-label={allWatched ? t('movieModal.unmarkSeason') : t('movieModal.markSeason')}
                            title={allWatched ? t('movieModal.unmarkSeason') : t('movieModal.markSeason')}
                            className={`shrink-0 grid place-items-center w-11 h-11 rounded-full transition disabled:cursor-wait ${
                              allWatched ? 'bg-emerald-500 hover:bg-emerald-400' : 'ring-2 ring-inset ring-white/20 hover:ring-white/40 hover:bg-white/5'
                            } ${FOCUS_RING}`}
                          >
                            {isSeasonPending ? (
                              <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                            ) : (
                              <Check className={`w-5 h-5 ${allWatched ? 'text-white' : 'text-white/30'}`} aria-hidden />
                            )}
                          </button>
                        )}
                      </div>

                      <button
                        onClick={toggleExpanded}
                        aria-expanded={isExpanded}
                        className={`w-full gap-1.5 border-t border-white/[0.07] text-sm font-medium hover:bg-white/[0.03] transition ${FOCUS_RING}`}
                        style={{ color: MIST }}
                      >
                        {isExpanded ? t('movieModal.hideEpisodes') : t('movieModal.showEpisodes')}
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} aria-hidden />
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: 'easeInOut' }}
                            className="overflow-hidden"
                          >
                            <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07]">
                              {season.episodes.map((episode) => {
                                const episodeKey = `${season.season_number}-${episode.episode_number}`;
                                const isWatched = watchedEpisodes.has(episodeKey);
                                const isPending = pendingEpisodes.has(episodeKey);
                                // a nota do episódio pode faltar no cache: 0 = sem nota
                                const episodeScore = episode.vote_average ?? 0;
                                const airDate = episode.air_date
                                  ? new Date(`${episode.air_date}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' })
                                  : null;

                                return (
                                  <li
                                    key={episode.episode_number}
                                    className={`flex items-start gap-3 px-3.5 py-3 ${isWatched && hasRated ? 'bg-emerald-400/[0.06]' : ''}`}
                                  >
                                    <span
                                      style={{ ...PIXEL, color: isWatched && hasRated ? '#6EE7B7' : MIST }}
                                      className="w-7 shrink-0 text-lg leading-6 text-right"
                                    >
                                      {episode.episode_number}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium leading-6" style={{ color: PAPER }}>{episode.name}</p>
                                      {(airDate || episode.runtime || episodeScore > 0) && (
                                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs" style={{ color: MIST }}>
                                          {airDate && <span>{airDate}</span>}
                                          {episode.runtime && <span>{t('movieModal.minutes', { count: episode.runtime })}</span>}
                                          {episodeScore > 0 && (
                                            <span className="inline-flex items-center gap-1">
                                              <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                                              {formatScore(episodeScore)}
                                            </span>
                                          )}
                                        </p>
                                      )}
                                      {episode.overview && (
                                        <p className="mt-1.5 text-sm line-clamp-2" style={{ color: 'rgba(243,234,211,0.7)' }}>{episode.overview}</p>
                                      )}
                                    </div>
                                    {hasRated && !isOtherUserProfile && (
                                      <button
                                        onClick={() => onToggleEpisode(season.season_number, episode.episode_number)}
                                        disabled={isPending}
                                        aria-pressed={isWatched}
                                        aria-label={`${episode.episode_number}. ${episode.name} — ${isWatched ? t('movieModal.unmarkEpisode') : t('movieModal.markEpisode')}`}
                                        className={`shrink-0 -my-1 grid place-items-center w-11 h-11 rounded-full transition disabled:cursor-wait ${FOCUS_RING}`}
                                      >
                                        <span
                                          className={`grid place-items-center w-7 h-7 rounded-full transition ${
                                            isWatched ? 'bg-emerald-500' : 'ring-2 ring-inset ring-white/20 hover:ring-white/40'
                                          }`}
                                        >
                                          {isPending ? (
                                            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" aria-hidden />
                                          ) : (
                                            <Check className={`w-4 h-4 ${isWatched ? 'text-white' : 'text-white/25'}`} aria-hidden />
                                          )}
                                        </span>
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default React.memo(SeasonsLayer);
