// Títulos "magros" (20/11/2026, peça final do Protocolo Reborn).
//
// Uma lista que não mostra a sinopse nem "onde assistir" não precisa baixá-los:
// a do próprio Perfil economiza assim 390 kB dos 952 kB medidos na maior
// biblioteca (270 títulos). Os objetos de uma lista dessas levam `thin: true`.
// Quem recebe um título assim para mostrá-lo INTEIRO (o menu do título,
// overlays/layers/TitleLayer.tsx) mostra o que veio e busca o resto.
export interface ThinMark {
  thin?: boolean;
}

export const isThinTitle = (title: unknown): boolean => typeof title === 'object' && title !== null && (title as ThinMark).thin === true;
