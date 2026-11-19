// A camada `title`: o menu do título desenhado pelo host de camadas
// (19/11/2026, Protocolo Reborn, onda 2b). Aberta com openTitle(movie) ou
// overlays.open('title', { id, mediaType }) — ver ../title.ts. Este arquivo é
// baixado sob demanda, e o MovieDetailsModal vem junto dele: nenhuma tela
// precisa mais carregar o menu no próprio pedaço.
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import MovieDetailsModal from '../../components/MovieDetailsModal';
import GlassLoader from '../../components/GlassLoader';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import { useLayer } from '../hooks';
import type { TitleParams } from '../registry';

const TitleLayer: React.FC<{ params: TitleParams }> = ({ params }) => {
  const layer = useLayer();
  const { t } = useTranslation();
  // O título de quem abriu (que pode trocá-lo depois, com overlays.update,
  // quando os detalhes completos chegam) ou, sem ele, o que a camada buscou.
  const [loaded, setLoaded] = useState<Movie | null>(null);
  const movie = params.movie ?? loaded;
  const { id, mediaType, onClose } = params;
  const close = layer.close;

  // Aberta só com o id (link, recarga): busca o título. O tipo vai sempre
  // explícito — sem ele a busca consultaria a tabela movies, que erra quando
  // um filme e uma série têm o mesmo número.
  const needsLoad = movie === null;
  useEffect(() => {
    if (!needsLoad) return;
    let alive = true;
    getMovieDetailsFromDB(id, mediaType)
      .then((details) => {
        if (alive) setLoaded({ ...details, media_type: mediaType });
      })
      .catch((error) => {
        console.error('Error loading title:', error);
        if (!alive) return;
        toast.error(t('common.error'));
        close();
      });
    return () => {
      alive = false;
    };
  }, [needsLoad, id, mediaType, close, t]);

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
