/// <reference types="vite-plugin-pwa/client" />
import type React from 'react';
import toast from 'react-hot-toast';
import { registerSW } from 'virtual:pwa-register';
import i18n from '../i18n';
import { reloadFresh } from './appUpdate';

// O service worker do site (18/11/2026, Protocolo Reborn, pacote). Este
// arquivo é baixado sob demanda pelo main.tsx, só no site (o app nativo já
// leva os arquivos dentro do pacote) e só depois da primeira tela útil, com o
// processador livre. Antes o registro ficava no App.tsx e começava logo depois
// do primeiro desenho: o service worker baixava ≈1,15 MB em segundo plano
// enquanto a Home ainda buscava os próprios pedaços.
//
// O que ele faz:
//   • registra o sw.js (pré-cache só da casca; ver "workbox" no vite.config.ts);
//   • na PRIMEIRA instalação, entrega ao service worker a lista do que esta
//     página já baixou (telas, fontes): ele guarda sem baixar de novo (vem do
//     cache do navegador), e a próxima visita já abre do aparelho;
//   • quando há versão nova, mostra um aviso do próprio site com "Atualizar"
//     (antes era um confirm() do navegador, em inglês, que travava a tela a
//     cada deploy). Quem ignora o aviso recebe a versão nova na próxima vez
//     que abrir o site.

const TOAST_STYLE: React.CSSProperties = {
  background: '#1B1432',
  color: '#F4EEDD',
  border: '1px solid rgba(167, 139, 250, 0.45)',
  borderRadius: 16,
  boxShadow: '0 14px 34px -14px rgba(0, 0, 0, 0.9)',
  padding: '10px 12px 10px 16px',
  maxWidth: 380,
};

const showUpdateNotice = () => {
  toast(
    (item) => (
      <span className="flex items-center gap-3 text-sm">
        <span>{i18n.t('appUpdate.ready')}</span>
        <button
          type="button"
          onClick={() => {
            toast.dismiss(item.id);
            void reloadFresh();
          }}
          className="shrink-0 h-9 min-h-0 px-3 rounded-lg bg-violet-500/30 hover:bg-violet-500/45 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          {i18n.t('appUpdate.reload')}
        </button>
      </span>
    ),
    { id: 'app-update', duration: 20000, style: TOAST_STYLE },
  );
};

// Só o que é do próprio site e tem nome que não muda de conteúdo.
const CACHEABLE = /^\/(static|fonts)\//;

function handOverLoadedFiles(registration: ServiceWorkerRegistration) {
  // Página já controlada: o service worker viu (e guardou) cada pedido.
  if (navigator.serviceWorker.controller) return;
  const send = (worker: ServiceWorker) => {
    const urls = new Set<string>();
    for (const entry of performance.getEntriesByType('resource')) {
      try {
        const url = new URL(entry.name);
        if (url.origin === window.location.origin && CACHEABLE.test(url.pathname)) urls.add(url.pathname);
      } catch {
        // endereço estranho: fica de fora
      }
    }
    if (urls.size) worker.postMessage({ type: 'CACHE_URLS', payload: { urlsToCache: [...urls] } });
  };
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) return;
  if (worker.state === 'activated') send(worker);
  else worker.addEventListener('statechange', () => worker.state === 'activated' && send(worker));
}

export function registerServiceWorker(): void {
  registerSW({
    immediate: true,
    onNeedRefresh: showUpdateNotice,
    onRegisteredSW(_url, registration) {
      if (registration) handOverLoadedFiles(registration);
    },
  });
}
