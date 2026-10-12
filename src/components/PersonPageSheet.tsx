import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Bookmark, ChevronRight, Film, Loader2, RotateCcw, Star, User } from 'lucide-react';
import OracleSheet, { SheetFade } from './OracleSheet';
import OptimizedPoster from './OptimizedPoster';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  getPersonLibraryStats,
  getPersonPage,
  directedCount,
  personAge,
  personBiography,
  topMovies,
  PERSON_PHOTO_BASE,
  type PersonLibraryStats,
  type PersonPage,
  type PersonRole,
} from '../lib/people';
import { RANK_MEDALS } from '../lib/libraryLayouts';
import { FOCUS_RING, MIST, PAPER, PIXEL, VELVET, ratingTone, withAlpha } from '../lib/oracleTheme';

// Página da pessoa (12/10/2026): tocar num nome do elenco, no menu do filme,
// abre esta gaveta POR CIMA do menu — foto, nascimento, biografia, "você e
// ela" (os títulos da sua biblioteca com essa pessoa) e o Top 10 de filmes
// dela pela nota do público. Quem dirigiu 3 filmes ou mais ganha também a
// aba Direção.
//
// Tocar num filme do Top 10 abre o menu dele por cima desta gaveta (fechar
// volta para cá); quem cuida disso é o menu do filme (onOpenMovie). Os dados
// vêm do banco (person_pages), não do TMDB a cada visita — ver lib/people.ts.

export interface PersonSeed {
  id: number;
  name: string;
  profilePath?: string | null;
}

interface PersonPageSheetProps {
  person: PersonSeed | null;
  onClose: () => void;
  // Filme de onde a pessoa foi aberta: aparece marcado no Top 10, e tocar
  // nele só fecha a gaveta.
  currentMovieId?: number;
  onOpenMovie: (movieId: number) => void;
  loadingMovieId?: number | null;
  // Com o menu de outro filme aberto por cima, o Esc é dele.
  escapeEnabled?: boolean;
}

type MineMap = Record<number, number | null>;

const formatDate = (iso: string, lang: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

const PersonPageSheet: React.FC<PersonPageSheetProps> = ({ person: seed, onClose, currentMovieId, onOpenMovie, loadingMovieId = null, escapeEnabled = true }) => {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user?.id || null;
  const lang = i18n.language;
  const personId = seed?.id ?? null;

  const [page, setPage] = useState<PersonPage | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [role, setRole] = useState<PersonRole>('cast');
  const [bioOpen, setBioOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [stats, setStats] = useState<PersonLibraryStats | null>(null);
  const [mine, setMine] = useState<MineMap>({});

  // Pessoa nova: tudo do zero.
  useEffect(() => {
    setPage(null);
    setStats(null);
    setMine({});
    setRole('cast');
    setBioOpen(false);
    setPhotoFailed(false);
    if (!personId) return;
    setStatus('loading');
    let cancelled = false;
    getPersonPage(personId)
      .then((found) => {
        if (cancelled) return;
        setPage(found);
        setStatus(found ? 'ready' : 'error');
      })
      .catch(() => !cancelled && setStatus('error'));
    return () => {
      cancelled = true;
    };
  }, [personId, attempt]);

  // "Você e ela" — só com conta.
  useEffect(() => {
    if (!personId || !userId) return;
    let cancelled = false;
    getPersonLibraryStats(personId).then((found) => !cancelled && setStats(found));
    return () => {
      cancelled = true;
    };
  }, [personId, userId]);

  const canDirect = useMemo(() => (page ? directedCount(page) >= 3 : false), [page]);
  const showRoleTabs = canDirect && (page?.movie_cast?.length || 0) > 0;
  // Quem é conhecido por dirigir e mal atua abre direto na Direção.
  useEffect(() => {
    if (page && canDirect && page.known_for_department === 'Directing' && topMovies(page, 'cast', lang).length < 3) setRole('director');
  }, [page, canDirect, lang]);

  const top = useMemo(() => (page ? topMovies(page, role, lang) : []), [page, role, lang]);
  const topKey = top.map((m) => m.id).join(',');

  // A nota da pessoa (ou watchlist) em cada filme do Top 10: uma consulta só.
  useEffect(() => {
    if (!userId || !topKey) return;
    let cancelled = false;
    supabase
      .from('user_movies')
      .select('movie_id, rating')
      .eq('user_id', userId)
      .eq('media_type', 'movie')
      .in('movie_id', topKey.split(',').map(Number))
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: MineMap = {};
        data.forEach((row: { movie_id: number; rating: number | null }) => {
          next[row.movie_id] = row.rating;
        });
        setMine((prev) => ({ ...prev, ...next }));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, topKey]);

  const name = page?.name || seed?.name || '';
  const photo = photoFailed ? null : page?.profile_path ?? seed?.profilePath ?? null;
  const age = page ? personAge(page) : null;
  const bio = page ? personBiography(page, lang) : null;
  const longBio = (bio?.length || 0) > 360;
  const department = page?.known_for_department
    ? t(`person.department.${page.known_for_department}`, { defaultValue: page.known_for_department })
    : null;

  const subtitle = [department, page?.deathday ? null : age !== null ? t('person.age', { count: age }) : null].filter(Boolean).join(' · ') || undefined;

  const facts: { label: string; value: string }[] = [];
  if (page?.birthday) facts.push({ label: t('person.born'), value: formatDate(page.birthday, lang) });
  if (page?.deathday) {
    facts.push({
      label: t('person.died'),
      value: age !== null ? `${formatDate(page.deathday, lang)} · ${t('person.diedAt', { count: age })}` : formatDate(page.deathday, lang),
    });
  }
  if (page?.place_of_birth) facts.push({ label: t('person.birthplace'), value: page.place_of_birth });

  const formatOne = (value: number) => value.toLocaleString(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ---------- Você e ela ----------
  const youBlock = (() => {
    if (!userId || !stats) return null;
    const total = stats.rated + stats.watchlist;
    let compare: string | null = null;
    if (stats.rated > 0 && stats.avgRating !== null && stats.overallAvg !== null) {
      const diff = Math.round((stats.avgRating - stats.overallAvg) * 10) / 10;
      compare = diff > 0 ? t('person.you.above', { diff: formatOne(diff) }) : diff < 0 ? t('person.you.below', { diff: formatOne(-diff) }) : t('person.you.equal');
    }
    const tone = stats.avgRating !== null ? ratingTone(Math.round(stats.avgRating)) : null;
    return (
      <section className="mt-5 rounded-2xl px-4 py-3.5 ring-1 ring-white/[0.08]" style={{ background: withAlpha('#8B5CF6', 0.1) }}>
        <p className="text-xs uppercase tracking-wide" style={{ color: MIST }}>{t('person.you.title', { name })}</p>
        {total === 0 ? (
          <p className="mt-1.5 text-sm" style={{ color: PAPER }}>{t('person.you.none', { name })}</p>
        ) : (
          <div className="mt-1.5 flex items-center gap-4">
            {stats.avgRating !== null && tone && (
              <div className="shrink-0 text-center">
                <p className="text-2xl font-semibold leading-none" style={{ color: tone.color }}>{formatOne(stats.avgRating)}</p>
                <p className="mt-1 text-[11px]" style={{ color: MIST }}>{t('person.you.avgLabel')}</p>
              </div>
            )}
            <div className="min-w-0 text-sm leading-snug" style={{ color: PAPER }}>
              {stats.rated > 0 && <p>{t('person.you.rated', { count: stats.rated, name })}</p>}
              {compare && <p style={{ color: MIST }}>{compare}</p>}
              {stats.watchlist > 0 && <p style={{ color: MIST }}>{t('person.you.watchlist', { count: stats.watchlist })}</p>}
            </div>
          </div>
        )}
      </section>
    );
  })();

  // ---------- Top 10 ----------
  const topList = (
    <SheetFade id={role} className="mt-3">
      {top.length === 0 ? (
        <p className="py-6 text-sm text-center" style={{ color: MIST }}>{t('person.empty')}</p>
      ) : (
        <ol className="space-y-1.5">
          {top.map((m, i) => {
            const isCurrent = m.id === currentMovieId;
            const hasMine = Object.prototype.hasOwnProperty.call(mine, m.id);
            const myRating = hasMine ? mine[m.id] : undefined;
            const myTone = hasMine ? ratingTone(myRating ?? null) : null;
            const medal = RANK_MEDALS[i] as string | undefined;
            return (
              <li key={m.id} className="search-row" style={{ '--row-i': i } as React.CSSProperties}>
                <button
                  type="button"
                  onClick={() => (isCurrent ? onClose() : onOpenMovie(m.id))}
                  aria-label={t('person.openMovie', { title: m.title, year: m.year })}
                  className={`group w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.06] ${FOCUS_RING}`}
                  style={isCurrent ? { background: 'rgba(255,255,255,0.05)' } : undefined}
                >
                  <span
                    className="w-6 shrink-0 text-center text-lg leading-none"
                    style={{ ...PIXEL, color: medal || MIST }}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <span className="relative w-11 shrink-0 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                    {m.posterPath ? (
                      <OptimizedPoster src={`https://image.tmdb.org/t/p/w92${m.posterPath}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                        <Film className="w-4 h-4" aria-hidden />
                      </span>
                    )}
                    {loadingMovieId === m.id && (
                      <span className="absolute inset-0 bg-black/55 grid place-items-center">
                        <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate" style={{ color: PAPER }}>{m.title}</span>
                      {isCurrent && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'rgba(232,121,249,0.16)', color: '#F0ABFC' }}>
                          {t('person.thisMovie')}
                        </span>
                      )}
                    </span>
                    <span className="block text-[13px] truncate" style={{ color: MIST }}>
                      {[m.year, m.character ? t('person.asCharacter', { character: m.character }) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 flex flex-col items-end gap-1">
                    <span className="inline-flex items-center gap-1 text-sm" style={{ color: PAPER }} title={t('person.publicScore')}>
                      <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                      {formatOne(m.voteAverage)}
                    </span>
                    {myTone && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold leading-none"
                        style={{ color: myTone.color, boxShadow: `inset 0 0 0 1px ${myTone.ring}` }}
                      >
                        {myRating === null || myRating === undefined ? (
                          <>
                            <Bookmark className="w-3 h-3" aria-hidden />
                            {t('person.inWatchlist')}
                          </>
                        ) : (
                          t('person.yourRating', { rating: myRating })
                        )}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-0 -ml-1 group-hover:opacity-60 transition hidden sm:block" style={{ color: MIST }} aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </SheetFade>
  );

  return (
    <OracleSheet
      open={!!seed}
      onClose={onClose}
      title={name}
      subtitle={subtitle}
      size="lg"
      zIndexClass="z-[9999]"
      escapeEnabled={escapeEnabled}
      contentKey={personId}
    >
      <div className="flex gap-4">
        <span className="relative w-24 sm:w-28 shrink-0 aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 grid place-items-center" style={{ background: VELVET, color: MIST }}>
          <User className="w-8 h-8" aria-hidden />
          {photo && (
            <img
              src={`${PERSON_PHOTO_BASE}${photo}`}
              alt=""
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {status === 'loading' && (
            <div className="space-y-3 pt-1" aria-busy="true">
              {[0, 1, 2].map((i) => (
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
                {t('person.error', { name })}
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
              {facts.length > 0 ? (
                <dl className="space-y-2.5">
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt className="text-xs" style={{ color: MIST }}>{fact.label}</dt>
                      <dd className="text-sm leading-snug" style={{ color: PAPER }}>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm" style={{ color: MIST }}>{t('person.noFacts')}</p>
              )}
            </SheetFade>
          )}
        </div>
      </div>

      {status === 'ready' && bio && (
        <section className="mt-5">
          <p className={`text-sm leading-relaxed whitespace-pre-line ${bioOpen || !longBio ? '' : 'line-clamp-4'}`} style={{ color: PAPER }}>
            {bio}
          </p>
          {longBio && (
            <button
              type="button"
              onClick={() => setBioOpen((v) => !v)}
              className={`mt-1.5 text-sm font-medium underline-offset-2 hover:underline rounded ${FOCUS_RING}`}
              style={{ color: '#F0ABFC' }}
            >
              {bioOpen ? t('movieModal.readLess') : t('movieModal.readMore')}
            </button>
          )}
        </section>
      )}

      {status === 'ready' && youBlock}

      {status === 'ready' && (
        <section className="mt-6">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl leading-tight">{t('person.topTitle')}</h3>
              <p className="mt-0.5 text-xs" style={{ color: MIST }}>{t('person.topHint')}</p>
            </div>
            {showRoleTabs && (
              <div role="tablist" aria-label={t('person.roleTabs')} className="shrink-0 inline-flex p-0.5 rounded-full ring-1 ring-white/10" style={{ background: VELVET }}>
                {(['cast', 'director'] as PersonRole[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={role === value}
                    onClick={() => setRole(value)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${FOCUS_RING}`}
                    style={role === value ? { background: PAPER, color: '#221B36' } : { color: MIST }}
                  >
                    {value === 'cast' ? t('person.roleCast') : t('person.roleDirector')}
                  </button>
                ))}
              </div>
            )}
          </div>
          {topList}
        </section>
      )}

      {status === 'loading' && (
        <div className="mt-6 space-y-2" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <span className="w-6" />
              <span className="w-11 aspect-[2/3] rounded-md animate-pulse" style={{ background: VELVET }} />
              <span className="flex-1 space-y-1.5">
                <span className="block h-4 w-2/3 rounded animate-pulse" style={{ background: VELVET }} />
                <span className="block h-3 w-1/3 rounded animate-pulse" style={{ background: VELVET }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </OracleSheet>
  );
};

export default PersonPageSheet;
