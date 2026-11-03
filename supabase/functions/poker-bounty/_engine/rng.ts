// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/rng.ts
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
 * nunca ser enviada ao cliente (quem conhece o estado prevê o baralho). Cada
 * fluxo nasce do SHA-256 da semente + rótulo (hashSeed), e o baralho é
 * refeito a cada mão, para nenhum estado do sfc32 durar além de uma mão.
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

// SHA-256 síncrono em TS puro (igual no navegador, no Node e no Deno; o
// crypto.subtle é assíncrono e não serve aqui). Conferido contra o node:crypto.
const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function sha256Words(text: string): Uint32Array {
  const bytes = utf8(text);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255);
  bytes.push((bitLen >>> 24) & 255, (bitLen >>> 16) & 255, (bitLen >>> 8) & 255, bitLen & 255);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      W[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA_K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H;
}

/**
 * Semente → estado inicial de 128 bits = os 4 primeiros words do SHA-256 da semente.
 *
 * 03/11/2026 (revisão de segurança): antes era o cyrb128, que não é criptográfico.
 * Todos os fluxos da partida (`<semente>:deck:<mão>`, `:think:`, `:show:`, `:bot:`)
 * começam com a mesma semente secreta; no cyrb128 eles dividiam o estado interno
 * depois dos caracteres da semente, e quem anotasse os tempos de "pensar" e as
 * cartas vistas poderia, com o motor público e um solver, recuperar esse estado e
 * prever os baralhos das mãos seguintes. Com o SHA-256 cada fluxo é independente:
 * o que se vê de um não diz nada sobre os outros, e o baralho de cada mão já sai de
 * um fluxo próprio (runner.ts). Sementes parecidas continuam virando estados
 * completamente diferentes. Custo: ~2 µs por gerador criado.
 */
export function hashSeed(seed: string): RngState {
  const h = sha256Words(seed);
  return [h[0] >>> 0, h[1] >>> 0, h[2] >>> 0, h[3] >>> 0];
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
