import { useCallback, useEffect, useState } from 'react';
import { getCastPhotos } from '../../lib/castPhotos';

// Fotos do elenco: vêm da tabela people do site (cada artista é
// cadastrado uma vez só a partir do TMDB — ver lib/castPhotos.ts).
// Enquanto não chegam, ou pra quem não tem foto, fica a inicial do nome.
//
// Usado só pela seção do elenco (TitleCast).
const NO_PHOTOS: Record<number, string | null> = {};
const NO_FAILED: Set<number> = new Set();

export function useCastPhotos(movieId: number, rawMediaType: 'movie' | 'tv' | undefined, castIdsKey: string) {
  const [photos, setPhotos] = useState<Record<number, string | null>>(NO_PHOTOS);
  const [failed, setFailed] = useState<Set<number>>(NO_FAILED);

  useEffect(() => {
    setPhotos(NO_PHOTOS);
    setFailed(NO_FAILED);
    if (!castIdsKey) return;
    let cancelled = false;
    getCastPhotos(movieId, rawMediaType === 'tv' ? 'tv' : 'movie', castIdsKey.split(',').map(Number)).then((found) => {
      if (!cancelled) setPhotos(found);
    });
    return () => {
      cancelled = true;
    };
  }, [movieId, rawMediaType, castIdsKey]);

  const markFailed = useCallback((id: number) => setFailed((prev) => new Set(prev).add(id)), []);

  return { photos, failed, markFailed };
}
