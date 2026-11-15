import { posterUrl } from '../../lib/persona';
import type { PersonaWorld } from '../../lib/personaWorld';
import { NO_IMAGES, POSTER_SIZE, SCREEN_SIZE, shrinkCover, type SceneImages } from './draw';

// As imagens de verdade da cena, reduzidas a pixel: a capa do filme da Persona
// (na tela) e os pôsteres do Jackpot (nos quadros da parede). Enquanto não
// chegam, ou se o TMDB não responder, a cena usa os desenhos de reserva.
//
// 14/11/2026 (pedido do Bruno): a tela projeta a CAPA DO FILME, para todo
// mundo. Antes era a "foto do personagem", que para 70 das 84 Personas é uma
// cena larga do filme e para 14 é um pôster: uns estúdios mostravam a capa e
// outros, um recorte de cena. No dele (Contato) o recorte, feito para o cartão
// em pé, pegava mais da metade da cena e mostrava "um homem em pixels" ao lado
// da personagem. O personagem continua no cartão, embaixo da cena.
//
// 14/11/2026 (noite): os quadros da parede são os 4 últimos pôsteres que a
// pessoa ganhou no Poster Jackpot (antes, os títulos de nota 10).
//
// Fica num arquivo à parte porque a cena (PersonaScene) e a imagem de
// compartilhar (lib/studioCard) usam as mesmas imagens.

const loadImage = (src: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    // sem isto o canvas fica "sujo" e não poderia virar imagem de compartilhar
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

// o que identifica as imagens de uma cena (para não buscar de novo sem precisar)
export const sceneImagesKey = (world: PersonaWorld, stage: number): string => {
  const entry = world.persona?.code ? (world.persona.persona ?? null) : null;
  const size = SCREEN_SIZE(stage);
  return [entry?.posterPath ?? '', size.w, size.h, ...world.posters.slice(0, 4).map((poster) => poster.path)].join('|');
};

export async function loadSceneImages(world: PersonaWorld, stage: number): Promise<SceneImages> {
  const entry = world.persona?.code ? (world.persona.persona ?? null) : null;
  const cover = entry ? posterUrl(entry.posterPath, 'w342') : null;
  const size = SCREEN_SIZE(stage);
  const [face, ...frames] = await Promise.all([
    cover ? loadImage(cover) : Promise.resolve(null),
    ...world.posters.slice(0, 4).map((poster) => loadImage(`https://image.tmdb.org/t/p/w185${poster.path}`)),
  ]);
  try {
    return {
      // a capa é em pé e a tela é deitada: entra a faixa de cima do pôster, de ponta a ponta
      portrait: face ? shrinkCover(face, size.w, size.h, 0.5, 0.14, 1) : null,
      posters: frames.map((img) => (img ? shrinkCover(img, POSTER_SIZE.w, POSTER_SIZE.h) : null)),
    };
  } catch {
    return NO_IMAGES;
  }
}
