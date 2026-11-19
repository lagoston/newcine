import React, { useEffect, useState } from 'react';
import { Film, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PosterArt from '../posterJackpot/PosterArt';
import { posterKey, useEquippedPosters } from '../../lib/posterJackpot';
import { VELVET, PAPER, MIST, PIXEL, FOCUS_RING } from '../../lib/oracleTheme';
import OracleSeals from './OracleSeals';
import FriendBubbles from './FriendBubbles';
import { mediaTypeOf, type TitleMovie } from './shared';
import type { OracleComments } from './useOracleComments';

// O pôster (toque = trailer) com os selos dos oráculos e as bolhas dos
// amigos por cima. Cada parte re-renderiza sozinha: o pôster quando a capa
// equipada chega, os selos com os balões, as bolhas quando os amigos chegam.

interface TitlePosterProps {
  movie: TitleMovie;
  // De quem são os pôsteres equipados: o dono da biblioteca visitada ou quem
  // está olhando.
  posterOwnerId: string | null | undefined;
  userId: string | null;
  oracle: OracleComments;
  onOpenTrailer: () => void;
  onOpenReviews: () => void;
}

const TitlePoster: React.FC<TitlePosterProps> = ({ movie, posterOwnerId, userId, oracle, onOpenTrailer, onOpenReviews }) => {
  const { t } = useTranslation();
  // Poster Jackpot: o pôster da coleção que o dono da biblioteca equipou
  // neste título substitui a capa aqui também.
  const equippedPosters = useEquippedPosters(posterOwnerId);
  const equippedPoster = equippedPosters.get(posterKey(movie.media_type, movie.id));
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => {
    setPosterFailed(false);
  }, [movie.id]);
  const posterSrc = movie.poster_path && !posterFailed ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null;

  return (
    <div className="relative mx-auto md:mx-0 w-[min(66vw,260px)] md:w-full">
      <button
        type="button"
        onClick={onOpenTrailer}
        aria-label={t('movieModal.playTrailer')}
        className={`group/poster relative block w-full aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/15 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)] ${FOCUS_RING}`}
        style={{ background: VELVET }}
      >
        {equippedPoster ? (
          <PosterArt
            filePath={equippedPoster.file_path}
            effect={equippedPoster.effect}
            size="w500"
            loading="eager"
            className="absolute inset-0 w-full h-full"
            mark={{ rarity: equippedPoster.rarity, serial: equippedPoster.serial, size: 'md' }}
          />
        ) : posterSrc ? (
          <img
            src={posterSrc}
            alt=""
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ color: MIST }}>
            <Film className="w-10 h-10" aria-hidden />
            <span style={{ ...PIXEL, color: PAPER }} className="text-lg leading-tight">{movie.title}</span>
          </span>
        )}
        {/* Convite discreto pro trailer — frase só no hover (desktop) */}
        <span className="absolute top-2.5 right-2.5 flex items-center gap-2 pointer-events-none">
          <span className="hidden sm:inline text-[11px] font-medium text-white bg-black/70 px-2 py-1 rounded-full opacity-0 group-hover/poster:opacity-100 transition-opacity whitespace-nowrap">
            {t('movies.clickForTrailer')}
          </span>
          <span className="grid place-items-center w-10 h-10 rounded-full bg-black/45 ring-1 ring-white/20 opacity-80 group-hover/poster:opacity-100 group-hover/poster:scale-105 transition">
            <Play className="w-4 h-4 fill-white text-white ml-0.5" aria-hidden />
          </span>
        </span>
      </button>

      <OracleSeals sources={oracle.sources} phrases={oracle.phrases} />

      <FriendBubbles movieId={movie.id} mediaType={mediaTypeOf(movie)} userId={userId} onOpenReviews={onOpenReviews} />
    </div>
  );
};

export default React.memo(TitlePoster);
