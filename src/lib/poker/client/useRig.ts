/**
 * O "equipamento" de qualquer mesa (livre, prêmio, treino): ajustes, Diretor de
 * falas, o projetor (`useTable`) e o Worker de contas. Cada modo pendura o seu
 * controlador em cima disto.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MatchMode, PublicEvent, TableView } from '../types.ts';
import type { PokerHome } from './apiTypes.ts';
import { pokerApi } from './api.ts';
import type { TableShow } from './display.ts';
import { langOf, type Lang } from './format.ts';
import { MatchClient } from './matchClient.ts';
import { getPokerSettings, usePokerSettings, type PokerSettingsLocal } from './settings.ts';
import { matchInSession } from './session.ts';
import { useDirector, type DirectorOptions, type RecapInfo, type SpeechItem, type TableContext, type UseDirector } from './useDirector.ts';
import { useTable, type UseTable } from './useTable.ts';

export type CtxExtras = Partial<Omit<TableContext, 'view' | 'mode' | 'lang' | 'speed' | 'talk' | 'reducedMotion'>> & { quipPack?: string };

export interface Rig {
  mode: MatchMode;
  lang: Lang;
  t: TFunction;
  settings: PokerSettingsLocal;
  reduced: boolean;
  dir: UseDirector;
  table: UseTable;
  client: MatchClient;
  /** Completa o contexto do Diretor (título, história, prêmio…), lido a cada evento. */
  extras: React.MutableRefObject<CtxExtras>;
  /** Gancho depois de cada evento projetado (o treino espera "Continuar" aqui). */
  afterEvent: React.MutableRefObject<((e: PublicEvent, t: TableShow) => void | Promise<void>) | null>;
  beforeTurn: React.MutableRefObject<((t: TableShow) => void | Promise<void>) | null>;
  /** Diretor novo antes de dar as cartas (o do pacote B é um por partida). */
  newMatch: (patch?: Partial<DirectorOptions>) => Promise<void>;
  /** Manda ao servidor as chaves de história tocadas (poker_mark_story), uma vez cada. */
  flushStory: () => void;
  /** Fala de cartão ("Anteriormente em…", convite do Intervalo), fora do orçamento. */
  cardLine: (kind: 'recap' | 'intervalInvite', info?: RecapInfo) => SpeechItem | null;
}

// Mesa vazia para o contexto do Diretor antes da primeira `view` (Intervalo).
const blankView = (mode: MatchMode): TableView => ({
  mode, handNumber: 0, level: { index: 0, sb: 25, bb: 50, ante: 0, handsLeft: 5, next: null }, status: 'running',
  seats: [], board: [], pots: [], potTotal: 0, toActId: null, legal: null, prize: null, loan: 0, places: {},
});

export function useRig(mode: MatchMode, home: PokerHome | null): Rig {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const settings = usePokerSettings();
  const reduced = !!useReducedMotion();
  const extras = useRef<CtxExtras>({});
  const afterEvent = useRef<((e: PublicEvent, t: TableShow) => void | Promise<void>) | null>(null);
  const beforeTurn = useRef<((t: TableShow) => void | Promise<void>) | null>(null);
  const [client] = useState(() => new MatchClient());
  useEffect(() => () => client.dispose(), [client]);

  // O lobby chega (e é relido) pelo Blefe: título, Réplicas equipadas e partidas da
  // vida vêm dele; a história soma o que o servidor tem com o que já foi tocado aqui.
  const x = extras.current;
  x.title = home?.title?.id ?? x.title;
  x.lifetimeMatches = home?.player?.lifetime_matches ?? x.lifetimeMatches;
  x.quipPack = home?.loadout?.quips ?? x.quipPack;
  x.story = { ...(home?.player?.story ?? {}), ...(x.story ?? {}) };

  const tableRef = useRef<UseTable | null>(null);
  const s0 = getPokerSettings();
  const dir = useDirector({
    mode,
    lang,
    talk: s0.talk,
    speed: s0.speed,
    story: x.story ?? {},
    lifetimeMatches: x.lifetimeMatches ?? 0,
    matchInSession: matchInSession(),
    reducedMotion: reduced,
    quipPack: x.quipPack,
    // Cada balão também vai para o Roteiro da mesa (leitura depois, e o leitor de tela).
    onSpeech: (item) =>
      tableRef.current?.addLog(item.text, item.speaker === 'human' ? t('poker.table.you') : t(`poker.oracles.${item.speaker}.short`, { defaultValue: item.speaker })),
  });

  const ctxFor = (view: TableView | null): TableContext => {
    const s = getPokerSettings();
    const e = extras.current;
    return {
      mode,
      lang,
      title: e.title ?? 'figurante',
      lifetimeMatches: e.lifetimeMatches ?? 0,
      matchInSession: e.matchInSession ?? matchInSession(),
      returning: e.returning ?? false,
      localHour: new Date().getHours(),
      nemesis: e.nemesis,
      customer: e.customer,
      memory: e.memory,
      prize: e.prize,
      story: e.story ?? {},
      speed: s.speed,
      talk: s.talk,
      view: view ?? blankView(mode),
      reducedMotion: reduced,
      tournament: e.tournament,
    };
  };
  const table = useTable({
    mode,
    director: dir.director,
    compute: client,
    t,
    lang,
    afterEvent: (e, tb) => afterEvent.current?.(e, tb),
    beforeTurn: (tb) => beforeTurn.current?.(tb),
    ctx: () => {
      const view = tableRef.current?.getView();
      return view ? ctxFor(view) : null;
    },
  });
  tableRef.current = table;

  const sent = useRef(new Set<string>());
  const flushStory = useCallback(() => {
    let keys: string[] = [];
    try {
      keys = dir.director.storyTouched().filter((k) => !sent.current.has(k));
    } catch {
      keys = [];
    }
    if (!keys.length) return;
    keys.forEach((k) => sent.current.add(k));
    const at = new Date().toISOString();
    extras.current.story = { ...(extras.current.story ?? {}), ...Object.fromEntries(keys.map((k) => [k, at])) };
    pokerApi.markStory(keys).catch(() => keys.forEach((k) => sent.current.delete(k)));
  }, [dir.director]);

  const newMatch = useCallback(
    async (patch: Partial<DirectorOptions> = {}) => {
      // O que o Diretor da partida anterior tocou vale para o próximo (ex.: first_visit).
      flushStory();
      const s = getPokerSettings();
      const e = extras.current;
      e.matchInSession = matchInSession();
      await dir.reset({
        lang,
        talk: s.talk,
        speed: s.speed,
        story: e.story ?? {},
        lifetimeMatches: e.lifetimeMatches ?? 0,
        matchInSession: e.matchInSession,
        reducedMotion: reduced,
        quipPack: e.quipPack,
        afterInterval: false,
        ...patch,
      });
    },
    [dir, flushStory, lang, reduced],
  );

  // Saiu no meio da partida: as chaves tocadas também vão.
  const flushRef = useRef(flushStory);
  flushRef.current = flushStory;
  useEffect(() => () => flushRef.current(), []);

  const cardLine = (kind: 'recap' | 'intervalInvite', info?: RecapInfo): SpeechItem | null => {
    try {
      return dir.director.cardLine?.(kind, ctxFor(tableRef.current?.getView() ?? null), info) ?? null;
    } catch {
      return null;
    }
  };

  return { mode, lang, t, settings, reduced, dir, table, client, extras, afterEvent, beforeTurn, newMatch, flushStory, cardLine };
}
