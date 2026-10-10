import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Filter, PartyPopper, Star, Wand2, Crown, Film, RefreshCw, Tv, Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getOraclePoolPredictions, Movie, type PredictedShelfMovie } from '../lib/tmdb';
import { ShelfItem, getFullTitle, prefetchFullTitle, titleKey } from '../lib/titleCards';
import { tilesThatFit, useInViewOnce, useProgressiveCount, useReveal, useTitleCards } from '../hooks/useLazyList';
import MovieDetailsModal from '../components/MovieDetailsModal';
import StreamingFilterModal from '../components/StreamingFilterModal';
import OptimizedPoster from '../components/OptimizedPoster';
import { VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, POSTER_TITLE, ORACLES, ORACLE_BY_ID, OracleId, oracleCardImage, withAlpha } from '../lib/oracleTheme';
import { MOODS, type Mood } from '../lib/moods';
import PredictedBadge from '../components/PredictedBadge';

// Biblioteca dos Oráculos (/oracle/libraries?oracle=bogart): as 9
// prateleiras temáticas de um oráculo, cada título com a nota PREVISTA pra
// você; troca de oráculo, Filmes | Séries e filtro de streaming no topo.
// As cartas pra escolher o oráculo ficam na Central dos Oráculos — sem
// ?oracle= válido, a página volta pra lá.
//
// Séries: cada prateleira guarda filmes (recommendation_pools.movie_ids) e
// séries (tv_ids) em listas separadas. A chave Filmes | Séries mostra uma
// OU outra — desde 09/10/2026 as séries não se misturam mais com os filmes
// (antes, "Incluir Séries" juntava as duas na mesma fileira). A escolha
// fica salva neste aparelho.

type CardType = OracleId;

// As 9 prateleiras (humores) vêm de lib/moods — "random-surprise" existe
// como décimo mood_key no banco, mas é um modo coringa (quase 2500
// filmes), não uma categoria curada, então não vira prateleira aqui.
const MOOD_CATEGORIES: Mood[] = MOODS;

// Descrição funcional de cada oráculo: o critério de curadoria dele.
const LIBRARY_FUNCTION_DESC_KEY: Record<CardType, string> = {
  bogart: 'oracle.libraries.bogartFunctionDesc',
  fincher: 'oracle.libraries.fincherFunctionDesc',
  cypher: 'oracle.libraries.cypherFunctionDesc',
};
// O mesmo critério, escrito para as séries (Séries ligado).
const LIBRARY_SERIES_FUNCTION_DESC_KEY: Record<CardType, string> = {
  bogart: 'oracle.libraries.bogartSeriesFunctionDesc',
  fincher: 'oracle.libraries.fincherSeriesFunctionDesc',
  cypher: 'oracle.libraries.cypherSeriesFunctionDesc',
};

type ShelfMediaType = 'movie' | 'tv';

const MEDIA_TYPE_KEY = 'cineoracle:oracleLibraries:mediaType';
// Chave antiga do "Incluir Séries" (filmes + séries juntos): quem tinha
// ligado passa a ver as séries.
const LEGACY_INCLUDE_SERIES_KEY = 'cineoracle:oracleLibraries:includeSeries';

const readMediaType = (): ShelfMediaType => {
  try {
    const saved = window.localStorage.getItem(MEDIA_TYPE_KEY);
    if (saved === 'movie' || saved === 'tv') return saved;
    return window.localStorage.getItem(LEGACY_INCLUDE_SERIES_KEY) === '1' ? 'tv' : 'movie';
  } catch {
    return 'movie';
  }
};

const saveMediaType = (value: ShelfMediaType) => {
  try {
    window.localStorage.setItem(MEDIA_TYPE_KEY, value);
    window.localStorage.removeItem(LEGACY_INCLUDE_SERIES_KEY);
  } catch {
    // sem armazenamento (aba anônima etc.): vale só nesta visita
  }
};

const MEDIA_TYPE_OPTIONS: { value: ShelfMediaType; icon: typeof Film; labelKey: string }[] = [
  { value: 'movie', icon: Film, labelKey: 'oracle.libraries.showMovies' },
  { value: 'tv', icon: Tv, labelKey: 'oracle.libraries.showSeries' },
];

// Sem Premium, cada prateleira mostra os 20 primeiros títulos (os de nota
// prevista mais alta); com Premium, a prateleira inteira.
const FREE_LIMIT = 20;
const LOAD_STEP = 15;

const TILE_WIDTH = 'w-[124px] sm:w-[148px]';
const tileWidthPx = () => (typeof window !== 'undefined' && window.innerWidth >= 640 ? 148 : 124);
const SHELF_PAD = 'px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))]';

interface ShelfState {
  // Títulos da prateleira que a pessoa ainda não tem, já na ordem da nota
  // prevista (calculada uma vez pela Edge Function).
  titles: PredictedShelfMovie[];
  // Quantos títulos do tipo a prateleira tem ao todo (com os que a pessoa
  // já tem). 0 = a prateleira ainda não tem esse tipo de título.
  poolCount: number;
  loading: boolean;
  // Falha ao falar com o servidor — diferente de "prateleira vazia".
  error: boolean;
}

const INITIAL_SHELF: ShelfState = { titles: [], poolCount: 0, loading: true, error: false };

type PredictedMovie = Movie & { predictedRating?: number | null };

const SkeletonTile: React.FC = () => (
  <li className={`shrink-0 ${TILE_WIDTH}`} aria-hidden>
    <span className="block aspect-[2/3] rounded-xl poster-skeleton" />
    <span className="mt-2.5 block h-3.5 w-4/5 rounded poster-skeleton" />
    <span className="mt-2 block h-3 w-1/2 rounded poster-skeleton" />
  </li>
);

// Uma prateleira: o humor, e a fileira de pôsteres ordenada pela nota
// prevista.
//
// Sob demanda (10/10/2026): a prateleira só pede as notas previstas quando
// chega perto da tela (antes as 9 pediam ao abrir a página). Os pôsteres
// vêm em lotes, como cartões leves (lib/titleCards), conforme a pessoa rola
// de lado — e acendem ao aparecer. Sem Premium, a fileira para nos 20
// primeiros e termina no convite ao Premium; com Premium, segue carregando
// sozinha até o fim (antes era um botão "+30" a cada vez). Com o filtro de
// streaming ligado, a fileira continua buscando enquanto o fim estiver à
// vista, até achar títulos que passem no filtro.
//
// Cada prateleira pertence a UM oráculo: a página monta uma prateleira nova
// (key = oráculo + humor + filmes/séries) quando o oráculo — ou a chave
// Filmes | Séries — muda. Antes a mesma prateleira
// era reaproveitada e a primeira busca do oráculo novo lia o estado do
// oráculo anterior ("já tenho 20 filmes") — pulava a busca das previsões,
// ficava com uma lista vazia e mostrava "Você já assistiu tudo dessa
// categoria" em todas as prateleiras. E uma resposta atrasada do oráculo
// anterior podia chegar depois e ocupar a prateleira nova.
const Shelf: React.FC<{
  cardType: CardType;
  mood: Mood;
  mediaType: ShelfMediaType;
  selectedProviderIds: number[];
  isPremium: boolean;
  onMovieClick: (movie: Movie) => void;
}> = ({ cardType, mood, mediaType, selectedProviderIds, isPremium, onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<ShelfState>(INITIAL_SHELF);
  const isFetchingRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Arrastar com o mouse no desktop (a barra de rolagem fica escondida).
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollStartRef = useRef(0);
  const dragDistanceRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDraggingRef.current = true;
    startXRef.current = e.pageX - scrollRef.current.offsetLeft;
    scrollStartRef.current = scrollRef.current.scrollLeft;
    dragDistanceRef.current = 0;
    scrollRef.current.style.cursor = 'grabbing';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    dragDistanceRef.current = Math.abs(x - startXRef.current);
    scrollRef.current.scrollLeft = scrollStartRef.current - (x - startXRef.current) * 2;
  };
  const handleMouseUp = () => {
    isDraggingRef.current = false;
    if (scrollRef.current) scrollRef.current.style.cursor = 'grab';
  };

  // As notas previstas da prateleira inteira, numa chamada só.
  const loadPredictions = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setState((s) => ({ ...s, loading: true, error: false }));
    try {
      const { titles, poolCount } = await getOraclePoolPredictions(cardType, mood.key, mediaType);
      if (!aliveRef.current) return;
      setState({ titles, poolCount, loading: false, error: false });
    } catch (error) {
      console.error(`Error loading shelf ${cardType}/${mood.key}:`, error);
      if (!aliveRef.current) return;
      setState((s) => ({ ...s, loading: false, error: true }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [cardType, mood.key, mediaType]);

  // Só quando a prateleira chega perto da tela.
  const [sectionRef, inView] = useInViewOnce<HTMLElement>(500);
  useEffect(() => {
    if (inView) loadPredictions();
  }, [inView, loadPredictions]);

  const refs: ShelfItem[] = useMemo(
    () =>
      state.titles.map((title) => ({
        id: title.movie_id,
        media_type: title.media_type,
        predictedRating: title.predicted_rating,
      })),
    [state.titles]
  );
  const limit = isPremium ? refs.length : Math.min(FREE_LIMIT, refs.length);
  const filterOn = selectedProviderIds.length > 0;
  const initialCount = useMemo(() => tilesThatFit(tileWidthPx()) + 2, []);
  const { count, endRef, hasMore } = useProgressiveCount({
    total: limit,
    initial: initialCount,
    step: LOAD_STEP,
    enabled: inView && !state.loading && !state.error,
    resetKey: selectedProviderIds.join(','),
  });
  const cardOf = useTitleCards(refs, count, { enabled: inView && refs.length > 0 });
  const reveal = useReveal();

  // Filtro de streaming — no cliente, sobre os cartões já carregados.
  const passesFilter = (movie: Movie) => {
    if (!filterOn) return true;
    const flatrate = movie.watchProviders?.flatrate;
    if (!flatrate || flatrate.length === 0) return false;
    return flatrate.some((p) => selectedProviderIds.includes(p.provider_id));
  };

  const shown = refs.slice(0, count).map((ref) => {
    const card = cardOf(ref);
    return { ref, movie: card ? ({ ...card, predictedRating: ref.predictedRating ?? null } as PredictedMovie) : undefined };
  });
  const visible = shown.filter((item) => !item.movie || passesFilter(item.movie));
  const visibleTiles = visible.filter((item) => item.movie).length;
  const lockedCount = refs.length - limit;
  const showPremiumTile = !isPremium && lockedCount > 0 && count >= limit;

  const isFullyEmpty = !state.loading && !state.error && refs.length === 0;
  // Prateleira sem nenhum título do tipo escolhido (ex.: ainda sem séries) —
  // diferente de "você já assistiu tudo".
  const hasNoTitlesOfType = isFullyEmpty && state.poolCount === 0;
  const Icon = mood.icon;
  const label = t(mood.labelKey);
  const formatScore = (value: number) => value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <section
      ref={sectionRef}
      className="border-t border-white/[0.07] py-8 sm:py-10"
      style={{ background: `linear-gradient(180deg, ${withAlpha(mood.color, 0.1)} 0%, ${withAlpha(mood.color, 0.03)} 55%, transparent 100%)` }}
      aria-label={label}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8 flex items-center gap-3.5">
        {/* A letra da prateleira — a mesma do código de personalidade. */}
        <span
          className="relative grid place-items-center w-12 h-12 sm:w-14 sm:h-14 shrink-0 rounded-xl text-3xl sm:text-4xl leading-none"
          style={{ ...PIXEL, color: mood.color, background: VELVET, boxShadow: `inset 0 0 0 1.5px ${withAlpha(mood.color, 0.55)}` }}
          aria-hidden
        >
          {mood.letter}
        </span>
        <div className="min-w-0">
          <h2 style={{ ...PIXEL, color: PAPER }} className="flex items-center gap-2 text-2xl sm:text-3xl leading-tight">
            <span className="truncate">{label}</span>
            <Icon className="w-5 h-5 shrink-0" style={{ color: mood.color }} aria-hidden />
          </h2>
          <p className="mt-0.5 text-sm truncate" style={{ color: MIST }}>
            {t(mood.tagKey)}
          </p>
        </div>
      </div>

      {state.loading ? (
        <div className={`mt-6 flex gap-4 overflow-hidden ${SHELF_PAD}`} aria-busy="true">
          <ol className="contents">
            {[...Array(initialCount)].map((_, i) => (
              <SkeletonTile key={i} />
            ))}
          </ol>
        </div>
      ) : state.error ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
          <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
            <span className="flex-1 min-w-[12rem]">{t('oracle.libraries.shelfError')}</span>
            <button
              onClick={() => loadPredictions()}
              className={`gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <RefreshCw className="w-4 h-4 text-violet-300" aria-hidden />
              {t('common.retry')}
            </button>
          </div>
        </div>
      ) : isFullyEmpty ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
          <p className="flex items-center gap-3 rounded-xl px-4 py-4 text-sm ring-1 ring-white/10" style={{ background: VELVET, color: MIST }}>
            {hasNoTitlesOfType ? (
              <>
                <Inbox className="w-5 h-5 shrink-0 text-violet-300" aria-hidden />
                {t(mediaType === 'tv' ? 'oracle.libraries.shelfNoSeries' : 'oracle.libraries.shelfNoMovies')}
              </>
            ) : (
              <>
                <PartyPopper className="w-5 h-5 shrink-0 text-amber-300" aria-hidden />
                {t('oracle.libraries.shelfFullyWatched')}
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          {filterOn && !hasMore && visibleTiles === 0 && visible.length === 0 && (
            <p className="mx-auto max-w-6xl px-5 sm:px-8 mt-4 text-sm" style={{ color: MIST }}>
              {t('oracle.libraries.noMoviesForFilter')}
            </p>
          )}

          <div
            ref={scrollRef}
            className="mt-3 pt-3 overflow-x-auto cursor-grab select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            <ol className={`flex gap-4 pb-2 ${SHELF_PAD}`}>
              {visible.map(({ ref, movie }) => {
                if (!movie) return <SkeletonTile key={`s:${titleKey(ref)}`} />;
                const year = (movie.release_date || '').slice(0, 4);
                const predicted = typeof movie.predictedRating === 'number' ? movie.predictedRating : null;
                return (
                  <li key={`t:${titleKey(ref)}`} ref={reveal} className={`reveal-tile group relative shrink-0 ${TILE_WIDTH}`}>
                    <button
                      onClick={() => {
                        if (dragDistanceRef.current > 5) return;
                        onMovieClick(movie);
                      }}
                      onPointerEnter={() => prefetchFullTitle(ref)}
                      onPointerDown={() => prefetchFullTitle(ref)}
                      className={`block w-full text-left rounded-xl ${FOCUS_RING}`}
                    >
                      <span
                        className="relative block aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1"
                        style={{ background: VELVET }}
                      >
                        {movie.poster_path ? (
                          <OptimizedPoster src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`} alt={movie.title} className="absolute inset-0 w-full h-full object-cover" />
                        ) : (
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: MIST }}>
                            <Film className="w-7 h-7" aria-hidden />
                            <span className="text-xs leading-snug line-clamp-3" style={{ color: PAPER }}>
                              {movie.title}
                            </span>
                          </span>
                        )}
                        {predicted !== null && <PredictedBadge rating={predicted} />}
                      </span>
                      <span className={`mt-2.5 text-sm font-medium ${POSTER_TITLE}`} style={{ color: PAPER }} title={movie.title}>
                        {movie.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                        {year && <span>{year}</span>}
                        {movie.vote_average > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                            {formatScore(movie.vote_average)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}

              {hasMore && <li ref={endRef} aria-hidden className="shrink-0 w-px" />}

              {/* Sem Premium: a fileira termina no convite. */}
              {showPremiumTile && (
                <li className={`reveal-tile shrink-0 ${TILE_WIDTH}`} ref={reveal}>
                  <button
                    onClick={() => navigate('/premium')}
                    className={`w-full aspect-[2/3] flex flex-col items-center justify-center gap-2 px-3 rounded-xl border-2 border-dashed text-center transition border-amber-300/40 hover:border-amber-300/70 hover:bg-amber-500/10 ${FOCUS_RING}`}
                  >
                    <Crown className="w-6 h-6 text-amber-300" aria-hidden />
                    <span style={{ ...PIXEL, color: PAPER }} className="text-xl leading-none">
                      {t('oracle.libraries.moreTitles', { count: lockedCount })}
                    </span>
                    <span className="text-xs leading-snug" style={{ color: MIST }}>
                      {t('oracle.libraries.premiumRequired')}
                    </span>
                  </button>
                </li>
              )}
            </ol>
          </div>
        </>
      )}
    </section>
  );
};

export default function OracleLibraries() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const oracleParam = searchParams.get('oracle');
  const selectedOracle: CardType | null = oracleParam && oracleParam in ORACLE_BY_ID ? (oracleParam as CardType) : null;

  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showStreamingFilter, setShowStreamingFilter] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>([]);
  // ?type=movie|tv (ex.: "Ver todos" de Filmes/Séries Para Você, na home)
  // abre direto em Filmes ou em Séries; sem ele, vale a última escolha.
  const [mediaType, setMediaType] = useState<ShelfMediaType>(() => {
    const typeParam = searchParams.get('type');
    if (typeParam === 'movie' || typeParam === 'tv') {
      saveMediaType(typeParam);
      return typeParam;
    }
    return readMediaType();
  });
  const [isPremium, setIsPremium] = useState(false);
  // Estilo de carta do Personalizar perfil. Começa null de propósito: a
  // carta só monta com a imagem certa, sem piscar a padrão antes.
  const [cardStyle, setCardStyle] = useState<string | null>(null);
  // Prateleiras na ordem dos humores favoritos do usuário (calculada no
  // servidor); a ordem padrão vale até ela chegar.
  const [orderedMoods, setOrderedMoods] = useState(MOOD_CATEGORIES);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.rpc('get_user_favorite_moods_order', { p_user_id: session.user.id }).then(({ data, error }) => {
      if (error || !data) return;
      const orderMap = new Map((data as { mood_key: string; score: number }[]).map((row, idx) => [row.mood_key, idx]));
      const sorted = [...MOOD_CATEGORIES].sort((a, b) => {
        const rankA = orderMap.get(a.key) ?? MOOD_CATEGORIES.length;
        const rankB = orderMap.get(b.key) ?? MOOD_CATEGORIES.length;
        return rankA - rankB;
      });
      setOrderedMoods(sorted);
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('profiles')
      .select('card_style')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setCardStyle((data?.card_style as string) || 'default');
      });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.rpc('get_user_premium_status', { user_id_input: session.user.id }).then(({ data }) => {
      setIsPremium(Boolean(data));
    });
  }, [session?.user?.id]);

  // Troca de oráculo sempre começa do topo da página.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [selectedOracle]);

  // Os detalhes completos só vêm ao abrir (normalmente já adiantados quando
  // o dedo/mouse encostou no pôster).
  const handleMovieClick = async (movie: Movie) => {
    try {
      const details = await getFullTitle({ id: movie.id, media_type: movie.media_type === 'tv' ? 'tv' : 'movie' });
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    }
  };

  const chooseMediaType = (next: ShelfMediaType) => {
    if (next === mediaType) return;
    setMediaType(next);
    saveMediaType(next);
  };

  const handleToggleProvider = (providerId: number) => {
    setSelectedProviderIds((prev) => (prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]));
  };

  // Sem oráculo escolhido: as cartas moram na Central dos Oráculos.
  if (!selectedOracle) return <Navigate to="/oracle" replace />;

  const current = ORACLE_BY_ID[selectedOracle];
  const ghostButton = `gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium whitespace-nowrap transition ${FOCUS_RING}`;

  return (
    <div className="min-h-screen pb-16">
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10 pb-8">
        <div className="flex items-center justify-between gap-3">
          {/* No celular a volta fica só com a seta, pra caber os dois botões. */}
          <Link
            to="/oracle"
            aria-label={t('oracle.title')}
            className={`-ml-2 shrink-0 gap-1.5 h-11 px-2 rounded-xl hover:bg-white/5 text-sm font-medium transition ${FOCUS_RING}`}
            style={{ color: MIST, justifyContent: 'flex-start', display: 'inline-flex' }}
          >
            <ArrowLeft className="w-[18px] h-[18px]" aria-hidden />
            <span className="hidden sm:inline">{t('oracle.title')}</span>
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            {/* Filmes | Séries: uma lista OU a outra, nunca as duas juntas. */}
            <div
              role="group"
              aria-label={t('oracle.libraries.mediaTypeGroup')}
              className="inline-flex items-center h-11 p-1 rounded-xl border border-white/15"
            >
              {MEDIA_TYPE_OPTIONS.map(({ value, icon: OptionIcon, labelKey }) => {
                const active = mediaType === value;
                return (
                  <button
                    key={value}
                    onClick={() => chooseMediaType(value)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 h-full px-2.5 sm:px-3 rounded-lg text-sm font-medium whitespace-nowrap transition ${FOCUS_RING} ${
                      active ? 'bg-violet-500/25 shadow-[inset_0_0_0_1px_rgba(167,139,250,0.55)]' : 'hover:bg-white/5'
                    }`}
                    style={{ color: active ? PAPER : MIST }}
                  >
                    <OptionIcon className={`w-4 h-4 ${active ? 'text-violet-200' : 'text-violet-300/70'}`} aria-hidden />
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowStreamingFilter(true)}
              aria-label={selectedProviderIds.length > 0 ? `${t('library.filters')} (${selectedProviderIds.length})` : t('library.filters')}
              className={`${ghostButton} ${selectedProviderIds.length > 0 ? '!border-violet-400/60 bg-violet-500/20' : ''}`}
              style={{ color: PAPER }}
            >
              <Filter className="w-4 h-4 text-violet-300" aria-hidden />
              {t('library.filters')}
              {selectedProviderIds.length > 0 && (
                <span className="grid place-items-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs leading-none" style={{ ...PIXEL, background: PAPER, color: INK }} aria-hidden>
                  {selectedProviderIds.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-4 sm:gap-5">
          {cardStyle ? (
            <img
              src={oracleCardImage(current.id, cardStyle)}
              alt=""
              decoding="async"
              className="w-[72px] sm:w-[92px] h-auto shrink-0 rounded-lg"
              style={{ boxShadow: `0 16px 32px -16px ${withAlpha(current.color, 0.8)}` }}
            />
          ) : (
            <span className="w-[72px] sm:w-[92px] aspect-[3/5] shrink-0 rounded-lg bg-white/[0.06] animate-pulse" />
          )}
          <div className="min-w-0">
            <p className="text-sm" style={{ color: MIST }}>
              {t('oracle.libraries.title')}
            </p>
            <h1 style={{ ...PIXEL, color: current.color }} className="mt-1 text-[2.4rem] sm:text-5xl leading-none">
              {current.name}
            </h1>
            <p className="mt-2 text-sm sm:text-[15px] leading-snug" style={{ color: PAPER }}>
              {t((mediaType === 'tv' ? LIBRARY_SERIES_FUNCTION_DESC_KEY : LIBRARY_FUNCTION_DESC_KEY)[current.id])}
            </p>
          </div>
        </div>

        {/* Trocar de oráculo sem voltar */}
        <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label={t('oracle.libraries.switchOracle')}>
          {ORACLES.map((oracle) => {
            const active = oracle.id === current.id;
            return (
              <button
                key={oracle.id}
                onClick={() => !active && setSearchParams({ oracle: oracle.id }, { replace: true })}
                aria-pressed={active}
                className={`gap-2 h-11 pl-1.5 pr-4 rounded-full text-sm font-medium transition ${FOCUS_RING} ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}
                style={{ color: active ? PAPER : MIST, boxShadow: `inset 0 0 0 1.5px ${active ? oracle.color : 'rgba(255,255,255,0.15)'}` }}
              >
                <img src={oracle.avatar} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                {oracle.name}
              </button>
            );
          })}
        </div>

        <p className="mt-4 inline-flex items-start gap-2 text-sm" style={{ color: MIST }}>
          <Wand2 className="w-4 h-4 mt-0.5 shrink-0 text-violet-300" aria-hidden />
          {t('oracle.libraries.predictedRatingLegend')}
        </p>
      </section>

      {session?.user?.id &&
        orderedMoods.map((mood) => (
          <Shelf
            key={`${current.id}:${mood.key}:${mediaType}`}
            cardType={current.id}
            mood={mood}
            mediaType={mediaType}
            selectedProviderIds={selectedProviderIds}
            isPremium={isPremium}
            onMovieClick={handleMovieClick}
          />
        ))}

      {selectedMovie && <MovieDetailsModal movie={selectedMovie} isOpen={true} onClose={() => setSelectedMovie(null)} isOtherUserProfile={false} />}

      <StreamingFilterModal
        isOpen={showStreamingFilter}
        onClose={() => setShowStreamingFilter(false)}
        selectedProviderIds={selectedProviderIds}
        onToggleProvider={handleToggleProvider}
        onClearFilter={() => setSelectedProviderIds([])}
      />
    </div>
  );
}
