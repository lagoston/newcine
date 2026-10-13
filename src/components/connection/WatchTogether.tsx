import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Shuffle, SlidersHorizontal, RotateCcw, ChevronDown, EyeOff, Eye, Users2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { MOODS, MOOD_BY_KEY, withMoodAlpha, type MoodKey } from '../../lib/moods';
import { PosterArt, ScoreBubble } from './connectionBits';
import { formatRating } from './connectionFormat';
import { TonePill } from './ConnectionChip';
import type { ConnectionSide } from '../../lib/connection';
import { PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../../lib/oracleTheme';
import { PROFILE_GHOST_BUTTON } from '../ProfileIdentityCard';

// "Assistam juntos" (13/10/2026), o antigo Match Movie dentro da gaveta
// Conexão. Sem passo de configuração: quando a seção aparece na tela, já
// pede à função match-movie uma sessão de títulos que nenhum dos dois viu,
// pelos humores das duas personalidades (os 3 de cada um; sem
// personalidade, os 9). Os chips ligam/desligam humores (sempre fica pelo
// menos um) e pedem de novo. "Outra sessão" sorteia de novo (o servidor
// amostra ao acaso).
//
// "Ajustar" abre ali mesmo (antes abria o Match Movie antigo por cima, o que
// ficava estranho): o tipo de sessão — nenhum viu, só um viu, os dois viram
// — e os 9 humores. Cada mudança já pede a sessão de novo.
//
// "Nota da dupla" é a média harmônica das duas notas (o "Match" de antes):
// a nota mais baixa pesa mais, então só sobe quando os dois gostariam.

interface ScoreEntry {
  userId: string;
  username: string;
  score: number;
  wasRated: boolean;
}

export interface WatchMovie {
  id: number;
  title: string;
  poster_path: string | null;
  overview: string;
  scores: ScoreEntry[];
  matchScore: number;
}

type SessionMode = 'unseen' | 'one' | 'both';

interface WatchTogetherProps {
  me: ConnectionSide | null;
  other: ConnectionSide;
  defaultMoods: MoodKey[];
  onOpenTitle: (ref: { movie_id: number; media_type: 'movie' | 'tv' }) => void;
}

type Phase = 'idle' | 'loading' | 'ready' | 'error';

const ALL_MOODS = MOODS.map((m) => m.key);
// Ordem fixa dos humores (a mesma de lib/moods).
const inOrder = (keys: Iterable<MoodKey>) => {
  const set = new Set(keys);
  return ALL_MOODS.filter((k) => set.has(k));
};

const MODES: { id: SessionMode; icon: React.ElementType }[] = [
  { id: 'unseen', icon: EyeOff },
  { id: 'one', icon: Eye },
  { id: 'both', icon: Users2 },
];

const AMBER = '#FCD34D';

const WatchTogether: React.FC<WatchTogetherProps> = ({ me, other, defaultMoods, onOpenTitle }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const wrapRef = useRef<HTMLDivElement>(null);
  const inView = useInView(wrapRef, { once: true, amount: 0.15 });

  const initial = useMemo(() => (defaultMoods.length ? inOrder(defaultMoods) : ALL_MOODS), [defaultMoods]);
  // Chips mostrados (os humores de vocês, ou os 9) e os ligados.
  const [pool, setPool] = useState<MoodKey[]>(initial);
  const [selected, setSelected] = useState<MoodKey[]>(initial);
  const [mode, setMode] = useState<SessionMode>('unseen');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [movies, setMovies] = useState<WatchMovie[]>([]);
  const [nonce, setNonce] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    setPool(initial);
    setSelected(initial);
  }, [initial]);

  const moodsKey = selected.join(',');

  const run = useCallback(async () => {
    const id = ++request.current;
    setPhase('loading');
    try {
      const { data, error } = await supabase.functions.invoke('match-movie', {
        body: { friendIds: [other.id], mode, moods: moodsKey.split(',').filter(Boolean), language: lang },
      });
      if (id !== request.current) return;
      if (error || (data && (data as { error?: string }).error)) throw error || new Error((data as { error: string }).error);
      setMovies(((data as { movies?: WatchMovie[] } | null)?.movies || []).slice(0, 6));
      setPhase('ready');
    } catch (err) {
      if (id !== request.current) return;
      console.error('WatchTogether match-movie error:', err);
      setPhase('error');
    }
  }, [other.id, mode, moodsKey, lang]);

  // Roda sozinho quando a seção aparece, e de novo a cada mudança de humor,
  // de tipo de sessão ou "Outra sessão".
  useEffect(() => {
    if (!inView || !moodsKey) return;
    run();
  }, [inView, run, moodsKey, nonce]);

  const toggle = (key: MoodKey) => {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.length > 1 ? prev.filter((k) => k !== key) : prev;
      return inOrder([...prev, key]);
    });
  };
  const pickAllMoods = () => {
    setPool(ALL_MOODS);
    setSelected(ALL_MOODS);
  };
  const toggleAdjust = () => {
    setAdjustOpen((open) => {
      // Ajustando, aparecem os 9 humores (os de vocês continuam ligados).
      if (!open) setPool(ALL_MOODS);
      return !open;
    });
  };
  const isDefault = mode === 'unseen' && moodsKey === initial.join(',');
  const resetDefaults = () => {
    setMode('unseen');
    setSelected(initial);
  };

  const top = movies[0];
  const rest = movies.slice(1, 6);
  const scoreOf = (movie: WatchMovie, side: 'me' | 'other') => {
    const id = side === 'me' ? me?.id : other.id;
    return movie.scores.find((s) => s.userId === id) ?? movie.scores[side === 'me' ? 0 : 1];
  };
  const busy = phase === 'loading' || phase === 'idle';

  const bubble = (movie: WatchMovie, side: 'me' | 'other') => {
    const s = scoreOf(movie, side);
    if (!s) return null;
    const user = side === 'me' ? me ?? {} : other;
    const name = side === 'me' ? t('connection.you') : `@${other.username}`;
    const value = formatRating(s.score, lang, true);
    return (
      <ScoreBubble
        user={user}
        value={s.score}
        language={lang}
        decimals
        note={s.wasRated ? undefined : t('matchMovie.predicted')}
        label={`${name}: ${value}${s.wasRated ? '' : ` (${t('matchMovie.predicted')})`}`}
      />
    );
  };

  const moodChip = (key: MoodKey) => {
    const mood = MOOD_BY_KEY[key];
    const on = selected.includes(key);
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggle(key)}
        aria-pressed={on}
        className={`shrink-0 h-10 min-h-0 gap-1.5 pl-2.5 pr-3 rounded-full text-[13px] font-medium transition ${FOCUS_RING}`}
        style={{
          background: on ? withMoodAlpha(mood, 0.16) : 'rgba(255,255,255,0.03)',
          boxShadow: `inset 0 0 0 1px ${on ? withMoodAlpha(mood, 0.5) : 'rgba(255,255,255,0.1)'}`,
          color: on ? PAPER : MIST,
        }}
      >
        <span style={{ ...PIXEL, color: mood.color, opacity: on ? 1 : 0.5 }} className="text-[15px] leading-none" aria-hidden>
          {mood.letter}
        </span>
        {t(mood.labelKey)}
      </button>
    );
  };

  return (
    <div ref={wrapRef}>
      {/* Humores (e o Ajustar, que abre aqui mesmo) */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px]" style={{ color: MIST }}>
          {adjustOpen ? t('connection.watch.moodsTitle') : t('connection.watch.moodsFrom')}
        </p>
        <button
          type="button"
          onClick={toggleAdjust}
          aria-expanded={adjustOpen}
          aria-controls="watch-together-adjust"
          className={`shrink-0 h-9 min-h-0 gap-1.5 px-3 rounded-full text-[13px] font-medium transition ${FOCUS_RING}`}
          style={{
            color: PAPER,
            background: adjustOpen ? 'rgba(167,139,250,0.16)' : 'rgba(255,255,255,0.04)',
            boxShadow: `inset 0 0 0 1px ${adjustOpen ? 'rgba(167,139,250,0.5)' : 'rgba(255,255,255,0.12)'}`,
          }}
        >
          <SlidersHorizontal className="w-4 h-4 text-violet-300" aria-hidden />
          {t('connection.watch.adjust')}
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${adjustOpen ? 'rotate-180' : ''}`} style={{ color: MIST }} aria-hidden />
        </button>
      </div>

      {adjustOpen ? (
        <div
          id="watch-together-adjust"
          className="mt-2.5 rounded-2xl p-3 sm:p-4"
          style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 0 1px rgba(167,139,250,0.22)' }}
        >
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('connection.watch.moodsTitle')}>
            {pool.map(moodChip)}
          </div>

          <p className="mt-4 text-[12.5px]" style={{ color: MIST }} id="watch-together-mode">
            {t('connection.watch.mode.title')}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="watch-together-mode">
            {MODES.map(({ id, icon: Icon }) => {
              const on = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMode(id)}
                  className={`flex-col gap-1.5 h-auto min-h-[64px] px-2 py-2.5 rounded-xl text-[12.5px] font-medium leading-tight text-center transition ${FOCUS_RING}`}
                  style={{
                    color: on ? PAPER : MIST,
                    background: on ? 'rgba(252,211,77,0.1)' : 'rgba(255,255,255,0.03)',
                    boxShadow: `inset 0 0 0 1px ${on ? 'rgba(252,211,77,0.55)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  <Icon className="w-[18px] h-[18px]" style={{ color: on ? AMBER : MIST }} aria-hidden />
                  {t(`connection.watch.mode.${id}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12.5px] leading-snug" style={{ color: 'rgba(189,180,214,0.85)' }}>
            {t(`connection.watch.modeHint.${mode}`)}
          </p>

          {!isDefault && (
            <button
              type="button"
              onClick={resetDefaults}
              className={`mt-3 h-9 min-h-0 gap-1.5 px-3 -ml-1 rounded-full text-[13px] font-medium hover:bg-white/[0.05] transition ${FOCUS_RING}`}
              style={{ color: MIST }}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              {t('connection.watch.reset')}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-2 -mx-5 sm:-mx-7 px-5 sm:px-7 flex gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label={t('connection.watch.moodsFrom')}>
          {pool.map(moodChip)}
        </div>
      )}

      {/* Sessão */}
      <div className="mt-4" aria-live="polite" aria-busy={busy}>
        {busy ? (
          <div aria-hidden>
            <div className="flex gap-4 rounded-2xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <span className="block w-[104px] aspect-[2/3] rounded-lg bg-white/[0.06] motion-safe:animate-pulse" />
              <span className="flex-1 pt-1 space-y-2.5">
                <span className="block h-3 w-24 rounded bg-white/[0.06] motion-safe:animate-pulse" />
                <span className="block h-4 w-40 max-w-full rounded bg-white/[0.06] motion-safe:animate-pulse" />
                <span className="block h-8 w-44 max-w-full rounded-full bg-white/[0.05] motion-safe:animate-pulse" />
              </span>
            </div>
            <p className="mt-2 text-[12.5px]" style={{ color: MIST }}>
              {t('connection.watch.loading')}
            </p>
          </div>
        ) : phase === 'error' ? (
          <div className="rounded-2xl p-4 text-[14px]" style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: MIST }}>
            <p>{t('connection.watch.error')}</p>
            <button type="button" onClick={() => setNonce((n) => n + 1)} className={`mt-3 ${PROFILE_GHOST_BUTTON}`} style={{ color: PAPER }}>
              <RotateCcw className="w-4 h-4" aria-hidden />
              {t('connection.watch.retry')}
            </button>
          </div>
        ) : !top ? (
          <div className="rounded-2xl p-4 text-[14px]" style={{ background: 'rgba(255,255,255,0.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)', color: MIST }}>
            <p>{t('connection.watch.empty')}</p>
            {pool.length < ALL_MOODS.length || selected.length < ALL_MOODS.length ? (
              <button type="button" onClick={pickAllMoods} className={`mt-3 ${PROFILE_GHOST_BUTTON}`} style={{ color: PAPER }}>
                {t('connection.watch.useAll')}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div
              className="flex gap-4 rounded-2xl p-3 pr-4"
              style={{
                background: 'linear-gradient(180deg, rgba(252,211,77,0.07), rgba(255,255,255,0.02) 60%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(252,211,77,0.18)',
              }}
            >
              <button
                type="button"
                onClick={() => onOpenTitle({ movie_id: top.id, media_type: 'movie' })}
                aria-label={top.title}
                className={`block shrink-0 w-[104px] min-h-0 min-w-0 rounded-lg hover:brightness-110 transition ${FOCUS_RING}`}
              >
                <PosterArt path={top.poster_path} size="w342" />
              </button>
              <div className="min-w-0 flex-1 pt-0.5">
                <p style={{ ...PIXEL, color: AMBER }} className="text-[13px] leading-none">
                  {mode === 'both' ? t('connection.watch.rewatch') : t('connection.watch.tonight')}
                </p>
                <h4 className="mt-1.5 text-[17px] font-semibold leading-snug line-clamp-2" style={{ color: PAPER }}>
                  {top.title}
                </h4>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {bubble(top, 'me')}
                  {bubble(top, 'other')}
                </div>
                <div className="mt-3 flex items-center gap-2" title={t('connection.watch.duoHint')}>
                  <span className="text-[13px]" style={{ color: MIST }}>
                    {t('connection.watch.duoScore')}
                  </span>
                  <TonePill color={ratingTone(Math.round(top.matchScore)).color} size="md">
                    {formatRating(top.matchScore, lang, true)}
                  </TonePill>
                </div>
                <p className="mt-1 text-[12px] leading-snug" style={{ color: 'rgba(189,180,214,0.8)' }}>
                  {t('connection.watch.duoHint')}
                </p>
              </div>
            </div>

            {rest.length > 0 && (
              <ul className="mt-3 -mx-5 sm:-mx-7 px-5 sm:px-7 scroll-px-5 sm:scroll-px-7 flex gap-2.5 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-1">
                {rest.map((movie) => (
                  <li key={movie.id} className="snap-start shrink-0 w-[84px]">
                    <button
                      type="button"
                      onClick={() => onOpenTitle({ movie_id: movie.id, media_type: 'movie' })}
                      aria-label={`${movie.title} · ${t('connection.watch.duoScore')} ${formatRating(movie.matchScore, lang, true)}`}
                      title={movie.title}
                      className={`block w-full min-h-0 min-w-0 text-left rounded-lg hover:brightness-110 transition ${FOCUS_RING}`}
                    >
                      <PosterArt path={movie.poster_path} />
                    </button>
                    <div className="mt-1.5 flex justify-center" aria-hidden>
                      <TonePill color={ratingTone(Math.round(movie.matchScore)).color}>{formatRating(movie.matchScore, lang, true)}</TonePill>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          disabled={busy}
          className={`w-full sm:w-auto ${PROFILE_GHOST_BUTTON} disabled:opacity-50`}
          style={{ color: PAPER }}
        >
          <Shuffle className="w-4 h-4 text-amber-200" aria-hidden />
          {t('connection.watch.another')}
        </button>
      </div>
    </div>
  );
};

export default WatchTogether;
