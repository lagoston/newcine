/**
 * Tilt dos bots (SPEC §3.2 e §3.5) a partir SÓ de informação pública: perda de cacife
 * numa mão e blefe exposto. Por isso o início e o fim são eventos públicos (`tilt`).
 *
 * Duração: o gatilho no fim da mão h vale para as `hands` mãos seguintes; um gatilho
 * novo durante o tilt renova a contagem sem novo evento.
 */
import type { Card } from '../cards.ts';
import type { HandResult } from '../engine.ts';
import type { HandFlags, PlayerId, RivalId, TiltKind } from '../types.ts';
import type { MatchStateX } from '../match/internal.ts';
import { isAirShown } from './buckets.ts';

export interface TiltChange { playerId: RivalId; kind: TiltKind; on: boolean; targetId?: PlayerId }

function trigger(st: MatchStateX, bot: RivalId, targetId: PlayerId | undefined, out: TiltChange[]): void {
  const p = st.config.profiles[bot];
  const mem = st.bots[bot];
  if (!p || !mem || p.tilt.hands <= 0) return;
  const target = p.tilt.effect.targeted ? targetId : undefined;
  if (mem.tilt) {
    mem.tilt.handsLeft = p.tilt.hands;
    if (target) mem.tilt.targetId = target;
    return;
  }
  mem.tilt = { kind: p.tilt.kind, handsLeft: p.tilt.hands, ...(target ? { targetId: target } : {}) };
  out.push({ playerId: bot, kind: p.tilt.kind, on: true, ...(target ? { targetId: target } : {}) });
}

/** Fim de mão: conta as mãos do tilt ativo e confere os gatilhos. Altera `st.bots`. */
export function endOfHandTilt(st: MatchStateX, result: HandResult, flags: HandFlags, potTotal: number, bb: number): TiltChange[] {
  const out: TiltChange[] = [];
  const g = st.game;
  for (const id of Object.keys(st.bots)) {
    const mem = st.bots[id];
    const alive = g.players.some((q) => q.id === id && q.status !== 'eliminated');
    if (!mem.tilt) continue;
    if (!alive) {
      mem.tilt = null;
      continue;
    }
    mem.tilt.handsLeft -= 1;
    if (mem.tilt.handsLeft <= 0) {
      out.push({ playerId: id, kind: mem.tilt.kind, on: false, ...(mem.tilt.targetId ? { targetId: mem.tilt.targetId } : {}) });
      mem.tilt = null;
    }
  }
  const folders = new Set(result.actions.filter((a) => a.type === 'fold').map((a) => a.playerId));
  for (const id of Object.keys(st.bots)) {
    const alive = g.players.some((q) => q.id === id && q.status !== 'eliminated');
    if (!alive || result.startStacks[id] === undefined) continue;
    const prof = st.config.profiles[id];
    if (!prof) continue;
    const trig = prof.tilt.trigger;
    const loss = -(result.net[id] ?? 0);
    const carrier = st.holderId === id && st.capturedHand === null && st.config.prize !== null;
    const share = carrier && prof.bounty.carrier.tiltLostStackShare !== null ? prof.bounty.carrier.tiltLostStackShare : trig.lostStackShare;
    let fire = false;
    let target: PlayerId | undefined;
    if (trig.lostPotBB !== null && !result.winnerIds.includes(id) && potTotal >= trig.lostPotBB * bb && loss >= 5 * bb) fire = true;
    if (share !== null && loss > 0 && loss >= share * result.startStacks[id]) fire = true;
    if (trig.ownBluffExposed && flags.bluffCaught?.blufferId === id) fire = true;
    if (trig.bluffedByShown && flags.bluffShown && flags.bluffShown.playerId !== id && folders.has(id)) {
      fire = true;
      target = flags.bluffShown.playerId;
    }
    if (fire) trigger(st, id, target, out);
  }
  return out;
}

/** A pessoa mostrou as cartas depois de levar sem showdown: blefe exposto contra quem largou. */
export function tiltOnHumanShow(st: MatchStateX, result: HandResult, cards: Card[], who: PlayerId = 'human'): TiltChange[] {
  const out: TiltChange[] = [];
  const lastAggr = [...result.actions].reverse().find((a) => a.type === 'bet' || a.type === 'raise')?.playerId;
  if (lastAggr !== who || !isAirShown(cards, result.board)) return out;
  const folders = new Set(result.actions.filter((a) => a.type === 'fold').map((a) => a.playerId));
  for (const id of Object.keys(st.bots)) {
    const prof = st.config.profiles[id];
    const alive = st.game.players.some((q) => q.id === id && q.status !== 'eliminated');
    if (alive && prof?.tilt.trigger.bluffedByShown && folders.has(id)) trigger(st, id, who, out);
  }
  return out;
}
