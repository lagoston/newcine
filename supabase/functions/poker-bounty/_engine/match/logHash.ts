// GERADO por scripts/sync-poker-engine.mjs — não edite. Fonte: src/lib/poker/match/logHash.ts
/**
 * Hash do log de eventos para o teste de determinismo (SPEC §8, pacote A, item 4): a mesma
 * semente e as mesmas ações dão o mesmo hash no Node e no Deno (pacote C).
 * FNV-1a de 64 bits em duas metades de 32 (Math.imul), sobre o JSON do log. Não é
 * criptográfico; serve só para comparar.
 */
export function logHash(value: unknown): string {
  const s = JSON.stringify(value);
  let h1 = 0x84222325 | 0;
  let h2 = 0xcbf29ce4 | 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c & 0xff;
    h2 ^= c >>> 8;
    // multiplicação por 0x100000001b3 (primo do FNV-64), em 32 bits
    const lo = Math.imul(h1, 0x1b3);
    const hi = (Math.imul(h2, 0x1b3) + Math.imul(h1, 0x100) + ((h1 >>> 0) * 0x1b3 / 4294967296 | 0)) | 0;
    h1 = lo;
    h2 = hi;
  }
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
