// O menu do título como camada (19/11/2026, Protocolo Reborn, onda 2b).
//
// Antes cada tela guardava o filme aberto num estado e montava a sua cópia do
// MovieDetailsModal (27 lugares, e o menu de 265 KB ia junto no pedaço de cada
// tela). Agora qualquer lugar abre o menu assim, sem estado e sem importar o
// componente:
//   openTitle(movie)                         com o título já carregado
//   openTitle(movie, { onClose: recarregar }) com o que fazer quando fechar
//   overlays.open('title', { id, mediaType }) só com o id (a camada busca)
// Quem desenha é o host de camadas (um menu só, baixado sob demanda).
import type { Movie } from '../lib/tmdb';
import { overlays } from './host';
import type { TitleParams } from './registry';

export function openTitle(movie: Movie, options: Omit<TitleParams, 'id' | 'mediaType' | 'movie'> = {}): string | null {
  return overlays.open('title', { id: movie.id, mediaType: movie.media_type === 'tv' ? 'tv' : 'movie', movie, ...options });
}
