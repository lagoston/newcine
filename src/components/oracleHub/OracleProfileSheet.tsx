import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bookmark, ChevronRight, Film, Loader2, RotateCcw, Star, User } from 'lucide-react';
import OracleSheet, { SheetFade } from '../OracleSheet';
import OptimizedPoster from '../OptimizedPoster';
import MovieDetailsModal from '../MovieDetailsModal';
import PersonPageSheet, { type PersonSeed } from '../PersonPageSheet';
import type { Movie } from '../../lib/tmdb';
import { getFullTitle, prefetchFullTitle } from '../../lib/titleCards';
import {
  getOracleProfile,
  peekOracleProfile,
  oracleTitleName,
  oracleTitlePoster,
  ORACLE_HIGHLIGHTS,
  type HighlightKey,
  type OracleProfile,
  type OracleTitle,
} from '../../lib/oracleProfile';
import { MOOD_BY_KEY } from '../../lib/moods';
import { RANK_MEDALS } from '../../lib/libraryLayouts';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET, ORACLE_BY_ID, oracleCardImage, ratingTone, withAlpha, type OracleId } from '../../lib/oracleTheme';

// Perfil do oráculo (21/10/2026): tocar na carta de um oráculo no Oracle Hub
// abre esta gaveta, no estilo da página do ator/diretor — a carta no lugar
// da foto, a ficha (curadoria, acervo, época, nota média do público), a
// lenda dele, "você e ele", os destaques do acervo (que mudam conforme o
// jeito do oráculo: o Cypher mostra a maior bomba e o mais obscuro), o Top 10
// de filmes e de séries, as nove prateleiras, os diretores que ele mais
// guarda (que abrem a página da pessoa) e o acervo em números.
//
// Tocar num título abre o menu dele por cima; tocar numa prateleira leva à
// Biblioteca dos Oráculos já nela.

type Tab = 'movies' | 'series';

const PERSON_PHOTO = 'https://image.tmdb.org/t/p/w185';

const OracleProfileSheet: React.FC<{ oracleId: OracleId | null; cardStyle: string; onClose: () => void }> = ({ oracleId, cardStyle, onClose }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const oracle = oracleId ? ORACLE_BY_ID[oracleId] : null;

  const [profile, setProfile] = useState<OracleProfile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('movies');
  const [loreOpen, setLoreOpen] = useState(false);
  const [selected, setSelected] = useState<Movie | null>(null);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonSeed | null>(null);
  const [personMovieLoading, setPersonMovieLoading] = useState<number | null>(null);

  useEffect(() => {
    setTab('movies');
    setLoreOpen(false);
    setPerson(null);
    if (!oracleId) return;
    const cached = peekOracleProfile(oracleId);
    setProfile(cached ?? null);
    setStatus(cached ? 'ready' : 'loading');
    let cancelled = false;
    // Mesmo com o guardado da sessão, busca de novo (a biblioteca pode ter
    // mudado) e troca quando chegar.
    getOracleProfile(oracleId)
      .then((found) => {
        if (cancelled) return;
        setProfile(found);
        setStatus('ready');
      })
      .catch((error) => {
        console.error('Oracle profile:', error);
        if (!cancelled && !cached) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [oracleId, attempt]);

  const formatInt = (value: number) => value.toLocaleString(lang);
  const formatOne = (value: number) => value.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const openTitle = async (title: OracleTitle) => {
    const key = `${title.type}:${title.id}`;
    setLoadingKey(key);
    try {
      setSelected(await getFullTitle({ id: title.id, media_type: title.type }));
    } catch {
      /* sem detalhes: fica na gaveta */
    } finally {
      setLoadingKey(null);
    }
  };
  const openPersonMovie = async (movieId: number) => {
    setPersonMovieLoading(movieId);
    try {
      setSelected(await getFullTitle({ id: movieId, media_type: 'movie' }));
    } catch {
      /* fica na página da pessoa */
    } finally {
      setPersonMovieLoading(null);
    }
  };

  const topList = profile ? (tab === 'movies' ? profile.top.movies : profile.top.series) : [];
  const showTabs = Boolean(profile && profile.top.movies.length > 0 && profile.top.series.length > 0);
  useEffect(() => {
    if (profile && profile.top.movies.length === 0 && profile.top.series.length > 0) setTab('series');
  }, [profile]);

  const goldenDecade = useMemo(() => (profile?.decades.length ? [...profile.decades].sort((a, b) => b.count - a.count)[0] : null), [profile]);
  const countryName = useMemo(() => {
    if (!profile?.topCountry) return null;
    try {
      return new Intl.DisplayNames([lang], { type: 'region' }).of(profile.topCountry) || profile.topCountry;
    } catch {
      return profile.topCountry;
    }
  }, [profile?.topCountry, lang]);

  if (!oracle) return null;
  const color = oracle.color;
  const nickname = t(`oracle.cards.${oracle.id}`);
  const subtitle = `${nickname} · ${t(`oracle.cards.${oracle.id}Subtitle`)}`;
  const lore = t(`oracle.cards.${oracle.id}Desc`);

  // ---------- Ficha ----------
  const facts: { label: string; value: React.ReactNode }[] = profile
    ? [
        { label: t('oracle.profile.curation'), value: t(`oracle.libraries.${oracle.id}FunctionDesc`) },
        { label: t('oracle.profile.collection'), value: t('oracle.profile.collectionValue', { movies: formatInt(profile.movies), series: formatInt(profile.series) }) },
        ...(profile.years.min && profile.years.max
          ? [{ label: t('oracle.profile.era'), value: t('oracle.profile.eraValue', { from: profile.years.min, to: profile.years.max }) }]
          : []),
        ...(profile.avgVote !== null
          ? [
              {
                label: t('oracle.profile.publicAvg'),
                value: (
                  <span className="inline-flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                    {formatOne(profile.avgVote)}
                  </span>
                ),
              },
            ]
          : []),
      ]
    : [];

  // ---------- Você e ele ----------
  const youBlock = (() => {
    const you = profile?.you;
    if (!you) return null;
    const total = you.rated + you.watchlist;
    let compare: string | null = null;
    if (you.rated > 0 && you.avg !== null && you.overall !== null) {
      const diff = Math.round((you.avg - you.overall) * 10) / 10;
      compare = diff > 0 ? t('person.you.above', { diff: formatOne(diff) }) : diff < 0 ? t('person.you.below', { diff: formatOne(-diff) }) : t('person.you.equal');
    }
    const tone = you.avg !== null ? ratingTone(Math.round(you.avg)) : null;
    return (
      <section className="mt-5 rounded-2xl px-4 py-3.5 ring-1 ring-white/[0.08]" style={{ background: withAlpha(color, 0.1) }}>
        <p className="text-xs" style={{ color: MIST }}>{t('person.you.title', { name: oracle.name })}</p>
        {total === 0 ? (
          <p className="mt-1.5 text-sm" style={{ color: PAPER }}>{t('oracle.profile.youNone', { name: oracle.name })}</p>
        ) : (
          <div className="mt-1.5 flex items-center gap-4">
            {you.avg !== null && tone && (
              <div className="shrink-0 text-center">
                <p className="text-2xl font-semibold leading-none" style={{ color: tone.color }}>{formatOne(you.avg)}</p>
                <p className="mt-1 text-[11px]" style={{ color: MIST }}>{t('person.you.avgLabel')}</p>
              </div>
            )}
            <div className="min-w-0 text-sm leading-snug" style={{ color: PAPER }}>
              {you.rated > 0 && <p>{t('oracle.profile.youRated', { count: you.rated, name: oracle.name })}</p>}
              {compare && <p style={{ color: MIST }}>{compare}</p>}
              {you.loved > 0 && <p style={{ color: MIST }}>{t('oracle.profile.youLoved', { count: you.loved })}</p>}
              {you.watchlist > 0 && <p style={{ color: MIST }}>{t('person.you.watchlist', { count: you.watchlist })}</p>}
            </div>
          </div>
        )}
      </section>
    );
  })();

  // ---------- Destaques ----------
  const highlights = profile
    ? ORACLE_HIGHLIGHTS[oracle.id]
        .map((key) => ({ key, title: profile.highlights[key] }))
        .filter((h): h is { key: HighlightKey; title: OracleTitle } => Boolean(h.title))
    : [];

  const sectionTitle = (title: string, hint?: string, right?: React.ReactNode) => (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl leading-tight">{title}</h3>
        {hint && <p className="mt-0.5 text-xs" style={{ color: MIST }}>{hint}</p>}
      </div>
      {right}
    </div>
  );

  const myChip = (title: OracleTitle) => {
    if (!title.inLibrary) return null;
    const tone = ratingTone(title.rating);
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none"
        style={{ color: tone.color, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
      >
        {title.rating === null ? (
          <>
            <Bookmark className="w-3 h-3" aria-hidden />
            {t('person.inWatchlist')}
          </>
        ) : (
          t('person.yourRating', { rating: title.rating })
        )}
      </span>
    );
  };

  const shelvesMax = profile ? Math.max(1, ...profile.shelves.map((s) => s.movies + s.series)) : 1;
  const genresMax = profile ? Math.max(1, ...profile.genres.map((g) => g.count)) : 1;
  const decadesMax = profile ? Math.max(1, ...profile.decades.map((d) => d.count)) : 1;

  return (
    <>
      <OracleSheet
        open={!!oracleId}
        onClose={onClose}
        title={<span style={{ color }}>{oracle.name}</span>}
        subtitle={subtitle}
        size="lg"
        escapeEnabled={!selected && !person}
        contentKey={oracleId}
      >
        <div className="flex gap-4">
          <span className="relative w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10" style={{ background: VELVET, boxShadow: `0 18px 32px -18px ${withAlpha(color, 0.9)}` }}>
            <img src={oracleCardImage(oracle.id, cardStyle)} alt="" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
          </span>
          <div className="min-w-0 flex-1">
            {status === 'loading' && (
              <div className="space-y-3 pt-1" aria-busy="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <span className="block h-3 w-20 rounded animate-pulse" style={{ background: VELVET }} />
                    <span className="mt-1.5 block h-4 w-40 max-w-full rounded animate-pulse" style={{ background: VELVET }} />
                  </div>
                ))}
              </div>
            )}
            {status === 'error' && (
              <div className="pt-1">
                <p className="flex items-start gap-2 text-sm" style={{ color: MIST }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                  {t('oracle.profile.error', { name: oracle.name })}
                </p>
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ring-1 ring-white/15 hover:bg-white/10 transition ${FOCUS_RING}`}
                  style={{ color: PAPER }}
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden />
                  {t('person.retry')}
                </button>
              </div>
            )}
            {status === 'ready' && (
              <SheetFade id="facts">
                <dl className="space-y-2.5">
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt className="text-xs" style={{ color: MIST }}>{fact.label}</dt>
                      <dd className="text-sm leading-snug" style={{ color: PAPER }}>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </SheetFade>
            )}
          </div>
        </div>

        {/* A lenda do oráculo, no lugar da biografia. */}
        <section className="mt-5">
          <p className={`text-sm leading-relaxed italic ${loreOpen ? '' : 'line-clamp-4'}`} style={{ color: PAPER }}>
            {lore}
          </p>
          {lore.length > 260 && (
            <button
              type="button"
              onClick={() => setLoreOpen((v) => !v)}
              className={`mt-1.5 text-sm font-medium underline-offset-2 hover:underline rounded ${FOCUS_RING}`}
              style={{ color: '#F0ABFC' }}
            >
              {loreOpen ? t('movieModal.readLess') : t('movieModal.readMore')}
            </button>
          )}
        </section>

        {status === 'ready' && profile && (
          <>
            {youBlock}

            {/* Destaques do acervo */}
            {highlights.length > 0 && (
              <section className="mt-6">
                {sectionTitle(t('oracle.profile.highlightsTitle'))}
                <ul className="mt-3 grid grid-cols-3 gap-3 sm:flex sm:gap-4">
                  {highlights.map(({ key, title }) => {
                    const poster = oracleTitlePoster(title, lang);
                    const name = oracleTitleName(title, lang);
                    const loading = loadingKey === `${title.type}:${title.id}`;
                    return (
                      <li key={key} className="sm:w-[148px] sm:shrink-0">
                        <button
                          type="button"
                          onClick={() => openTitle(title)}
                          onPointerEnter={() => prefetchFullTitle({ id: title.id, media_type: title.type })}
                          className={`group block w-full text-left rounded-xl ${FOCUS_RING}`}
                          aria-label={`${t(`oracle.profile.hl.${key}`)}: ${name}`}
                        >
                          <span className="block text-[11px] sm:text-xs font-semibold leading-tight mb-1.5" style={{ color }}>
                            {t(`oracle.profile.hl.${key}`)}
                          </span>
                          <span className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1" style={{ background: VELVET }}>
                            {poster ? (
                              <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${poster}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                            ) : (
                              <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                                <Film className="w-6 h-6" aria-hidden />
                              </span>
                            )}
                            {loading && (
                              <span className="absolute inset-0 bg-black/55 grid place-items-center">
                                <Loader2 className="w-5 h-5 text-white animate-spin" aria-hidden />
                              </span>
                            )}
                          </span>
                          <span className="mt-2 block text-[13px] font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>{name}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                            {title.year && <span>{title.year}</span>}
                            {title.vote !== null && (
                              <span className="inline-flex items-center gap-1">
                                <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                                {formatOne(title.vote)}
                              </span>
                            )}
                          </span>
                          {key === 'obscure' && (
                            <span className="mt-0.5 block text-[11px]" style={{ color: MIST }}>{t('oracle.profile.votesCount', { count: title.votes })}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Top 10 */}
            <section className="mt-7">
              {sectionTitle(
                t('oracle.profile.topTitle', { name: oracle.name }),
                t('oracle.profile.topHint'),
                showTabs ? (
                  <div role="tablist" aria-label={t('oracle.profile.topTabs')} className="shrink-0 inline-flex p-0.5 rounded-full ring-1 ring-white/10" style={{ background: VELVET }}>
                    {(['movies', 'series'] as Tab[]).map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={tab === value}
                        onClick={() => setTab(value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${FOCUS_RING}`}
                        style={tab === value ? { background: withAlpha(color, 0.22), color: PAPER } : { color: MIST }}
                      >
                        {t(value === 'movies' ? 'oracle.libraries.showMovies' : 'oracle.libraries.showSeries')}
                      </button>
                    ))}
                  </div>
                ) : undefined
              )}
              <SheetFade id={tab} className="mt-3">
                {topList.length === 0 ? (
                  <p className="py-6 text-sm text-center" style={{ color: MIST }}>{t('person.empty')}</p>
                ) : (
                  <ol className="space-y-1.5">
                    {topList.map((title, i) => {
                      const poster = oracleTitlePoster(title, lang);
                      const name = oracleTitleName(title, lang);
                      const mood = MOOD_BY_KEY[title.mood];
                      const medal = RANK_MEDALS[i] as string | undefined;
                      return (
                        <li key={`${title.type}:${title.id}`} className="search-row" style={{ '--row-i': i } as React.CSSProperties}>
                          <button
                            type="button"
                            onClick={() => openTitle(title)}
                            onPointerEnter={() => prefetchFullTitle({ id: title.id, media_type: title.type })}
                            aria-label={t('person.openMovie', { title: name, year: title.year ?? '' })}
                            className={`group w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.06] ${FOCUS_RING}`}
                          >
                            <span className="w-6 shrink-0 text-center text-lg leading-none" style={{ ...PIXEL, color: medal || MIST }} aria-hidden>
                              {i + 1}
                            </span>
                            <span className="relative w-11 shrink-0 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                              {poster ? (
                                <OptimizedPoster src={`https://image.tmdb.org/t/p/w92${poster}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                              ) : (
                                <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                                  <Film className="w-4 h-4" aria-hidden />
                                </span>
                              )}
                              {loadingKey === `${title.type}:${title.id}` && (
                                <span className="absolute inset-0 bg-black/55 grid place-items-center">
                                  <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                                </span>
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium truncate" style={{ color: PAPER }}>{name}</span>
                              <span className="block text-[13px] truncate" style={{ color: MIST }}>
                                {[title.year, mood ? t(mood.labelKey) : null].filter(Boolean).join(' · ')}
                              </span>
                            </span>
                            <span className="shrink-0 flex flex-col items-end gap-1">
                              {title.vote !== null && (
                                <span className="inline-flex items-center gap-1 text-sm" style={{ color: PAPER }} title={t('person.publicScore')}>
                                  <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                                  {formatOne(title.vote)}
                                </span>
                              )}
                              {myChip(title)}
                            </span>
                            <ChevronRight className="w-4 h-4 shrink-0 opacity-0 -ml-1 group-hover:opacity-60 transition hidden sm:block" style={{ color: MIST }} aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </SheetFade>
            </section>

            {/* As nove prateleiras */}
            <section className="mt-7">
              {sectionTitle(t('oracle.profile.shelvesTitle'), t('oracle.profile.shelvesHint', { name: oracle.name }))}
              <ul className="mt-3 space-y-1">
                {profile.shelves.map((shelf) => {
                  const mood = MOOD_BY_KEY[shelf.mood];
                  if (!mood) return null;
                  const total = shelf.movies + shelf.series;
                  return (
                    <li key={shelf.mood}>
                      <button
                        type="button"
                        onClick={() => navigate(`/oracle/libraries?oracle=${oracle.id}&mood=${shelf.mood}`)}
                        className={`group w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.06] ${FOCUS_RING}`}
                      >
                        <span
                          className="grid place-items-center w-9 h-9 shrink-0 rounded-lg text-xl leading-none"
                          style={{ ...PIXEL, color: mood.color, background: VELVET, boxShadow: `inset 0 0 0 1.5px ${withAlpha(mood.color, 0.5)}` }}
                          aria-hidden
                        >
                          {mood.letter}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate" style={{ color: PAPER }}>{t(mood.labelKey)}</span>
                          <span className="mt-1.5 block h-1.5 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden>
                            <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (total / shelvesMax) * 100)}%`, background: withAlpha(mood.color, 0.75) }} />
                          </span>
                          <span className="mt-1 flex items-baseline justify-between gap-2 text-[11px] tabular-nums" style={{ color: MIST }}>
                            <span className="truncate">{t('oracle.profile.collectionValue', { movies: formatInt(shelf.movies), series: formatInt(shelf.series) })}</span>
                            {shelf.rated > 0 && <span className="shrink-0">{t('oracle.profile.shelfRated', { count: shelf.rated })}</span>}
                          </span>
                        </span>
                        <ChevronRight className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition" style={{ color: MIST }} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Diretores de cabeceira */}
            {profile.directors.length > 0 && (
              <section className="mt-7">
                {sectionTitle(t('oracle.profile.directorsTitle'), t('oracle.profile.directorsHint', { name: oracle.name }))}
                <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {profile.directors.map((director) => {
                    const content = (
                      <>
                        <span className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden grid place-items-center ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
                          <User className="w-4 h-4" aria-hidden />
                          {director.photo && <img src={`${PERSON_PHOTO}${director.photo}`} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium leading-tight truncate" style={{ color: PAPER }}>{director.name}</span>
                          <span className="block text-xs" style={{ color: MIST }}>{t('oracle.profile.directorFilms', { count: director.count })}</span>
                        </span>
                      </>
                    );
                    return (
                      <li key={director.name}>
                        {director.id ? (
                          <button
                            type="button"
                            onClick={() => setPerson({ id: director.id as number, name: director.name, profilePath: director.photo, role: 'director' })}
                            className={`w-full flex items-center gap-2.5 rounded-xl p-2 text-left ring-1 ring-white/[0.07] hover:bg-white/[0.06] transition ${FOCUS_RING}`}
                            aria-label={t('person.openDirector', { name: director.name })}
                          >
                            {content}
                          </button>
                        ) : (
                          <div className="flex items-center gap-2.5 rounded-xl p-2 ring-1 ring-white/[0.07]">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* O acervo em números */}
            <section className="mt-7 pb-1">
              {sectionTitle(t('oracle.profile.numbersTitle'))}
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {[
                  profile.hours ? { key: 'hours', value: formatInt(profile.hours), label: t('oracle.profile.hours') } : null,
                  profile.countries ? { key: 'countries', value: formatInt(profile.countries), label: countryName ? t('oracle.profile.countriesMost', { country: countryName }) : t('oracle.profile.countries') } : null,
                  goldenDecade ? { key: 'decade', value: String(goldenDecade.decade), label: t('oracle.profile.goldenDecade', { count: goldenDecade.count, decade: t('oracle.profile.decadeLabel', { decade: goldenDecade.decade }) }) } : null,
                ]
                  .filter((item): item is { key: string; value: string; label: string } => item !== null)
                  .map((item) => (
                    <li key={item.key} className="rounded-xl px-3 py-2.5 ring-1 ring-white/[0.07]" style={{ background: withAlpha(color, 0.07) }}>
                      <p style={{ ...PIXEL, color }} className="text-xl sm:text-2xl leading-none">{item.value}</p>
                      <p className="mt-1.5 text-[11px] sm:text-xs leading-snug" style={{ color: MIST }}>{item.label}</p>
                    </li>
                  ))}
              </ul>

              {profile.decades.length > 1 && (
                <div className="mt-5">
                  <p className="text-xs" style={{ color: MIST }}>{t('oracle.profile.decadesTitle')}</p>
                  <ol className="mt-2 flex items-end gap-1.5 h-20" aria-label={t('oracle.profile.decadesTitle')}>
                    {profile.decades.map((d) => (
                      <li key={d.decade} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${t('oracle.profile.decadeLabel', { decade: d.decade })}: ${formatInt(d.count)}`}>
                        <span className="w-full rounded-t-[4px]" style={{ height: `${Math.max(4, (d.count / decadesMax) * 100)}%`, background: d === goldenDecade ? color : withAlpha(color, 0.4) }} />
                        <span className="mt-1 text-[10px] tabular-nums" style={{ color: MIST }}>{String(d.decade).slice(2)}</span>
                        <span className="sr-only">{`${t('oracle.profile.decadeLabel', { decade: d.decade })}: ${formatInt(d.count)}`}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {profile.genres.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs" style={{ color: MIST }}>{t('oracle.profile.genresTitle')}</p>
                  <ul className="mt-2 space-y-1.5">
                    {profile.genres.map((genre) => (
                      <li key={genre.id} className="flex items-center gap-3">
                        <span className="w-24 sm:w-28 shrink-0 text-sm truncate" style={{ color: PAPER }}>{lang.startsWith('pt') ? genre.pt : genre.en}</span>
                        <span className="flex-1 h-2 rounded-full bg-white/[0.07] overflow-hidden" aria-hidden>
                          <span className="block h-full rounded-full" style={{ width: `${(genre.count / genresMax) * 100}%`, background: withAlpha(color, 0.7) }} />
                        </span>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums" style={{ color: MIST }}>{formatInt(genre.count)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </OracleSheet>

      <PersonPageSheet
        person={person}
        onClose={() => setPerson(null)}
        onOpenMovie={openPersonMovie}
        loadingMovieId={personMovieLoading}
        escapeEnabled={!selected}
      />

      {selected && <MovieDetailsModal movie={selected} isOpen onClose={() => setSelected(null)} isOtherUserProfile={false} />}
    </>
  );
};

export default OracleProfileSheet;
