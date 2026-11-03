/**
 * Orçamento de falas (SPEC §6.3). Números da v1; o teste `test-dialogue` mede o resultado
 * (18 a 22 balões por partida de ~35 mãos, ≥ 40% das mãos em silêncio, ≤ 1 momento não-P1
 * por mão, meia-carga ≥ 35% abaixo).
 *
 * O momento é reservado quando entra na fila e devolvido se cair da fila sem tocar; assim
 * "um momento por mão" vale de forma exata.
 */
export const BUDGET = {
  balloonsMax: 22,             // balões não-P1 por partida
  // 03/11/2026: o §6.3 dava refill 0,55; medido no fuzz, isso dava ~29 balões em 35 mãos.
  // 0,28 põe a média na meta de 18–22 (P1 incluído).
  tokensStart: 2, tokensMax: 3, refillPerHand: 0.28,   // P2 e P3 custam 1; uma troca custa 2
  momentsPerHand: 1,           // uma fala ou uma troca (≤ 3 balões); um P1 substitui o que estiver na fila
  silentShareMin: 0.40,        // momento não-P1 na mão h só se (mãosComMomento + 1) ≤ 0,6·h + 1
  globalGapMs: 3500, speakerGapMs: 9000,               // entre inícios de balões; trocas livres do gap por personagem
  halfFromConsecutiveMatch: 3, // da 3ª partida seguida em diante: refill e fichas iniciais × 0,5; só P1 e trocas inéditas furam
  queueMax: 2,                 // itens não-P1 esperando
  waitMs: 4000,                // um balão não-P1 que espera mais que isso cai
  waitP1Ms: 20000,             // P1 espera mais (abertura, eliminações enquanto a próxima mão é dada)
};

export class Budget {
  tokens = BUDGET.tokensStart;
  balloons = 0;                       // balões não-P1 já reservados
  private p1Hands = new Set<number>();
  private nonP1Hands = new Set<number>();
  private half: boolean;
  private lastRefillHand = 0;

  constructor(half: boolean) {
    this.half = half;
    // meia-carga também começa com metade das fichas, senão partidas curtas nem sentem
    if (half) this.tokens = BUDGET.tokensStart * 0.5;
  }

  get halfMode(): boolean {
    return this.half;
  }

  /** Começo da mão h: repõe as fichas do orçamento. */
  onHand(h: number): void {
    if (h <= this.lastRefillHand) return;
    const hands = this.lastRefillHand === 0 ? Math.max(0, h - 1) : h - this.lastRefillHand;
    this.lastRefillHand = h;
    const refill = BUDGET.refillPerHand * (this.half ? 0.5 : 1);
    this.tokens = Math.min(BUDGET.tokensMax, this.tokens + refill * hands);
  }

  hadMoment(h: number): boolean {
    return this.p1Hands.has(h) || this.nonP1Hands.has(h);
  }

  /** Mãos com algum momento (P1 incluído). */
  private momentCount(): number {
    let n = this.nonP1Hands.size;
    for (const h of this.p1Hands) if (!this.nonP1Hands.has(h)) n++;
    return n;
  }

  hadNonP1(h: number): boolean {
    return this.nonP1Hands.has(h);
  }

  /** Pode reservar um momento não-P1 na mão h? `free` = troca inédita na meia-carga (não paga fichas). */
  canReserve(h: number, cost: number, balloons: number, free = false): boolean {
    if (h > 0 && this.nonP1Hands.has(h)) return false;
    const extra = this.p1Hands.has(h) ? 0 : 1;
    if (h > 0 && this.momentCount() + extra > (1 - BUDGET.silentShareMin) * h + 1) return false;
    if (this.balloons + balloons > BUDGET.balloonsMax) return false;
    if (!free && this.tokens < cost) return false;
    return true;
  }

  reserve(h: number, cost: number, balloons: number, free = false): void {
    if (!free) this.tokens -= cost;
    this.balloons += balloons;
    if (h > 0) this.nonP1Hands.add(h);
  }

  refund(h: number, cost: number, balloons: number, free = false): void {
    if (!free) this.tokens = Math.min(BUDGET.tokensMax, this.tokens + cost);
    this.balloons -= balloons;
    this.nonP1Hands.delete(h);
  }

  /** Um P1 tocou na mão h (conta para o silêncio, não gasta fichas). */
  markP1(h: number): void {
    if (h > 0) this.p1Hands.add(h);
  }
}
