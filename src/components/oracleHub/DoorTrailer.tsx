import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getMovieTrailer, getMoviesFromCacheByType, type Movie } from '../../lib/tmdb';

// O trailer da porta "A Mesa dos Oráculos" (11/11/2026, pedido do Bruno).
//
// No primeiro segundo da home, o conteúdo da porta desliza para o lado e no
// lugar dele roda, sem som, o trailer de um dos filmes mais recomendados para
// a pessoa nas três prateleiras favoritas — a partir dos 10 s, para pular as
// vinhetas do começo. Só o vídeo, recortado no formato da porta (sem nada do
// player nem texto por cima). Tocar no trailer para o vídeo, abre o menu
// expandido do filme e a porta volta ao que era. O trailer também termina sozinho (fim do
// vídeo, a porta sai da tela, a aba fica escondida) e a porta volta.
//
// Como funciona:
//   • os candidatos vêm de get_home_trailer_pick() (até 12, pela nota prevista);
//     sorteamos entre os 8 primeiros um que tenha trailer no YouTube;
//   • o vídeo começa escondido, atrás da porta; a porta só desliza quando o
//     YouTube avisa que está tocando (e pelo menos 1 s depois de a home
//     acender). Sem tocar em 9 s (bloqueio de autoplay, erro do vídeo,
//     internet lenta), desiste em silêncio e a porta nem se mexe;
//   • o estado do vídeo vem pelo postMessage do player do YouTube
//     (enablejsapi), sem carregar a API inteira;
//   • uma vez por sessão (aba / abertura do app), nunca com "reduzir
//     movimento" nem com economia de dados.

const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const START_AT = 10; // segundos: pula as vinhetas do começo do trailer
const REVEAL_AFTER_MS = 1000; // "no primeiro segundo"
const GIVE_UP_MS = 9000;
const SLIDE_MS = 650;
const SESSION_KEY = 'cineoracle:door-trailer';

type Phase = 'off' | 'loading' | 'showing' | 'leaving';

interface Pick {
  movie: Movie;
  key: string;
}

function shouldRun(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
  } catch {
    // sem sessionStorage: segue (no pior caso, o trailer volta numa nova visita à home)
  }
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return false;
  return true;
}

function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // ignora
  }
}

async function chooseTrailer(): Promise<Pick | null> {
  const { data, error } = await supabase.rpc('get_home_trailer_pick');
  if (error) throw error;
  const items = ((data as { items?: { id: number; trailer_key: string | null }[] } | null)?.items ?? []).slice(0, 8);
  // um dos mais recomendados, não sempre o primeiro
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  let lookups = 0;
  for (const item of items) {
    let key = item.trailer_key;
    if (!key) {
      if (lookups >= 3) continue;
      lookups += 1;
      key = (await getMovieTrailer(item.id, 'movie'))?.key ?? null;
    }
    if (!key) continue;
    const movies = await getMoviesFromCacheByType([{ movie_id: item.id, media_type: 'movie' }]);
    const movie = movies.get(`${item.id}_movie`);
    if (movie) return { movie: { ...movie, media_type: 'movie' }, key };
  }
  return null;
}

export function useDoorTrailer(enabled: boolean, watchRef: React.RefObject<HTMLElement>) {
  const [phase, setPhase] = useState<Phase>('off');
  const [pick, setPick] = useState<Pick | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const phaseRef = useRef<Phase>('off');
  const ranRef = useRef(false);
  const enabledAt = useRef(0);
  const timers = useRef<number[]>([]);

  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const post = useCallback((func: string, args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), EMBED_ORIGIN);
  }, []);

  // Desiste (antes de aparecer): some sem ninguém ver.
  const abort = useCallback(() => {
    if (phaseRef.current !== 'loading') return;
    clearTimers();
    go('off');
    setPick(null);
  }, [go]);

  // Termina (depois de aparecer): o vídeo para e a porta volta deslizando.
  const finish = useCallback(() => {
    if (phaseRef.current === 'loading') return abort();
    if (phaseRef.current !== 'showing') return;
    // pausa (o stopVideo volta para a capa com o botão do YouTube); o vídeo
    // some na mesma hora (DoorTrailerLayer, leaving) e a camada sai deslizando
    post('pauseVideo');
    clearTimers();
    go('leaving');
    later(() => {
      go('off');
      setPick(null);
    }, SLIDE_MS + 50);
  }, [abort, go, post]);

  // 1) Escolhe o filme assim que a home acende.
  useEffect(() => {
    if (!enabled || ranRef.current) return;
    ranRef.current = true;
    if (!shouldRun()) return;
    enabledAt.current = performance.now();
    let alive = true;
    chooseTrailer()
      .then((chosen) => {
        if (!alive || !chosen) return;
        setPick(chosen);
        go('loading');
        later(() => abort(), GIVE_UP_MS);
      })
      .catch((error) => console.error('Trailer da porta:', error));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // 2) O que o player do YouTube conta (tocando, acabou, erro).
  useEffect(() => {
    if (!pick) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== EMBED_ORIGIN || event.source !== iframeRef.current?.contentWindow) return;
      let data: { event?: string; info?: unknown } | null = null;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data) return;
      if (data.event === 'onError') {
        finish();
        return;
      }
      const state =
        data.event === 'onStateChange'
          ? (data.info as number)
          : data.event === 'infoDelivery' || data.event === 'initialDelivery'
            ? (data.info as { playerState?: number } | null)?.playerState
            : undefined;
      if (state === 1 && phaseRef.current === 'loading') {
        // tocando: a porta desliza (não antes do primeiro segundo da home)
        const wait = Math.max(0, REVEAL_AFTER_MS - (performance.now() - enabledAt.current));
        clearTimers();
        later(() => {
          if (phaseRef.current !== 'loading') return;
          markShown();
          go('showing');
        }, wait);
      } else if (state === 0) {
        finish();
      }
      // Termina 1,5 s antes do fim: a tela de "mais vídeos" do YouTube (que
      // cobre o vídeo quando ele acaba) nunca chega a aparecer.
      const info = (data.info ?? null) as { currentTime?: number; duration?: number } | null;
      if (
        phaseRef.current === 'showing' &&
        info &&
        typeof info.currentTime === 'number' &&
        typeof info.duration === 'number' &&
        info.duration > 0 &&
        info.currentTime >= info.duration - 1.5
      ) {
        finish();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, finish]);

  // 3) Saiu da tela ou a aba ficou escondida: termina.
  useEffect(() => {
    if (phase !== 'showing') return;
    const el = watchRef.current;
    const io = el
      ? new IntersectionObserver(([entry]) => {
          if (entry && entry.intersectionRatio < 0.35) finish();
        }, { threshold: [0, 0.35, 1] })
      : null;
    if (el && io) io.observe(el);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') finish();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, finish, watchRef]);

  useEffect(() => () => clearTimers(), []);

  // Quando o iframe carrega, pede para o player contar o que acontece.
  const onIframeLoad = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), EMBED_ORIGIN);
    post('addEventListener', ['onStateChange']);
    post('addEventListener', ['onError']);
  }, [post]);

  // Tocar no trailer: para o vídeo, a porta volta e devolve o filme.
  const open = useCallback((): Movie | null => {
    const movie = pick?.movie ?? null;
    finish();
    return movie;
  }, [pick, finish]);

  return { phase, pick, iframeRef, onIframeLoad, open };
}

// A camada do vídeo, dentro da porta: entra pela direita quando o conteúdo
// sai pela esquerda (os dois andam juntos, como um carrossel).
// 11/11/2026, 20h59 (Bruno): "o trailer deve ser cortado para manter-se no
// aspecto do botão, e coisas como o player do YouTube, ou qualquer outra
// informação visual que não seja o vídeo devem ser removidas". Então a camada
// é só o vídeo: nada de título, faixa, neon ou botão por cima. O player vem
// sem controles (controls=0), sem clique (pointer-events: none, então o
// YouTube nunca mostra os botões do passar do mouse) e só aparece depois de
// já estar tocando (sem a capa, o botão vermelho ou a rodinha de carregar).
// O recorte cobre a porta inteira, como object-fit: cover, e amplia o
// bastante para que as faixas de cima e de baixo do player (título, canal,
// logotipo, legendas, a tela do fim) fiquem sempre fora da porta: no mínimo
// 14% de corte em cima e embaixo, e 5% de cada lado.
//   altura do vídeo ≥ altura da porta / (1 − 2 × 0,14)  →  139cqh
//   largura ≥ largura da porta × 1,1                     →  110cqw
//   16:9: largura = max(110cqw, 139cqh × 16/9 = 247cqh)
export const DoorTrailerLayer: React.FC<{
  pick: Pick;
  showing: boolean;
  /** voltando: o vídeo some (nada do player parado aparece na saída) */
  leaving: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onLoad: () => void;
}> = ({ pick, showing, leaving, iframeRef, onLoad }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const src =
    `${EMBED_ORIGIN}/embed/${encodeURIComponent(pick.key)}?autoplay=1&mute=1&start=${START_AT}` +
    '&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0' +
    `&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  return (
    <span
      aria-hidden
      className={`absolute inset-0 z-[1] overflow-hidden rounded-2xl transition-transform duration-[650ms] ease-[cubic-bezier(0.7,0,0.2,1)] motion-reduce:transition-none ${
        showing ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ containerType: 'size' } as React.CSSProperties}
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={pick.movie.title}
        tabIndex={-1}
        allow="autoplay; encrypted-media"
        onLoad={onLoad}
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0 pointer-events-none transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
        style={{ width: 'max(110cqw, 247cqh)', aspectRatio: '16 / 9' }}
      />
    </span>
  );
};
