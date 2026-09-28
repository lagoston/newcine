import { useState, useEffect, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, Sparkles, Film } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import MovieDetailsModal from './MovieDetailsModal';
import OracleSheet from './OracleSheet';
import { getMovieDetailsFromDB, type Movie } from '../lib/tmdb';
import { VELVET, NIGHT, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../lib/oracleTheme';

interface CompatibilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  myUserId: string;
  otherUserId: string;
  otherUsername: string;
}

interface RawComparison {
  movie_id: number;
  media_type: string;
  rating_a: number;
  rating_b: number;
}

// Modelo categórico, não baseado em nota pública nem em qualquer medida de
// magnitude/desvio. Três grupos de nota:
//   A = 10, 9, 8, 7   B = 6, 5, 4   C = 3, 2, 1, 0
// A e B são vizinhos; B e C também; A e C NÃO (só se chega de um ao outro
// atravessando B). Cada filme comparado cai em exatamente uma categoria:
//   - notas EXATAMENTE iguais (qualquer nota)      -> grande concordância
//   - notas diferentes, mesmo grupo                -> concordância leve
//   - grupos vizinhos diferentes (A-B ou B-C)      -> discordância leve
//   - grupos desconectados (só A-C)                -> grande discordância
type RatingGroup = 'A' | 'B' | 'C';
type AgreementCategory = 'strong_agree' | 'light_agree' | 'light_disagree' | 'strong_disagree';

function getRatingGroup(rating: number): RatingGroup {
  if (rating >= 7) return 'A';
  if (rating >= 4) return 'B';
  return 'C';
}

function classifyComparison(ratingA: number, ratingB: number): AgreementCategory {
  if (ratingA === ratingB) return 'strong_agree';
  const groupA = getRatingGroup(ratingA);
  const groupB = getRatingGroup(ratingB);
  if (groupA === groupB) return 'light_agree';
  const disconnected = (groupA === 'A' && groupB === 'C') || (groupA === 'C' && groupB === 'A');
  return disconnected ? 'strong_disagree' : 'light_disagree';
}

// Delta simétrico por categoria — grande concordância e grande
// discordância têm o mesmo peso em módulo, garantindo que 50% (delta médio
// 0) seja o verdadeiro ponto de neutralidade.
const CATEGORY_DELTA: Record<AgreementCategory, number> = {
  strong_agree: 2,
  light_agree: 1,
  light_disagree: -1,
  strong_disagree: -2,
};

// "Mais concordam" prioriza grande concordância; "mais discordam" prioriza
// grande discordância.
const CATEGORY_PRIORITY: Record<AgreementCategory, number> = {
  strong_agree: 0,
  light_agree: 1,
  light_disagree: 1,
  strong_disagree: 0,
};

interface MovieComparison extends RawComparison {
  title: string;
  poster_path: string | null;
  category: AgreementCategory;
}

const MIN_MOVIES = 5;

// Faixas do placar, nas cores do fundo noite.
function getTier(score: number) {
  if (score >= 90) return { key: 'soulmates', color: '#6EE7B7', emoji: '💫' };
  if (score >= 75) return { key: 'great', color: '#86EFAC', emoji: '🎬' };
  if (score >= 60) return { key: 'good', color: '#7DD3FC', emoji: '🍿' };
  if (score >= 40) return { key: 'different', color: '#FCD34D', emoji: '🎭' };
  return { key: 'opposite', color: '#FCA5A5', emoji: '🌗' };
}

const RING_SIZE = 148;
const RING_STROKE = 10;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

export default function CompatibilityModal({ isOpen, onClose, myUserId, otherUserId, otherUsername }: CompatibilityModalProps) {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [comparisons, setComparisons] = useState<MovieComparison[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen || !myUserId || !otherUserId) return;
    fetchCompatibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, myUserId, otherUserId]);

  const fetchCompatibility = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_user_compatibility', { p_user_a: myUserId, p_user_b: otherUserId });
      if (error) throw error;
      const rows: RawComparison[] = data || [];

      if (rows.length === 0) {
        setComparisons([]);
        return;
      }

      const isPt = i18n.language.startsWith('pt');
      const ids = rows.map((r) => r.movie_id);
      const { data: cacheRows } = await supabase
        .from('movie_cache')
        .select('tmdb_id, media_type, title_en, title_pt, poster_path, poster_path_pt')
        .in('tmdb_id', ids);

      const cacheMap = new Map((cacheRows || []).map((c: any) => [`${c.tmdb_id}_${c.media_type}`, c]));

      const enriched: MovieComparison[] = rows.map((r) => {
        const cached: any = cacheMap.get(`${r.movie_id}_${r.media_type}`);
        return {
          ...r,
          title: cached ? (isPt && cached.title_pt ? cached.title_pt : cached.title_en) : `#${r.movie_id}`,
          poster_path: cached ? (isPt && cached.poster_path_pt ? cached.poster_path_pt : cached.poster_path) : null,
          category: classifyComparison(r.rating_a, r.rating_b),
        };
      });
      setComparisons(enriched);
    } catch (error) {
      console.error('Error fetching compatibility:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    if (comparisons.length === 0) return null;
    const n = comparisons.length;
    // Média simples dos deltas — nunca soma bruta: só a PROPORÇÃO entre as
    // categorias importa, não o volume de filmes.
    const avgDelta = comparisons.reduce((sum, m) => sum + CATEGORY_DELTA[m.category], 0) / n;
    // Delta médio 0 → 50%; +2 (só grandes concordâncias) → 100%; -2 → 0%.
    const score = Math.max(0, Math.min(100, Math.round(50 + (avgDelta / 2) * 50)));
    return { score, count: n };
  }, [comparisons]);

  const topAgreements = useMemo(
    () =>
      [...comparisons]
        .filter((m) => m.category === 'strong_agree' || m.category === 'light_agree')
        .sort((a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category])
        .slice(0, 3),
    [comparisons],
  );

  // Exclusão mútua garantida: discordâncias só escolhem entre os filmes que
  // sobraram depois de reservar as concordâncias.
  const topDisagreements = useMemo(() => {
    const agreedIds = new Set(topAgreements.map((m) => `${m.movie_id}_${m.media_type}`));
    return [...comparisons]
      .filter((m) => !agreedIds.has(`${m.movie_id}_${m.media_type}`) && (m.category === 'strong_disagree' || m.category === 'light_disagree'))
      .sort((a, b) => CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category])
      .slice(0, 3);
  }, [comparisons, topAgreements]);

  const handleOpenMovie = async (movieId: number) => {
    setLoadingMovieId(movieId);
    try {
      setSelectedMovie(await getMovieDetailsFromDB(movieId));
    } catch (error) {
      console.error('Error loading movie details:', error);
      toast.error(t('common.error'));
    } finally {
      setLoadingMovieId(null);
    }
  };

  const tier = stats ? getTier(stats.score) : null;

  const ratingChip = (value: number, label: string) => {
    const tone = ratingTone(value);
    return (
      <span
        className="grid place-items-center w-9 h-7 rounded-full text-[15px] leading-none"
        style={{ ...PIXEL, color: tone.color, boxShadow: `inset 0 0 0 1.5px ${tone.ring}` }}
        title={`${label}: ${value}`}
      >
        <span className="sr-only">{label}:</span>
        {value}
      </span>
    );
  };

  const renderList = (title: string, items: MovieComparison[]) => (
    <section>
      <div className="flex items-end justify-between gap-3">
        <h3 style={{ ...PIXEL, color: PAPER }} className="text-lg leading-tight">
          {title}
        </h3>
        {/* Legenda das duas colunas de nota */}
        <div className="shrink-0 flex gap-1.5 text-[11px]" style={{ color: MIST }} aria-hidden>
          <span className="w-9 text-center">{t('matchMovie.you')}</span>
          <span className="w-9 text-center truncate">@{otherUsername}</span>
        </div>
      </div>
      <ul className="mt-2.5 space-y-1">
        {items.map((m) => (
          <li key={`${m.movie_id}_${m.media_type}`}>
            <button
              onClick={() => handleOpenMovie(m.movie_id)}
              aria-busy={loadingMovieId === m.movie_id || undefined}
              className={`group w-full justify-start gap-3 p-2 -mx-2 rounded-xl text-left hover:bg-white/[0.05] transition ${FOCUS_RING}`}
              style={{ width: 'calc(100% + 1rem)' }}
            >
              <span className="relative block w-9 h-[54px] shrink-0 rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
                {m.poster_path ? (
                  <img src={`https://image.tmdb.org/t/p/w92${m.poster_path}`} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full grid place-items-center" style={{ color: MIST }}>
                    <Film className="w-4 h-4" aria-hidden />
                  </span>
                )}
                {loadingMovieId === m.movie_id && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50">
                    <Loader2 className="w-4 h-4 text-white animate-spin" aria-hidden />
                  </span>
                )}
              </span>
              <span className="flex-1 min-w-0 text-sm font-medium leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                {m.title}
              </span>
              <span className="shrink-0 flex gap-1.5">
                {ratingChip(m.rating_a, t('matchMovie.you'))}
                {ratingChip(m.rating_b, `@${otherUsername}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={onClose}
        title={t('compatibility.buttonLabel')}
        subtitle={t('compatibility.subtitle', { username: otherUsername })}
        leading={
          <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
            <Sparkles className="w-5 h-5 text-pink-300" aria-hidden />
          </span>
        }
        size="md"
        escapeEnabled={!selectedMovie}
        bodyClassName="px-5 sm:px-7 py-6"
      >
        {loading ? (
          <div className="flex flex-col items-center py-8" aria-busy="true">
            <div className="rounded-full bg-white/[0.06] animate-pulse" style={{ width: RING_SIZE, height: RING_SIZE }} />
            <div className="mt-4 h-5 w-44 rounded bg-white/10 animate-pulse" />
          </div>
        ) : !stats || stats.count < MIN_MOVIES ? (
          <div className="text-center py-8">
            <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
              <Film className="w-7 h-7 text-violet-300" aria-hidden />
            </span>
            <p className="mt-4 font-semibold" style={{ color: PAPER }}>
              {t('compatibility.notEnoughDataTitle')}
            </p>
            <p className="mt-1 text-sm max-w-sm mx-auto leading-relaxed" style={{ color: MIST }}>
              {t('compatibility.notEnoughDataDescription', { count: stats?.count || 0, min: MIN_MOVIES })}
            </p>
          </div>
        ) : (
          <div className="space-y-7">
            {/* Placar — o anel enche até a porcentagem */}
            <div className="flex flex-col items-center text-center">
              <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
                <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} className="-rotate-90" aria-hidden>
                  <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill={NIGHT} stroke="rgba(255,255,255,0.08)" strokeWidth={RING_STROKE} />
                  <motion.circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke={tier!.color}
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={RING_LENGTH}
                    initial={{ strokeDashoffset: reduceMotion ? RING_LENGTH * (1 - stats.score / 100) : RING_LENGTH }}
                    animate={{ strokeDashoffset: RING_LENGTH * (1 - stats.score / 100) }}
                    transition={{ duration: reduceMotion ? 0 : 0.9, ease: 'easeOut' }}
                  />
                </svg>
                <span className="absolute inset-0 grid place-items-center">
                  <span style={{ ...PIXEL, color: PAPER }} className="text-5xl leading-none">
                    {stats.score}
                    <span className="text-2xl" style={{ color: MIST }}>
                      %
                    </span>
                  </span>
                </span>
              </div>
              <p className="mt-4 text-lg font-semibold inline-flex items-center gap-2" style={{ color: tier!.color }}>
                <span aria-hidden>{tier!.emoji}</span>
                {t(`compatibility.tier.${tier!.key}`)}
              </p>
              <p className="mt-1 text-sm" style={{ color: MIST }}>
                {t('compatibility.moviesCompared', { count: stats.count })}
              </p>
            </div>

            {topAgreements.length > 0 && renderList(t('compatibility.mostAgree'), topAgreements)}
            {topDisagreements.length > 0 && renderList(t('compatibility.mostDisagree'), topDisagreements)}
          </div>
        )}
      </OracleSheet>

      {selectedMovie && <MovieDetailsModal movie={selectedMovie} isOpen={true} onClose={() => setSelectedMovie(null)} />}
    </>
  );
}
