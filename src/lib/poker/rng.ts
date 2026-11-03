/**
 * Gerador pseudoaleatório determinístico com semente (sfc32).
 *
 * Por que não Math.random(): o servidor precisa reproduzir exatamente o mesmo
 * baralho a partir do estado salvo (auditoria, retomada depois de cair a conexão,
 * testes). O estado do gerador é só uma tupla de 4 inteiros sem sinal de 32 bits,
 * que cabe direto no jsonb do estado da mesa.
 *
 * Atenção: sfc32 é rápido e estatisticamente bom, mas NÃO é criptográfico.
 * Em produção, a semente deve vir de crypto.getRandomValues() no servidor e
 * nunca ser enviada ao cliente (quem conhece o estado prevê o baralho).
 */

/** Estado serializável do gerador: [a, b, c, d], inteiros 0..2^32-1. */
export type RngState = [number, number, number, number];

export interface Rng {
  /** Inteiro uniforme em [0, 2^32). */
  nextUint32(): number;
  /** Real uniforme em [0, 1). */
  nextFloat(): number;
  /** Inteiro uniforme em [0, max). `max` precisa ser inteiro entre 1 e 2^32. */
  nextInt(max: number): number;
  /** Embaralha o array no lugar (Fisher–Yates) e devolve o mesmo array. */
  shuffle<T>(items: T[]): T[];
  /** Cópia do estado atual, para salvar e retomar com `rngFromState`. */
  getState(): RngState;
}

const TWO_POW_32 = 4294967296;

/**
 * cyrb128: espalha uma string em 128 bits. Sementes parecidas ("mesa-1",
 * "mesa-2") viram estados completamente diferentes.
 */
export function hashSeed(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Recria o gerador exatamente no ponto em que `state` foi salvo. */
export function rngFromState(state: Readonly<RngState>): Rng {
  if (!Array.isArray(state) || state.length !== 4) {
    throw new TypeError('Estado de RNG inválido: esperado array com 4 inteiros.');
  }
  let a = state[0] >>> 0;
  let b = state[1] >>> 0;
  let c = state[2] >>> 0;
  let d = state[3] >>> 0;
  // Estado todo zero é um ponto fixo ruim do sfc32; força um bit.
  if ((a | b | c | d) === 0) d = 1;

  const nextUint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  const nextInt = (max: number): number => {
    if (!(max >= 1 && max <= TWO_POW_32) || Math.floor(max) !== max) {
      throw new RangeError(`nextInt: max inválido (${max}).`);
    }
    // Amostragem por rejeição: descarta o "resto" do intervalo de 2^32 para
    // que todos os valores tenham exatamente a mesma chance (sem viés de módulo).
    const limit = TWO_POW_32 - (TWO_POW_32 % max);
    let x = nextUint32();
    while (x >= limit) x = nextUint32();
    return x % max;
  };

  return {
    nextUint32,
    nextFloat: () => nextUint32() / TWO_POW_32,
    nextInt,
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = nextInt(i + 1);
        const tmp = items[i];
        items[i] = items[j];
        items[j] = tmp;
      }
      return items;
    },
    getState: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}

/** Cria um gerador a partir de uma semente em texto. */
export function createRng(seed: string): Rng {
  const rng = rngFromState(hashSeed(seed));
  // Aquecimento recomendado para o sfc32: as primeiras saídas ainda
  // carregam correlação com a semente.
  for (let i = 0; i < 15; i++) rng.nextUint32();
  return rng;
}

/** Estado inicial (já aquecido) correspondente a uma semente. */
export function seedToRngState(seed: string): RngState {
  return createRng(seed).getState();
}

/** Atalho simétrico a `rngFromState`. */
export function rngState(rng: Rng): RngState {
  return rng.getState();
}
