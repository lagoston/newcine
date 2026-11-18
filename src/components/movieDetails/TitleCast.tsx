import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PROFILE_IMAGE_BASE } from '../../lib/castPhotos';
import { VELVET, PAPER, MIST, FOCUS_RING } from '../../lib/oracleTheme';
import type { PersonSeed } from '../PersonPageSheet';
import SectionTitle from './SectionTitle';
import { SECTION_CLASS, type TitleMovie } from './shared';
import { useCastPhotos } from './useCastPhotos';

// Elenco (os 6 primeiros). As fotos chegam por conta própria (useCastPhotos)
// e re-renderizam só esta seção.

interface TitleCastProps {
  movie: TitleMovie;
  // abre a página de uma pessoa por cima do menu
  onOpenPerson: (person: PersonSeed) => void;
}

const TitleCast: React.FC<TitleCastProps> = ({ movie, onOpenPerson }) => {
  const { t } = useTranslation();
  const cast = movie.credits?.cast?.slice(0, 6) || [];
  const castIdsKey = (movie.credits?.cast || []).slice(0, 6).map((c) => c.id).join(',');
  const { photos: castPhotos, failed: failedCastPhotos, markFailed } = useCastPhotos(movie.id, movie.media_type, castIdsKey);

  return (
    <section className={SECTION_CLASS}>
      <SectionTitle>{t('movies.cast')}</SectionTitle>
      {cast.length > 0 ? (
        <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {cast.map((actor) => {
            const photo = failedCastPhotos.has(actor.id) ? null : castPhotos[actor.id] ?? actor.profile_path ?? null;
            // Tocar no nome abre a página da pessoa (por cima
            // deste menu), com o Top 10 de filmes dela.
            const canOpen = Number.isInteger(actor.id) && actor.id > 0;
            return (
            <li key={actor.id} className="min-w-0">
              <button
                type="button"
                disabled={!canOpen}
                onClick={() => canOpen && onOpenPerson({ id: actor.id, name: actor.name, profilePath: photo })}
                aria-label={t('person.open', { name: actor.name })}
                className={`group flex w-[calc(100%+1rem)] -mx-2 items-center gap-3 min-w-0 px-2 py-1.5 rounded-xl text-left transition enabled:hover:bg-white/[0.06] ${FOCUS_RING}`}
              >
                <span
                  aria-hidden
                  className="relative grid place-items-center w-11 h-11 shrink-0 rounded-full overflow-hidden ring-1 ring-white/10 group-hover:ring-white/30 transition text-sm font-semibold"
                  style={{ background: VELVET, color: MIST }}
                >
                  {actor.name.charAt(0)}
                  {photo && (
                    <img
                      src={`${PROFILE_IMAGE_BASE}${photo}`}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={() => markFailed(actor.id)}
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate" style={{ color: PAPER }}>{actor.name}</span>
                  {actor.character && (
                    <span className="block text-sm truncate" style={{ color: MIST }}>{actor.character}</span>
                  )}
                </span>
                {canOpen && (
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-80 transition" style={{ color: MIST }} aria-hidden />
                )}
              </button>
            </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm" style={{ color: MIST }}>{t('movies.noCastAvailable')}</p>
      )}
    </section>
  );
};

export default React.memo(TitleCast);
