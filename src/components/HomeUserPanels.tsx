import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { BarChart3, MessageCircle, HelpCircle, Wand2, Star, X, Swords, ListVideo, Users, ArrowRight, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useWhispers } from '../contexts/WhispersContext';
import { getMovieDetails, Movie } from '../lib/tmdb';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import OptimizedPoster from './OptimizedPoster';
import ArchetypeSymbol from './ArchetypeSymbol';
import { PERSONAS_MAP } from './CinematicPersonaCard';
import WhispersModal from './WhispersModal';
import MonthlyInsightsModal from './MonthlyInsightsModal';
import { NIGHT, VELVET, PAPER, INK, MIST, PIXEL, ORACLES, ORACLE_BY_ID, OracleId } from '../lib/oracleTheme';

// Topo da home de quem está logado — "a mesa do oráculo".
// Três blocos, sem rotação automática escondendo informação:
//   1. Cabeçalho: saudação, números da conta e os dois atalhos pessoais
//      (Insights do mês e Sussurros).
//   2. "Na mesa hoje": as três cartas do dia, uma por oráculo, lado a lado,
//      com a nota prevista (ou a sua nota, se já avaliou). É o único momento
//      animado da página: as cartas são "distribuídas" na mesa ao abrir.
//   3. "Sua essência": arquétipo, as cinco balanças da Arquitetura da Alma
//      e a persona. Abaixo, os próximos passos (próxima tag com progresso,
//      duelo da watchlist, listas, amigos).

// ---------------------------------------------------------------------------
// Tags — mesmas regras de antes; agora cada candidata carrega o progresso.
// ---------------------------------------------------------------------------

type Tier = { name: string; emoji: string; min: number; hint: string; hintPt: string };

const PROGRESSION_TIERS: Tier[] = [
  { name: 'Balcony Regular', emoji: '🎫', min: 1, hint: '1 movie in library', hintPt: '1 filme na biblioteca' },
  { name: 'Seat Warmer', emoji: '💺', min: 20, hint: '20 movies in library', hintPt: '20 filmes na biblioteca' },
  { name: 'Popcorn Pro', emoji: '🍿', min: 50, hint: '50 movies in library', hintPt: '50 filmes na biblioteca' },
  { name: 'Reel Addict', emoji: '📽', min: 100, hint: '100 movies in library', hintPt: '100 filmes na biblioteca' },
  { name: 'Cine Elite', emoji: '🎞', min: 200, hint: '200 movies in library', hintPt: '200 filmes na biblioteca' },
  { name: 'Projectionist Supreme', emoji: '🎬', min: 500, hint: '500 movies in library', hintPt: '500 filmes na biblioteca' },
  { name: 'Cinematic Guru', emoji: '🎭', min: 1000, hint: '1000 movies in library', hintPt: '1000 filmes na biblioteca' },
];

const ORACLE_PRED_TIERS: Tier[] = [
  { name: 'Curious Seeker', emoji: '🔍', min: 10, hint: '10 Oracle predictions', hintPt: '10 previsões no Oráculo' },
  { name: 'Pattern Hunter', emoji: '🧩', min: 25, hint: '25 Oracle predictions', hintPt: '25 previsões no Oráculo' },
  { name: 'Mind Decoder', emoji: '🧠', min: 50, hint: '50 Oracle predictions', hintPt: '50 previsões no Oráculo' },
  { name: 'Future Whisperer', emoji: '🌘', min: 100, hint: '100 Oracle predictions', hintPt: '100 previsões no Oráculo' },
  { name: "Oracle's Chosen", emoji: '🌑', min: 200, hint: '200 Oracle predictions', hintPt: '200 previsões no Oráculo' },
  { name: 'Fate Architect', emoji: '🜂', min: 500, hint: '500 Oracle predictions', hintPt: '500 previsões no Oráculo' },
  { name: 'Timeline Overlord', emoji: '⛓️', min: 1000, hint: '1000 Oracle predictions', hintPt: '1000 previsões no Oráculo' },
];

const ORACLE_REC_TIERS: Tier[] = [
  { name: 'Popcorn Taster', emoji: '🌽', min: 10, hint: '10 Oracle recommendations', hintPt: '10 recomendações do Oráculo' },
  { name: 'Hidden Gem Hunter', emoji: '🔶', min: 25, hint: '25 Oracle recommendations', hintPt: '25 recomendações do Oráculo' },
  { name: 'Genre Explorer', emoji: '🗺️', min: 50, hint: '50 Oracle recommendations', hintPt: '50 recomendações do Oráculo' },
  { name: 'Taste Alchemist', emoji: '🧪', min: 100, hint: '100 Oracle recommendations', hintPt: '100 recomendações do Oráculo' },
  { name: 'Recommendation Lord', emoji: '⚜️', min: 200, hint: '200 Oracle recommendations', hintPt: '200 recomendações do Oráculo' },
  { name: 'Galaxy Curator', emoji: '🧮', min: 500, hint: '500 Oracle recommendations', hintPt: '500 recomendações do Oráculo' },
  { name: 'Multiverse Sommelier', emoji: '🎎', min: 1000, hint: '1000 Oracle recommendations', hintPt: '1000 recomendações do Oráculo' },
];

const COMMUNITY_TIERS: Tier[] = [
  { name: 'Spotlight Spark', emoji: '✨', min: 1, hint: '1 friend', hintPt: '1 amigo' },
  { name: 'Rising Star', emoji: '🌠', min: 10, hint: '10 friends', hintPt: '10 amigos' },
  { name: 'Red-Carpet Regular', emoji: '👠', min: 25, hint: '25 friends', hintPt: '25 amigos' },
  { name: 'Festival Favorite', emoji: '🏵️', min: 50, hint: '50 friends', hintPt: '50 amigos' },
  { name: 'Blockbuster', emoji: '💥', min: 100, hint: '100 friends', hintPt: '100 amigos' },
  { name: 'Cult Legend', emoji: '🌟', min: 200, hint: '200 friends', hintPt: '200 amigos' },
];

const THEME_TAGS = [
  { name: 'Mockingjay Victor', emoji: '🏹', hint: 'All 5 Hunger Games films', hintPt: 'Todos os 5 Hunger Games', ids: [70160, 101299, 131631, 131634, 695721] },
  { name: 'Lucky Player', emoji: '🎲', hint: 'Jumanji (1995) & Zathura (2005)', hintPt: 'Jumanji (1995) e Zathura (2005)', ids: [8844, 6795] },
  { name: 'Death Dodger', emoji: '☠️', hint: 'All 5 Final Destination films', hintPt: 'Todos os 5 Premonição', ids: [9532, 9358, 9286, 19912, 55779] },
  { name: 'Hogwarts Graduate', emoji: '🧙', hint: 'All 8 Harry Potter films', hintPt: 'Todos os 8 Harry Potter', ids: [671, 672, 673, 674, 675, 767, 12444, 12445] },
  { name: 'Force Founder', emoji: '🌌', hint: 'Star Wars Original Trilogy (IV-V-VI)', hintPt: 'Trilogia Original Star Wars (IV-V-VI)', ids: [11, 1891, 1892] },
  { name: 'Don of Cinema', emoji: '🍷', hint: 'The Godfather Trilogy', hintPt: 'Trilogia O Poderoso Chefão', ids: [238, 240, 242] },
  { name: 'Trap Builder', emoji: '🪤', hint: 'Home Alone 1 & 2', hintPt: 'Esqueceram de Mim 1 & 2', ids: [771, 772] },
  { name: 'Red-Pill Adept', emoji: '💊', hint: 'The Matrix Trilogy', hintPt: 'Trilogia Matrix', ids: [603, 604, 605] },
  { name: 'Flux-Capacitor Fan', emoji: '⚡', hint: 'Back to the Future Trilogy', hintPt: 'Trilogia De Volta Para o Futuro', ids: [105, 165, 196] },
  { name: 'Ring Expert', emoji: '💍', hint: 'The Lord of the Rings Trilogy', hintPt: 'Trilogia O Senhor dos Anéis', ids: [120, 121, 122] },
  { name: 'Toy Collector', emoji: '🦖', hint: 'All 4 Toy Story films', hintPt: 'Todos os 4 Toy Story', ids: [862, 863, 10193, 301528] },
  { name: 'Whip-Crack Scholar', emoji: '🥾', hint: 'Indiana Jones Quadrilogy', hintPt: 'Quadrilogia Indiana Jones', ids: [85, 89, 90, 91] },
  { name: 'Sailor', emoji: '🏴‍☠️', hint: 'All 5 Pirates of the Caribbean films', hintPt: 'Todos os 5 Piratas do Caribe', ids: [22, 58, 285, 1865, 166426] },
  { name: 'Senior Mechanic', emoji: '🔧', hint: 'All 10 main Fast & Furious films', hintPt: 'Todos os 10 principais Velozes e Furiosos', ids: [9799, 584, 9615, 13804, 51497, 82992, 168259, 337339, 385128, 385687] },
  { name: 'Cybertron Sentinel', emoji: '🤖', hint: 'All 7 live-action Transformers', hintPt: 'Todos os 7 Transformers live-action', ids: [424783, 1858, 91314, 667538, 335988, 8373, 38356] },
  { name: 'Swamp Royalty', emoji: '🧅', hint: 'All 4 Shrek films', hintPt: 'Todos os 4 Shrek', ids: [808, 809, 810, 10192] },
  { name: 'Dino Tamer', emoji: '🦴', hint: 'All 6 Jurassic Park/World films', hintPt: 'Todos os 6 Jurassic Park/World', ids: [329, 330, 331, 135397, 351286, 507086] },
  { name: 'Banana Boss', emoji: '🍌', hint: 'All 5 Despicable Me/Minions films', hintPt: 'Todos os 5 Meu Malvado Favorito/Minions', ids: [39538, 93456, 324852, 211672, 438148] },
  { name: 'Baba Yaga', emoji: '🃏', hint: 'John Wick Saga (4 films)', hintPt: 'Saga John Wick (4 filmes)', ids: [245891, 324552, 458156, 603692] },
  { name: 'Casual Drinker', emoji: '🥃', hint: 'The Hangover Trilogy', hintPt: 'Trilogia Se Beber Não Case!', ids: [18785, 45243, 109439] },
  { name: 'Sweetie Pie', emoji: '🥧', hint: 'American Pie (original four)', hintPt: 'American Pie (quatro originais)', ids: [2105, 2770, 8273, 71552] },
  { name: 'Visceral Gamer', emoji: '♟️', hint: 'Saw Franchise (10 films)', hintPt: 'Franquia Jogos Mortais (10 filmes)', ids: [176, 215, 214, 663, 11917, 22804, 41439, 298250, 602734, 951491] },
  { name: 'Nuts', emoji: '🌰', hint: 'Ice Age Saga (6 films)', hintPt: 'Saga A Era do Gelo (6 filmes)', ids: [425, 950, 8355, 57800, 278154, 774825] },
  { name: 'Dark Spirit', emoji: '🦇', hint: 'The Dark Knight Trilogy', hintPt: 'Trilogia Batman — O Cavaleiro das Trevas', ids: [272, 155, 49026] },
  { name: 'Infinity Gauntlet', emoji: '♾️', hint: 'All 4 Avengers films (2012-2019)', hintPt: 'Todos os 4 Vingadores (2012-2019)', ids: [24428, 299536, 99861, 299534] },
  { name: 'Sharp Canine', emoji: '🦷', hint: 'Twilight Saga (5 films)', hintPt: 'Saga Crepúsculo (5 filmes)', ids: [122, 121, 240, 50619, 50620] },
  { name: 'Primal Essence', emoji: '🦍', hint: 'Planet of the Apes reboot (4 films)', hintPt: 'Planeta dos Macacos reboot (4 filmes)', ids: [61791, 119450, 281338, 653346] },
];

interface NextTag {
  name: string;
  emoji: string;
  hint: string;
  hintPt: string;
  current: number;
  target: number;
}

function tierCandidate(count: number, tiers: Tier[]): NextTag | null {
  const next = tiers.find((tier) => count < tier.min);
  if (!next) return null;
  return { name: next.name, emoji: next.emoji, hint: next.hint, hintPt: next.hintPt, current: count, target: next.min };
}

function themeCandidates(libraryIds: Set<number>): NextTag[] {
  return THEME_TAGS
    .filter((tag) => !tag.ids.every((id) => libraryIds.has(id)))
    .map((tag) => ({
      name: tag.name,
      emoji: tag.emoji,
      hint: tag.hint,
      hintPt: tag.hintPt,
      current: tag.ids.filter((id) => libraryIds.has(id)).length,
      target: tag.ids.length,
    }));
}

// "Próxima tag" = a que está mais perto de ser desbloqueada (maior fração
// concluída; no empate, a que falta menos).
function pickClosestTag(candidates: NextTag[]): NextTag | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const ratio = b.current / b.target - a.current / a.target;
    if (Math.abs(ratio) > 1e-9) return ratio;
    return (a.target - a.current) - (b.target - b.current);
  })[0];
}

// ---------------------------------------------------------------------------
// Relógio da troca das cartas (meia-noite de Brasília = 03:00 UTC). Isolado
// num componente próprio: só ele re-renderiza a cada segundo.
// ---------------------------------------------------------------------------

function msUntilReset(): number {
  const now = new Date();
  const target = new Date(now);
  target.setUTCHours(3, 0, 0, 0);
  if (now >= target) target.setUTCDate(target.getUTCDate() + 1);
  return Math.max(0, target.getTime() - now.getTime());
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

const ResetCountdown: React.FC = () => {
  const [ms, setMs] = useState(msUntilReset);
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilReset()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <time className="font-mono tabular-nums" style={{ color: PAPER }}>
      {formatCountdown(ms)}
    </time>
  );
};

// ---------------------------------------------------------------------------
// Modal base (portal no <body>, Esc fecha, trava o scroll do fundo)
// ---------------------------------------------------------------------------

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <div className="relative flex min-h-full items-start sm:items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl ring-1 ring-white/10 shadow-2xl overflow-hidden`}
          style={{ background: NIGHT }}
        >
          <div className="flex items-center justify-between gap-4 px-6 pt-5 pb-4 border-b border-white/[0.07]">
            <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl leading-tight">{title}</h2>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="shrink-0 rounded-full hover:bg-white/10 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-300"
              style={{ color: MIST }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-6 max-h-[calc(100dvh-10rem)] overflow-y-auto">{children}</div>
        </motion.div>
      </div>
    </div>,
    document.body
  );
};

// ---------------------------------------------------------------------------
// Tipos de dados
// ---------------------------------------------------------------------------

interface AccountStats {
  username: string;
  avatarUrl: string | null;
  avatarFrame: string | null;
  avatarIsPremium: boolean;
  rated: number;
  watchlist: number;
  friends: number;
  lists: { id: string; name: string }[];
  nextTag: NextTag | null;
  // nota do usuário por id de filme (null = está na watchlist sem nota)
  movieRatings: Map<number, number | null>;
}

interface Personality {
  personalidade_completa: string | null;
  arquetipo_primario: string | null;
  arquetipo_secundario: string | null;
  points: Record<'E' | 'I' | 'C' | 'S' | 'R', number>;
}

interface EssenceInfo {
  archetype_name: string;
  archetype_description: string;
  subcategory_name: string;
  personality_description: string | null;
}

interface DailyPick {
  oracle: OracleId;
  movie: Movie;
}

const SPECTRA = ['E', 'I', 'C', 'S', 'R'] as const;

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface Props {
  userId: string;
  username: string;
  // A página só "acende" quando o topo está pronto — assim a home abre
  // inteira de uma vez, sem blocos pulando.
  visible?: boolean;
  onReady?: () => void;
  onMovieClick: (movie: Movie) => void;
}

const HomeUserPanels: React.FC<Props> = ({ userId, username, visible = true, onReady, onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('pt') ? 'pt' : 'en';
  const isPt = lang === 'pt';
  const reduceMotion = useReducedMotion();
  const { unreadCount: unreadWhispers, openWhispersTarget, clearOpenWhispersTarget } = useWhispers();

  const [stats, setStats] = useState<AccountStats | null>(null);
  const [personality, setPersonality] = useState<Personality | null>(null);
  const [essence, setEssence] = useState<EssenceInfo | null>(null);
  const [picks, setPicks] = useState<DailyPick[]>([]);
  const [picksLoading, setPicksLoading] = useState(true);
  const [predictions, setPredictions] = useState<Record<number, number>>({});

  const [insightsIsNew, setInsightsIsNew] = useState(false);
  const [showWhispers, setShowWhispers] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showOracleInfo, setShowOracleInfo] = useState(false);
  const [showPersona, setShowPersona] = useState(false);

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Pedido de abertura dos Sussurros vindo de uma notificação em outra tela.
  useEffect(() => {
    if (openWhispersTarget === 'home') {
      setShowWhispers(true);
      clearOpenWhispersTarget();
    }
  }, [openWhispersTarget, clearOpenWhispersTarget]);

  // O relatório do mês passado sempre existe a partir do dia 1º; o ponto
  // "novo" some depois que o usuário abre esse relatório específico.
  const lastMonth = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }, []);

  useEffect(() => {
    supabase
      .from('user_monthly_insights_seen')
      .select('id')
      .eq('user_id', userId)
      .eq('year', lastMonth.year)
      .eq('month', lastMonth.month)
      .maybeSingle()
      .then(({ data }) => setInsightsIsNew(!data));
  }, [userId, lastMonth]);

  const openInsights = () => {
    setShowInsights(true);
    if (insightsIsNew) {
      supabase
        .from('user_monthly_insights_seen')
        .insert({ user_id: userId, year: lastMonth.year, month: lastMonth.month })
        .then(() => setInsightsIsNew(false));
    }
  };

  const fetchStats = useCallback(async () => {
    const [profileRes, moviesRes, friendsRes, countersRes, listsRes] = await Promise.all([
      supabase.from('public_profiles').select('username, avatar_url, avatar_frame, plan_type, is_premium').eq('id', userId).maybeSingle(),
      supabase.from('user_movies').select('movie_id, media_type, rating').eq('user_id', userId),
      supabase.from('friendships').select('*', { count: 'exact', head: true }).eq('status', 'accepted').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      supabase.from('profiles').select('oracle_predictions_count, oracle_recommendations_count').eq('id', userId).maybeSingle(),
      supabase.from('lists').select('id, name').eq('user_id', userId).order('updated_at', { ascending: false }).limit(3),
    ]);

    const rows = (moviesRes.data ?? []) as { movie_id: number; media_type: string | null; rating: number | null }[];
    const movieRatings = new Map<number, number | null>();
    rows.forEach((row) => {
      if ((row.media_type ?? 'movie') === 'movie') movieRatings.set(row.movie_id, row.rating);
    });
    const libraryIds = new Set(rows.map((row) => row.movie_id));
    const friends = friendsRes.count ?? 0;
    const profile = profileRes.data as { username?: string; avatar_url?: string | null; avatar_frame?: string | null; plan_type?: string; is_premium?: boolean } | null;

    const nextTag = pickClosestTag([
      tierCandidate(rows.length, PROGRESSION_TIERS),
      tierCandidate(friends, COMMUNITY_TIERS),
      tierCandidate(countersRes.data?.oracle_predictions_count ?? 0, ORACLE_PRED_TIERS),
      tierCandidate(countersRes.data?.oracle_recommendations_count ?? 0, ORACLE_REC_TIERS),
      ...themeCandidates(libraryIds),
    ].filter((tag): tag is NextTag => tag !== null));

    setStats({
      username: profile?.username ?? '',
      avatarUrl: profile?.avatar_url ?? null,
      avatarFrame: profile?.avatar_frame ?? null,
      avatarIsPremium: profile?.is_premium ?? profile?.plan_type === 'premium',
      rated: rows.filter((row) => row.rating !== null).length,
      watchlist: rows.filter((row) => row.rating === null).length,
      friends,
      lists: (listsRes.data ?? []) as { id: string; name: string }[],
      nextTag,
      movieRatings,
    });
  }, [userId]);

  const fetchPersonality = useCallback(async () => {
    const { data: row } = await supabase
      .from('profiles')
      .select('personalidade_completa, arquetipo_primario, arquetipo_secundario, pontos_e, pontos_i, pontos_c, pontos_s, pontos_r')
      .eq('id', userId)
      .maybeSingle();

    setPersonality({
      personalidade_completa: row?.personalidade_completa ?? null,
      arquetipo_primario: row?.arquetipo_primario ?? null,
      arquetipo_secundario: row?.arquetipo_secundario ?? null,
      points: {
        E: Number(row?.pontos_e) || 0,
        I: Number(row?.pontos_i) || 0,
        C: Number(row?.pontos_c) || 0,
        S: Number(row?.pontos_s) || 0,
        R: Number(row?.pontos_r) || 0,
      },
    });

    if (!row?.personalidade_completa) {
      setEssence(null);
      return;
    }
    const { data: info } = await supabase
      .rpc('get_user_complete_personality', { p_user_id: userId, p_language: lang })
      .maybeSingle();
    setEssence((info as EssenceInfo | null) ?? null);
  }, [userId, lang]);

  const fetchDailyPicks = useCallback(async () => {
    setPicksLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_or_create_daily_oracle_recommendations');
      if (error || !data || data.length === 0) {
        setPicks([]);
        return;
      }
      const order: OracleId[] = ['bogart', 'fincher', 'cypher'];
      const loaded = await Promise.all(
        (data as { out_card_type: string; out_movie_id: number }[]).map(async (row) => {
          try {
            const movie = await getMovieDetails(row.out_movie_id, 'movie');
            return { oracle: row.out_card_type as OracleId, movie };
          } catch {
            return null;
          }
        })
      );
      const valid = loaded
        .filter((pick): pick is DailyPick => pick !== null && pick.oracle in ORACLE_BY_ID)
        .sort((a, b) => order.indexOf(a.oracle) - order.indexOf(b.oracle));
      setPicks(valid);

      // Nota prevista das cartas do dia (mesmo modelo do Oracle Filter).
      // Não segura a abertura da página: o selo aparece quando chegar.
      if (valid.length > 0) {
        supabase.functions
          .invoke('predict-watchlist-ratings', { body: { movieIds: valid.map((pick) => pick.movie.id) } })
          .then(({ data: result }) => setPredictions((result?.ratings as Record<number, number>) ?? {}))
          .catch(() => {});
      }
    } finally {
      setPicksLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([fetchStats(), fetchPersonality(), fetchDailyPicks()]).then(() => {
      if (!cancelled) onReadyRef.current?.();
    });
    return () => { cancelled = true; };
  }, [fetchStats, fetchPersonality, fetchDailyPicks]);

  // ---------------------------------------------------------------------
  // Derivados
  // ---------------------------------------------------------------------

  const displayName = username || stats?.username || '';
  const code = personality?.personalidade_completa ?? '';
  const hasEssence = code.length >= 3 && !!essence;
  const persona = hasEssence ? PERSONAS_MAP[code] : undefined;
  const topSpectra = new Set([personality?.arquetipo_primario, personality?.arquetipo_secundario].filter(Boolean) as string[]);
  const maxPoints = personality ? Math.max(1, ...SPECTRA.map((k) => personality.points[k])) : 1;

  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12
    ? t('home.desk.greetingMorning')
    : hour >= 12 && hour < 18
      ? t('home.desk.greetingAfternoon')
      : t('home.desk.greetingEvening');

  const formatScore = (value?: number) =>
    typeof value === 'number' && value > 0
      ? value.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : null;

  // ---------------------------------------------------------------------
  // Blocos
  // ---------------------------------------------------------------------

  const avatar = (() => {
    const frameComponent = frameUsesComponent(stats?.avatarFrame || undefined, stats?.avatarIsPremium ?? false);
    if (frameComponent === 'GhostRiderFrame' && stats?.avatarUrl) {
      return <GhostRiderFrame src={stats.avatarUrl} alt={displayName} size={64} />;
    }
    return (
      <div className={`w-16 h-16 rounded-full overflow-hidden ${getFrameClass(stats?.avatarFrame || undefined, stats?.avatarIsPremium ?? false)}`}>
        {stats?.avatarUrl ? (
          <img src={stats.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full grid place-items-center text-2xl" style={{ ...PIXEL, background: VELVET, color: PAPER }}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    );
  })();

  const statLink = (to: string, count: number, labelKey: string, state?: Record<string, unknown>) => (
    <Link to={to} state={state} className={`group inline-flex items-baseline gap-1.5 rounded ${focusRing}`}>
      <span className="font-semibold tabular-nums" style={{ color: PAPER }}>{count}</span>
      <span className="group-hover:underline underline-offset-4" style={{ color: MIST }}>{t(labelKey, { count })}</span>
    </Link>
  );

  const dealList = {
    hidden: {},
    shown: { transition: { staggerChildren: 0.09, delayChildren: 0.08 } },
  };
  const dealCard = {
    hidden: (i: number) => (reduceMotion ? { opacity: 1 } : { opacity: 0, y: 28, rotate: (i - 1) * 7 }),
    shown: reduceMotion
      ? { opacity: 1 }
      : { opacity: 1, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 210, damping: 22 } },
  };

  const pickBadge = (movieId: number) => {
    const own = stats?.movieRatings.get(movieId);
    if (typeof own === 'number') {
      return (
        <span
          className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-full text-sm font-semibold shadow-lg"
          style={{ background: PAPER, color: INK }}
          title={t('home.desk.yourRating')}
        >
          <Star className="w-3.5 h-3.5 fill-current" aria-hidden />
          <span className="sr-only">{t('home.desk.yourRating')}:</span>
          {own}
        </span>
      );
    }
    const predicted = predictions[movieId];
    if (typeof predicted === 'number') {
      return (
        <span
          className="absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-full bg-violet-600/95 text-white shadow-lg ring-1 ring-white/20"
          title={t('home.desk.predictedForYou')}
        >
          <Wand2 className="w-3.5 h-3.5" aria-hidden />
          <span className="sr-only">{t('home.desk.predictedForYou')}:</span>
          <span style={PIXEL} className="text-lg leading-none">{predicted}</span>
        </span>
      );
    }
    return null;
  };

  return (
    <>
      {/* ---------- Cabeçalho ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-6 sm:pt-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/profile" aria-label={t('nav.profile')} className={`shrink-0 rounded-full ${focusRing}`}>
              {avatar}
            </Link>
            <div className="min-w-0">
              <p className="text-sm sm:text-base" style={{ color: MIST }}>{greeting}</p>
              <h1 style={{ ...PIXEL, color: PAPER }} className="mt-1 text-[2rem] sm:text-5xl leading-none truncate">
                {displayName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={openInsights}
              aria-label={t('home.desk.insights')}
              className={`relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${focusRing}`}
              style={{ color: PAPER }}
            >
              <BarChart3 className="w-[18px] h-[18px] text-violet-300" aria-hidden />
              <span className="hidden sm:inline">{t('home.desk.insights')}</span>
              {insightsIsNew && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-fuchsia-500 ring-2" style={{ '--tw-ring-color': NIGHT } as React.CSSProperties}>
                  <span className="sr-only">{t('home.desk.newBadge')}</span>
                </span>
              )}
            </button>
            <button
              onClick={() => setShowWhispers(true)}
              aria-label={t('profile.whispers')}
              className={`relative inline-flex items-center gap-2 h-11 px-3 sm:px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition ${focusRing}`}
              style={{ color: PAPER }}
            >
              <MessageCircle className="w-[18px] h-[18px] text-violet-300" aria-hidden />
              <span className="hidden sm:inline">{t('profile.whispers')}</span>
              {unreadWhispers > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 grid place-items-center rounded-full bg-fuchsia-500 text-white text-[11px] font-bold ring-2" style={{ '--tw-ring-color': NIGHT } as React.CSSProperties}>
                  {unreadWhispers}
                </span>
              )}
            </button>
          </div>
        </div>

        {stats && (
          <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm sm:text-[15px]">
            {statLink('/library', stats.rated, 'home.desk.statRated')}
            {statLink('/library', stats.watchlist, 'home.desk.statWatchlist')}
            {statLink('/community', stats.friends, 'home.desk.statFriends')}
          </p>
        )}
      </section>

      {/* ---------- Na mesa hoje + Sua essência ---------- */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-12 pb-14 sm:pb-16 grid lg:grid-cols-12 gap-12 lg:gap-10">
        <div className="lg:col-span-8 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 style={{ ...PIXEL, color: PAPER }} className="text-3xl sm:text-4xl leading-tight">
                {t('home.desk.todayTitle')}
              </h2>
              <p className="mt-2 text-sm sm:text-base" style={{ color: MIST }}>
                {t('home.desk.todaySubtitle')} {t('home.desk.todayRenews')} <ResetCountdown />
              </p>
            </div>
            <button
              onClick={() => setShowOracleInfo(true)}
              aria-label={t('home.desk.todayHelp')}
              title={t('home.desk.todayHelp')}
              className={`shrink-0 rounded-full hover:bg-white/5 transition ${focusRing}`}
              style={{ color: MIST }}
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>

          {picksLoading ? (
            <div className="mt-7 flex sm:grid sm:grid-cols-3 gap-4 sm:gap-5 overflow-hidden" aria-hidden>
              {[0, 1, 2].map((i) => (
                <div key={i} className="shrink-0 w-[62%] sm:w-auto">
                  <div className="aspect-[2/3] rounded-xl animate-pulse" style={{ background: VELVET }} />
                  <div className="mt-3 h-4 w-24 rounded animate-pulse" style={{ background: VELVET }} />
                  <div className="mt-2 h-4 w-40 rounded animate-pulse" style={{ background: VELVET }} />
                </div>
              ))}
            </div>
          ) : picks.length > 0 ? (
            <motion.ol
              className="mt-7 -mx-5 px-5 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-3 gap-4 sm:gap-5 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-px-5 pb-2 sm:pb-0"
              style={{ scrollbarWidth: 'none' }}
              variants={dealList}
              initial="hidden"
              animate={visible ? 'shown' : 'hidden'}
            >
              {picks.map((pick, i) => {
                const oracle = ORACLE_BY_ID[pick.oracle];
                const year = pick.movie.release_date?.slice(0, 4);
                const score = formatScore(pick.movie.vote_average);
                const inWatchlist = stats?.movieRatings.get(pick.movie.id) === null;
                return (
                  <motion.li key={pick.oracle} custom={i} variants={dealCard} className="snap-start shrink-0 w-[62%] sm:w-auto">
                    <button
                      onClick={() => onMovieClick(pick.movie)}
                      className={`group block w-full text-left rounded-xl ${focusRing}`}
                    >
                      <div
                        className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/10 transition-transform duration-200 group-hover:-translate-y-1"
                        style={{ background: VELVET, boxShadow: `0 26px 50px -26px ${oracle.color}99` }}
                      >
                        {pick.movie.poster_path ? (
                          <OptimizedPoster
                            src={`https://image.tmdb.org/t/p/w500${pick.movie.poster_path}`}
                            alt={pick.movie.title}
                            className="absolute inset-0 w-full h-full object-cover"
                            priority
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center" style={{ color: MIST }}>
                            <Film className="w-10 h-10" aria-hidden />
                          </div>
                        )}
                        {pickBadge(pick.movie.id)}
                        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1" style={{ background: oracle.color }} />
                      </div>
                      <div className="mt-3.5 flex items-center gap-2">
                        <img
                          src={oracle.avatar}
                          alt=""
                          width={28}
                          height={28}
                          loading="lazy"
                          decoding="async"
                          className="w-7 h-7 rounded-full object-cover"
                          style={{ boxShadow: `0 0 0 2px ${oracle.color}` }}
                        />
                        <span style={{ ...PIXEL, color: oracle.color }} className="text-lg leading-none">{oracle.name}</span>
                      </div>
                      <p className="mt-2 font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                        {pick.movie.title}
                      </p>
                      <p className="mt-1 text-sm flex flex-wrap items-center gap-x-2" style={{ color: MIST }}>
                        {year && <span>{year}</span>}
                        {score && (
                          <span className="inline-flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 fill-amber-300 text-amber-300" aria-hidden />
                            {t('home.desk.publicScore', { score })}
                          </span>
                        )}
                        {inWatchlist && <span>{t('home.desk.inWatchlist')}</span>}
                      </p>
                    </button>
                  </motion.li>
                );
              })}
            </motion.ol>
          ) : (
            <p className="mt-7 text-sm" style={{ color: MIST }}>{t('home.panels.noRecommendationToday')}</p>
          )}

          <Link
            to="/oracle/libraries"
            className={`mt-7 inline-flex items-center gap-2 text-sm font-semibold text-violet-200 hover:text-white transition rounded ${focusRing}`}
          >
            {t('home.desk.moreRecs')}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </Link>
        </div>

        {/* Sua essência */}
        <aside className={`lg:col-span-4 ${personality && !hasEssence ? 'lg:self-start' : ''}`}>
          <div className="h-full rounded-2xl ring-1 ring-white/10 p-6 sm:p-7 flex flex-col" style={{ background: VELVET }}>
            {personality === null ? (
              <div className="space-y-3" aria-hidden>
                <div className="h-4 w-24 rounded bg-white/10 animate-pulse" />
                <div className="h-14 w-48 rounded bg-white/10 animate-pulse" />
                <div className="h-24 rounded bg-white/10 animate-pulse" />
              </div>
            ) : hasEssence ? (
              <>
                <p className="text-sm" style={{ color: MIST }}>{t('home.desk.essenceLabel')}</p>
                <div className="mt-3 flex items-center gap-4">
                  <ArchetypeSymbol archetypeId={code.slice(0, 2)} subcategoryId={code.slice(2, 3)} size={56} animated={false} />
                  <div className="min-w-0">
                    <p style={{ ...PIXEL, color: PAPER }} className="text-3xl leading-none">{code}</p>
                    <p className="mt-1.5 font-semibold leading-snug" style={{ color: PAPER }}>
                      {essence!.personality_description || `${essence!.archetype_name} ${essence!.subcategory_name}`}
                    </p>
                  </div>
                </div>
                {essence!.archetype_description && (
                  <p className="mt-4 text-sm leading-relaxed line-clamp-4" style={{ color: MIST }}>
                    {essence!.archetype_description}
                  </p>
                )}

                <h3 className="mt-6 text-sm font-semibold" style={{ color: PAPER }}>{t('oracle.architectureTitle')}</h3>
                <ul className="mt-3 space-y-2.5">
                  {SPECTRA.map((key) => {
                    const value = personality.points[key];
                    const isTop = topSpectra.has(key);
                    const width = `${Math.max(0, value) / maxPoints * 100}%`;
                    return (
                      <li key={key} className="grid grid-cols-[6.25rem_1fr] items-center gap-3">
                        <span className={`text-sm ${isTop ? 'font-semibold' : ''}`} style={{ color: isTop ? PAPER : MIST }}>
                          {t(`oracle.spectrum.${key}`)}
                        </span>
                        <span className="h-2 rounded-full bg-white/[0.08] overflow-hidden" role="presentation">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width,
                              background: isTop ? 'linear-gradient(90deg, #7c3aed, #c026d3)' : 'rgba(189,180,214,0.4)',
                            }}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs leading-relaxed" style={{ color: MIST }}>{t('home.desk.balancesHint')}</p>

                {persona && (
                  <button
                    onClick={() => setShowPersona(true)}
                    className={`mt-5 -mx-3 w-[calc(100%+1.5rem)] flex justify-start items-center gap-3 p-3 rounded-xl hover:bg-white/[0.05] text-left transition ${focusRing}`}
                  >
                    {persona.imageUrl ? (
                      <img src={persona.imageUrl} alt="" loading="lazy" className="w-11 h-11 rounded-full object-cover object-top ring-1 ring-white/15" />
                    ) : (
                      <span className="w-11 h-11 rounded-full grid place-items-center ring-1 ring-white/15" style={{ ...PIXEL, color: PAPER }}>
                        {persona.name.charAt(0)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs" style={{ color: MIST }}>{t('home.panels.yourPersona')}</span>
                      <span className="block font-semibold truncate" style={{ color: PAPER }}>{persona.name}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: MIST }} aria-hidden />
                  </button>
                )}

                <Link
                  to="/oracle"
                  className={`mt-auto pt-6 block ${focusRing} rounded-xl`}
                >
                  <span className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition">
                    {t('home.desk.openOracle')}
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </span>
                </Link>
              </>
            ) : (
              <>
                {/* As três cartas na mesa, viradas pra cima, esperando o ritual */}
                <div className="flex justify-center pt-2 pb-1" aria-hidden>
                  {ORACLES.map((oracle, i) => (
                    <img
                      key={oracle.id}
                      src={oracle.img}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-[27%] max-w-[92px] rounded-[4px] ring-1 ring-white/10 -mx-1.5"
                      style={{
                        transform: `rotate(${(i - 1) * 9}deg) translateY(${i === 1 ? '-6px' : '4px'})`,
                        boxShadow: `0 16px 30px -14px ${oracle.color}aa`,
                      }}
                    />
                  ))}
                </div>
                <h3 style={{ ...PIXEL, color: PAPER }} className="mt-7 text-2xl leading-tight">{t('home.desk.essenceEmptyTitle')}</h3>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: MIST }}>{t('home.desk.essenceEmptyDesc')}</p>
                <Link to="/oracle" className={`mt-auto pt-6 block rounded-xl ${focusRing}`}>
                  <span className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition">
                    {t('oracle.discoverYourEssence')}
                    <ArrowRight className="w-4 h-4" aria-hidden />
                  </span>
                </Link>
              </>
            )}
          </div>
        </aside>
      </section>

      {/* ---------- Próximos passos ---------- */}
      {stats && (
        <section className="border-t border-white/[0.07]">
          <ul className="mx-auto max-w-6xl px-5 sm:px-8 py-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
            <li>
              <div className="flex gap-4">
                <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center text-xl ring-1 ring-white/10" style={{ background: VELVET }} aria-hidden>
                  {stats.nextTag?.emoji ?? '🏆'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs" style={{ color: MIST }}>{t('home.panels.nextTag')}</p>
                  {stats.nextTag ? (
                    <>
                      <p className="font-semibold truncate" style={{ color: PAPER }}>{stats.nextTag.name}</p>
                      <p className="mt-0.5 text-sm" style={{ color: MIST }}>{isPt ? stats.nextTag.hintPt : stats.nextTag.hint}</p>
                      <div className="mt-2.5 flex items-center gap-2.5">
                        <span className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                            style={{ width: `${Math.min(100, (stats.nextTag.current / stats.nextTag.target) * 100)}%` }}
                          />
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: MIST }}>
                          {t('home.desk.tagProgress', { current: stats.nextTag.current, target: stats.nextTag.target })}
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="font-semibold" style={{ color: PAPER }}>{t('home.panels.allTagsUnlocked')}</p>
                  )}
                </div>
              </div>
            </li>

            {stats.watchlist >= 4 && (
              <li>
                <Link to="/library" state={{ openWatchlistDuel: true }} className={`group flex justify-start items-start gap-4 rounded-xl text-left ${focusRing}`}>
                  <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: VELVET }} aria-hidden>
                    <Swords className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold group-hover:underline underline-offset-4" style={{ color: PAPER }}>{t('home.panels.watchlistDuel')}</span>
                    <span className="block mt-0.5 text-sm leading-relaxed" style={{ color: MIST }}>{t('home.panels.watchlistDuelHint')}</span>
                  </span>
                </Link>
              </li>
            )}

            {stats.lists.length > 0 && (
              <li>
                <Link to="/lists" className={`group flex justify-start items-start gap-4 rounded-xl text-left ${focusRing}`}>
                  <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: VELVET }} aria-hidden>
                    <ListVideo className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold group-hover:underline underline-offset-4" style={{ color: PAPER }}>{t('home.panels.yourLists')}</span>
                    <span className="block mt-0.5 text-sm leading-relaxed line-clamp-2" style={{ color: MIST }}>
                      {stats.lists.map((list) => list.name).join(' · ')}
                    </span>
                  </span>
                </Link>
              </li>
            )}

            <li>
              <Link to="/community" className={`group flex justify-start items-start gap-4 rounded-xl text-left ${focusRing}`}>
                <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: VELVET }} aria-hidden>
                  <Users className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                    {stats.friends > 0 ? t('home.panels.matchWithFriends') : t('home.panels.openCommunity')}
                  </span>
                  <span className="block mt-0.5 text-sm leading-relaxed" style={{ color: MIST }}>
                    {stats.friends > 0 ? t('home.panels.matchWithFriendsHint') : t('home.desk.findFriendsHint')}
                  </span>
                </span>
              </Link>
            </li>
          </ul>
        </section>
      )}

      {/* ---------- Modais ---------- */}
      {showWhispers && (
        <WhispersModal isOpen onClose={() => setShowWhispers(false)} userId={userId} />
      )}

      {showInsights && (
        <MonthlyInsightsModal isOpen onClose={() => setShowInsights(false)} userId={userId} />
      )}

      {showOracleInfo && (
        <Sheet title={t('oracle.cards.infoTitle')} onClose={() => setShowOracleInfo(false)} wide>
          <ul className="space-y-7">
            {ORACLES.map((oracle) => (
              <li key={oracle.id} className="flex gap-5">
                <img
                  src={oracle.img}
                  alt=""
                  loading="lazy"
                  className="w-20 sm:w-24 shrink-0 self-start rounded-[4px] ring-1 ring-white/10"
                  style={{ boxShadow: `0 16px 32px -16px ${oracle.color}99` }}
                />
                <div className="min-w-0">
                  <p style={{ ...PIXEL, color: oracle.color }} className="text-2xl leading-none">{oracle.name}</p>
                  <p className="mt-2 font-semibold" style={{ color: PAPER }}>
                    {t(`oracle.cards.${oracle.id}`)} · {t(`oracle.cards.${oracle.id}Subtitle`)}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: MIST }}>{t(`oracle.cards.${oracle.id}Desc`)}</p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: PAPER }}>{t(`oracle.cards.${oracle.id}Rec`)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-7 pt-5 border-t border-white/[0.07] text-sm leading-relaxed" style={{ color: MIST }}>
            {t('home.desk.todayExplain')}
          </p>
        </Sheet>
      )}

      {showPersona && persona && (
        <Sheet title={t('home.panels.yourPersona')} onClose={() => setShowPersona(false)}>
          {persona.imageUrl && (
            <div className="w-full aspect-[4/3] rounded-xl overflow-hidden ring-1 ring-white/10 mb-5">
              <img src={persona.imageUrl} alt={persona.name} className="w-full h-full object-cover object-top" />
            </div>
          )}
          <p className="text-sm" style={{ color: MIST }}>
            {code} · {essence?.personality_description || `${essence?.archetype_name ?? ''} ${essence?.subcategory_name ?? ''}`}
          </p>
          <h3 style={{ ...PIXEL, color: PAPER }} className="mt-1 text-3xl leading-tight">{persona.name}</h3>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: MIST }}>
            {isPt ? persona.descriptionPt : persona.descriptionEn}
          </p>
        </Sheet>
      )}
    </>
  );
};

export default HomeUserPanels;