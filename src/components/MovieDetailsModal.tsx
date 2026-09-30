import React, { useState, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, Star, Loader2, Film, Instagram, Tv, Send, MessageSquare, Play, ChevronRight,
  ChevronDown, AlertCircle, Wand2, Plus, Check, Eye,
} from 'lucide-react';
import { Movie, getMovieTrailer, getMovieDetailsFromDB, getWatchedEpisodesForProfile } from '../lib/tmdb';
import { getCastPhotos, PROFILE_IMAGE_BASE } from '../lib/castPhotos';
import { getRandomFlavorPhrase } from '../lib/oracleFlavorPhrases';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS } from '../lib/cache';
import RecommendModal from './RecommendModal';
import ReviewsModal from './ReviewsModal';
import QuickAddMenu from './QuickAddMenu';
import ConfirmationModal from './ConfirmationModal';
import {
  NIGHT, VELVET, PAPER, INK, MIST, PIXEL, FOCUS_RING, ORACLE_BY_ID, OracleId, ratingTone,
} from '../lib/oracleTheme';

// Detalhes de um filme/série — "a ficha na mesa do oráculo".
//   • Topo: o fundo (backdrop) do filme se dissolvendo na noite, o pôster
//     (toque = trailer) com os selos dos oráculos e as bolhas dos amigos,
//     título, ficha rápida, notas (pública, prevista ou a sua) e gêneros.
//   • Corpo: sinopse, onde assistir, direção (com o Top 10) e elenco.
//   • Rodapé fixo: adicionar à biblioteca / já na biblioteca, e resenhas.
// No celular abre como gaveta de baixo pra cima; no desktop, centralizado.
// Fecha no X, no fundo escuro e no Esc (o Esc fecha primeiro o trailer ou
// as temporadas, se estiverem abertos).

// As mesmas 9 categorias usadas pra organizar as prateleiras na Biblioteca
// dos Oráculos (ver OracleLibraries.tsx) — "random-surprise" não entra por
// ser uma pool coringa, não uma categoria de verdade. Tons pensados pro
// fundo noite: texto claro, borda e fundo da mesma família de cor.
const MOOD_TAG_CONFIG: Record<string, { labelKey: string; pillClasses: string }> = {
  'adventures': { labelKey: 'oracle.moods.adventures', pillClasses: 'text-sky-200 border-sky-400/40 bg-sky-500/15' },
  'catharsis': { labelKey: 'oracle.moods.catharsis', pillClasses: 'text-blue-200 border-blue-400/40 bg-blue-500/15' },
  'adrenaline': { labelKey: 'oracle.moods.adrenaline', pillClasses: 'text-red-200 border-red-400/40 bg-red-500/15' },
  'mind-blowing': { labelKey: 'oracle.moods.mindBlowing', pillClasses: 'text-pink-200 border-pink-400/40 bg-pink-500/15' },
  'laugh-out-loud': { labelKey: 'oracle.moods.laughOutLoud', pillClasses: 'text-green-200 border-green-400/40 bg-green-500/15' },
  'drug-trip': { labelKey: 'oracle.moods.drugTrip', pillClasses: 'text-emerald-200 border-emerald-400/40 bg-emerald-500/15' },
  'romantic': { labelKey: 'oracle.moods.romantic', pillClasses: 'text-orange-200 border-orange-400/40 bg-orange-500/15' },
  'dark-and-scary': { labelKey: 'oracle.moods.darkScary', pillClasses: 'text-gray-200 border-gray-400/40 bg-gray-500/20' },
  'family-time': { labelKey: 'oracle.moods.familyTime', pillClasses: 'text-yellow-200 border-yellow-400/40 bg-yellow-500/15' },
};

// Padroniza QUALQUER classificação de origem (americana, britânica, etc.)
// pra escala brasileira única (L, +10, +12, +14, +16, +18). Não existe
// "+13" oficial no ClassInd — "PG-13" arredonda pra +14, o balde real mais
// próximo. Qualquer coisa não reconhecida (incluindo "NR") volta null:
// melhor não mostrar nada do que mostrar um selo enganoso.
const standardizeCertification = (raw: string): string | null => {
  const upper = raw.trim().toUpperCase();
  if (upper === 'L') return 'L';
  if (['10', '12', '14', '16', '18'].includes(upper)) return `+${upper}`;
  const usMap: Record<string, string> = { 'G': 'L', 'PG': '+10', 'PG-13': '+14', 'R': '+16', 'NC-17': '+18' };
  if (usMap[upper]) return usMap[upper];
  const ukMap: Record<string, string> = { 'U': 'L', '12A': '+12', '15': '+16' };
  if (ukMap[upper]) return ukMap[upper];
  return null;
};

// Cores oficiais do selo ClassInd: Livre=verde, 10=azul, 12=amarelo,
// 14=laranja, 16=vermelho, 18=preto (com contorno, pra não sumir na noite).
const certificationClasses = (standardized: string): string => {
  if (standardized === '+18') return 'bg-black text-white ring-1 ring-white/40';
  if (standardized === '+16') return 'bg-red-600 text-white';
  if (standardized === '+14') return 'bg-orange-500 text-white';
  if (standardized === '+12') return 'bg-yellow-400 text-gray-900';
  if (standardized === '+10') return 'bg-blue-500 text-white';
  return 'bg-green-600 text-white';
};

const countryFlag = (countryCode: string) => {
  if (!countryCode || countryCode.length !== 2) return '🌍';
  const codePoints = countryCode.toUpperCase().split('').map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

// Posições das bolhas dos amigos sobre o pôster. A 5ª fica logo à direita
// de onde nasce o balão do oráculo (canto inferior esquerdo), "quase
// raspando" sem sobrepor.
const FRIEND_POSITIONS: React.CSSProperties[] = [
  { top: '14%', left: '8%' },
  { top: '24%', right: '10%' },
  { top: '48%', left: '6%' },
  { top: '62%', right: '8%' },
  { bottom: '4%', left: '52%' },
];

// Fundo translúcido dos balões e selos sobre o pôster.
const BUBBLE_BG = 'rgba(18,13,34,0.94)';

interface FriendRating {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rating: number | null;
  review_title?: string | null;
  is_watchlist_only?: boolean;
}

interface MovieDetailsModalProps {
  movie: Movie;
  isOpen: boolean;
  onClose: () => void;
  isOtherUserProfile?: boolean;
  // Sobrescreve o z-index padrão (z-[9999]) — necessário quando esse
  // modal é aberto DE DENTRO de outro modal que já tem um z-index alto
  // (como os modais de review, em z-[10000]), garantindo que este fique
  // por cima do modal que o abriu, não escondido atrás dele.
  zIndexClass?: string;
  // ID do dono do perfil sendo visitado — quando presente junto com
  // isOtherUserProfile, os episódios exibidos como assistidos são os
  // DELE, não os de quem está olhando, e os botões de marcação somem
  // por completo (não se marca episódio na conta de outra pessoa).
  profileUserId?: string;
  onAddToLibrary?: () => void;
  onEpisodeToggle?: () => void;
  // Regra geral contra empilhamento infinito: quando ESTA instância já é
  // aninhada dentro de outra (aberta pelo Top 10 do diretor, por exemplo),
  // ela não abre uma TERCEIRA camada por conta própria — em vez disso pede
  // pra quem a abriu (o modal-pai) TROCAR o filme exibido no lugar dela.
  isNested?: boolean;
  onReplaceMovie?: (movie: Movie) => void;
}

const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({
  movie,
  isOpen,
  onClose,
  isOtherUserProfile = false,
  zIndexClass = 'z-[9999]',
  profileUserId,
  onAddToLibrary,
  onEpisodeToggle,
  isNested = false,
  onReplaceMovie
}) => {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const [isInLibrary, setIsInLibrary] = useState(false);
  const navigate = useNavigate();
  const [friendRatings, setFriendRatings] = useState<FriendRating[]>([]);
  // Qual bolha de amigo tem o balãozinho com o nome ativo no momento —
  // primeiro clique numa bolha mostra o balão; um segundo clique NA
  // MESMA bolha (ela já ativa) navega pro perfil desse usuário.
  const [activeFriendBubble, setActiveFriendBubble] = useState<string | null>(null);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showSeasonsModal, setShowSeasonsModal] = useState(false);
  // Vazio por padrão — todas as temporadas nascem recolhidas, mostrando
  // só o cabeçalho (pôster, nome, contagem de episódios). Um clique na
  // seta expande e revela a lista de episódios daquela temporada.
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(new Set());
  const [pendingEpisodes, setPendingEpisodes] = useState<Set<string>>(new Set());
  const [userRating, setUserRating] = useState<number | null>(null);
  const [predictedRating, setPredictedRating] = useState<number | null>(null);
  const [predictionLoading, setPredictionLoading] = useState(true);
  const [movieMoodKey, setMovieMoodKey] = useState<string | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [seasons, setSeasons] = useState<any[]>(movie.seasons || []);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(false);
  const [oracleSources, setOracleSources] = useState<string[]>([]);
  const [certification, setCertification] = useState<string | null>(null);
  // A nota do próprio usuário chega por uma consulta separada — até ela
  // voltar, o espaço da nota fica com um esqueleto (sem piscar a prevista).
  const [userRatingLoaded, setUserRatingLoaded] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const titleId = useId();
  const seasonsTitleId = useId();

  // Top 10 do diretor — busca sob demanda, só quando o usuário clica.
  const [showDirectorTopTen, setShowDirectorTopTen] = useState(false);
  const [directorTopTenLoading, setDirectorTopTenLoading] = useState(false);
  const [directorTopTenError, setDirectorTopTenError] = useState<string | null>(null);
  const [directorTopTenMovies, setDirectorTopTenMovies] = useState<any[]>([]);
  const [directorNestedMovie, setDirectorNestedMovie] = useState<Movie | null>(null);
  const [loadingNestedMovieId, setLoadingNestedMovieId] = useState<number | null>(null);
  const [oracleFlavorPhrases, setOracleFlavorPhrases] = useState<Record<string, string>>({});
  // Controla quais balões estão visíveis agora (não "dispensados" — o padrão
  // é começar ESCONDIDO e aparecer sozinho depois de um tempo, ver useEffect
  // abaixo). Um toque no selo ou no balão alterna manualmente e cancela
  // qualquer temporizador pendente daquele oráculo.
  const [visibleOracleBubbles, setVisibleOracleBubbles] = useState<Set<string>>(new Set());
  const bubbleTimersRef = React.useRef<Record<string, { showTimer?: ReturnType<typeof setTimeout>; hideTimer?: ReturnType<typeof setTimeout> }>>({});

  const clearBubbleTimers = (source: string) => {
    const timers = bubbleTimersRef.current[source];
    if (timers?.showTimer) clearTimeout(timers.showTimer);
    if (timers?.hideTimer) clearTimeout(timers.hideTimer);
    bubbleTimersRef.current[source] = {};
  };

  const toggleOracleBubble = (source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // O toque "quebra a cadeia" — cancela as aparições/desaparições
    // automáticas pendentes, e dali em diante é controle manual. Um balão
    // por vez: abrir o de um oráculo fecha o do outro (os selos ficam
    // lado a lado e os balões se cobririam).
    Object.keys(bubbleTimersRef.current).forEach(clearBubbleTimers);
    setVisibleOracleBubbles((prev) => (prev.has(source) ? new Set() : new Set([source])));
  };

  // Reset seasons when movie changes
  useEffect(() => {
    setSeasons(movie.seasons || []);
    setLoadingSeasons(false);
    setPosterFailed(false);
    setSynopsisExpanded(false);
    setActiveFriendBubble(null);
  }, [movie.id]);

  // Necessário desde que o aninhamento passou a REAPROVEITAR a mesma
  // instância do modal (troca de filme via onReplaceMovie) em vez de criar
  // uma instância nova do zero a cada clique — sem isso, o painel do Top
  // 10 continuaria mostrando os filmes do diretor ANTERIOR depois de trocar
  // de filme pela própria lista.
  useEffect(() => {
    setShowDirectorTopTen(false);
    setDirectorTopTenLoading(false);
    setDirectorTopTenError(null);
    setDirectorTopTenMovies([]);
  }, [movie.id]);

  // Fotos do elenco: vêm da tabela people do site (cada artista é
  // cadastrado uma vez só a partir do TMDB — ver lib/castPhotos.ts).
  // Enquanto não chegam, ou pra quem não tem foto, fica a inicial do nome.
  const [castPhotos, setCastPhotos] = useState<Record<number, string | null>>({});
  const [failedCastPhotos, setFailedCastPhotos] = useState<Set<number>>(new Set());
  const castIdsKey = (movie.credits?.cast || []).slice(0, 6).map((c) => c.id).join(',');
  useEffect(() => {
    setCastPhotos({});
    setFailedCastPhotos(new Set());
    if (!castIdsKey) return;
    let cancelled = false;
    getCastPhotos(movie.id, movie.media_type === 'tv' ? 'tv' : 'movie', castIdsKey.split(',').map(Number)).then((photos) => {
      if (!cancelled) setCastPhotos(photos);
    });
    return () => {
      cancelled = true;
    };
  }, [movie.id, movie.media_type, castIdsKey]);

  useEffect(() => {
    if (session?.user?.id) {
      checkIfInLibrary();
      loadFriendRatings();
      loadUserRating();
      loadPredictedRating();
      loadMovieMood();
      if (movie.media_type === 'tv') {
        loadWatchedEpisodes();
      }
    }
  }, [session?.user?.id, movie.id]);

      useEffect(() => {
    // Limpa temporizadores do filme anterior antes de trocar — evita um
    // balão do filme antigo aparecer sozinho depois que o usuário já
    // navegou pra outro filme.
    Object.keys(bubbleTimersRef.current).forEach(clearBubbleTimers);
    setVisibleOracleBubbles(new Set());

    if (movie.media_type === 'tv') {
      setOracleSources([]);
      setOracleFlavorPhrases({});
      return;
    }
    supabase
      .rpc('get_movie_oracle_mood_sources', { movie_id_param: movie.id })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching oracle mood sources:', error);
          return;
        }
        // data vem como [{ card_type, mood_key }, ...] — agrupa por oráculo
        // pra saber exatamente quais humores bateram pra cada um.
        const rows: { card_type: string; mood_key: string }[] = data || [];
        const moodsByOracle: Record<string, string[]> = {};
        rows.forEach((row) => {
          if (!moodsByOracle[row.card_type]) moodsByOracle[row.card_type] = [];
          moodsByOracle[row.card_type].push(row.mood_key);
        });

        const sources = Object.keys(moodsByOracle);
        setOracleSources(sources);

        // Sorteia uma frase característica por selo, respeitando o(s) humor(es)
        // reais que o filme bateu — "Surpresa Aleatória" só entra em jogo se
        // não houver nenhum humor específico (ver getRandomFlavorPhrase). A
        // frase é sorteada UMA VEZ aqui e guardada em estado — mesmo que o
        // balão apareça/suma/seja alternado manualmente depois, a frase
        // continua a mesma durante toda essa abertura do modal.
        const isPt = i18n.language.startsWith('pt');
        const phrases: Record<string, string> = {};
        sources.forEach((source) => {
          const phrase = getRandomFlavorPhrase(source, moodsByOracle[source]);
          if (phrase) phrases[source] = isPt ? phrase.pt : phrase.en;
        });
        setOracleFlavorPhrases(phrases);

        // Temporizador por selo: o primeiro balão aparece sozinho 2s depois
        // de abrir o modal e fica 6s; os seguintes entram em fila, um de
        // cada vez. Um toque a qualquer momento cancela esse ciclo (ver
        // toggleOracleBubble).
        sources.filter((source) => !!phrases[source]).forEach((source, order) => {
          const showTimer = setTimeout(() => {
            setVisibleOracleBubbles(new Set([source]));
            const hideTimer = setTimeout(() => {
              setVisibleOracleBubbles((prev) => {
                const next = new Set(prev);
                next.delete(source);
                return next;
              });
            }, 6000);
            bubbleTimersRef.current[source] = { ...bubbleTimersRef.current[source], hideTimer };
          }, 2000 + order * 6500);
          bubbleTimersRef.current[source] = { showTimer };
        });
      });

    return () => {
      Object.keys(bubbleTimersRef.current).forEach(clearBubbleTimers);
    };
  }, [movie.id, movie.media_type, i18n.language]);

  // Classificação indicativa — busca direto do movie_cache.content_ratings,
  // que já vem como um array com uma entrada por país (ex: um item com
  // iso_3166_1 "BR" e outro "US", cada um com sua própria "certification").
  // A versão antiga dessa feature às vezes mostrava algo tipo "New York" em
  // vez da nota — sinal claro de estar lendo o campo errado desse array
  // (provavelmente pegando o índice [0] sem checar o país, ou lendo um outro
  // campo qualquer). Aqui filtramos explicitamente pelo país certo e lemos
  // SÓ o campo "certification", nunca outra coisa.
  useEffect(() => {
    const isPt = i18n.language.startsWith('pt');
    supabase
      .from('movie_cache')
      .select('content_ratings')
      .eq('tmdb_id', movie.id)
      .eq('media_type', movie.media_type || 'movie')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data?.content_ratings || !Array.isArray(data.content_ratings)) {
          setCertification(null);
          return;
        }
        const ratings: { iso_3166_1?: string; certification?: string }[] = data.content_ratings;
        const preferredRegion = isPt ? 'BR' : 'US';

        // Tenta o país preferido primeiro, depois US, depois qualquer um —
        // cada candidato passa pela padronização; só aceita o primeiro que
        // a função realmente reconhece (evita mostrar sigla de país que
        // ainda não mapeamos).
        const candidates = [
          ratings.find((r) => r.iso_3166_1 === preferredRegion && r.certification),
          ratings.find((r) => r.iso_3166_1 === 'US' && r.certification),
          ...ratings.filter((r) => r.certification)
        ];

        let standardized: string | null = null;
        for (const candidate of candidates) {
          if (candidate?.certification) {
            standardized = standardizeCertification(candidate.certification);
            if (standardized) break;
          }
        }
        setCertification(standardized);
      });
  }, [movie.id, movie.media_type, i18n.language]);

  useEffect(() => {
    if (isOpen) {
      // Simples overflow hidden - sem position fixed que causa bugs visuais
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;

      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  // Esc fecha a camada de cima: trailer → temporadas → o próprio modal.
  // Com um modal filho aberto (resenhas, nota, indicar, confirmação ou
  // outro filme aninhado), quem responde ao Esc é ele, não este.
  const childModalOpen = showReviewsModal || showQuickAdd || showDeleteConfirmation || showRecommendModal || !!directorNestedMovie;
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showTrailerModal) { setShowTrailerModal(false); return; }
      if (showSeasonsModal) { setShowSeasonsModal(false); return; }
      if (childModalOpen) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, showTrailerModal, showSeasonsModal, childModalOpen, onClose]);

  const checkIfInLibrary = async () => {
    try {
      // Check if movie is in library with correct media_type
      const { data, error } = await supabase
        .from('user_movies')
        .select(`
          id,
          movies!inner(media_type)
        `)
        .eq('user_id', session?.user?.id)
        .eq('movie_id', movie.id)
        .eq('movies.media_type', movie.media_type || 'movie')
        .maybeSingle();

      if (error) {
        console.warn('Error checking library:', error);
        return;
      }

      setIsInLibrary(data !== null);
    } catch (error) {
      console.error('Error checking library:', error);
    }
  };

  const loadFriendRatings = async () => {
    if (!session?.user?.id) return;

    try {
      setLoadingFriends(true);
      const MAX_BUBBLES = 5;
      let combined: FriendRating[] = [];
      // Rastreia quem já está em `combined` pra nenhum nível seguinte
      // repetir a mesma pessoa (ex.: um amigo de amigo que também
      // aparece nas reviews aleatórias de terceiros).
      const usedUserIds = new Set<string>();

      // Nível 1: amigos diretos (amizade é simétrica — pega o outro
      // lado da relação, seja qual for quem enviou o pedido
      // originalmente).
      const { data: friendshipData, error: friendshipError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);

      if (friendshipError) throw friendshipError;

      const followingIds = (friendshipData || []).map(f =>
        f.requester_id === session.user.id ? f.addressee_id : f.requester_id
      );

      if (followingIds.length > 0) {
        const { data: allEntriesData, error: entriesError } = await supabase
          .from('user_movies')
          .select(`
            user_id,
            rating,
            movies!inner(media_type)
          `)
          .eq('movie_id', movie.id)
          .eq('movies.media_type', movie.media_type || 'movie')
          .in('user_id', followingIds);

        if (entriesError) throw entriesError;

        if (allEntriesData && allEntriesData.length > 0) {
          const ratedEntries = allEntriesData.filter((r: any) => r.rating !== null);
          // Watchlist-only: mesmo filme presente em user_movies, mas sem
          // nota — é exatamente como o resto do app já identifica "está
          // na watchlist" (rating IS NULL).
          const watchlistOnlyEntries = allEntriesData.filter((r: any) => r.rating === null);

          const allUserIds = allEntriesData.map((r: any) => r.user_id);

          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', allUserIds);

          if (profilesError) throw profilesError;

          const ratedUserIds = ratedEntries.map((r: any) => r.user_id);
          const { data: reviewsData } = ratedUserIds.length > 0
            ? await supabase
                .from('reviews')
                .select('user_id, title')
                .eq('movie_id', movie.id)
                .eq('media_type', movie.media_type || 'movie')
                .in('user_id', ratedUserIds)
            : { data: [] as any[] };

          const ratedFormatted: FriendRating[] = ratedEntries.map((r: any) => {
            const profile = profilesData?.find(p => p.id === r.user_id);
            const review = reviewsData?.find((rv: any) => rv.user_id === r.user_id);
            return {
              user_id: r.user_id,
              username: profile?.username || 'Unknown',
              avatar_url: profile?.avatar_url || null,
              rating: r.rating,
              review_title: review?.title || null,
            };
          });

          const watchlistFormatted: FriendRating[] = watchlistOnlyEntries.map((r: any) => {
            const profile = profilesData?.find(p => p.id === r.user_id);
            return {
              user_id: r.user_id,
              username: profile?.username || 'Unknown',
              avatar_url: profile?.avatar_url || null,
              rating: null,
              review_title: null,
              is_watchlist_only: true,
            };
          });

          const shuffledRated = ratedFormatted.sort(() => Math.random() - 0.5);
          const shuffledWatchlist = watchlistFormatted.sort(() => Math.random() - 0.5);
          // Prioriza quem avaliou (informação mais rica) e completa com
          // quem só tem na watchlist até o teto de 5 bolhas.
          combined = [...shuffledRated, ...shuffledWatchlist].slice(0, MAX_BUBBLES);
          combined.forEach((f) => usedUserIds.add(f.user_id));
        }
      }

      // Nível 2: se ainda sobram vagas (não só quando combined está
      // totalmente vazio) — completa com reviews ESCRITAS por qualquer
      // outro usuário sobre essa obra (não avaliação simples, tem que
      // ter texto de review de verdade), excluindo quem já apareceu.
      if (combined.length < MAX_BUBBLES) {
        const remaining = MAX_BUBBLES - combined.length;
        const { data: randomReviewsData } = await supabase
          .from('reviews')
          .select('user_id, title')
          .eq('movie_id', movie.id)
          .eq('media_type', movie.media_type || 'movie')
          .not('title', 'is', null)
          .limit(20);

        const freshReviews = (randomReviewsData || []).filter((r: any) => !usedUserIds.has(r.user_id));

        if (freshReviews.length > 0) {
          const shuffledReviews = [...freshReviews].sort(() => Math.random() - 0.5).slice(0, remaining);
          const reviewUserIds = shuffledReviews.map((r: any) => r.user_id);
          const { data: randomProfilesData } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .in('id', reviewUserIds);

          const { data: randomRatingsData } = await supabase
            .from('user_movies')
            .select('user_id, rating')
            .eq('movie_id', movie.id)
            .in('user_id', reviewUserIds);

          const tier2Formatted: FriendRating[] = shuffledReviews.map((r: any) => {
            const profile = randomProfilesData?.find((p: any) => p.id === r.user_id);
            const ratingEntry = randomRatingsData?.find((rt: any) => rt.user_id === r.user_id);
            return {
              user_id: r.user_id,
              username: profile?.username || 'Unknown',
              avatar_url: profile?.avatar_url || null,
              rating: ratingEntry?.rating ?? null,
              review_title: r.title,
            };
          });

          combined = [...combined, ...tier2Formatted];
          tier2Formatted.forEach((f) => usedUserIds.add(f.user_id));
        }
      }

      // Nível 3: ainda sobram vagas — completa com amigos de amigos (2º
      // grau), excluindo quem já é amigo direto, o próprio usuário, e
      // qualquer um já mostrado nos níveis anteriores. Mesma
      // priorização: quem avaliou primeiro, completa com quem só tem
      // na watchlist.
      if (combined.length < MAX_BUBBLES) {
        const remaining = MAX_BUBBLES - combined.length;
        const { data: fofData, error: fofError } = await supabase
          .rpc('get_friends_of_friends', { p_user_id: session.user.id });

        if (fofError) throw fofError;

        const fofIds = (fofData || [])
          .map((r: any) => r.user_id)
          .filter((id: string) => !usedUserIds.has(id));

        if (fofIds.length > 0) {
          const { data: fofEntriesData, error: fofEntriesError } = await supabase
            .from('user_movies')
            .select(`
              user_id,
              rating,
              movies!inner(media_type)
            `)
            .eq('movie_id', movie.id)
            .eq('movies.media_type', movie.media_type || 'movie')
            .in('user_id', fofIds);

          if (fofEntriesError) throw fofEntriesError;

          if (fofEntriesData && fofEntriesData.length > 0) {
            const fofRatedEntries = fofEntriesData.filter((r: any) => r.rating !== null);
            const fofWatchlistOnlyEntries = fofEntriesData.filter((r: any) => r.rating === null);

            const fofAllUserIds = fofEntriesData.map((r: any) => r.user_id);

            const { data: fofProfilesData, error: fofProfilesError } = await supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .in('id', fofAllUserIds);

            if (fofProfilesError) throw fofProfilesError;

            const fofRatedUserIds = fofRatedEntries.map((r: any) => r.user_id);
            const { data: fofReviewsData } = fofRatedUserIds.length > 0
              ? await supabase
                  .from('reviews')
                  .select('user_id, title')
                  .eq('movie_id', movie.id)
                  .eq('media_type', movie.media_type || 'movie')
                  .in('user_id', fofRatedUserIds)
              : { data: [] as any[] };

            const fofRatedFormatted: FriendRating[] = fofRatedEntries.map((r: any) => {
              const profile = fofProfilesData?.find(p => p.id === r.user_id);
              const review = fofReviewsData?.find((rv: any) => rv.user_id === r.user_id);
              return {
                user_id: r.user_id,
                username: profile?.username || 'Unknown',
                avatar_url: profile?.avatar_url || null,
                rating: r.rating,
                review_title: review?.title || null,
              };
            });

            const fofWatchlistFormatted: FriendRating[] = fofWatchlistOnlyEntries.map((r: any) => {
              const profile = fofProfilesData?.find(p => p.id === r.user_id);
              return {
                user_id: r.user_id,
                username: profile?.username || 'Unknown',
                avatar_url: profile?.avatar_url || null,
                rating: null,
                review_title: null,
                is_watchlist_only: true,
              };
            });

            const fofShuffledRated = fofRatedFormatted.sort(() => Math.random() - 0.5);
            const fofShuffledWatchlist = fofWatchlistFormatted.sort(() => Math.random() - 0.5);
            const tier3Formatted = [...fofShuffledRated, ...fofShuffledWatchlist].slice(0, remaining);
            combined = [...combined, ...tier3Formatted];
          }
        }
      }

      setFriendRatings(combined);
    } catch (error) {
      console.error('Error loading friend ratings:', error);
      setFriendRatings([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const loadUserRating = async () => {
    if (!session?.user?.id) return;
    setUserRatingLoaded(false);

    try {
      const { data, error } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('movie_id', movie.id)
        .maybeSingle();

      if (error) throw error;
      setUserRating(data?.rating !== undefined ? data.rating : null);
    } catch (error) {
      console.error('Error loading user rating:', error);
    } finally {
      setUserRatingLoaded(true);
    }
  };

  // Nota Prevista para Você — mesmo modelo usado nas prateleiras da
  // Biblioteca dos Oráculos e no Match Movie. Fica vazia (sem badge
  // nenhum) quando o filme não está em nenhuma pool de recomendação
  // ou quando o usuário ainda não completou o questionário de
  // personalidade. Enquanto a previsão carrega, um skeleton do mesmo
  // tamanho do badge final fica no lugar — sem isso, o badge só surge
  // quando a resposta chega, empurrando repentinamente tudo que vem
  // depois dele.
  const loadPredictedRating = async () => {
    if (!session?.user?.id) return;
    setPredictionLoading(true);
    setPredictedRating(null);

    try {
      const { data, error } = await supabase.functions.invoke('predict-single-movie', {
        body: { movieId: movie.id, mediaType: movie.media_type },
      });

      if (error) throw error;
      setPredictedRating(data?.inPool && data?.predictedRating !== null ? data.predictedRating : null);
    } catch (error) {
      console.error('Error loading predicted rating:', error);
      setPredictedRating(null);
    } finally {
      setPredictionLoading(false);
    }
  };

  // Mood da pool a que o filme pertence — mostrado como mais um
  // "gênero" ao lado dos reais. Independente de previsão: um filme já
  // avaliado, ou de um usuário sem questionário completo, ainda pode
  // (e deve) mostrar essa tag, já que é informação sobre o filme em
  // si, não sobre a previsão pessoal de ninguém. Só filmes entram em
  // pool — séries nunca têm mood.
  const loadMovieMood = async () => {
    if (movie.media_type !== 'movie') return;

    try {
      const { data, error } = await supabase
        .rpc('get_pools_containing_movie', { p_movie_id: movie.id });

      if (error) throw error;

      const realMood = (data || []).find((p: { mood_key: string }) => p.mood_key !== 'random-surprise');
      setMovieMoodKey(realMood?.mood_key || null);
    } catch (error) {
      console.error('Error loading movie mood:', error);
      setMovieMoodKey(null);
    }
  };

  const loadWatchedEpisodes = async () => {
    if (!session?.user?.id || movie.media_type !== 'tv') return;

    try {
      // Em perfil de outra pessoa, os episódios marcados como assistidos
      // são os DELA — usa a variante que respeita visibilidade de
      // perfil e lê da conta do dono, não de quem está olhando.
      if (isOtherUserProfile && profileUserId) {
        const watched = await getWatchedEpisodesForProfile(session.user.id, profileUserId, movie.id);
        setWatchedEpisodes(watched);
        return;
      }

      const { data, error } = await supabase
        .from('watched_episodes')
        .select('season_number, episode_number')
        .eq('user_id', session.user.id)
        .eq('tmdb_id', movie.id);

      if (error) throw error;

      const watched = new Set<string>();
      data?.forEach(ep => {
        watched.add(`${ep.season_number}-${ep.episode_number}`);
      });
      setWatchedEpisodes(watched);
    } catch (error) {
      console.error('Error loading watched episodes:', error);
    }
  };

  const fetchSeasons = async () => {
    if (movie.media_type !== 'tv' || loadingSeasons) return;

    setLoadingSeasons(true);
    try {
      const { data: cached } = await supabase
        .from('movie_cache')
        .select('seasons_data, number_of_seasons')
        .eq('tmdb_id', movie.id)
        .eq('media_type', 'tv')
        .maybeSingle();

      const cachedHasEpisodes =
        cached?.seasons_data?.length > 0 &&
        cached.seasons_data[0]?.episodes?.length > 0;

      if (cachedHasEpisodes) {
        setSeasons(cached.seasons_data);
        movie.seasons = cached.seasons_data;
        return;
      }

      const numberOfSeasons = cached?.number_of_seasons || movie.number_of_seasons || 0;
      if (numberOfSeasons <= 0) return;

      const { fetchTVSeasonsData } = await import('../lib/tmdb');
      const freshSeasons = await fetchTVSeasonsData(movie.id, numberOfSeasons);

      if (freshSeasons.length > 0) {
        setSeasons(freshSeasons);
        movie.seasons = freshSeasons;

        supabase
          .from('movie_cache')
          .update({ seasons_data: freshSeasons, updated_at: new Date().toISOString() })
          .eq('tmdb_id', movie.id)
          .eq('media_type', 'tv')
          .then(() => {});
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const handleOpenSeasons = async () => {
    setShowSeasonsModal(true);

    const hasDetailedSeasons = seasons.length > 0 && seasons[0]?.episodes?.length > 0;
    if (!hasDetailedSeasons) {
      await fetchSeasons();
    }
  };

  const toggleEpisode = async (seasonNumber: number, episodeNumber: number) => {
    // isOtherUserProfile bloqueado aqui também, não só escondendo o
    // botão — defesa em profundidade contra marcar episódio na conta de
    // outra pessoa por qualquer caminho de código.
    if (!session?.user?.id || userRating === null || isOtherUserProfile) return;

    const key = `${seasonNumber}-${episodeNumber}`;

    // Trava contra cliques concorrentes no MESMO episódio — clicar de
    // novo antes da chamada anterior terminar fazia duas chamadas
    // decidirem "marcar" (ou "desmarcar") a partir do mesmo estado
    // desatualizado, e a segunda podia falhar por violar a chave única
    // da tabela, ou inverter o que a primeira acabara de fazer.
    if (pendingEpisodes.has(key)) return;
    setPendingEpisodes((prev) => new Set(prev).add(key));

    // A decisão de marcar/desmarcar também precisa vir do estado mais
    // recente no momento em que a chamada REALMENTE começa — não do
    // valor capturado quando o componente renderizou.
    const wasWatched = watchedEpisodes.has(key);

    try {
      if (wasWatched) {
        // Unmark episode
        const { error } = await supabase
          .from('watched_episodes')
          .delete()
          .eq('user_id', session.user.id)
          .eq('tmdb_id', movie.id)
          .eq('season_number', seasonNumber)
          .eq('episode_number', episodeNumber);

        if (error) throw error;
      } else {
        // Mark episode
        const { error } = await supabase
          .from('watched_episodes')
          .insert({
            user_id: session.user.id,
            tmdb_id: movie.id,
            season_number: seasonNumber,
            episode_number: episodeNumber
          });

        if (error) throw error;
      }

      // Forma funcional — sempre parte do estado mais recente, mesmo
      // que outras chamadas pra episódios diferentes tenham terminado
      // e atualizado o estado enquanto esta ainda estava em rede. Sem
      // isso, marcar vários episódios rapidamente fazia cada resposta
      // sobrescrever o Set inteiro a partir de uma foto antiga,
      // perdendo as marcações que já tinham "chegado" antes dela.
      setWatchedEpisodes((prev) => {
        const next = new Set(prev);
        if (wasWatched) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });

      // Trigger parent component refresh
      if (onEpisodeToggle) {
        onEpisodeToggle();
      }

      // Dispatch custom event for profile stats refresh
      window.dispatchEvent(new CustomEvent('episodeToggled'));
    } catch (error) {
      console.error('Error toggling episode:', error);
      toast.error('Failed to update episode status');
    } finally {
      setPendingEpisodes((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const toggleSeason = async (season: any) => {
    if (!session?.user?.id || userRating === null || isOtherUserProfile) return;

    const seasonKey = `season-${season.season_number}-all`;
    if (pendingEpisodes.has(seasonKey)) return;
    setPendingEpisodes((prev) => new Set(prev).add(seasonKey));

    const allWatched = season.episodes.every((ep: any) =>
      watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
    );

    try {
      if (allWatched) {
        // Unmark all episodes in season
        const { error } = await supabase
          .from('watched_episodes')
          .delete()
          .eq('user_id', session.user.id)
          .eq('tmdb_id', movie.id)
          .eq('season_number', season.season_number);

        if (error) throw error;

        // Forma funcional — parte sempre do estado mais recente, não
        // de uma foto capturada antes da chamada de rede terminar.
        setWatchedEpisodes((prev) => {
          const next = new Set(prev);
          season.episodes.forEach((ep: any) => {
            next.delete(`${season.season_number}-${ep.episode_number}`);
          });
          return next;
        });
      } else {
        // Mark all episodes in season
        const episodesToInsert = season.episodes.map((ep: any) => ({
          user_id: session.user.id,
          tmdb_id: movie.id,
          season_number: season.season_number,
          episode_number: ep.episode_number
        }));

        const { error } = await supabase
          .from('watched_episodes')
          .upsert(episodesToInsert, {
            onConflict: 'user_id,tmdb_id,season_number,episode_number'
          });

        if (error) throw error;

        setWatchedEpisodes((prev) => {
          const next = new Set(prev);
          season.episodes.forEach((ep: any) => {
            next.add(`${season.season_number}-${ep.episode_number}`);
          });
          return next;
        });
      }

      // Trigger parent component refresh
      if (onEpisodeToggle) {
        onEpisodeToggle();
      }

      // Dispatch custom event for profile stats refresh
      window.dispatchEvent(new CustomEvent('episodeToggled'));
    } catch (error) {
      console.error('Error toggling season:', error);
      toast.error('Failed to update season status');
    } finally {
      setPendingEpisodes((prev) => {
        const next = new Set(prev);
        next.delete(seasonKey);
        return next;
      });
    }
  };

  const handleShareToInstagram = async () => {
    if (!session?.user?.id || isSharing) return;

    setIsSharing(true);

    try {
      // Obter a nota do usuário
      const { data: userMovie, error: ratingError } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('movie_id', movie.id)
        .maybeSingle();

      if (ratingError) throw ratingError;

      const userRating = userMovie?.rating !== undefined ? userMovie.rating : null;

      // Criar canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = 1080;
      canvas.height = 1920;

      // Carregar fundo baseado na nota
      let backgroundPath = '/assets/cinequero.webp';
      if (userRating !== null) {
        backgroundPath = `/assets/cine${Math.round(userRating)}.webp`;
      }

      const background = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = backgroundPath;
      });

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Carregar e desenhar poster do filme (CENTRALIZADO)
      if (movie.poster_path) {
        try {
          const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
          const response = await fetch(posterUrl, { cache: 'no-store' });
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          const posterImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = blobUrl;
          });

          // Poster CENTRALIZADO e maior
          const posterWidth = 450;
          const posterHeight = 675;
          const posterX = (canvas.width - posterWidth) / 2;
          const posterY = 550;

          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);

          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;

          URL.revokeObjectURL(blobUrl);
        } catch (error) {
          console.error('Erro ao carregar poster:', error);
        }
      }

      // Desenhar título do filme (ABAIXO DO POSTER, centralizado)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 52px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const titleY = 1280;
      const maxWidth = 900;

      // Quebrar título em linhas
      const words = movie.title.split(' ');
      let line = '';
      let currentY = titleY;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), canvas.width / 2, currentY);
          line = words[i] + ' ';
          currentY += 65;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), canvas.width / 2, currentY);

      // Converter canvas para blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Erro ao gerar imagem');
          setIsSharing(false);
          return;
        }

        // Criar arquivo
        const file = new File([blob], 'cine-oracle-story.png', { type: 'image/png' });

        // Verificar se pode compartilhar
        if (navigator.share && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `${movie.title} - Cine Oracle`,
              text: `Assisti ${movie.title} e dei nota ${userRating}/10! 🎬`
            });
            toast.success('Compartilhado com sucesso!');
          } catch (error) {
            if ((error as Error).name !== 'AbortError') {
              console.error('Erro ao compartilhar:', error);
              // Fallback: baixar imagem
              downloadImage(canvas);
            }
          } finally {
            setIsSharing(false);
          }
        } else {
          // Fallback: baixar imagem
          downloadImage(canvas);
          setIsSharing(false);
        }
      }, 'image/png');

    } catch (error) {
      console.error('Error sharing to Instagram:', error);
      toast.error('Erro ao compartilhar. Tente novamente.');
      setIsSharing(false);
    }
  };

  const downloadImage = (canvas: HTMLCanvasElement) => {
    const link = document.createElement('a');
    link.download = 'cine-oracle-story.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Imagem baixada! Compartilhe no Instagram Stories.');
  };

  const handleOpenTrailer = async () => {
    setShowTrailerModal(true);
    setLoadingTrailer(true);
    setTrailerKey(undefined);
    try {
      const trailer = await getMovieTrailer(movie.id, movie.media_type || 'movie');
      setTrailerKey(trailer?.key || null);
    } catch (error) {
      console.error('Error fetching trailer:', error);
      setTrailerKey(null);
    } finally {
      setLoadingTrailer(false);
    }
  };

  const handleAddToLibrary = async (rating?: number) => {
    if (!session?.user?.id) return;

    const mediaType = movie.media_type || 'movie';
    const isTv = mediaType === 'tv';
    const director = movie.credits?.crew?.find(
      p => p.job === 'Director' || (isTv && p.job === 'Creator')
    )?.name;

    const { error: movieError } = await supabase
      .from('movies')
      .upsert({
        id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        genres: movie.genres?.map(g => g.name),
        director: director || null,
        media_type: mediaType,
        number_of_seasons: isTv ? (movie.number_of_seasons || null) : null
      }, { onConflict: 'id,media_type' });

    if (movieError) throw movieError;

    const insertData: Record<string, unknown> = {
      movie_id: movie.id,
      media_type: mediaType,
      user_id: session.user.id,
    };
    if (rating !== undefined) insertData.rating = rating;

    const { error: libraryError } = await supabase
      .from('user_movies')
      .insert(insertData);

    if (libraryError) throw libraryError;

    setIsInLibrary(true);
    setUserRating(rating !== undefined ? rating : null);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(session.user.id));
    cache.invalidatePattern('stats:');
    toast.success(t('library.inLibrary'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  };

  const handleRemoveFromLibrary = async () => {
    if (!session?.user?.id) return;

    const mediaType = movie.media_type || 'movie';

    const { error } = await supabase
      .from('user_movies')
      .delete()
      .eq('movie_id', movie.id)
      .eq('media_type', mediaType)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error removing from library:', error);
      toast.error(t('common.error'));
      return;
    }

    setIsInLibrary(false);
    setUserRating(null);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(session.user.id));
    cache.invalidatePattern('stats:');
    toast.success(t('library.movieRemovedSuccess'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  };

  if (!isOpen) return null;

  const isTvShow = movie.media_type === 'tv';
  // Nota 0 ("Crime Cinematográfico") também é nota — por isso a checagem
  // é por null, não por "falsy" como antes.
  const hasRated = userRating !== null && userRating !== undefined;
  const providers = movie.watchProviders?.flatrate || [];
  const hasStreamingProviders = providers.length > 0;

  // Séries: Creator ou Director; filmes: Director (Executive Producer como
  // último recurso, como sempre foi).
  let director = t('movies.unknown');
  if (movie.credits?.crew) {
    const directorPerson = movie.credits.crew.find(person =>
      person.job === 'Director' || person.job === 'Creator' || person.job === 'Executive Producer'
    );
    if (directorPerson) {
      director = directorPerson.name;
    }
  }

  const cast = movie.credits?.cast?.slice(0, 6) || [];
  const releaseSource = movie.release_date || movie.first_air_date || '';
  // Ano lido direto do texto "AAAA-MM-DD": new Date() interpretaria como
  // meia-noite UTC e, no Brasil, um filme de 1º de janeiro viraria do ano
  // anterior.
  const releaseYearNumber = parseInt(releaseSource.slice(0, 4), 10);
  const year = Number.isNaN(releaseYearNumber) ? null : releaseYearNumber;

  // Obra ainda não lançada, com data de estreia conhecida — usada pra
  // preencher "Assistir em" com a data em vez da mensagem genérica de "não
  // disponível", já que nesse caso a ausência de streaming não é falta de
  // informação, é só que ainda não chegou lá.
  const releaseDateObj = movie.release_date
    ? new Date(movie.release_date.length === 10 ? `${movie.release_date}T12:00:00` : movie.release_date)
    : null;
  const isUpcomingRelease = !!releaseDateObj && !isNaN(releaseDateObj.getTime()) && releaseDateObj.getTime() > Date.now();
  const formattedReleaseDate = releaseDateObj?.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  // Top 10 do diretor — busca sob demanda, só quando o usuário clica.
  //
  // BUG ENCONTRADO na versão anterior: quando o filme vinha do cache do
  // banco (getCachedMovie em lib/tmdb.ts), o crew do diretor era
  // reconstruído com um ID FALSO fixo (id: 0), só pra preencher o formato
  // esperado — nunca foi o ID real da pessoa no TMDB. A busca por
  // "/person/0/movie_credits" retornava lixo ou vazio dependendo de qual
  // filme aleatório tem ID 0 no TMDB, explicando todos os sintomas
  // relatados: lista vazia mesmo pra diretores com filmes no banco,
  // comportamento diferente dependendo de onde o filme foi aberto (cache
  // do banco vs busca ao vivo do TMDB, que tem ID real), e a impressão de
  // só "puxar o filme atual" quando a resposta vinha inesperada.
  //
  // Correção: NUNCA confiar em um director id vindo do objeto `movie` já
  // carregado sem validar — só usa o id embutido se for maior que 0
  // (sinal de que veio de busca ao vivo real, não do placeholder do
  // cache), senão resolve por nome via /search/person, confiável
  // independente de como o filme chegou até aqui.
  const handleOpenDirectorTopTen = async () => {
    // Retrátil: se já está aberto, o clique fecha, sem mexer nos dados já
    // carregados (reabrir depois mostra a lista de novo sem nova busca).
    if (showDirectorTopTen) {
      setShowDirectorTopTen(false);
      return;
    }

    setShowDirectorTopTen(true);

    // Já tem resultado de uma busca anterior nesse mesmo filme aberto —
    // não busca de novo à toa.
    if (directorTopTenMovies.length > 0 || directorTopTenError) return;

    setDirectorTopTenError(null);

    if (!director || director === t('movies.unknown')) {
      setDirectorTopTenError(t('movies.noDirectorMoviesFound'));
      return;
    }

    setDirectorTopTenLoading(true);
    const tmdbLang = i18n.language.startsWith('pt') ? 'pt-BR' : 'en-US';
    const authHeader = { Authorization: `Bearer ${session?.access_token || ''}` };

    try {
      const embeddedDirector = movie.credits?.crew?.find(
        (person) => person.job === 'Director' && person.id > 0
      );

      let directorPersonId: number | null = embeddedDirector?.id ?? null;

      if (!directorPersonId) {
        const searchUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=${encodeURIComponent(`/search/person?query=${encodeURIComponent(director)}&language=${tmdbLang}`)}`;
        const searchResponse = await fetch(searchUrl, { headers: authHeader });
        if (!searchResponse.ok) throw new Error('search failed');
        const searchJson = await searchResponse.json();
        const bestMatch = searchJson.results?.[0];
        if (!bestMatch?.id) {
          setDirectorTopTenError(t('movies.noDirectorMoviesFound'));
          setDirectorTopTenLoading(false);
          return;
        }
        directorPersonId = bestMatch.id;
      }

      const creditsUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=${encodeURIComponent(`/person/${directorPersonId}/movie_credits?language=${tmdbLang}`)}`;
      const creditsResponse = await fetch(creditsUrl, { headers: authHeader });
      if (!creditsResponse.ok) throw new Error('credits fetch failed');
      const creditsJson = await creditsResponse.json();

      const directedCredits = (creditsJson.crew || []).filter((c: any) => c.job === 'Director');

      const seen = new Set<number>();
      const deduped = directedCredits.filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      const filtered = deduped
        .filter((m: any) => (m.vote_count || 0) >= 50 && m.id !== movie.id)
        .sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0))
        .slice(0, 10);

      if (filtered.length === 0) {
        setDirectorTopTenError(t('movies.noDirectorMoviesFound'));
      }
      setDirectorTopTenMovies(filtered);
    } catch (err) {
      console.error('Error fetching director top ten:', err);
      setDirectorTopTenError(t('common.error'));
    } finally {
      setDirectorTopTenLoading(false);
    }
  };

  const handleOpenDirectorMovie = async (movieId: number) => {
    setLoadingNestedMovieId(movieId);
    try {
      const details = await getMovieDetailsFromDB(movieId);
      if (isNested && onReplaceMovie) {
        // Já estamos numa camada aninhada — pede pro pai trocar o filme
        // exibido aqui, em vez de abrir mais uma camada por baixo.
        onReplaceMovie(details);
      } else {
        setDirectorNestedMovie(details);
      }
    } catch (err) {
      console.error('Error loading director movie:', err);
      toast.error(t('common.error'));
    } finally {
      setLoadingNestedMovieId(null);
    }
  };

  const runtime = movie.runtime
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
    : null;
  const seasonCount = movie.number_of_seasons || 0;
  const backdropPath = (movie as Movie & { backdrop_path?: string | null }).backdrop_path || null;
  const posterSrc = movie.poster_path && !posterFailed ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null;
  const longSynopsis = (movie.overview?.length || 0) > 320;
  const today = new Date().toISOString().slice(0, 10);
  const stillAiring = movie.in_production === true || movie.status === 'Returning Series';

  // País de origem — aceita o formato do cache (origin_country: ["US"]) e o
  // da API (production_countries: [{ iso_3166_1, name }]).
  const originCountry = (() => {
    if (movie.origin_country && movie.origin_country.length > 0) {
      return { iso_3166_1: movie.origin_country[0], name: '' };
    }
    if (movie.production_countries && movie.production_countries.length > 0) {
      return movie.production_countries[0];
    }
    return null;
  })();
  const originName = (() => {
    if (!originCountry) return '';
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' }).of(originCountry.iso_3166_1) || originCountry.name || originCountry.iso_3166_1;
    } catch {
      return originCountry.name || originCountry.iso_3166_1;
    }
  })();

  const formatScore = (value: number) =>
    value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Ficha rápida embaixo do título: ano · duração (ou temporadas) · selo
  // de classificação · bandeira. Cada item só entra se existir.
  const metaItems: React.ReactNode[] = [];
  if (year) {
    metaItems.push(
      <span key="year"><span className="sr-only">{t('movies.year')}: </span>{year}</span>
    );
  }
  if (isTvShow ? seasonCount > 0 : !!runtime) {
    metaItems.push(
      <span key="length">
        <span className="sr-only">{isTvShow ? t('movies.seasons') : t('movies.runtime')}: </span>
        {isTvShow ? t('movieModal.seasonCount', { count: seasonCount }) : runtime}
      </span>
    );
  }
  if (certification) {
    metaItems.push(
      <span
        key="cert"
        title={t('movies.ageLabel')}
        className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-bold leading-none ${certificationClasses(certification)}`}
      >
        <span className="sr-only">{t('movies.ageLabel')}: </span>
        {certification}
      </span>
    );
  }
  if (originCountry) {
    metaItems.push(
      <span key="origin" title={originName} className="text-base leading-none">
        <span className="sr-only">{t('movies.origin')}: {originName} </span>
        <span aria-hidden>{countryFlag(originCountry.iso_3166_1)}</span>
      </span>
    );
  }

  const ghostPill = `inline-flex items-center gap-2 h-11 px-4 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`;
  const sectionClass = 'pt-6 mt-6 border-t border-white/[0.07]';
  const sectionTitle = (text: string) => (
    <h3 style={{ ...PIXEL, color: PAPER }} className="text-xl leading-none">{text}</h3>
  );

  // Onde assistir — aparece embaixo do pôster no desktop e depois da
  // sinopse no celular. Sempre presente (com a data de estreia ou "não
  // disponível"), pra estrutura da ficha ser a mesma em qualquer filme.
  const whereToWatch = (
    <>
      {sectionTitle(t('movies.watchOn'))}
      <div className="mt-3">
        {hasStreamingProviders ? (
          <ul className="flex flex-wrap gap-2.5">
            {providers.map((provider) => (
              <li key={provider.provider_id}>
                <img
                  src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                  alt={provider.provider_name}
                  title={provider.provider_name}
                  loading="lazy"
                  decoding="async"
                  className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/10"
                />
              </li>
            ))}
          </ul>
        ) : isUpcomingRelease ? (
          <p className="text-sm" style={{ color: PAPER }}>
            {t('movies.upcomingRelease', { date: formattedReleaseDate, defaultValue: `Estreia em ${formattedReleaseDate}` })}
          </p>
        ) : (
          <p className="text-sm" style={{ color: MIST }}>{t('movies.noStreamingAvailable')}</p>
        )}
      </div>
    </>
  );

  // Nota em destaque ao lado da nota pública: a sua (se já avaliou), a
  // prevista pelo oráculo (se o filme está em alguma pool), ou "na sua
  // watchlist". Enquanto carrega, um esqueleto do mesmo tamanho segura o
  // lugar pra nada pular.
  const personalChip = (() => {
    if (!session?.user) return null;
    if (!userRatingLoaded || (!hasRated && predictionLoading)) {
      return <span className="h-8 w-44 rounded-full animate-pulse" style={{ background: VELVET }} aria-hidden />;
    }
    if (hasRated) {
      return (
        <span className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full text-sm font-semibold" style={{ background: PAPER, color: INK }}>
          <Star className="w-3.5 h-3.5 fill-current" aria-hidden />
          {t('home.desk.yourRating')}
          <span style={PIXEL} className="text-base leading-none">{userRating}</span>
        </span>
      );
    }
    if (predictedRating !== null) {
      return (
        <span className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-3 rounded-full text-sm bg-violet-600/90 text-white ring-1 ring-white/20">
          <Wand2 className="w-3.5 h-3.5" aria-hidden />
          {t('home.desk.predictedForYou')}
          <span style={PIXEL} className="text-base leading-none">{predictedRating}</span>
        </span>
      );
    }
    if (isInLibrary) {
      return (
        <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm border border-sky-400/40 bg-sky-500/10 text-sky-200">
          <Eye className="w-3.5 h-3.5" aria-hidden />
          {t('home.desk.inWatchlist')}
        </span>
      );
    }
    return null;
  })();

  const friendAriaLabel = (friend: FriendRating) => {
    if (friend.is_watchlist_only) return `${friend.username}: ${t('movies.wantingToWatch')}`;
    if (friend.rating !== null) return t('movieModal.friendRated', { name: friend.username, rating: friend.rating });
    return friend.username;
  };

  const handleFriendClick = (friend: FriendRating) => {
    // Com resenha: abre as resenhas do filme (a dele já aparece lá).
    // Só watchlist: vai direto pro perfil. Só nota: o primeiro toque mostra
    // o balão com nome e nota; o segundo, na mesma bolha, abre o perfil.
    if (friend.review_title) {
      setShowReviewsModal(true);
    } else if (friend.is_watchlist_only) {
      navigate(`/profile/${friend.username}`);
    } else if (activeFriendBubble === friend.user_id) {
      navigate(`/profile/${friend.username}`);
    } else {
      setActiveFriendBubble(friend.user_id);
    }
  };

  // Renderizado via Portal, direto no <body> — não como filho de onde o
  // componente foi chamado. Sem isso, quando o modal é aberto de dentro de
  // uma página cujo container raiz é um motion.div (Framer Motion aplica
  // transform via style inline), o modal ficava preso no contexto de
  // empilhamento desse container e a navbar passava por cima dele.
  return createPortal(
    <div className={`fixed inset-0 ${zIndexClass}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto relative w-full sm:max-w-4xl max-h-[94dvh] sm:max-h-[calc(100dvh-5rem)] flex flex-col rounded-t-2xl sm:rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden"
          style={{ background: NIGHT }}
        >
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className={`absolute top-3 right-3 z-30 grid place-items-center w-11 h-11 rounded-full ring-1 ring-white/15 backdrop-blur-md hover:bg-white/10 transition ${FOCUS_RING}`}
            style={{ background: 'rgba(18,13,34,0.6)', color: PAPER }}
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {/* ---------- Topo: fundo do filme + pôster + título ---------- */}
            <div className="relative">
              <div className="absolute inset-x-0 top-0 h-64 sm:h-80 overflow-hidden pointer-events-none" aria-hidden>
                {backdropPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w1280${backdropPath}`}
                    alt=""
                    decoding="async"
                    className="w-full h-full object-cover opacity-45"
                  />
                ) : (
                  <div className="w-full h-full" style={{ background: 'radial-gradient(ellipse 80% 70% at 70% 0%, rgba(139,92,246,0.28), transparent 70%)' }} />
                )}
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(to bottom, rgba(18,13,34,0.25) 0%, rgba(18,13,34,0.7) 55%, ${NIGHT} 100%)` }}
                />
              </div>

              <div className="relative px-5 sm:px-8 pt-14 sm:pt-12 pb-8 md:grid md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)] md:gap-8">
                {/* Coluna do pôster */}
                <div>
                  <div className="relative mx-auto md:mx-0 w-[min(66vw,260px)] md:w-full">
                    <button
                      type="button"
                      onClick={handleOpenTrailer}
                      aria-label={t('movieModal.playTrailer')}
                      className={`group/poster relative block w-full aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/15 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] ${FOCUS_RING}`}
                      style={{ background: VELVET }}
                    >
                      {posterSrc ? (
                        <img
                          src={posterSrc}
                          alt=""
                          decoding="async"
                          className="absolute inset-0 w-full h-full object-cover"
                          onError={() => setPosterFailed(true)}
                        />
                      ) : (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ color: MIST }}>
                          <Film className="w-10 h-10" aria-hidden />
                          <span style={{ ...PIXEL, color: PAPER }} className="text-lg leading-tight">{movie.title}</span>
                        </span>
                      )}
                      {/* Convite discreto pro trailer — frase só no hover (desktop) */}
                      <span className="absolute top-2.5 right-2.5 flex items-center gap-2 pointer-events-none">
                        <span className="hidden sm:inline text-[11px] font-medium text-white bg-black/55 backdrop-blur-sm px-2 py-1 rounded-full opacity-0 group-hover/poster:opacity-100 transition-opacity whitespace-nowrap">
                          {t('movies.clickForTrailer')}
                        </span>
                        <span className="grid place-items-center w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm ring-1 ring-white/20 opacity-80 group-hover/poster:opacity-100 group-hover/poster:scale-105 transition">
                          <Play className="w-4 h-4 fill-white text-white ml-0.5" aria-hidden />
                        </span>
                      </span>
                    </button>

                    {/* Selos dos oráculos cuja pool tem esse filme — cada um com
                        a sua frase, num balão que aparece sozinho 2s depois de
                        abrir, some depois de 6s, e alterna a qualquer toque. */}
                    {oracleSources.length > 0 && (
                      <div className="absolute bottom-0.5 left-0.5 z-20 flex items-end">
                        {oracleSources.map((source) => {
                          const oracle = ORACLE_BY_ID[source as OracleId];
                          const phrase = oracleFlavorPhrases[source];
                          const showBubble = !!phrase && visibleOracleBubbles.has(source);
                          return (
                            <div key={source} className="relative">
                              <button
                                type="button"
                                onClick={(e) => toggleOracleBubble(source, e)}
                                aria-label={t('movieModal.oracleSays', { name: oracle?.name || source })}
                                aria-expanded={showBubble}
                                className={`grid place-items-center w-11 h-11 rounded-full ${FOCUS_RING}`}
                              >
                                {oracle ? (
                                  <img
                                    src={oracle.avatar}
                                    alt=""
                                    width={28}
                                    height={28}
                                    className="w-7 h-7 rounded-full object-cover"
                                    style={{ boxShadow: `0 0 0 2px ${oracle.color}, 0 6px 14px -4px rgba(0,0,0,0.85)` }}
                                  />
                                ) : (
                                  <span className="grid place-items-center w-7 h-7 rounded-full" style={{ background: BUBBLE_BG, color: MIST }}>
                                    <Film className="w-3.5 h-3.5" aria-hidden />
                                  </span>
                                )}
                              </button>
                              <AnimatePresence>
                                {showBubble && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 6 }}
                                    transition={{ duration: 0.2 }}
                                    className="absolute bottom-full left-1 mb-1 w-52 z-30 cursor-pointer"
                                    onClick={(e) => toggleOracleBubble(source, e)}
                                  >
                                    <div
                                      className="relative rounded-xl px-3 py-2 shadow-2xl"
                                      style={{ background: PAPER, color: INK, borderLeft: `4px solid ${oracle?.color || MIST}` }}
                                    >
                                      {oracle && <p style={PIXEL} className="text-[13px] leading-none mb-1">{oracle.name}</p>}
                                      <p className="text-[11px] italic leading-snug">“{phrase}”</p>
                                      <span
                                        aria-hidden
                                        className="absolute top-full left-4 w-0 h-0 border-x-[6px] border-x-transparent border-t-[7px]"
                                        style={{ borderTopColor: PAPER }}
                                      />
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bolhas de quem viu: amigos primeiro, depois resenhas de
                        outras pessoas, depois amigos de amigos (até 5). */}
                    {!loadingFriends && friendRatings.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none" role="group" aria-label={t('movieModal.friendsHere')}>
                        {friendRatings.map((friend, index) => {
                          const tone = friend.is_watchlist_only
                            ? ratingTone(null)
                            : friend.rating === null
                              ? { color: MIST, ring: 'rgba(189,180,214,0.35)' }
                              : ratingTone(friend.rating);
                          const position = FRIEND_POSITIONS[index] || FRIEND_POSITIONS[0];
                          const isActive = activeFriendBubble === friend.user_id;
                          return (
                            <div
                              key={friend.user_id}
                              className="absolute animate-float-slow pointer-events-auto"
                              style={{ ...position, animationDelay: `${index * 0.3}s`, zIndex: isActive ? 25 : 10 }}
                            >
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleFriendClick(friend); }}
                                aria-label={friendAriaLabel(friend)}
                                className={`group relative block w-12 h-12 sm:w-14 sm:h-14 rounded-full ${FOCUS_RING}`}
                                style={{ minWidth: 0, minHeight: 0, padding: 0 }}
                              >
                                <span
                                  className="absolute inset-0 rounded-full overflow-hidden"
                                  style={{ background: VELVET, boxShadow: `0 0 0 2.5px ${tone.color}, 0 12px 24px -8px rgba(0,0,0,0.85)` }}
                                >
                                  {friend.avatar_url ? (
                                    <img src={friend.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                  ) : (
                                    <span className="w-full h-full grid place-items-center text-lg font-semibold" style={{ color: PAPER }}>
                                      {friend.username.charAt(0).toUpperCase()}
                                    </span>
                                  )}
                                </span>

                                {/* Selo: a nota, ou um olho quando é só watchlist */}
                                <span
                                  className="absolute -bottom-1.5 -right-1.5 grid place-items-center w-7 h-7 rounded-full text-[13px] leading-none"
                                  style={{
                                    ...PIXEL,
                                    background: NIGHT,
                                    color: tone.color,
                                    boxShadow: `0 0 0 2px ${tone.color}${friend.rating === 10 ? ', 0 0 16px rgba(249,168,212,0.85)' : ''}`,
                                  }}
                                >
                                  {friend.is_watchlist_only ? <Eye className="w-3.5 h-3.5" aria-hidden /> : (friend.rating ?? '–')}
                                </span>

                                {friend.review_title ? (
                                  // Com resenha: balão sempre visível com o título dela.
                                  <span
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 block w-[118px] px-2.5 py-1.5 rounded-xl text-center shadow-2xl ring-1 ring-white/15"
                                    style={{ background: BUBBLE_BG }}
                                  >
                                    <span className="block text-[10px] font-semibold truncate" style={{ color: PAPER }}>{friend.username}</span>
                                    <span className="text-[10px] italic leading-tight line-clamp-2 mt-0.5" style={{ color: MIST }}>“{friend.review_title}”</span>
                                    <span aria-hidden className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]" style={{ borderTopColor: BUBBLE_BG }} />
                                  </span>
                                ) : friend.is_watchlist_only ? (
                                  // Só watchlist: balão sempre visível, "querendo assistir".
                                  <span
                                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 block px-2.5 py-1.5 rounded-xl text-center whitespace-nowrap shadow-2xl ring-1 ring-white/15"
                                    style={{ background: BUBBLE_BG }}
                                  >
                                    <span className="block text-[10px] font-semibold" style={{ color: PAPER }}>{friend.username}</span>
                                    <span className="block text-[10px] italic leading-tight mt-0.5 text-sky-300">
                                      {t('movies.wantingToWatch', { defaultValue: 'Querendo Assistir...' })}
                                    </span>
                                    <span aria-hidden className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]" style={{ borderTopColor: BUBBLE_BG }} />
                                  </span>
                                ) : (
                                  // Só nota: balão aparece no primeiro toque (ou no hover).
                                  <span
                                    className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 block px-3 py-1.5 rounded-xl text-left whitespace-nowrap shadow-2xl ring-1 ring-white/15 transition-opacity duration-200 ${
                                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                                    }`}
                                    style={{ background: BUBBLE_BG }}
                                  >
                                    <span className="block text-xs font-semibold" style={{ color: PAPER }}>{friend.username}</span>
                                    <span className="flex items-center gap-1 text-xs" style={{ color: tone.color }}>
                                      <Star className="w-3 h-3 fill-current" aria-hidden />
                                      {friend.rating}/10
                                    </span>
                                    <span aria-hidden className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-[5px] border-x-transparent border-t-[6px]" style={{ borderTopColor: BUBBLE_BG }} />
                                  </span>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="hidden md:block mt-8">{whereToWatch}</div>
                </div>

                {/* Coluna das informações */}
                <div className="mt-6 md:mt-0 min-w-0">
                  <div className="text-center md:text-left md:pr-12">
                    <h2 id={titleId} style={{ ...PIXEL, color: PAPER }} className="text-[1.9rem] sm:text-4xl leading-[1.05] [text-wrap:balance]">
                      {movie.title}
                    </h2>
                    {metaItems.length > 0 && (
                      <p className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-x-2.5 gap-y-1.5 text-sm" style={{ color: MIST }}>
                        {metaItems.map((item, i) => (
                          <React.Fragment key={i}>
                            {i > 0 && <span aria-hidden className="w-1 h-1 rounded-full bg-white/25" />}
                            {item}
                          </React.Fragment>
                        ))}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-center md:justify-start gap-2">
                    {movie.vote_average > 0 && (
                      <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-sm ring-1 ring-white/10" style={{ background: VELVET, color: PAPER }}>
                        <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                        {t('home.desk.publicScore', { score: formatScore(movie.vote_average) })}
                      </span>
                    )}
                    {personalChip}
                  </div>

                  {((movie.genres && movie.genres.length > 0) || (movieMoodKey && MOOD_TAG_CONFIG[movieMoodKey])) && (
                    <div className="mt-4 flex flex-wrap justify-center md:justify-start gap-2">
                      {movie.genres?.map((genre) => (
                        <span key={genre.id ?? genre.name} className="px-3 py-1 rounded-full text-[13px] border border-white/15" style={{ color: MIST }}>
                          {genre.name}
                        </span>
                      ))}
                      {movieMoodKey && MOOD_TAG_CONFIG[movieMoodKey] && (
                        <span className={`px-3 py-1 rounded-full text-[13px] font-medium border ${MOOD_TAG_CONFIG[movieMoodKey].pillClasses}`}>
                          {t(MOOD_TAG_CONFIG[movieMoodKey].labelKey)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap justify-center md:justify-start gap-2">
                    <button onClick={handleOpenTrailer} className={ghostPill} style={{ color: PAPER }}>
                      <Play className="w-4 h-4 fill-fuchsia-300 text-fuchsia-300" aria-hidden />
                      {t('movieModal.trailer')}
                    </button>
                    {session?.user && (
                      <>
                        <button onClick={() => setShowRecommendModal(true)} className={ghostPill} style={{ color: PAPER }}>
                          <Send className="w-4 h-4 text-orange-300" aria-hidden />
                          {t('indications.indicate')}
                        </button>
                        <button
                          onClick={handleShareToInstagram}
                          disabled={isSharing}
                          aria-label={t('movieModal.shareStoryHint')}
                          title={t('movieModal.shareStoryHint')}
                          className={ghostPill}
                          style={{ color: PAPER }}
                        >
                          {isSharing ? (
                            <Loader2 className="w-4 h-4 animate-spin text-pink-300" aria-hidden />
                          ) : (
                            <Instagram className="w-4 h-4 text-pink-300" aria-hidden />
                          )}
                          {t('movieModal.shareStory')}
                        </button>
                      </>
                    )}
                  </div>

                  {isTvShow && (
                    <button
                      onClick={handleOpenSeasons}
                      className={`mt-5 w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl ring-1 ring-white/10 hover:ring-white/25 text-left transition ${FOCUS_RING}`}
                      style={{ background: VELVET }}
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <span className="grid place-items-center w-10 h-10 shrink-0 rounded-lg bg-violet-500/15 text-violet-300">
                          <Tv className="w-5 h-5" aria-hidden />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold" style={{ color: PAPER }}>{t('movies.seasonsAndEpisodes')}</span>
                          <span className="block text-sm truncate" style={{ color: MIST }}>
                            {[
                              seasonCount > 0 ? t('movieModal.seasonCount', { count: seasonCount }) : null,
                              hasRated && watchedEpisodes.size > 0 ? t('movieModal.episodesWatched', { count: watchedEpisodes.size }) : null,
                            ].filter(Boolean).join(' · ') || t('movieModal.seeSeasons')}
                          </span>
                        </span>
                      </span>
                      <ChevronRight className="w-5 h-5 shrink-0" style={{ color: MIST }} aria-hidden />
                    </button>
                  )}

                  {/* ---------- Corpo ---------- */}
                  <div className="text-left">
                    <section className={sectionClass}>
                      {sectionTitle(t('movies.synopsis'))}
                      <p
                        className={`mt-3 text-[15px] leading-relaxed ${longSynopsis && !synopsisExpanded ? 'line-clamp-5' : ''}`}
                        style={{ color: 'rgba(243,234,211,0.86)' }}
                      >
                        {movie.overview || t('movies.noSynopsis')}
                      </p>
                      {longSynopsis && (
                        <button
                          onClick={() => setSynopsisExpanded((v) => !v)}
                          aria-expanded={synopsisExpanded}
                          className={`mt-1 -ml-2 px-2 rounded-lg text-sm font-medium text-violet-300 hover:text-violet-200 justify-start ${FOCUS_RING}`}
                        >
                          {synopsisExpanded ? t('movieModal.readLess') : t('movieModal.readMore')}
                        </button>
                      )}
                    </section>

                    <section className={`md:hidden ${sectionClass}`}>{whereToWatch}</section>

                    <section className={sectionClass}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm" style={{ color: MIST }}>{t('movies.director')}</p>
                          <p className="mt-0.5 text-lg font-semibold truncate" style={{ color: PAPER }}>{director}</p>
                        </div>
                        {director !== t('movies.unknown') && (
                          <button
                            onClick={handleOpenDirectorTopTen}
                            aria-expanded={showDirectorTopTen}
                            className={`shrink-0 ${ghostPill}`}
                            style={{ color: PAPER }}
                          >
                            {t('movies.viewTopTen')}
                            <ChevronDown className={`w-4 h-4 transition-transform ${showDirectorTopTen ? 'rotate-180' : ''}`} aria-hidden />
                          </button>
                        )}
                      </div>

                      {showDirectorTopTen && (
                        <div className="mt-4">
                          <p className="text-sm mb-3" style={{ color: MIST }}>{t('movies.directorTopTen', { director })}</p>

                          {directorTopTenLoading && (
                            <div className="grid grid-cols-5 gap-2" aria-busy="true">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="aspect-[2/3] rounded-lg animate-pulse" style={{ background: VELVET }} />
                              ))}
                            </div>
                          )}

                          {!directorTopTenLoading && directorTopTenError && (
                            <p className="flex items-center gap-2 text-sm" style={{ color: MIST }}>
                              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                              {directorTopTenError}
                            </p>
                          )}

                          {!directorTopTenLoading && !directorTopTenError && directorTopTenMovies.length > 0 && (
                            <ol className="grid grid-cols-5 gap-2">
                              {directorTopTenMovies.map((m: any) => (
                                <li key={m.id}>
                                  {/* Só o pôster, proporção 2:3 fixa — título no
                                      hover/leitor de tela, pra células nunca
                                      esticarem umas às outras. */}
                                  <button
                                    onClick={() => handleOpenDirectorMovie(m.id)}
                                    aria-label={m.release_date ? `${m.title} (${m.release_date.slice(0, 4)})` : m.title}
                                    title={m.title}
                                    className={`group relative block w-full aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 hover:ring-white/35 transition ${FOCUS_RING}`}
                                    style={{ background: VELVET, minWidth: 0 }}
                                  >
                                    {m.poster_path ? (
                                      <img
                                        src={`https://image.tmdb.org/t/p/w185${m.poster_path}`}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                    ) : (
                                      <span className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                                        <Film className="w-5 h-5" aria-hidden />
                                      </span>
                                    )}
                                    {loadingNestedMovieId === m.id && (
                                      <span className="absolute inset-0 bg-black/55 grid place-items-center">
                                        <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                                      </span>
                                    )}
                                    {m.vote_average > 0 && (
                                      <span
                                        className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] leading-none"
                                        style={{ background: 'rgba(18,13,34,0.86)', color: PAPER }}
                                      >
                                        <Star className="w-2.5 h-2.5 fill-amber-300 text-amber-300" aria-hidden />
                                        {formatScore(m.vote_average)}
                                      </span>
                                    )}
                                  </button>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                      )}
                    </section>

                    <section className={sectionClass}>
                      {sectionTitle(t('movies.cast'))}
                      {cast.length > 0 ? (
                        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                          {cast.map((actor) => {
                            const photo = failedCastPhotos.has(actor.id) ? null : castPhotos[actor.id] ?? actor.profile_path ?? null;
                            return (
                            <li key={actor.id} className="flex items-center gap-3 min-w-0">
                              <span
                                aria-hidden
                                className="relative grid place-items-center w-11 h-11 shrink-0 rounded-full overflow-hidden ring-1 ring-white/10 text-sm font-semibold"
                                style={{ background: VELVET, color: MIST }}
                              >
                                {actor.name.charAt(0)}
                                {photo && (
                                  <img
                                    src={`${PROFILE_IMAGE_BASE}${photo}`}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                    className="absolute inset-0 w-full h-full object-cover"
                                    onError={() => setFailedCastPhotos((prev) => new Set(prev).add(actor.id))}
                                  />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block font-medium truncate" style={{ color: PAPER }}>{actor.name}</span>
                                {actor.character && (
                                  <span className="block text-sm truncate" style={{ color: MIST }}>{actor.character}</span>
                                )}
                              </span>
                            </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-3 text-sm" style={{ color: MIST }}>{t('movies.noCastAvailable')}</p>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- Rodapé fixo ---------- */}
          {session?.user && (
            <div
              className="shrink-0 flex gap-2.5 px-5 sm:px-8 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-white/[0.07]"
              style={{ background: 'rgba(18,13,34,0.97)' }}
            >
              {!isInLibrary ? (
                <button
                  onClick={() => setShowQuickAdd(true)}
                  className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition ${FOCUS_RING}`}
                >
                  <Plus className="w-5 h-5" aria-hidden />
                  {t('library.addToLibrary')}
                </button>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirmation(true)}
                  aria-label={`${t('movies.inLibrary')} — ${t('movieModal.tapToRemove')}`}
                  title={t('movieModal.tapToRemove')}
                  className={`flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-xl border border-emerald-400/30 bg-emerald-400/10 hover:bg-emerald-400/15 text-emerald-200 font-semibold transition ${FOCUS_RING}`}
                >
                  <Check className="w-5 h-5" aria-hidden />
                  {t('movies.inLibrary')}
                </button>
              )}
              <button
                onClick={() => setShowReviewsModal(true)}
                title={t('reviews.title')}
                className={`inline-flex items-center justify-center gap-2 h-12 w-12 sm:w-auto sm:px-5 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 font-medium transition ${FOCUS_RING}`}
                style={{ color: PAPER }}
              >
                <MessageSquare className="w-5 h-5 text-violet-300" aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('reviews.title')}</span>
              </button>
            </div>
          )}
        </motion.div>
      </div>

      <RecommendModal
        isOpen={showRecommendModal}
        onClose={() => setShowRecommendModal(false)}
        movieId={movie.id}
        movieTitle={movie.title}
        moviePoster={movie.poster_path}
        mediaType={movie.media_type}
      />

      <QuickAddMenu
        movieTitle={movie.title}
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAdd={handleAddToLibrary}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleRemoveFromLibrary}
        title={t('common.delete')}
        message={t('library.movieRemoved')}
      />

      {/* ---------- Trailer ---------- */}
      <AnimatePresence>
        {showTrailerModal && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${t('movieModal.trailer')} — ${movie.title}`}>
            <motion.div
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrailerModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-3xl rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl"
              style={{ background: NIGHT }}
            >
              <div className="flex items-center justify-between gap-4 pl-5 pr-2 py-2 border-b border-white/[0.07]">
                <div className="min-w-0">
                  <p style={{ ...PIXEL, color: PAPER }} className="text-lg leading-none">{t('movieModal.trailer')}</p>
                  <p className="mt-1 text-sm truncate" style={{ color: MIST }}>{movie.title}</p>
                </div>
                <button
                  onClick={() => setShowTrailerModal(false)}
                  aria-label={t('common.close')}
                  className={`shrink-0 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
                  style={{ color: MIST }}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="aspect-video bg-black grid place-items-center">
                {loadingTrailer ? (
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: MIST }} aria-hidden />
                ) : trailerKey ? (
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${trailerKey}`}
                    title={`${t('movieModal.trailer')} — ${movie.title}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <Film className="w-8 h-8" style={{ color: MIST }} aria-hidden />
                    <p style={{ color: MIST }}>{t('duel.noTrailer')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------- Temporadas e episódios ---------- */}
      <AnimatePresence>
        {showSeasonsModal && (
          <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby={seasonsTitleId}>
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSeasonsModal(false)}
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
                    <h2 id={seasonsTitleId} style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-[1.7rem] leading-tight">
                      {t('movies.seasonsAndEpisodes')}
                    </h2>
                    <p className="mt-1 text-sm truncate" style={{ color: MIST }}>{movie.title}</p>
                  </div>
                  <button
                    onClick={() => setShowSeasonsModal(false)}
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
                      {!hasRated && !isOtherUserProfile && session?.user && (
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
                          (sum, s) => sum + (s.episodes?.filter((ep: any) => ep.air_date && ep.air_date <= today).length || 0),
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

                      {seasons.map((season: any) => {
                        if (!season.episodes || season.episodes.length === 0) return null;

                        const allWatched = season.episodes.every((ep: any) =>
                          watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
                        );
                        const isSeasonPending = pendingEpisodes.has(`season-${season.season_number}-all`);
                        const isExpanded = expandedSeasons.has(season.season_number);
                        const toggleExpanded = () => {
                          setExpandedSeasons((prev) => {
                            const next = new Set(prev);
                            if (next.has(season.season_number)) next.delete(season.season_number);
                            else next.add(season.season_number);
                            return next;
                          });
                        };

                        // Progresso só dessa temporada, contando episódios já lançados.
                        const airedInSeason = season.episodes.filter((ep: any) => ep.air_date && ep.air_date <= today).length;
                        const watchedInSeason = season.episodes.filter((ep: any) =>
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
                                  onClick={() => toggleSeason(season)}
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
                                    {season.episodes.map((episode: any) => {
                                      const episodeKey = `${season.season_number}-${episode.episode_number}`;
                                      const isWatched = watchedEpisodes.has(episodeKey);
                                      const isPending = pendingEpisodes.has(episodeKey);
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
                                            {(airDate || episode.runtime || episode.vote_average > 0) && (
                                              <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs" style={{ color: MIST }}>
                                                {airDate && <span>{airDate}</span>}
                                                {episode.runtime && <span>{t('movieModal.minutes', { count: episode.runtime })}</span>}
                                                {episode.vote_average > 0 && (
                                                  <span className="inline-flex items-center gap-1">
                                                    <Star className="w-3 h-3 fill-amber-300 text-amber-300" aria-hidden />
                                                    {formatScore(episode.vote_average)}
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
                                              onClick={() => toggleEpisode(season.season_number, episode.episode_number)}
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
        )}
      </AnimatePresence>

      {showReviewsModal && (
        <ReviewsModal
          movie={movie}
          onClose={() => setShowReviewsModal(false)}
          userRating={userRating}
        />
      )}

      {directorNestedMovie && (
        <MovieDetailsModal
          movie={directorNestedMovie}
          isOpen={true}
          onClose={() => setDirectorNestedMovie(null)}
          zIndexClass={zIndexClass}
          isNested={true}
          onReplaceMovie={setDirectorNestedMovie}
        />
      )}
    </div>,
    document.body
  );
};

export default MovieDetailsModal;
