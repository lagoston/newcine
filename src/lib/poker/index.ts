/**
 * Núcleo do poker (Texas Hold'em No-Limit) do CineOracle.
 * TypeScript puro, sem React/DOM/Node: roda no navegador e na Edge Function (Deno).
 */
export * from './rng.ts';
export * from './cards.ts';
export * from './evaluator.ts';
export * from './engine.ts';
export * from './equity.ts';
// O Grande Blefe (F0, 03/11/2026): contratos, números padrão, perfis e camada de partida.
export * from './types.ts';
export * from './config.ts';
export * from './bots/profile.ts';
export * from './match/match.ts';
