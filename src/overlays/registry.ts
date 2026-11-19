// As camadas que o host abre sozinho, de qualquer lugar do app, com
// `overlays.open(tipo, params)` (Protocolo Reborn; lista vazia na onda 2a,
// preenchida na 2b, 19/11/2026).
//
// Para acrescentar um tipo:
//   1. o formato dos parâmetros em OverlaySpec;
//   2. o carregador em OVERLAYS (import() do componente, que recebe `params`
//      e lê `useLayer()` para saber se está aberto e como fechar).
//
// ATENÇÃO (pedaços do build): este arquivo tem import() de telas do app, então
// mora na ENTRADA, e o resto de src/overlays mora no eixo app-core. Por isso
// só o App.tsx importa OVERLAYS (e entrega ao <OverlayProvider registry>);
// dentro de src/overlays daqui só se importam TIPOS. Um import de valor
// fecharia um círculo entre a entrada e o app-core (tela branca).
import type { ComponentType } from 'react';
import type { Movie } from '../lib/tmdb';
import type { DailyReward } from '../lib/posterJackpot';
import type { JackpotTab } from '../components/posterJackpot/PosterJackpotSheet';

export interface TitleParams {
  id: number;
  mediaType: 'movie' | 'tv';
  // O título já carregado por quem abre. Sem ele a camada busca pelo id (é o
  // que acontece ao abrir por link ou ao recarregar).
  movie?: Movie;
  // Menu aberto no perfil de outra pessoa (os episódios vistos são os dela).
  isOtherUserProfile?: boolean;
  profileUserId?: string;
  onAddToLibrary?: () => void;
  onEpisodeToggle?: () => void;
  // Chamado uma vez quando o menu fecha, por qualquer caminho (X, Esc, voltar).
  onClose?: () => void;
}

export interface JackpotParams {
  // a aba em que a gaveta abre (o padrão é a roleta)
  tab?: JackpotTab;
  // a ficha do dia que acabou de ser pega (a gaveta abre em Missões e mostra)
  dailyReward?: DailyReward | null;
  // Chamado uma vez quando a gaveta fecha, por qualquer caminho.
  onClose?: () => void;
}

export type OverlaySpec = {
  // o menu do título (MovieDetailsModal)
  title: TitleParams;
  // a gaveta do Poster Jackpot, por cima de qualquer página
  jackpot: JackpotParams;
};
export type OverlayKind = keyof OverlaySpec;

export interface OverlayDef<P> {
  load: () => Promise<{ default: ComponentType<{ params: P }> }>;
  // piso do z-index (o padrão é o das gavetas, 9990)
  z?: number;
  // baixa o código da camada quando o app fica ocioso, antes do primeiro toque
  idle?: boolean;
}

export type OverlayRegistry = { [K in OverlayKind]: OverlayDef<OverlaySpec[K]> };

export const OVERLAYS: OverlayRegistry = {
  // 9999: o z de sempre do menu do título (acima das gavetas, em 9990)
  title: { load: () => import('./layers/TitleLayer'), z: 9999, idle: true },
  jackpot: { load: () => import('./layers/JackpotLayer') },
};
