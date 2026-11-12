import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getMovieTrailer, getMoviesFromCacheByType, type Movie } from '../../lib/tmdb';

// O trailer da porta "A Mesa dos Oráculos" (11/11/2026, pedido do Bruno).
//
// Ao abrir a home, o conteúdo da porta desliza para o lado e no lugar dele
// roda, sem som, o trailer de um dos filmes mais recomendados para a pessoa
// nas três prateleiras favoritas — a partir dos 10 s, para pular as vinhetas
// do começo. Só o vídeo, recortado no formato da porta (sem nada do player nem
// texto por cima). Tocar no trailer abre o menu expandido do filme e a porta
// volta ao que era. O trailer também termina sozinho (perto do fim do vídeo,
// a porta sai da tela, a aba fica escondida) e a porta volta.
//
// Como funciona:
//   • os candidatos vêm de get_home_trailer_pick() (até 12, pela nota prevista);
//     sorteamos entre os 8 primeiros um que tenha trailer no YouTube;
//   • 12/11/2026 (Bruno: "o botão play do YouTube ainda aparece por alguns
//     segundos quando o vídeo entra … deixe-o rodando mas sem aparecer"): o
//     vídeo começa aos 5 s e toca ESCONDIDO, no lugar dele, por baixo do
//     conteúdo da porta, por no mínimo 5 s — o tempo de o YouTube apagar o
//     botão de play, o título e a rodinha. Só então (já perto dos 10 s do
//     trailer) a porta abre e o vídeo entra, já limpo.
//     Antes o vídeo esperava fora da porta (deslocado para a direita e
//     cortado pelo overflow). Para o navegador, um iframe fora da vista não
//     precisa ser desenhado, então o YouTube só apagava o botão depois que o
//     vídeo aparecia. Agora ele espera no lugar, invisível (opacidade 0,01,
//     embaixo do conteúdo), e o navegador o desenha normalmente;
//   • sem começar a tocar em 9 s (bloqueio de autoplay, erro do vídeo,
//     internet lenta), ou tocando mas travado antes de poder entrar, desiste
//     em silêncio e a porta nem se mexe;
//   • o estado do vídeo vem pelo postMessage do player do YouTube
//     (enablejsapi), sem carregar a API inteira;
//   • uma vez por sessão (aba / abertura do app), nunca com "reduzir
//     movimento" nem com economia de dados.

const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';
const START_AT = 5; // segundos: o vídeo começa aqui, ainda escondido
const SHOW_FROM = 10; // segundos: e só aparece daqui (pula as vinhetas do começo)
const WARM_UP_MS = 5000; // tocando escondido no mínimo isso (o YouTube apaga o botão de play)
const STEADY_MS = 800; // e tocando sem parar há pelo menos isso (nada de rodinha de carregar)
const GIVE_UP_MS = 9000; // sem começar a tocar nesse tempo, desiste
const STUCK_MS = 14000; // começou a tocar, mas não chegou ao ponto de entrar nesse tempo: desiste
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
  const timers = useRef<number[]>([]);
  // o que o player contou: o estado atual, desde quando toca sem parar,
  // quando tocou pela primeira vez e em que segundo do trailer está
  const playerState = useRef<number | null>(null);
  const playingSince = useRef<number | null>(null);
  const firstPlayAt = useRef<number | null>(null);
  const videoTime = useRef<number | null>(null);

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

  // Termina (depois de aparecer): a porta volta e cobre o vídeo como uma
  // cortina; quando a cortina fecha, o iframe sai da página (e o vídeo com ele).
  // 12/11/2026: o vídeo não é mais pausado aqui — pausado, o YouTube mostra o
  // botão de play grande, que aparecia durante a volta da porta. Sem som e
  // coberto em 650 ms, ele só segue rodando até sair.
  const finish = useCallback(() => {
    if (phaseRef.current === 'loading') return abort();
    if (phaseRef.current !== 'showing') return;
    clearTimers();
    go('leaving');
    later(() => {
      go('off');
      setPick(null);
    }, SLIDE_MS + 50);
  }, [abort, go]);

  // Entra só com o vídeo limpo: tocando escondido há WARM_UP_MS, sem parar há
  // STEADY_MS e já nos 10 s do trailer (se o player não contar o segundo, o
  // tempo escondido basta: começou nos 5 s, então já passou dos 10).
  const tryReveal = useCallback(() => {
    if (phaseRef.current !== 'loading' || playerState.current !== 1) return;
    if (firstPlayAt.current === null || playingSince.current === null) return;
    const now = performance.now();
    if (now - firstPlayAt.current < WARM_UP_MS || now - playingSince.current < STEADY_MS) return;
    if (videoTime.current !== null && videoTime.current < SHOW_FROM) return;
    clearTimers();
    markShown();
    go('showing');
  }, [go]);

  // 1) Escolhe o filme assim que a home acende.
  useEffect(() => {
    if (!enabled || ranRef.current) return;
    ranRef.current = true;
    if (!shouldRun()) return;
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

  // 2) O que o player do YouTube conta (tocando, carregando, acabou, erro, o
  //    segundo em que está).
  useEffect(() => {
    if (!pick) return;
    const poll = () => {
      tryReveal();
      if (phaseRef.current === 'loading') later(poll, 250);
    };
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
      const info = (data.info ?? null) as { playerState?: number; currentTime?: number; duration?: number } | null;
      const state =
        data.event === 'onStateChange'
          ? (data.info as number)
          : data.event === 'infoDelivery' || data.event === 'initialDelivery'
            ? info?.playerState
            : undefined;
      if (typeof info?.currentTime === 'number') videoTime.current = info.currentTime;
      if (typeof state === 'number' && state !== playerState.current) {
        playerState.current = state;
        playingSince.current = state === 1 ? performance.now() : null;
        if (state === 1 && firstPlayAt.current === null && phaseRef.current === 'loading') {
          // começou a tocar (escondido): troca o prazo e passa a vigiar a hora de entrar
          firstPlayAt.current = performance.now();
          clearTimers();
          later(() => abort(), STUCK_MS);
          later(poll, 250);
        }
        if (state === 0) {
          finish();
          return;
        }
      }
      tryReveal();
      // Termina 1,5 s antes do fim: a tela de "mais vídeos" do YouTube (que
      // cobre o vídeo quando ele acaba) nunca chega a aparecer.
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
  }, [pick, finish, tryReveal]);

  // 3) Saiu da tela ou a aba ficou escondida: termina (ou, se o vídeo ainda
  //    está esquentando escondido, desiste — fora da vista ele nem é desenhado).
  useEffect(() => {
    if (phase !== 'showing' && phase !== 'loading') return;
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

  // Tocar no trailer: a porta volta e devolve o filme (o menu dele abre por
  // cima, e o vídeo some com a volta da porta).
  const open = useCallback((): Movie | null => {
    const movie = pick?.movie ?? null;
    finish();
    return movie;
  }, [pick, finish]);

  return { phase, pick, iframeRef, onIframeLoad, open };
}

// A camada do vídeo, dentro da porta e embaixo do conteúdo dela.
// 11/11/2026, 20h59 (Bruno): "o trailer deve ser cortado para manter-se no
// aspecto do botão, e coisas como o player do YouTube, ou qualquer outra
// informação visual que não seja o vídeo devem ser removidas". Então a camada
// é só o vídeo: nada de título, faixa, neon ou botão por cima. O player vem
// sem controles (controls=0) e sem clique (pointer-events: none, então o
// YouTube nunca mostra os botões do passar do mouse).
// O recorte cobre a porta inteira, como object-fit: cover, e amplia o
// bastante para que as faixas de cima e de baixo do player (título, canal,
// logotipo, legendas, a tela do fim) fiquem sempre fora da porta: no mínimo
// 14% de corte em cima e embaixo, e 5% de cada lado.
//   altura do vídeo ≥ altura da porta / (1 − 2 × 0,14)  →  139cqh
//   largura ≥ largura da porta × 1,1                     →  110cqw
//   16:9: largura = max(110cqw, 139cqh × 16/9 = 247cqh)
// 12/11/2026: o vídeo não anda mais. Esquentando (loading), fica no lugar com
// opacidade 0,01 — invisível para a pessoa, mas na vista para o navegador,
// que assim o desenha e deixa o YouTube apagar o botão de play antes de ele
// aparecer. Entrando e saindo, é descoberto e coberto como uma cortina
// (door-trailer-in / door-trailer-out, em index.css), no passo do conteúdo.
export const DoorTrailerLayer: React.FC<{
  pick: Pick;
  phase: Exclude<Phase, 'off'>;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onLoad: () => void;
}> = ({ pick, phase, iframeRef, onLoad }) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const src =
    `${EMBED_ORIGIN}/embed/${encodeURIComponent(pick.key)}?autoplay=1&mute=1&start=${START_AT}` +
    '&controls=0&playsinline=1&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0' +
    `&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
  const curtain = `${SLIDE_MS}ms cubic-bezier(0.7,0,0.2,1) both`;
  return (
    <span
      aria-hidden
      className="absolute inset-0 overflow-hidden rounded-2xl"
      style={
        {
          containerType: 'size',
          opacity: phase === 'loading' ? 0.01 : 1,
          animation:
            phase === 'showing' ? `door-trailer-in ${curtain}` : phase === 'leaving' ? `door-trailer-out ${curtain}` : undefined,
        } as React.CSSProperties
      }
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={pick.movie.title}
        tabIndex={-1}
        allow="autoplay; encrypted-media"
        onLoad={onLoad}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-0 pointer-events-none"
        style={{ width: 'max(110cqw, 247cqh)', aspectRatio: '16 / 9' }}
      />
    </span>
  );
};
