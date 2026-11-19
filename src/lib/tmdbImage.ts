// As imagens do TMDB num lugar só (19/11/2026, Reborn, onda 2b, render.md A8).
//
// O TMDB serve cada pôster em tamanhos fixos (a "escada" abaixo). Pedir o
// tamanho certo para a largura em que a imagem é desenhada, vezes a densidade
// da tela, é o que evita baixar e decodificar pixel que ninguém vê.
//
// Medido na prévia (celular de 390 px, densidades 2 e 3): os pôsteres das
// faixas da Home e da Biblioteca têm 124 px de largura e pedem w342, que já é
// o degrau certo nos dois casos (248 e 372 px reais). Ali nada muda. O que
// sobrava: numa tela comum de computador (densidade 1) o mesmo pôster de 148 px
// baixava w342 (≈28 kB) onde w154 (≈6 kB) basta, e o fundo do menu do título
// vinha em w1280 (≈140 kB, 3,7 MB decodificado) também no celular.

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/';

export type TmdbPosterSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780';
const POSTER_LADDER: number[] = [92, 154, 185, 342, 500, 780];

// O endereço de uma imagem do TMDB (`path` começa com "/").
export const tmdbImage = (path: string, size: string): string => `${TMDB_IMAGE_BASE}${size}${path}`;

// O menor degrau que cobre `px` pixels reais de largura. A folga de 10% evita
// subir um degrau inteiro (o dobro dos bytes) por causa de poucos pixels:
// 372 px reais ficam com w342. `max` é o teto.
export function posterSizeFor(px: number, max: TmdbPosterSize = 'w780'): TmdbPosterSize {
  const cap = Number(max.slice(1));
  const step = POSTER_LADDER.find((size) => size >= px * 0.9 && size <= cap) ?? cap;
  return `w${Math.min(step, cap)}` as TmdbPosterSize;
}

// `src` e `srcSet` de um pôster desenhado com `cssWidth` px de largura: um
// candidato por densidade de tela (1x, 2x, 3x). O navegador escolhe pela
// densidade do aparelho, do mesmo jeito em todos (com descritores de largura o
// Chrome e o Safari escolhem degraus diferentes para a mesma tela). O `src` é
// o candidato de 2x, para quem não entende srcSet.
export function posterSources(path: string, cssWidth: number, max: TmdbPosterSize = 'w780'): { src: string; srcSet: string | undefined } {
  const sizes = [1, 2, 3].map((density) => posterSizeFor(cssWidth * density, max));
  const parts: string[] = [];
  sizes.forEach((size, i) => {
    // densidades seguidas com o mesmo degrau viram um candidato só
    if (i === 0 || size !== sizes[i - 1]) parts.push(`${tmdbImage(path, size)} ${i + 1}x`);
  });
  return { src: tmdbImage(path, sizes[1]), srcSet: parts.length > 1 ? parts.join(', ') : undefined };
}

// O fundo (backdrop) do menu do título: no celular a faixa tem a largura da
// tela e fica a 45% de opacidade sob um degradê; w780 basta.
export function backdropSize(): 'w780' | 'w1280' {
  const narrow = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 639px)').matches;
  return narrow ? 'w780' : 'w1280';
}
