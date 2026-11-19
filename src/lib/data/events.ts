// Evento → o que deixa de valer (18/11/2026, Protocolo Reborn, onda 2a).
//
// É o mapa 4.2 do relatório de rede: "o que muda quando alguém dá nota" escrito
// NUM LUGAR SÓ. Quem muda algo avisa no barramento (src/lib/bus.ts:
// emit('title:rated', …)); este arquivo escuta e marca como vencidas as
// consultas que dependiam daquilo. Acaba a classe de erro "esqueci de
// invalidar a biblioteca" (achado A12: 6 telas invalidavam, outras 6 não).
//
// 'now'   = quem está com aquilo na tela pede de novo já;
// 'later' = só marca como vencido: refaz quando alguém usar de novo, ou na
//           próxima troca de página/volta ao app. É o padrão para o que não
//           está à vista de quem acabou de agir (dar 10 notas seguidas na
//           Biblioteca não dispara 10 leituras do evento sazonal).
//
// Os avisos antigos de window ('cineoracle:jackpot-chips', 'episodeToggled'…)
// também chegam aqui: o barramento faz a ponte.
import { on, type BusEvent, type BusEvents } from '../bus';
import { invalidate } from './client';
import type { QueryKey } from './keys';

type Rule = [key: QueryKey, when: 'now' | 'later'];

// As chaves são prefixos (sem o id da pessoa no fim): ['jackpot','state'] pega
// ['jackpot','state',<quem está logado>].
const RULES: { [E in BusEvent]: (payload: BusEvents[E]) => Rule[] } = {
  'title:rated': (e) => [
    [['library'], 'now'],
    [['profile', 'stats'], 'later'],
    [['title', 'me', e.mediaType, e.id], 'now'],
    [['title', 'social', e.mediaType, e.id], 'later'],
    [['seasonal'], 'later'],
    [['jackpot', 'state'], 'later'],
    [['persona', 'world'], 'later'],
    [['forYou'], 'later'],
    [['tags'], 'later'],
  ],
  'title:watchlist': (e) => [
    [['library'], 'now'],
    [['title', 'me', e.mediaType, e.id], 'now'],
    [['jackpot', 'state'], 'later'],
  ],
  'title:episodes': (e) => [
    [typeof e?.id === 'number' ? ['tvProgress', e.id] : ['tvProgress'], 'now'],
    [['profile', 'stats'], 'later'],
  ],
  'profile:updated': () => [[['me', 'profile'], 'now']],
  'friendship:changed': () => [
    [['me', 'friendIds'], 'now'],
    [['feed'], 'later'],
    [['title', 'social'], 'later'],
  ],
  // ficha voadora, presente, missão: o saldo na porta do Jackpot atualiza já
  'jackpot:chips': () => [[['jackpot', 'state'], 'now']],
  // giro, troca, contrato: a tela que girou já corrige o saldo com a resposta
  // do giro; o resto (o que falta, as missões) refaz na próxima vez
  'posters:changed': () => [
    [['jackpot', 'state'], 'later'],
    [['jackpot', 'mine'], 'now'],
    [['equipped'], 'now'],
  ],
  'seasonal:stale': () => [[['seasonal'], 'now']],
};

let started = false;
export function startDataEvents(): void {
  if (started) return;
  started = true;
  (Object.keys(RULES) as BusEvent[]).forEach((event) => {
    on(event, (payload) => {
      const rules = (RULES[event] as (payload: unknown) => Rule[])(payload);
      rules.forEach(([key, when]) => void invalidate(key, when));
    });
  });
}
