import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { IS_NATIVE_APP } from './lib/platform';
import { captureInviteFromUrl } from './lib/invite';

// Link de convite (?convite=código): guarda o código antes de qualquer tela.
captureInviteFromUrl();

// Create root and render without StrictMode to avoid double renders
createRoot(document.getElementById('root')!).render(<App />);

// Dentro do app nativo (Android/iOS): barras do sistema, botão voltar e a
// tela de abertura. O site não baixa esse pedaço.
if (IS_NATIVE_APP) {
  import('./lib/nativeShell').then(({ setupNativeShell }) => setupNativeShell());
}
