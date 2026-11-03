/**
 * O "equipamento" de qualquer mesa (livre, prêmio, treino): ajustes, Diretor de
 * falas, o projetor (`useTable`) e o Worker de contas. Cada modo pendura o seu
 * controlador em cima disto.
 */
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { MatchMode, PublicEvent } from '../types.ts';
import type { TableShow } from './display.ts';
import { langOf, type Lang } from './format.ts';
import { MatchClient } from './matchClient.ts';
import { getPokerSettings, usePokerSettings, type PokerSettingsLocal } from './settings.ts';
import { matchInSession } from './session.ts';
import { useDirector, type TableContext, type UseDirector } from './useDirector.ts';
import { useTable, type UseTable } from './useTable.ts';

export type CtxExtras = Partial<Omit<TableContext, 'view' | 'mode' | 'lang' | 'speed' | 'talk' | 'reducedMotion'>>;

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
}

export function useRig(mode: MatchMode, opts: { story?: Record<string, string>; lifetimeMatches?: number } = {}): Rig {
  const { t, i18n } = useTranslation();
  const lang = langOf(i18n.language);
  const settings = usePokerSettings();
  const reduced = !!useReducedMotion();
  const extras = useRef<CtxExtras>({});
  const afterEvent = useRef<((e: PublicEvent, t: TableShow) => void | Promise<void>) | null>(null);
  const beforeTurn = useRef<((t: TableShow) => void | Promise<void>) | null>(null);
  const [client] = useState(() => new MatchClient());
  useEffect(() => () => client.dispose(), [client]);

  const s0 = getPokerSettings();
  const dir = useDirector({
    mode,
    lang,
    talk: s0.talk,
    speed: s0.speed,
    story: opts.story ?? {},
    lifetimeMatches: opts.lifetimeMatches ?? 0,
    matchInSession: matchInSession(),
    reducedMotion: reduced,
  });

  const tableRef = useRef<UseTable | null>(null);
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
      if (!view) return null;
      const s = getPokerSettings();
      const x = extras.current;
      return {
        mode,
        lang,
        title: x.title ?? 'figurante',
        lifetimeMatches: x.lifetimeMatches ?? opts.lifetimeMatches ?? 0,
        matchInSession: x.matchInSession ?? matchInSession(),
        returning: x.returning ?? false,
        localHour: new Date().getHours(),
        nemesis: x.nemesis,
        customer: x.customer,
        memory: x.memory,
        prize: x.prize,
        story: x.story ?? opts.story ?? {},
        speed: s.speed,
        talk: s.talk,
        view,
        reducedMotion: reduced,
      };
    },
  });
  tableRef.current = table;

  return { mode, lang, t, settings, reduced, dir, table, client, extras, afterEvent, beforeTurn };
}
