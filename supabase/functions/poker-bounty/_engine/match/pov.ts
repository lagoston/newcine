// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/pov.ts
/**
 * Pacote E3 (03/11/2026): ponto de vista de cada aparelho na mesa de amigos.
 *
 * A interface e o Diretor tratam "eu" como 'human'. Na mesa de amigos as pessoas se chamam
 * p1..p4 (nenhuma é 'human'), então o remapeamento é só trocar o id de quem vê por 'human'
 * (os outros ficam como estão) e girar os números de lugar para "eu" ficar no lugar 0
 * (1 = à esquerda, 2 = em frente, 3 = à direita), como na mesa de uma pessoa.
 *
 * Só serve para o que JÁ é público para quem vê (saída de toPublicEvents/tableView com o
 * mesmo `viewer`): não revela nada a mais.
 */
import type { MatchEvent, MatchState, PlayerId, PublicEvent, TableView } from '../types.ts';
import { toPublicEvents } from './publicEvents.ts';
import { tableView } from './tableView.ts';

/** A mesa tem sempre 4 lugares (0..3). */
const TABLE_SEATS = 4;
const SELF = 'human';

/** Troca `viewer` por 'human' em todos os valores e chaves (cópia profunda). */
function rename<T>(value: T, viewer: string): T {
  if (typeof value === 'string') return (value === viewer ? SELF : value) as T;
  if (Array.isArray(value)) return value.map((v) => rename(v, viewer)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k === viewer ? SELF : k] = rename(v, viewer);
    return out as T;
  }
  return value;
}

const turn = (seat: number, mine: number): number => (((seat - mine) % TABLE_SEATS) + TABLE_SEATS) % TABLE_SEATS;

/** Eventos públicos de `viewer` (já filtrados por toPublicEvents) com "eu" = 'human'. */
export function povEvents(events: readonly PublicEvent[], viewer: PlayerId, viewerSeat: number): PublicEvent[] {
  if (viewer === SELF) return events.map((e) => JSON.parse(JSON.stringify(e)) as PublicEvent);
  return events.map((e) => {
    const r = rename(e, viewer);
    if (r.t === 'matchStarted') r.seats = r.seats.map((sx) => ({ ...sx, seat: turn(sx.seat, viewerSeat) }));
    return r;
  });
}

/** Visão de `viewer` (tableView com o mesmo viewer) com "eu" = 'human' e os lugares girados. */
export function povView(view: TableView, viewer: PlayerId): TableView {
  if (viewer === SELF) return JSON.parse(JSON.stringify(view)) as TableView;
  const mine = view.seats.find((sx) => sx.id === viewer)?.seat ?? 0;
  const r = rename(view, viewer);
  r.seats = r.seats.map((sx) => ({ ...sx, seat: turn(sx.seat, mine) }));
  return r;
}

/** Atalho: eventos privados de um passo + estado → o que o aparelho de `viewer` recebe, já com "eu" = 'human'. */
export function friendsPayload(s: MatchState, events: MatchEvent[], viewer: PlayerId): { events: PublicEvent[]; view: TableView } {
  const seat = s.config.seats[viewer] ?? 0;
  return {
    events: povEvents(toPublicEvents(events, viewer), viewer, seat),
    view: povView(tableView(s, viewer), viewer),
  };
}
