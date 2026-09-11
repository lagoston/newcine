import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, LibraryBig, Filter, PartyPopper, Star, Wand2, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getOraclePoolPredictions, getMoviesForPredictedSlice, Movie, getMovieDetails } from '../lib/tmdb';
import MovieDetailsModal from '../components/MovieDetailsModal';
import OracleForYouBox from '../components/OracleForYouBox';
import StreamingFilterModal from '../components/StreamingFilterModal';

type CardType = 'bogart' | 'fincher' | 'cypher';

// As 9 categorias temáticas reais dos pools — "random-surprise" existe
// como décimo mood_key no banco, mas é um modo coringa/fallback (quase
// 1000 filmes, muito maior que as outras), não uma categoria curada de
// verdade — por isso não vira uma prateleira própria aqui.
const MOOD_CATEGORIES: { key: string; labelKey: string; tagKey: string; colors: { bar: string; text: string; shelfRgb: string } }[] = [
  { key: 'adventures', labelKey: 'oracle.moods.adventures', tagKey: 'oracle.moods.adventuresTag', colors: { bar: 'from-sky-400 to-sky-600', text: 'text-sky-600 dark:text-sky-400', shelfRgb: '14,165,233' } },
  { key: 'catharsis', labelKey: 'oracle.moods.catharsis', tagKey: 'oracle.moods.catharsisTag', colors: { bar: 'from-blue-400 to-blue-600', text: 'text-blue-600 dark:text-blue-400', shelfRgb: '59,130,246' } },
  { key: 'adrenaline', labelKey: 'oracle.moods.adrenaline', tagKey: 'oracle.moods.adrenalineTag', colors: { bar: 'from-red-400 to-red-600', text: 'text-red-600 dark:text-red-400', shelfRgb: '239,68,68' } },
  { key: 'mind-blowing', labelKey: 'oracle.moods.mindBlowing', tagKey: 'oracle.moods.mindBlowingTag', colors: { bar: 'from-pink-400 to-pink-600', text: 'text-pink-600 dark:text-pink-400', shelfRgb: '236,72,153' } },
  { key: 'laugh-out-loud', labelKey: 'oracle.moods.laughOutLoud', tagKey: 'oracle.moods.laughOutLoudTag', colors: { bar: 'from-green-400 to-green-600', text: 'text-green-600 dark:text-green-400', shelfRgb: '34,197,94' } },
  { key: 'drug-trip', labelKey: 'oracle.moods.drugTrip', tagKey: 'oracle.moods.drugTripTag', colors: { bar: 'from-emerald-400 to-emerald-600', text: 'text-emerald-600 dark:text-emerald-400', shelfRgb: '16,185,129' } },
  { key: 'romantic', labelKey: 'oracle.moods.romantic', tagKey: 'oracle.moods.romanticTag', colors: { bar: 'from-orange-400 to-orange-600', text: 'text-orange-600 dark:text-orange-400', shelfRgb: '249,115,22' } },
  { key: 'dark-and-scary', labelKey: 'oracle.moods.darkScary', tagKey: 'oracle.moods.darkScaryTag', colors: { bar: 'from-gray-400 to-gray-600', text: 'text-gray-600 dark:text-gray-400', shelfRgb: '107,114,128' } },
  { key: 'family-time', labelKey: 'oracle.moods.familyTime', tagKey: 'oracle.moods.familyTimeTag', colors: { bar: 'from-yellow-400 to-yellow-600', text: 'text-yellow-600 dark:text-yellow-400', shelfRgb: '234,179,8' } },
];

const ORACLE_THEME: Record<CardType, { glow: string; border: string; text: string }> = {
  bogart: { glow: 'from-green-500/20 to-emerald-500/10', border: 'border-green-400/40', text: 'text-green-600 dark:text-green-400' },
  fincher: { glow: 'from-red-500/20 to-rose-600/10', border: 'border-red-400/40', text: 'text-red-600 dark:text-red-400' },
  cypher: { glow: 'from-yellow-500/20 to-amber-500/10', border: 'border-yellow-400/40', text: 'text-yellow-600 dark:text-yellow-400' },
};

// Descrição funcional de cada oráculo — antes usava um texto narrativo
// ("Dizem que o Sapo era..."), agora explica objetivamente o critério
// de curadoria de cada um, colorida na mesma cor de identidade (verde
// Sapo/Bogart, vermelho Raposa/Fincher, amarelo Cobra/Cypher).
const LIBRARY_FUNCTION_DESC_KEY: Record<CardType, string> = {
  bogart: 'oracle.libraries.bogartFunctionDesc',
  fincher: 'oracle.libraries.fincherFunctionDesc',
  cypher: 'oracle.libraries.cypherFunctionDesc',
};

// Carga inicial (grátis) é menor que o incremento pago — antes os dois
// usavam o mesmo número (30), fazendo a primeira carga de cada
// prateleira já vir mais pesada que o necessário pra uma primeira
// visualização.
const INITIAL_PAGE_SIZE = 20;
const LOAD_MORE_INCREMENT = 30;

interface ShelfState {
  movies: Movie[];
  totalCount: number;
  loading: boolean;
  loadingMore: boolean;
}

// Uma prateleira horizontal, com visual de "prateleira física" (tábua
// sutil por baixo dos pôsteres, como uma locadora de verdade). O
// primeiro lote de 20 é grátis; carregar mais de 30 em 30 é uma trava
// premium (sem custo por uso, só exige assinatura), e some quando não
// há mais nada além do que já foi carregado — a mesma lógica de
// esgotado se aplica tanto pra prateleira já nascer
// vazia (usuário já assistiu tudo daquela categoria) quanto pro botão
// pago não aparecer quando não sobra mais nada pra carregar.
const Shelf: React.FC<{
  cardType: CardType;
  mood: typeof MOOD_CATEGORIES[number];
  userId: string;
  accessToken: string;
  selectedProviderIds: number[];
  isPremium: boolean;
  onMovieClick: (movie: Movie) => void;
}> = ({ cardType, mood, userId, accessToken, selectedProviderIds, isPremium, onMovieClick }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [state, setState] = useState<ShelfState>({ movies: [], totalCount: 0, loading: true, loadingMore: false });
  const stateRef = useRef(state);
  stateRef.current = state;
  const isFetchingRef = useRef(false);
  // Cache da lista completa de IDs já ordenados pela nota PREVISTA
  // pessoal (calculada uma vez pela Edge Function) — "carregar mais" só
  // fatia essa lista e busca detalhes da fatia nova, sem recalcular as
  // previsões de novo a cada clique.
  const predictedIdsRef = useRef<{ movie_id: number; predicted_rating: number; is_true_ten: boolean; is_true_nine: boolean }[]>([]);

  // Drag-to-scroll com mouse — mesmo padrão já usado no carrossel da
  // Watchlist. O scroll horizontal funcionava por toque no mobile, mas
  // sem um jeito de arrastar com o mouse não tinha como rolar no
  // desktop, já que a barra de rolagem nativa fica escondida
  // (scrollbarWidth: 'none').
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

  const loadMore = useCallback(async () => {
    if (isFetchingRef.current) return;
    const current = stateRef.current;
    if (current.movies.length > 0 && current.movies.length >= current.totalCount) return;

    isFetchingRef.current = true;
    setState((s) => ({ ...s, loadingMore: current.movies.length > 0, loading: current.movies.length === 0 }));
    try {
      // Primeira carga da prateleira: calcula as previsões pra TODO o
      // pool (uma única chamada à Edge Function) e guarda em cache.
      // Cargas seguintes ("carregar mais") só fatiam esse cache já
      // pronto — nenhuma nova previsão é recalculada.
      if (current.movies.length === 0) {
        predictedIdsRef.current = await getOraclePoolPredictions(cardType, mood.key, accessToken);
      }

      const allPredicted = predictedIdsRef.current;
      const pageSize = current.movies.length === 0 ? INITIAL_PAGE_SIZE : LOAD_MORE_INCREMENT;
      const nextSlice = allPredicted.slice(current.movies.length, current.movies.length + pageSize);
      const sliceMovies = await getMoviesForPredictedSlice(nextSlice.map((p) => p.movie_id));

      // Anexa a nota prevista (e se é um "10 verdadeiro" do Filtro do 10)
      // a cada filme, na mesma ordem em que a previsão já veio ordenada.
      const ratingByMovieId = new Map(nextSlice.map((p) => [p.movie_id, p]));
      const enrichedMovies = sliceMovies.map((movie) => ({
        ...movie,
        predictedRating: ratingByMovieId.get(movie.id)?.predicted_rating,
        isTrueTen: ratingByMovieId.get(movie.id)?.is_true_ten,
        isTrueNine: ratingByMovieId.get(movie.id)?.is_true_nine,
      }));

      setState((s) => ({
        movies: current.movies.length === 0 ? enrichedMovies : [...s.movies, ...enrichedMovies],
        totalCount: allPredicted.length,
        loading: false,
        loadingMore: false,
      }));
    } catch (error) {
      console.error(`Error loading shelf ${cardType}/${mood.key}:`, error);
      setState((s) => ({ ...s, loading: false, loadingMore: false }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [cardType, mood.key, userId, accessToken]);

  useEffect(() => {
    isFetchingRef.current = false;
    predictedIdsRef.current = [];
    setState({ movies: [], totalCount: 0, loading: true, loadingMore: false });
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardType, mood.key, userId]);

  // Filtro de streaming — client-side, sobre os filmes já carregados
  // dessa prateleira. Mesma lógica já usada no filtro da Watchlist.
  const visibleMovies = selectedProviderIds.length === 0
    ? state.movies
    : state.movies.filter((movie) => {
        const flatrate = movie.watchProviders?.flatrate;
        if (!flatrate || flatrate.length === 0) return false;
        return flatrate.some((p) => selectedProviderIds.includes(p.provider_id));
      });

  const hasMore = state.movies.length < state.totalCount;
  // O botão de carregar mais só aparece sem filtro de streaming ativo —
  // desperdiçar a trava premium carregando mais filmes "crus" do pool
  // quando o filtro já está escondendo a maioria deles seria um mau
  // negócio pro usuário (arriscar carregar filmes que nem vão aparecer
  // filtrados). Com o
  // filtro ligado, a saída é desligá-lo primeiro.
  const showLoadMoreButton = hasMore && selectedProviderIds.length === 0;
  const isFullyEmpty = !state.loading && state.totalCount === 0;
  // O bug do "+30 fica bugado com filtro ativo": antes, o botão de
  // carregar mais vivia DENTRO do mesmo bloco que só aparecia quando
  // havia filmes visíveis — se o filtro de streaming escondesse TODOS os
  // filmes já carregados (visibleMovies.length === 0), o usuário caía
  // direto na mensagem de "nenhum filme com esse filtro" e o botão de
  // carregar mais simplesmente NUNCA aparecia, mesmo quando hasMore era
  // verdadeiro e carregar mais poderia trazer filmes compatíveis com o
  // filtro. Agora a mensagem de filtro vazio e o botão de carregar mais
  // podem conviver na mesma tela — não são mais mutuamente exclusivos.

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2.5 mb-2 px-1">
        <div className={`h-6 w-1.5 rounded-full bg-gradient-to-b ${mood.colors.bar} shadow-md`} />
        <h3 className={`text-sm font-bold ${mood.colors.text}`}>
          {t(mood.labelKey)}
          <span className="font-normal text-gray-400 dark:text-gray-500"> ({t(mood.tagKey)})</span>
        </h3>
        {state.totalCount > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-500">({state.totalCount})</span>
        )}
      </div>

      {/* "Prateleira física" com efeito 3D — diferente da primeira
          versão (que cobria a altura inteira da fileira com um fundo
          uniforme), agora só a METADE INFERIOR dos pôsteres senta sobre
          uma "tábua" de altura fixa, com linhas diagonais simulando o
          ângulo de perspectiva de uma prateleira vista de frente/cima, e
          camadas de sombra dando volume real — a parte de cima dos
          pôsteres fica "no ar", só a base encosta na tábua, como numa
          locadora física de verdade. */}
      <div className="relative px-1">
        {state.loading ? (
          <div className="relative flex gap-3 overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-[110px] sm:w-[130px] aspect-[2/3] rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse flex-shrink-0" />
            ))}
          </div>
        ) : isFullyEmpty ? (
          <div className="relative flex items-center gap-2 py-4 px-2 text-gray-500 dark:text-gray-400">
            <PartyPopper className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <p className="text-sm">
              {t('oracle.libraries.shelfFullyWatched', { defaultValue: 'Você já assistiu tudo dessa categoria — bom trabalho!' })}
            </p>
          </div>
        ) : (
          <div className="relative">
            {visibleMovies.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 px-1 pb-3">
                {t('library.noMoviesForFilter', { defaultValue: 'Nenhum filme disponível nos streamings selecionados — carregar mais pode trazer opções compatíveis.' })}
              </p>
            )}

            {(visibleMovies.length > 0 || showLoadMoreButton) && (
              <div className="relative pb-3">
                {/* A tábua 3D — posicionada por baixo da fileira,
                    cobrindo só a metade inferior da altura dos pôsteres
                    (82px mobile / 97px desktop, a metade aproximada de
                    165px/195px). Linhas diagonais + gradiente escurecendo
                    de cima pra baixo simulam a perspectiva e o volume de
                    uma tábua física, com sombra própria projetada na
                    página abaixo dela. */}
                <div
                  className="absolute left-0 right-0 bottom-3 h-[82px] sm:h-[97px] rounded-b-xl pointer-events-none"
                  style={{
                    background: `linear-gradient(180deg, rgba(${mood.colors.shelfRgb},0.30) 0%, rgba(${mood.colors.shelfRgb},0.5) 45%, rgba(${mood.colors.shelfRgb},0.68) 100%)`,
                    backgroundImage:
                      'repeating-linear-gradient(25deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 2px, transparent 2px, transparent 16px), ' +
                      'repeating-linear-gradient(-15deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 20px), ' +
                      `linear-gradient(180deg, rgba(${mood.colors.shelfRgb},0.30) 0%, rgba(${mood.colors.shelfRgb},0.5) 45%, rgba(${mood.colors.shelfRgb},0.68) 100%)`,
                    boxShadow:
                      'inset 0 6px 10px -4px rgba(0,0,0,0.35), ' +
                      'inset 0 -2px 4px rgba(255,255,255,0.15), ' +
                      '0 10px 18px -6px rgba(0,0,0,0.45)',
                  }}
                />

                <div
                  ref={scrollRef}
                  className="relative flex gap-3.5 overflow-x-auto pb-2 cursor-grab select-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
                >
                  {visibleMovies.map((movie) => (
                    <button
                      key={`${movie.id}-${movie.media_type}`}
                      onClick={() => { if (dragDistanceRef.current > 5) return; onMovieClick(movie); }}
                      className="relative w-[110px] sm:w-[130px] flex-shrink-0 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700 aspect-[2/3] shadow-[0_10px_18px_-4px_rgba(0,0,0,0.45)] hover:shadow-[0_14px_22px_-4px_rgba(0,0,0,0.55)] hover:-translate-y-1 transition-all duration-200"
                    >
                      <img
                        src={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : 'https://via.placeholder.com/300x450?text=No+Image'}
                        alt={movie.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                      {/* Nota PREVISTA pra esse usuário — mesmo ícone e
                          cor da legenda no topo da seção, deixando
                          claro que não é a nota pública do filme. */}
                      {typeof (movie as Movie & { predictedRating?: number }).predictedRating === 'number' && (
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-violet-600/90 backdrop-blur-sm shadow-lg">
                          <Wand2 className="w-3 h-3 text-white" />
                          <span className="text-[10px] font-black text-white leading-none">
                            {(movie as Movie & { predictedRating?: number }).predictedRating}
                          </span>
                        </div>
                      )}
                      {/* Sombra de contato na base do pôster, reforçando
                          que ele está "apoiado" na tábua. */}
                      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />
                    </button>
                  ))}

                  {showLoadMoreButton && (
                    <button
                      onClick={() => isPremium ? loadMore() : navigate('/premium')}
                      disabled={state.loadingMore}
                      className="w-[110px] sm:w-[130px] flex-shrink-0 rounded-xl border-2 border-dashed border-amber-400/60 dark:border-amber-500/50 flex flex-col items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-900/10 hover:bg-amber-50/60 dark:hover:bg-amber-900/25 transition-colors disabled:opacity-60 shadow-inner"
                      style={{ aspectRatio: '2/3' }}
                    >
                      {state.loadingMore ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                      <>
                        {/* Tickets aposentados — agora é uma trava premium
                            simples, sem custo por uso. Não-premium vê o
                            aviso e é levado pra /premium ao clicar;
                            premium carrega na hora. */}
                        {isPremium ? (
                          <Wand2 className="w-5 h-5" />
                        ) : (
                          <Crown className="w-5 h-5" />
                        )}
                        <span className="text-[11px] font-bold text-center leading-tight px-1">
                          {t('oracle.libraries.loadMore30', { defaultValue: '+30 títulos' })}
                        </span>
                        <span className="text-[10px] opacity-80">
                          {isPremium
                            ? t('oracle.libraries.tapToLoad', { defaultValue: 'Toque para carregar' })
                            : t('oracle.libraries.premiumRequired', { defaultValue: 'Exclusivo Premium' })}
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default function OracleLibraries() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session } = useAuth();

  const [selectedOracle, setSelectedOracle] = useState<CardType | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [showStreamingFilter, setShowStreamingFilter] = useState(false);
  const [selectedProviderIds, setSelectedProviderIds] = useState<number[]>([]);
  // Status premium compartilhado por TODAS as prateleiras — tickets
  // foram aposentados; carregar mais de 20 títulos agora é uma trava
  // premium simples, sem custo por uso.
  const [isPremium, setIsPremium] = useState(false);
  // Estilo de carta escolhido pelo usuário no Customize Profile — mesmo
  // padrão do OracleDuel: troca o sufixo do arquivo de imagem
  // (BOGART.webp vira BOGART2.webp no estilo "yugioh"). Começa null (não
  // 'default') de propósito — se começasse já em 'default', a carta
  // renderizava primeiro com a imagem padrão e só trocava pra "yugioh"
  // quando a resposta do banco chegasse, causando um flash visível de
  // troca de imagem. Esperando o valor real chegar antes de montar as
  // cartas, a imagem certa já aparece de primeira, sem flick.
  const [cardStyle, setCardStyle] = useState<'default' | 'yugioh' | null>(null);
 // Prateleiras reordenadas pelos moods favoritos do usuário — soma da
 // nota dada a cada filme avaliado que pertence àquele mood (não só
 // contagem), calculada uma vez no servidor. Começa com a ordem padrão
 // original como fallback, até a ordem personalizada chegar — evita a
 // lista pular de posição visivelmente depois que a página já carregou.
 const [orderedMoods, setOrderedMoods] = useState(MOOD_CATEGORIES);

 useEffect(() => {
 if (!session?.user?.id) return;
 supabase
 .rpc('get_user_favorite_moods_order', { p_user_id: session.user.id })
 .then(({ data, error }) => {
 if (error || !data) return;
 const orderMap = new Map(data.map((row: { mood_key: string; score: number }, idx: number) => [row.mood_key, idx]));
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
    supabase.from('profiles').select('card_style').eq('id', session.user.id).single().then(({ data }) => {
      setCardStyle((data?.card_style as 'default' | 'yugioh') || 'default');
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.rpc('get_user_premium_status', { user_id_input: session.user.id }).then(({ data }) => {
      setIsPremium(data || false);
    });
  }, [session?.user?.id]);

  const ORACLE_NAMES: Record<CardType, string> = { bogart: 'BOGART', fincher: 'FINCHER', cypher: 'CYPHER' };
  const getCardImage = (id: CardType) => {
    const suffix = cardStyle === 'yugioh' ? '2' : '';
    return `/assets/${ORACLE_NAMES[id]}${suffix}.webp`;
  };
  const oracles: { id: CardType }[] = [
    { id: 'bogart' },
    { id: 'fincher' },
    { id: 'cypher' },
  ];

  const handleMovieClick = async (movie: Movie) => {
    try {
      const details = await getMovieDetails(movie.id, movie.media_type || 'movie');
      setSelectedMovie(details);
    } catch {
      setSelectedMovie(movie);
    }
  };

  const handleToggleProvider = (providerId: number) => {
    setSelectedProviderIds((prev) =>
      prev.includes(providerId) ? prev.filter((id) => id !== providerId) : [...prev, providerId]
    );
  };

  const handleBack = () => {
    if (selectedOracle) {
      setSelectedOracle(null);
    } else {
      navigate('/oracle');
    }
  };

  return (
    <div className="min-h-screen pt-20 pb-24 px-4 relative overflow-hidden">
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2.5 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 hover:bg-white/80 dark:hover:bg-gray-700/80 transition-colors shadow-lg"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div className="flex items-center gap-2.5">
              <LibraryBig className="w-6 h-6 text-amber-500" />
              <h1 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-500">
                {t('oracle.libraries.title', { defaultValue: 'Biblioteca dos Oráculos' })}
              </h1>
            </div>
          </div>

          {/* Filtro de streaming — só aparece depois de escolher um
              oráculo, já que filtra as prateleiras dele. Cor azul por
              padrão (era cinza antes), consistente com o mesmo filtro da
              Watchlist. */}
          {selectedOracle && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowStreamingFilter(true)}
                className={`relative flex items-center justify-center p-2.5 sm:p-3 rounded-xl transition-all shadow-lg flex-shrink-0 ${
                  selectedProviderIds.length > 0
                    ? 'bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                <Filter className="w-4 h-4" />
                {selectedProviderIds.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white text-purple-600 text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                    {selectedProviderIds.length}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* NÍVEL 1 — escolher o oráculo */}
          {!selectedOracle && !cardStyle && (
            <div className="grid grid-cols-3 gap-2 sm:gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-2xl sm:rounded-3xl bg-gray-200/50 dark:bg-gray-700/50 animate-pulse aspect-[3/4]" />
              ))}
            </div>
          )}

          {!selectedOracle && cardStyle && (
            <motion.div
              key="oracles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-center text-gray-600 dark:text-gray-400 mb-8 max-w-xl mx-auto">
                {t('oracle.libraries.chooseOracle', { defaultValue: 'Cada oráculo enxerga o cinema à sua própria maneira. Escolha um dos três para explorar tudo que ele já separou pra você.' })}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:gap-6">
                {oracles.map((oracle) => {
                  const theme = ORACLE_THEME[oracle.id];
                  return (
                    <motion.button
                      key={oracle.id}
                      onClick={() => setSelectedOracle(oracle.id)}
                      whileHover={{ scale: 1.03, y: -6 }}
                      whileTap={{ scale: 0.98 }}
                      className={`relative h-full flex flex-col rounded-2xl sm:rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border ${theme.border} shadow-2xl overflow-hidden p-1.5 sm:p-5 text-left group`}
                    >
                      <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${theme.glow} rounded-full blur-3xl pointer-events-none`} />
                      {/* flex-1 + flex-col aqui é o que faltava: sem
                          isso, o grid esticava cada botão pra altura do
                          card mais alto (comportamento padrão do CSS
                          Grid), mas o conteúdo interno ficava com sua
                          altura natural "grudado no topo" — cada
                          oráculo tem tamanhos de texto diferentes, então
                          isso desalinhava o título/imagem entre os 3
                          cards. Título e descrição agora têm line-clamp
                          fixo, pra nenhum texto crescer mais que o
                          esperado e desequilibrar o conjunto de novo. */}
                      <div className="relative z-10 flex-1 flex flex-col">
                        {/* Imagem sem aspect-ratio forçado nem object-cover
                            — a carta mantém sua proporção real, sem
                            cortar nenhuma parte dela (mesma técnica já
                            usada no Duelo: w-full h-auto). */}
                        <div className="rounded-xl sm:rounded-2xl overflow-hidden mb-2 sm:mb-4">
                          <img
                            src={getCardImage(oracle.id)}
                            alt={t(`oracle.cards.${oracle.id}`)}
                            className="w-full h-auto group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                        <h2 className={`text-xs sm:text-lg font-bold mb-0.5 sm:mb-1 line-clamp-1 ${theme.text}`}>
                          {t(`oracle.cards.${oracle.id}`)}
                        </h2>
                        <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1 sm:mb-2 line-clamp-1">
                          {t(`oracle.cards.${oracle.id}Subtitle`)}
                        </p>
                        <p className={`text-[10px] sm:text-sm font-semibold leading-snug sm:leading-relaxed line-clamp-3 ${theme.text}`}>
                          {t(LIBRARY_FUNCTION_DESC_KEY[oracle.id])}
                        </p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              {session?.user?.id && (
                <div className="mt-8">
                  <OracleForYouBox userId={session.user.id} hasEssence={true} />
                </div>
              )}
            </motion.div>
          )}

          {/* NÍVEL 2 — as 9 prateleiras daquele oráculo, direto, sem
              precisar escolher humor antes. */}
          {selectedOracle && (
            <motion.div
              key="shelves"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Imagem sem w/h fixos nem object-cover — mantém a
                  proporção original da carta, sem cortar nenhuma parte
                  dela (mesma técnica já usada na tela de seleção de
                  oráculo, w-full h-auto). Legenda da nota prevista
                  agora fica ao lado, não embaixo. */}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-16 sm:w-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700">
                  <img src={getCardImage(selectedOracle)} alt="" className="w-full h-auto" />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <p className={`text-sm font-bold ${ORACLE_THEME[selectedOracle].text}`}>{t(`oracle.cards.${selectedOracle}`)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t(`oracle.cards.${selectedOracle}Subtitle`)}</p>
                  {/* Mesmo ícone e cor usados no selo roxo de cada capa,
                      pra deixar visualmente óbvio que os dois se
                      referem à mesma coisa: não é a nota pública do
                      site, é a nota que o sistema de previsões
                      calculou especificamente pra esse usuário. */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-400/25 w-fit">
                    <Wand2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                    <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                      {t('oracle.libraries.predictedRatingLegend', { defaultValue: 'Mostrando a nota prevista para você — não é a nota pública do filme' })}
                    </p>
                  </div>
                </div>
              </div>


              {session?.user?.id && orderedMoods.map((mood) => (
                <Shelf
                  key={mood.key}
                  cardType={selectedOracle}
                  mood={mood}
                  userId={session.user.id}
                  accessToken={session.access_token}
                  selectedProviderIds={selectedProviderIds}
                  isPremium={isPremium}
                  onMovieClick={handleMovieClick}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedMovie && (
        <MovieDetailsModal
          movie={selectedMovie}
          isOpen={true}
          onClose={() => setSelectedMovie(null)}
          isOtherUserProfile={false}
        />
      )}

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