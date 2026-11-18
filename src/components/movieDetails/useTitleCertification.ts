import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { DETAILS_GRACE_MS, standardizeCertification, type TitleMovie } from './shared';

// Classificação indicativa — busca direto do movie_cache.content_ratings,
// que já vem como um array com uma entrada por país (ex: um item com
// iso_3166_1 "BR" e outro "US", cada um com sua própria "certification").
// A versão antiga dessa feature às vezes mostrava algo tipo "New York" em
// vez da nota — sinal claro de estar lendo o campo errado desse array
// (provavelmente pegando o índice [0] sem checar o país, ou lendo um outro
// campo qualquer). Aqui filtramos explicitamente pelo país certo e lemos
// SÓ o campo "certification", nunca outra coisa.
// 18/11/2026 (otimização, rede.md A3): quando o título já veio com a linha
// do cache inteira (content_ratings junto), a classificação sai dela, sem
// outra consulta. Sem o campo, consulta como antes — e, se o menu abriu com
// o item da lista, espera um pouco pelos detalhes completos primeiro.
//
// Usado só pelo cabeçalho (TitleHeading): a resposta re-renderiza só ele.
export function useTitleCertification(movie: TitleMovie): string | null {
  const { i18n } = useTranslation();
  const [certification, setCertification] = useState<string | null>(null);
  const movieId = movie.id;
  const rawMediaType = movie.media_type;
  const language = i18n.language;
  const rowRatings = movie.content_ratings;
  const ratingsFromRow = Array.isArray(rowRatings) ? rowRatings : null;
  // com os detalhes completos (têm `credits`) ou só com o item da lista?
  const detailsReady = movie.credits !== undefined;

  useEffect(() => {
    const isPt = language.startsWith('pt');
    let cancelled = false;
    const pick = (list: unknown) => {
      if (cancelled) return;
      if (!Array.isArray(list)) {
        setCertification(null);
        return;
      }
      const ratings: { iso_3166_1?: string; certification?: string }[] = list;
      const preferredRegion = isPt ? 'BR' : 'US';

      // Tenta o país preferido primeiro, depois US, depois qualquer um —
      // cada candidato passa pela padronização; só aceita o primeiro que
      // a função realmente reconhece (evita mostrar sigla de país que
      // ainda não mapeamos).
      const candidates = [
        ratings.find((r) => r.iso_3166_1 === preferredRegion && r.certification),
        ratings.find((r) => r.iso_3166_1 === 'US' && r.certification),
        ...ratings.filter((r) => r.certification)
      ];

      let standardized: string | null = null;
      for (const candidate of candidates) {
        if (candidate?.certification) {
          standardized = standardizeCertification(candidate.certification);
          if (standardized) break;
        }
      }
      setCertification(standardized);
    };
    if (ratingsFromRow) {
      pick(ratingsFromRow);
      return () => {
        cancelled = true;
      };
    }
    const query = () =>
      supabase
        .from('movie_cache')
        .select('content_ratings')
        .eq('tmdb_id', movieId)
        .eq('media_type', rawMediaType || 'movie')
        .maybeSingle()
        .then(({ data, error }) => pick(error ? null : data?.content_ratings));
    const timer = detailsReady ? null : window.setTimeout(query, DETAILS_GRACE_MS);
    if (detailsReady) query();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [movieId, rawMediaType, language, ratingsFromRow, detailsReady]);

  return certification;
}
