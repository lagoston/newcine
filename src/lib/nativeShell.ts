import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { setAppActive } from './motion';
import { pauseRealtime, resumeRealtime } from './realtimePause';
import { supabase } from './supabase';

// Ajustes que só valem dentro do app nativo (Android/iOS). Carregado sob
// demanda pelo main.tsx quando IS_NATIVE_APP — o site não baixa nada disto.
//
// • Barras do sistema com ícones claros (o fundo do app é a noite).
// • Botão "voltar" do Android: fecha o que estiver aberto por cima (modal,
//   busca…) como o Esc faz no computador; sem nada aberto, volta uma página;
//   no Início, minimiza o app (em vez de fechar).
// • A tela de abertura (Olho Lunar) sai quando o React já desenhou a página.
// • App em segundo plano (18/11/2026, Reborn, bateria A10): o enfeite pausa
//   (animações e o estúdio) e, depois de 30 s no fundo, o websocket do tempo
//   real é fechado; na volta tudo religa sozinho.

const anyOverlayOpen = () => document.querySelector('[role="dialog"], [aria-modal="true"]') !== null;

// Quanto tempo no fundo até fechar o websocket: uma olhada rápida em outro app
// (responder uma mensagem) não derruba a mesa de pôquer.
const REALTIME_GRACE_MS = 30_000;
let realtimeTimer: number | undefined;

// O Capacitor avisa quando o app sai da tela e quando volta. No Android é o
// onStop/onResume da Activity (tela desligada, outro app na frente, tela
// inicial); no iPhone, perder e ganhar o foco. Antes ninguém escutava isso: os
// temporizadores do site seguiam rodando no fundo (o Capacitor não os pausa:
// KeepRunning é verdadeiro por padrão) e o websocket do tempo real mandava uma
// batida a cada ~30 s.
function onAppState(active: boolean) {
  // lib/motion.ts: marca o <html> (o CSS pausa as animações) e desliga os
  // laços de enfeite (o estúdio da Persona); na volta, religa
  setAppActive(active);
  window.clearTimeout(realtimeTimer);
  if (active) resumeRealtime(supabase.realtime);
  else realtimeTimer = window.setTimeout(() => pauseRealtime(supabase.realtime), REALTIME_GRACE_MS);
}

export async function setupNativeShell() {
  document.documentElement.classList.add('is-native-app');

  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});

  App.addListener('appStateChange', ({ isActive }) => onAppState(isActive));

  App.addListener('backButton', ({ canGoBack }) => {
    if (anyOverlayOpen()) {
      // Um Esc só, a partir do elemento em foco (ou do body): ele sobe até
      // o document e a window, onde os modais escutam.
      const target = (document.activeElement as HTMLElement | null) ?? document.body;
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      return;
    }
    if (canGoBack && window.location.pathname !== '/') {
      window.history.back();
      return;
    }
    App.minimizeApp().catch(() => {});
  });

  // Dois quadros depois do primeiro desenho: a página já está na tela.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
    })
  );
}
