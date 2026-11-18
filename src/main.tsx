import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initI18n } from './i18n';
import { IS_NATIVE_APP } from './lib/platform';
import { captureInviteFromUrl } from './lib/invite';

// Link de convite (?convite=código): guarda o código antes de qualquer tela.
captureInviteFromUrl();

// 18/11/2026 (otimização): quem está com o site aberto durante um deploy, ao
// abrir uma tela, pede um pedaço com o nome antigo, que já não existe. Em vez
// da tela branca, o site recarrega UMA vez (e traz os arquivos novos). Se
// falhar de novo logo em seguida (ou sem sessionStorage), não recarrega: o
// erro segue para o RouteErrorBoundary, que mostra o aviso com "Tentar novamente".
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'co:preload-reload-at';
  try {
    const last = Number(sessionStorage.getItem(KEY)) || 0;
    if (Date.now() - last < 15_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

// 18/11/2026 (otimização): idiomas sob demanda — só o da pessoa é baixado
// (antes os dois iam no pacote principal, ≈335 KB). Os import() ficam aqui, na
// entrada, para o nome com hash do idioma não "contaminar" o código comum (ver
// o comentário em i18n.ts).
const i18nReady = initI18n({
  pt: () => import('./locales/pt.json'),
  en: () => import('./locales/en.json'),
});

// Desenha depois que o idioma chegou (no app vem de dentro do APK; no site o
// index.html já começou a baixá-lo). Se der erro, desenha mesmo assim.
// Create root and render without StrictMode to avoid double renders
const root = createRoot(document.getElementById('root')!);
i18nReady.finally(() => {
  root.render(<App />);

  // Dentro do app nativo (Android/iOS): barras do sistema, botão voltar e a
  // tela de abertura (sai depois deste primeiro desenho). O site não baixa
  // esse pedaço.
  if (IS_NATIVE_APP) {
    import('./lib/nativeShell').then(({ setupNativeShell }) => setupNativeShell());
  }
});
