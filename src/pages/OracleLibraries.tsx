import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Loader2, LibraryBig, Filter, Ticket, PartyPopper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getOraclePoolMovies, spendTickets, Movie, getMovieDetails } from '../lib/tmdb';
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

const SHELF_PAGE_SIZE = 30;

interface ShelfState {
  movies: Movie[];
  totalCount: number;
  loading: boolean;
  loadingMore: boolean;
}

// Uma prateleira horizontal, com visual de "prateleira física" (tábua
// sutil por baixo dos pôsteres, como uma locadora de verdade). O
// primeiro lote de 30 é grátis; carregar mais custa 3 tickets por lote
// de 30, e some quando não há mais nada além do que já foi carregado —
// a mesma lógica de esgotado se aplica tanto pra prateleira já nascer
// vazia (usuário já assistiu tudo daquela categoria) quanto pro botão
// pago não aparecer quando não sobra mais nada pra carregar.
const Shelf: React.FC<{
  cardType: CardType;
  mood: typeof MOOD_CATEGORIES[number];
  userId: string;
  selectedProviderIds: number[];
  ticketsRemaining: number | null;
  onTicketsSpent: (remaining: number) => void;
  onMovieClick: (movie: Movie) => void;
}> = ({ cardType, mood, userId, selectedProviderIds, ticketsRemaining, onTicketsSpent, onMovieClick }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<ShelfState>({ movies: [], totalCount: 0, loading: true, loadingMore: false });
  const stateRef = useRef(state);
  stateRef.current = state;
  const isFetchingRef = useRef(false);

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

  const loadMore = useCallback(async (spendingTickets: boolean) => {
    if (isFetchingRef.current) return;
    const current = stateRef.current;
    if (current.movies.length > 0 && current.movies.length >= current.totalCount) return;

    if (spendingTickets) {
      const result = await spendTickets(userId, 3);
      if (!result.success) {
        toast.error(t('oracle.libraries.notEnoughTickets', { defaultValue: 'Você não tem tickets suficientes.' }));
        return;
      }
      onTicketsSpent(result.ticketsRemaining);
    }

    isFetchingRef.current = true;
    setState((s) => ({ ...s, loadingMore: current.movies.length > 0, loading: current.movies.length === 0 }));
    try {
      const page = await getOraclePoolMovies(cardType, mood.key, userId, SHELF_PAGE_SIZE, current.movies.length);
      setState((s) => ({
        movies: current.movies.length === 0 ? page.movies : [...s.movies, ...page.movies],
        totalCount: page.totalCount,
        loading: false,
        loadingMore: false,
      }));
    } catch (error) {
      console.error(`Error loading shelf ${cardType}/${mood.key}:`, error);
      setState((s) => ({ ...s, loading: false, loadingMore: false }));
    } finally {
      isFetchingRef.current = false;
    }
  }, [cardType, mood.key, userId, onTicketsSpent, t]);

  useEffect(() => {
    isFetchingRef.current = false;
    setState({ movies: [], totalCount: 0, loading: true, loadingMore: false });
    loadMore(false);
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
  // O botão pago só aparece sem filtro de streaming ativo — gastar
  // tickets pra carregar mais filmes "crus" do pool quando o filtro já
  // está escondendo a maioria deles seria um mau negócio pro usuário
  // (arriscar pagar por filmes que nem vão aparecer filtrados). Com o
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
                      {/* Sombra de contato na base do pôster, reforçando
                          que ele está "apoiado" na tábua. */}
                      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-black/35 to-transparent pointer-events-none" />
                    </button>
                  ))}

                  {showLoadMoreButton && (
                    <button
                      onClick={() => loadMore(true)}
                      disabled={state.loadingMore}
                      className="w-[110px] sm:w-[130px] flex-shrink-0 rounded-xl border-2 border-dashed border-amber-400/60 dark:border-amber-500/50 flex flex-col items-center justify-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-900/10 hover:bg-amber-50/60 dark:hover:bg-amber-900/25 transition-colors disabled:opacity-60 shadow-inner"
                      style={{ aspectRatio: '2/3' }}
                    >
                      {state.loadingMore ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                      <>
                        <Ticket className="w-5 h-5" />
                        <span className="text-[11px] font-bold text-center leading-tight px-1">
                          {t('oracle.libraries.loadMore30', { defaultValue: '+30 títulos' })}
                        </span>
                        <span className="text-[10px] opacity-80">3 tickets</span>
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
  // Saldo de tickets compartilhado por TODAS as prateleiras — gastar num
  // "carregar mais 30" precisa refletir imediatamente em qualquer outra
  // prateleira que o usuário abra em seguida, não ficar isolado por
  // prateleira.
  const [ticketsRemaining, setTicketsRemaining] = useState<number | null>(null);
  // Estilo de carta escolhido pelo usuário no Customize Profile — mesmo
  // padrão do OracleDuel: troca o sufixo do arquivo de imagem
  // (BOGART.webp vira BOGART2.webp no estilo "yugioh"). Começa null (não
  // 'default') de propósito — se começasse já em 'default', a carta
  // renderizava primeiro com a imagem padrão e só trocava pra "yugioh"
  // quando a resposta do banco chegasse, causando um flash visível de
  // troca de imagem. Esperando o valor real chegar antes de montar as
  // cartas, a imagem certa já aparece de primeira, sem flick.
  const [cardStyle, setCardStyle] = useState<'default' | 'yugioh' | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('card_style').eq('id', session.user.id).single().then(({ data }) => {
      setCardStyle((data?.card_style as 'default' | 'yugioh') || 'default');
    });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.rpc('check_and_reset_tickets', { user_id_param: session.user.id }).then(({ data }) => {
      if (data && data.length > 0) setTicketsRemaining(data[0].tickets_remaining);
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
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-20 left-10 w-96 h-96 bg-gradient-to-br from-amber-400/10 to-fuchsia-400/10 dark:from-amber-600/5 dark:to-fuchsia-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-gradient-to-br from-slate-400/10 to-purple-400/10 dark:from-slate-600/5 dark:to-purple-600/5 rounded-full blur-3xl" />
      </div>

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
              {ticketsRemaining !== null && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl border border-white/60 dark:border-gray-700/60 shadow-lg text-sm font-semibold text-amber-600 dark:text-amber-400 flex-shrink-0">
                  <Ticket className="w-4 h-4" />
                  {ticketsRemaining}
                </div>
              )}
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
                      className={`relative rounded-2xl sm:rounded-3xl bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl border ${theme.border} shadow-2xl overflow-hidden p-1.5 sm:p-5 text-left group`}
                    >
                      <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-br ${theme.glow} rounded-full blur-3xl pointer-events-none`} />
                      <div className="relative z-10">
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
                        <h2 className={`text-xs sm:text-lg font-bold mb-0.5 sm:mb-1 ${theme.text}`}>
                          {t(`oracle.cards.${oracle.id}`)}
                        </h2>
                        <p className="text-[9px] sm:text-xs text-gray-500 dark:text-gray-400 mb-1 sm:mb-2 line-clamp-1 sm:line-clamp-none">
                          {t(`oracle.cards.${oracle.id}Subtitle`)}
                        </p>
                        <p className={`text-[10px] sm:text-sm font-semibold leading-snug sm:leading-relaxed ${theme.text}`}>
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
              <div className="flex items-center gap-3 mb-6">
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                  <img src={getCardImage(selectedOracle)} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${ORACLE_THEME[selectedOracle].text}`}>{t(`oracle.cards.${selectedOracle}`)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t(`oracle.cards.${selectedOracle}Subtitle`)}</p>
                </div>
              </div>

              {session?.user?.id && MOOD_CATEGORIES.map((mood) => (
                <Shelf
                  key={mood.key}
                  cardType={selectedOracle}
                  mood={mood}
                  userId={session.user.id}
                  selectedProviderIds={selectedProviderIds}
                  ticketsRemaining={ticketsRemaining}
                  onTicketsSpent={setTicketsRemaining}
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