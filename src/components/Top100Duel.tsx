import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Film, Flag, RotateCcw, Scale, Swords, Trophy, Tv, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import OracleSheet from './OracleSheet';
import { titleKey } from '../lib/titleCards';
import { EMPTY_TOP100, RatedTitle, TOP_LIMIT, Top100Saved } from '../lib/libraryLayouts';
import { useTitleCards } from '../hooks/useLazyList';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, POSTER_TITLE, ratingTone } from '../lib/oracleTheme';

// Duelo do Top 100 (10/10/2026): a pessoa ordena o Top 100 em confrontos de
// 1 contra 1, quantos quiser, e pode parar a qualquer hora.
//
// Como funciona — "inserção com galope" a partir da ordem que já existe:
//   1. Ordem. O começo da lista vai sendo confirmado de cima para baixo. O
//      próximo título enfrenta o que está logo acima dele: se perde, fica
//      onde está (1 duelo só — o normal quando a ordem já é boa); se ganha,
//      sobe enfrentando títulos cada vez mais acima (2, 4, 8 posições...) até
//      perder, e aí uma busca binária acha o lugar exato. Cada título custa
//      ~1 duelo se já estava no lugar e ~log₂(distância) se precisa subir.
//      Ordenar 100 títulos do zero levaria ~530 duelos; partindo de uma
//      ordem razoável, bem menos (a tela mostra uma estimativa).
//   2. Desafiantes. Com a ordem confirmada e o Top 100 cheio, os avaliados de
//      fora (nota igual ou maior que a do último) desafiam o nº 100: quem
//      perde fica de fora; quem ganha sobe até o seu lugar e empurra o
//      último para fora.
// "Empate" conta como derrota de quem está subindo (fica onde está).
// Tudo o que é decidido é salvo na hora (ordem, o começo confirmado, os
// desafiantes que perderam e o número de duelos) — dá pra fechar e continuar
// depois do mesmo ponto. Mexer na ordem à mão desconfirma só dali pra baixo.

interface Top100DuelProps {
  entries: RatedTitle[];
  // avaliados fora do Top 100, da maior nota para a menor
  outside: RatedTitle[];
  saved: Top100Saved | null;
  onSave: (next: Top100Saved) => Promise<void>;
  onClose: () => void;
}

type Phase = 'order' | 'challenge' | 'done';

interface DuelState {
  list: RatedTitle[];
  // quantos do começo da lista já estão confirmados (fase de ordem)
  k: number;
  phase: Phase;
  // desafiantes que faltam (fase de desafiantes)
  queue: RatedTitle[];
  queueTotal: number;
  rejected: string[];
  count: number;
  // busca do lugar do título da vez: galope (testa m − 2^exp) ou binária
  search: { mode: 'gallop'; upper: number; exp: number } | { mode: 'binary'; lo: number; hi: number };
}

const keys = (list: RatedTitle[]) => list.map(titleKey);

// Desafiantes elegíveis: fora do Top, não tirados, não derrotados, com nota
// igual ou maior que a do último do Top.
function challengersFor(list: RatedTitle[], outside: RatedTitle[], rejected: string[], excluded: string[]): RatedTitle[] {
  if (list.length < TOP_LIMIT) return [];
  const inTop = new Set(keys(list));
  const out = new Set([...rejected, ...excluded]);
  const floor = list[list.length - 1]?.userRating ?? 0;
  return outside.filter((title) => !inTop.has(titleKey(title)) && !out.has(titleKey(title)) && title.userRating >= floor);
}

function startSearch(state: Omit<DuelState, 'search'>): DuelState {
  const m = state.phase === 'order' ? state.k : state.list.length;
  return { ...state, search: { mode: 'gallop', upper: m, exp: 0 } };
}

// Avança para o próximo título a posicionar (ou para a próxima fase).
function advance(state: Omit<DuelState, 'search'>, outside: RatedTitle[], excluded: string[]): DuelState {
  if (state.phase === 'order' && state.k < state.list.length) return startSearch(state);
  if (state.phase === 'order') {
    const queue = challengersFor(state.list, outside, state.rejected, excluded);
    if (queue.length === 0) return { ...state, phase: 'done', queue: [], search: { mode: 'gallop', upper: 0, exp: 0 } };
    return startSearch({ ...state, phase: 'challenge', queue, queueTotal: queue.length });
  }
  if (state.phase === 'challenge') {
    // pula quem ficou abaixo da nota do último (o último pode ter mudado)
    const floor = state.list[state.list.length - 1]?.userRating ?? 0;
    const queue = state.queue.filter((title) => title.userRating >= floor);
    if (queue.length === 0) return { ...state, phase: 'done', queue: [], search: { mode: 'gallop', upper: 0, exp: 0 } };
    return startSearch({ ...state, queue });
  }
  return { ...state, search: { mode: 'gallop', upper: 0, exp: 0 } };
}

function initialState(entries: RatedTitle[], outside: RatedTitle[], saved: Top100Saved | null): DuelState {
  const base = saved || EMPTY_TOP100;
  const listKeys = keys(entries);
  let k = 0;
  while (k < base.duelSorted.length && k < listKeys.length && base.duelSorted[k] === listKeys[k]) k += 1;
  k = Math.max(k, Math.min(1, entries.length));
  return advance(
    { list: entries, k, phase: 'order', queue: [], queueTotal: 0, rejected: base.duelRejected, count: base.duelCount },
    outside,
    base.excluded
  );
}

const subjectOf = (state: DuelState): RatedTitle | null =>
  state.phase === 'order' ? state.list[state.k] ?? null : state.phase === 'challenge' ? state.queue[0] ?? null : null;

const opponentIndexOf = (state: DuelState): number => {
  const m = state.phase === 'order' ? state.k : state.list.length;
  if (state.search.mode === 'gallop') return Math.max(0, m - 2 ** state.search.exp);
  return (state.search.lo + state.search.hi) >> 1;
};

// O título da vez vai para a posição `ins` da parte já ordenada.
function place(state: DuelState, ins: number, outside: RatedTitle[], excluded: string[]): DuelState {
  const subject = subjectOf(state);
  if (!subject) return state;
  if (state.phase === 'order') {
    const list = [...state.list];
    list.splice(state.k, 1);
    list.splice(ins, 0, subject);
    return advance({ ...state, list, k: state.k + 1 }, outside, excluded);
  }
  const queue = state.queue.slice(1);
  if (ins >= state.list.length) {
    return advance({ ...state, queue, rejected: [...state.rejected, titleKey(subject)] }, outside, excluded);
  }
  const list = [...state.list];
  list.splice(ins, 0, subject);
  const rejected = [...state.rejected];
  if (list.length > TOP_LIMIT) {
    const dropped = list.pop();
    if (dropped) rejected.push(titleKey(dropped));
  }
  return advance({ ...state, list, queue, rejected }, outside, excluded);
}

// Resultado de um duelo: o título da vez ganhou (true) ou não (false/empate).
function resolve(state: DuelState, subjectWins: boolean, outside: RatedTitle[], excluded: string[]): DuelState {
  const counted = { ...state, count: state.count + 1 };
  const j = opponentIndexOf(state);
  if (state.search.mode === 'gallop') {
    if (subjectWins) {
      if (j === 0) return place(counted, 0, outside, excluded);
      return { ...counted, search: { mode: 'gallop', upper: j, exp: state.search.exp + 1 } };
    }
    const lo = j + 1;
    const hi = state.search.upper;
    if (lo >= hi) return place(counted, hi, outside, excluded);
    return { ...counted, search: { mode: 'binary', lo, hi } };
  }
  const lo = subjectWins ? state.search.lo : j + 1;
  const hi = subjectWins ? j : state.search.hi;
  if (lo >= hi) return place(counted, lo, outside, excluded);
  return { ...counted, search: { mode: 'binary', lo, hi } };
}

// Estimativa de duelos que faltam: ~1,3 por título ainda não confirmado
// (a maioria só confirma o lugar) mais 1 por desafiante.
function remainingEstimate(state: DuelState, outside: RatedTitle[], excluded: string[]): number {
  if (state.phase === 'done') return 0;
  if (state.phase === 'challenge') return state.queue.length;
  const left = state.list.length - state.k;
  const challengers = challengersFor(state.list, outside, state.rejected, excluded).length;
  return Math.max(1, Math.round(left * 1.3) + challengers);
}

const Top100Duel: React.FC<Top100DuelProps> = ({ entries, outside, saved, onSave, onClose }) => {
  const { t } = useTranslation();
  const excluded = useMemo(() => saved?.excluded || [], [saved]);
  const [state, setState] = useState<DuelState>(() => initialState(entries, outside, saved));
  const [history, setHistory] = useState<DuelState[]>([]);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const savedKeyRef = useRef<string>('');

  // Salva o que mudou (em fila, uma gravação por vez).
  const persist = useCallback(
    (next: DuelState) => {
      const base = saved || EMPTY_TOP100;
      const payload: Top100Saved = {
        ...base,
        items: keys(next.list),
        duelSorted: next.phase === 'order' ? keys(next.list.slice(0, next.k)) : keys(next.list),
        duelRejected: next.rejected,
        duelCount: next.count,
      };
      const signature = JSON.stringify([payload.items, payload.duelSorted, payload.duelRejected, payload.duelCount]);
      if (signature === savedKeyRef.current) return;
      savedKeyRef.current = signature;
      saveChain.current = saveChain.current
        .then(() => onSave(payload))
        .catch((error) => {
          console.error('Error saving duel progress:', error);
          savedKeyRef.current = '';
          toast.error(t('common.error'));
        });
    },
    [saved, onSave, t]
  );

  const subject = subjectOf(state);
  const opponentIndex = opponentIndexOf(state);
  const opponent = state.phase === 'done' ? null : state.list[opponentIndex] ?? null;

  // Lado de cada um muda de duelo para duelo (sem favorecer a esquerda).
  const subjectOnLeft = (state.count * 7 + (subject?.id ?? 0)) % 2 === 0;
  const pair = subject && opponent ? (subjectOnLeft ? [subject, opponent] : [opponent, subject]) : [];

  // Cartões do par e dos próximos (pra trocar sem esperar).
  const upcoming = useMemo(() => {
    const next = state.phase === 'order' ? state.list.slice(state.k + 1, state.k + 4) : state.queue.slice(1, 4);
    return [...pair, ...next];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, subject, opponent]);
  const cardOf = useTitleCards(upcoming, upcoming.length, { ahead: 0 });

  const choose = useCallback(
    (winner: RatedTitle | null) => {
      if (!subject || !opponent) return;
      const subjectWins = winner !== null && titleKey(winner) === titleKey(subject);
      setHistory((prev) => [...prev.slice(-60), state]);
      const next = resolve(state, subjectWins, outside, excluded);
      setState(next);
      if (next.k !== state.k || next.phase !== state.phase || next.queue.length !== state.queue.length) persist(next);
    },
    [subject, opponent, state, outside, excluded, persist]
  );

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((prev) => prev.slice(0, -1));
    setState(previous);
    persist(previous);
  };

  const restart = () => {
    setHistory([]);
    const fresh = advance(
      { list: state.list, k: Math.min(1, state.list.length), phase: 'order', queue: [], queueTotal: 0, rejected: [], count: state.count },
      outside,
      excluded
    );
    setState(fresh);
    persist(fresh);
  };

  const close = () => {
    persist(state);
    onClose();
  };

  // Setas do teclado escolhem o da esquerda / da direita.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pair.length !== 2) return;
      if (e.key === 'ArrowLeft') choose(pair[0]);
      if (e.key === 'ArrowRight') choose(pair[1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pair, choose]);

  const total = state.list.length;
  const progress =
    state.phase === 'order'
      ? total > 0 ? state.k / total : 1
      : state.phase === 'challenge'
        ? state.queueTotal > 0 ? (state.queueTotal - state.queue.length) / state.queueTotal : 1
        : 1;
  const remaining = remainingEstimate(state, outside, excluded);

  const positionLabel = (title: RatedTitle) => {
    if (state.phase === 'challenge' && subject && titleKey(title) === titleKey(subject)) return t('library.duelChallenger');
    const index = state.list.findIndex((item) => titleKey(item) === titleKey(title));
    return index >= 0 ? `#${index + 1}` : '';
  };

  const ghostButton = `inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition disabled:opacity-40 ${FOCUS_RING}`;

  return (
    <OracleSheet
      open={true}
      onClose={close}
      title={t('library.duelTitle')}
      subtitle={t('library.duelCount', { count: state.count })}
      leading={
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-xl bg-pink-500/15 ring-1 ring-pink-400/30">
          <Swords className="w-5 h-5 text-pink-300" aria-hidden />
        </span>
      }
      size="lg"
    >
      {/* Andamento */}
      <div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span style={{ color: PAPER }}>
            {state.phase === 'order'
              ? t('library.duelPhaseOrder', { done: state.k, total })
              : state.phase === 'challenge'
                ? t('library.duelPhaseChallenge', { done: state.queueTotal - state.queue.length, total: state.queueTotal })
                : t('library.duelPhaseDone')}
          </span>
          {state.phase !== 'done' && (
            <span className="shrink-0 text-xs tabular-nums" style={{ color: MIST }}>
              {t('library.duelRemaining', { count: remaining })}
            </span>
          )}
        </div>
        <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span
            className="block h-full rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {state.phase === 'done' || !subject || !opponent ? (
        <div className="text-center py-10">
          <span className="mx-auto grid place-items-center w-16 h-16 rounded-2xl bg-amber-400/15 ring-1 ring-amber-300/30">
            <Trophy className="w-8 h-8 text-amber-300" aria-hidden />
          </span>
          <h3 style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl leading-tight">
            {t('library.duelDoneTitle')}
          </h3>
          <p className="mt-2 mx-auto max-w-sm text-sm" style={{ color: MIST }}>
            {t('library.duelDoneText', { count: state.count })}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <button onClick={restart} className={ghostButton} style={{ color: PAPER }}>
              <RotateCcw className="w-4 h-4 text-violet-300" aria-hidden />
              {t('library.duelRestart')}
            </button>
            <button
              onClick={close}
              className={`inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-600 hover:brightness-110 text-white text-sm font-semibold transition ${FOCUS_RING}`}
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <p style={{ ...PIXEL, color: PAPER }} className="text-center text-xl leading-tight">
            {state.phase === 'challenge' ? t('library.duelQuestionChallenge') : t('library.duelQuestion')}
          </p>

          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:gap-5">
            <AnimatePresence mode="popLayout" initial={false}>
              {pair.map((title, idx) => {
                const card = cardOf(title);
                const tone = ratingTone(title.userRating);
                return (
                  <motion.div
                    key={`${state.count}-${titleKey(title)}`}
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.24, delay: idx * 0.05 }}
                    className="min-w-0"
                  >
                    <button
                      onClick={() => choose(title)}
                      aria-label={t('library.duelPick', { title: card?.title || '' })}
                      className={`group block w-full text-left rounded-2xl ${FOCUS_RING}`}
                    >
                      <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-2xl ring-1 ring-white/10 shadow-xl transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98]" style={{ background: VELVET }}>
                        {card?.poster_path ? (
                          <img src={`https://image.tmdb.org/t/p/w500${card.poster_path}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
                        ) : card ? (
                          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center" style={{ color: MIST }}>
                            <Film className="w-8 h-8" aria-hidden />
                            <span className="text-sm leading-snug" style={{ color: PAPER }}>{card.title || t('library.unavailableTitle')}</span>
                          </span>
                        ) : (
                          <span className="absolute inset-0 poster-skeleton" />
                        )}
                        <span
                          className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs ring-1 ring-white/15"
                          style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: PAPER }}
                        >
                          {positionLabel(title)}
                        </span>
                        <span
                          className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-xs ring-1"
                          style={{ ...PIXEL, background: 'rgba(18,13,34,0.86)', color: tone.color, '--tw-ring-color': tone.ring } as React.CSSProperties}
                          title={t('home.desk.yourRating')}
                        >
                          {title.userRating}
                        </span>
                      </span>
                      <span className={`mt-2.5 text-sm font-semibold ${POSTER_TITLE}`} style={{ color: PAPER }}>
                        {card?.title || '…'}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: MIST }}>
                        {title.media_type === 'tv' && <Tv className="w-3 h-3 text-sky-300" aria-label={t('mobileSearch.series')} />}
                        {(card?.release_date || '').slice(0, 4)}
                      </span>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <span
              aria-hidden
              className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 grid place-items-center w-11 h-11 rounded-full ring-2 ring-pink-400/50 text-sm pointer-events-none"
              style={{ ...PIXEL, background: NIGHT, color: PAPER }}
            >
              vs
            </span>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2">
            <button onClick={undo} disabled={history.length === 0} className={`${ghostButton} !px-2`} style={{ color: PAPER }}>
              <Undo2 className="w-4 h-4 text-violet-300" aria-hidden />
              <span className="truncate">{t('library.duelUndo')}</span>
            </button>
            <button onClick={() => choose(null)} className={`${ghostButton} !px-2`} style={{ color: PAPER }} title={t('library.duelTieHint')}>
              <Scale className="w-4 h-4 text-amber-300" aria-hidden />
              <span className="truncate">{t('library.duelTie')}</span>
            </button>
            <button onClick={close} className={`${ghostButton} !px-2`} style={{ color: PAPER }}>
              <Flag className="w-4 h-4 text-pink-300" aria-hidden />
              <span className="truncate">{t('library.duelStop')}</span>
            </button>
          </div>
          <p className="mt-4 text-center text-xs leading-snug" style={{ color: MIST }}>
            {t('library.duelHint')}
          </p>
        </div>
      )}
    </OracleSheet>
  );
};

export default Top100Duel;
