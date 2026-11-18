import React, { lazy, Suspense } from 'react';
import GlassLoader from './GlassLoader';

// 18/11/2026 (otimização): o modal do filme (≈265 KB, 77 KB comprimido, com o
// desenho do estúdio, as frases dos oráculos, o DNA…) vinha junto com a Home e
// com o "Ver todos" por import estático, mesmo sem ninguém abrir um filme.
// Este invólucro tem as mesmas props e só baixa o modal quando ele aparece.
// Uso: troque `import MovieDetailsModal from './MovieDetailsModal'` por
// `import MovieDetailsModal from './LazyMovieDetailsModal'`.
const load = () => import('./MovieDetailsModal');
const Inner = lazy(load);

// Começa a baixar o modal antes do primeiro toque.
const preloadMovieDetails = () => {
  load().catch(() => {});
};

// Pré-carga ociosa: depois que a página terminou de abrir e o processador
// ficou livre, o modal é baixado em segundo plano — o primeiro toque num
// pôster continua instantâneo. Quem pediu economia de dados não baixa antes.
if (typeof window !== 'undefined') {
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  if (!saveData) {
    const whenIdle = () => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(preloadMovieDetails, { timeout: 8000 });
      else setTimeout(preloadMovieDetails, 1500);
    };
    const afterLoad = () => setTimeout(whenIdle, 1500);
    if (document.readyState === 'complete') afterLoad();
    else window.addEventListener('load', afterLoad, { once: true });
  }
}

export default function LazyMovieDetailsModal(props: React.ComponentProps<typeof Inner>) {
  // Se o toque vier antes da pré-carga terminar: um carregador por cima da
  // tela até o modal chegar (só quando o modal está aberto).
  const fallback = props.isOpen ? (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50" role="status">
      <GlassLoader size="lg" />
    </div>
  ) : null;
  return (
    <Suspense fallback={fallback}>
      <Inner {...props} />
    </Suspense>
  );
}
