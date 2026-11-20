// A camada `title`: o menu do título desenhado pelo host de camadas
// (19/11/2026, Protocolo Reborn, onda 2b). Aberta com openTitle(movie) ou
// overlays.open('title', { id, mediaType }) — ver ../title.ts. Este arquivo é
// baixado sob demanda, e o MovieDetailsModal vem junto dele: nenhuma tela
// precisa mais carregar o menu no próprio pedaço.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import MovieDetailsModal from '../../components/MovieDetailsModal';
import GlassLoader from '../../components/GlassLoader';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import { isThinTitle, type ThinMark } from '../../lib/data';
import { useLayer } from '../hooks';
import type { TitleParams } from '../registry';

const TitleLayer: React.FC<{ params: TitleParams }> = ({ params }) => {
  const layer = useLayer();
  const { t } = useTranslation();
  const { id, mediaType, onClose } = params;
  const close = layer.close;
  // O título de quem abriu (que pode trocá-lo depois, com overlays.update,
  // quando os detalhes completos chegam) ou, sem ele, o que a camada buscou.
  const given = params.movie ?? null;
  // 20/11/2026 (peça final do Reborn): título MAGRO, vindo de uma lista que não
  // baixa a sinopse nem "onde assistir" (a do próprio Perfil: 390 kB a menos
  // em 952; marca `thin` em lib/data/thin.ts). O menu abre na hora com o que
  // veio e a camada busca os detalhes completos, trocando o objeto quando
  // chegam, sem fechar nem reabrir nada. Se a busca falhar, o menu fica como
  // abriu (só sem as duas seções).
  const thin = isThinTitle(given);
  const titleKey = `${mediaType}:${id}`;
  const [loaded, setLoaded] = useState<{ key: string; movie: Movie } | null>(null);
  const full = loaded !== null && loaded.key === titleKey ? loaded.movie : null;
  const movie = useMemo<Movie | null>(() => {
    if (!given) return full;
    if (!thin || !full) return given;
    // o catálogo vem dos detalhes; o que é da pessoa (a nota dela) fica o da lista
    const merged: Movie & ThinMark = { ...given, ...full };
    delete merged.thin;
    if (given.userRating !== undefined) merged.userRating = given.userRating;
    return merged;
  }, [given, thin, full]);

  // Aberta só com o id (link, recarga) ou com um título magro: busca o título.
  // O tipo vai sempre explícito — sem ele a busca consultaria a tabela movies,
  // que erra quando um filme e uma série têm o mesmo número.
  const needsLoad = (given === null || thin) && full === null;
  useEffect(() => {
    if (!needsLoad) return;
    let alive = true;
    getMovieDetailsFromDB(id, mediaType)
      .then((details) => {
        if (alive) setLoaded({ key: `${mediaType}:${id}`, movie: { ...details, media_type: mediaType } });
      })
      .catch((error) => {
        console.error('Error loading title:', error);
        if (!alive) return;
        // com um título magro o menu já está aberto e utilizável: fica como está
        if (thin) return;
        toast.error(t('common.error'));
        close();
      });
    return () => {
      alive = false;
    };
  }, [needsLoad, thin, id, mediaType, close, t]);

  // Avisa quem abriu, uma vez, quando o menu fecha por qualquer caminho.
  const told = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (layer.open || told.current) return;
    told.current = true;
    onCloseRef.current?.();
  }, [layer.open]);

  if (!movie) {
    return layer.open ? (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50" style={{ zIndex: layer.z }} role="status">
        <GlassLoader size="lg" />
      </div>
    ) : null;
  }
  return (
    <MovieDetailsModal
      movie={movie}
      isOpen={layer.open}
      onClose={close}
      isOtherUserProfile={params.isOtherUserProfile}
      profileUserId={params.profileUserId}
      onAddToLibrary={params.onAddToLibrary}
      onEpisodeToggle={params.onEpisodeToggle}
    />
  );
};

export default TitleLayer;
