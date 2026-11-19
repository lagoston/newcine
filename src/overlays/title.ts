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
import { useCallback, useRef } from 'react';
import type { Movie } from '../lib/tmdb';
import { overlays } from './host';
import type { TitleParams } from './registry';

export type TitleOptions = Omit<TitleParams, 'id' | 'mediaType' | 'movie'>;

export function openTitle(movie: Movie, options: TitleOptions = {}): string | null {
  return overlays.open('title', { id: movie.id, mediaType: movie.media_type === 'tv' ? 'tv' : 'movie', movie, ...options });
}

// Os detalhes completos chegaram depois do cartão leve: troca o título do menu
// aberto. Se a pessoa já fechou, não faz nada (não reabre).
export function updateTitle(mark: string | null, movie: Movie): void {
  if (mark) overlays.update<'title'>(mark, { movie });
}

// Para um componente que abre títulos: devolve uma função fixa `abrir(filme)`
// que usa sempre as opções mais novas do componente (as funções de "adicionou
// à biblioteca", "marcou episódio" e "fechou" do último render), como quando o
// menu era filho dele. Substitui o trio estado + <MovieDetailsModal> + onClose.
export function useOpenTitle(options: TitleOptions = {}): (movie: Movie) => string | null {
  const latest = useRef(options);
  latest.current = options;
  return useCallback(
    (movie: Movie) =>
      openTitle(movie, {
        isOtherUserProfile: latest.current.isOtherUserProfile,
        profileUserId: latest.current.profileUserId,
        onAddToLibrary: () => latest.current.onAddToLibrary?.(),
        onEpisodeToggle: () => latest.current.onEpisodeToggle?.(),
        onClose: () => latest.current.onClose?.(),
      }),
    [],
  );
}
