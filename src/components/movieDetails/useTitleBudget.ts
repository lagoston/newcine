import { useEffect, useState } from 'react';
import { fetchAndStoreBudget } from '../../lib/tmdb';
import { DETAILS_GRACE_MS, type TitleMovie } from './shared';

// Orçamento (só filmes). Vem do movie_cache; se o filme veio de um cache
// antigo sem ele, busca no TMDB uma vez e grava (lib/tmdb.ts).
//   undefined = carregando · null = erro (some) · 0 = não divulgado
//
// 18/11/2026 (otimização, rede.md A3): quem abre pela Home ou pela busca
// monta o menu primeiro com o item da lista do TMDB (sem orçamento) e troca
// pelos detalhes completos logo depois — e eles já trazem o orçamento do
// cache. Pedir o orçamento antes disso era 1 função de borda que devolvia a
// linha inteira de novo. Agora: com os detalhes completos (têm `credits`),
// pede na hora se faltar; com o item da lista, espera um pouco pelos
// detalhes e só pede se eles não vierem.
//
// Usado só pela seção da direção (TitleCredits).
export function useTitleBudget(movie: TitleMovie): number | null | undefined {
  const movieId = movie.id;
  const rawMediaType = movie.media_type;
  const rowBudget = movie.budget;
  const detailsReady = movie.credits !== undefined;
  const [budget, setBudget] = useState<number | null | undefined>(typeof rowBudget === 'number' ? rowBudget : undefined);

  useEffect(() => {
    if (rawMediaType === 'tv' || !movieId) {
      setBudget(null);
      return;
    }
    if (typeof rowBudget === 'number') {
      setBudget(rowBudget);
      return;
    }
    setBudget(undefined);
    let cancelled = false;
    const load = () =>
      fetchAndStoreBudget(movieId).then((value) => {
        if (!cancelled) setBudget(value);
      });
    const timer = detailsReady ? null : window.setTimeout(load, DETAILS_GRACE_MS);
    if (detailsReady) load();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [movieId, rawMediaType, rowBudget, detailsReady]);

  return budget;
}
