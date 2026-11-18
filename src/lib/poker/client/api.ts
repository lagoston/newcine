/**
 * Qual API a mesa usa: a real, do `src/lib/pokerApi.ts`.
 *
 * 18/11/2026 (otimização): antes este arquivo importava o `mockApi` sempre, só
 * como reserva (`real ?? mockApi`). Com isso o mock, o `mockFriends` e o motor
 * do pôquer (≈150 KB) entravam no pacote da home pela porta do pôquer
 * (StudioDoor → usePokerDoor → usePokerHome → aqui), mesmo sem ninguém jogar.
 * Agora a produção usa só a API real (o pedaço "pokerMeta" da home caiu de
 * 161 KB para 8 KB, medido).
 *
 * Para jogar sem servidor numa prévia (o antigo VITE_POKER_PREVIEW=1): no
 * vite.config da prévia, troque este arquivo por um que exporte o mock —
 * `export { mockApi as pokerApi } from './mockApi.ts'; export const usingMockApi = true;`
 * — com o mesmo plugin `resolveId` dos stubs do Supabase.
 */
import type { PokerApiLike } from './apiTypes.ts';
import { pokerApi as realPokerApi } from '../../pokerApi.ts';

// Os tipos do pokerApi.ts e do apiTypes.ts andaram um pouco separados (ex.:
// prize.article_pt); o código antigo já convertia com `as PokerApiLike`.
export const pokerApi: PokerApiLike = realPokerApi as unknown as PokerApiLike;
export const usingMockApi = false;
