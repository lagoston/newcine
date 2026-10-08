import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';

// Ajustes que só valem dentro do app nativo (Android/iOS). Carregado sob
// demanda pelo main.tsx quando IS_NATIVE_APP — o site não baixa nada disto.
//
// • Barras do sistema com ícones claros (o fundo do app é a noite).
// • Botão "voltar" do Android: fecha o que estiver aberto por cima (modal,
//   busca…) como o Esc faz no computador; sem nada aberto, volta uma página;
//   no Início, minimiza o app (em vez de fechar).
// • A tela de abertura (Olho Lunar) sai quando o React já desenhou a página.

const anyOverlayOpen = () => document.querySelector('[role="dialog"], [aria-modal="true"]') !== null;

export async function setupNativeShell() {
  document.documentElement.classList.add('is-native-app');

  SystemBars.setStyle({ style: SystemBarsStyle.Dark }).catch(() => {});

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
