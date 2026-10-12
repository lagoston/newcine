import React, { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PAPER, MIST, PIXEL, VELVET, FOCUS_RING, glassPanel } from '../../lib/oracleTheme';
import { PROFILE_IMAGE_BASE } from '../../lib/castPhotos';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import PersonPageSheet, { type PersonSeed } from '../PersonPageSheet';
import MovieDetailsModal from '../MovieDetailsModal';
import type { ObservatoryPerson } from '../../hooks/useTasteObservatory';
import { ModuleTitle, Ring, affinityColor, formatOne } from './observatoryKit';

// As pessoas que a pessoa mais ama no cinema: atores e diretores com a maior
// média de nota (com pelo menos 3 títulos de um ator, 2 de um diretor). A
// foto fica dentro de um anel: o comprimento do anel é quantos títulos ela
// viu dessa pessoa, a cor é a média que ela dá. Tocar abre a página da
// pessoa (com o "Você e…" e o Top 10 dela).

interface PeopleOrbitProps {
  actors: ObservatoryPerson[];
  directors: ObservatoryPerson[];
  ownerName?: string;
}

const Portrait: React.FC<{ person: ObservatoryPerson; size: number }> = ({ person, size }) => {
  const [failed, setFailed] = useState(false);
  const photo = !failed && person.photo ? `${PROFILE_IMAGE_BASE}${person.photo}` : null;
  return (
    <span className="relative grid place-items-center rounded-full overflow-hidden" style={{ width: size, height: size, background: VELVET }}>
      <span style={{ ...PIXEL, color: MIST }} className="text-lg" aria-hidden>
        {person.name.charAt(0)}
      </span>
      {photo && <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />}
    </span>
  );
};

const PeopleOrbit: React.FC<PeopleOrbitProps> = ({ actors, directors, ownerName }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [sheet, setSheet] = useState<PersonSeed | null>(null);
  const [nestedMovie, setNestedMovie] = useState<Movie | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);

  const openPerson = (person: ObservatoryPerson) => {
    if (!person.id) {
      toast.error(t('profile.observatory.personUnavailable'));
      return;
    }
    setSheet({ id: person.id, name: person.name, profilePath: person.photo });
  };

  const openMovie = async (movieId: number) => {
    setLoadingMovieId(movieId);
    try {
      setNestedMovie(await getMovieDetailsFromDB(movieId, 'movie'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setLoadingMovieId(null);
    }
  };

  const summary = (person: ObservatoryPerson) =>
    t('profile.observatory.personSummary', { avg: formatOne(person.avg, i18n.language), count: person.count });

  // Um grupo (Atuação ou Direção): o primeiro em destaque, os outros numa
  // grade de 4 (até 8 atores, 4 diretores). O anel de cada um é medido
  // contra o que a pessoa mais viu no grupo.
  const group = (role: 'cast' | 'director', list: ObservatoryPerson[], heading: string, hint: string, empty: string) => {
    const maxCount = Math.max(1, ...list.map((p) => p.count));
    const [hero, ...rest] = list;
    return (
      <div>
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium" style={{ color: PAPER }}>
            {heading}
          </span>
          <span className="text-[11px]" style={{ color: MIST }}>
            {hint}
          </span>
        </p>
        {!hero ? (
          <p className="mt-3 text-[13px]" style={{ color: MIST }}>
            {empty}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openPerson(hero)}
              className={`group mt-3 w-full flex items-center justify-start gap-4 rounded-2xl p-2 -mx-2 text-left transition hover:bg-white/[0.04] ${FOCUS_RING}`}
              aria-label={`${hero.name}: ${summary(hero)}`}
            >
              <motion.span
                initial={reduceMotion ? false : { scale: 0.85, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                <Ring size={80} stroke={4} fraction={hero.count / maxCount} color={affinityColor(hero.avg)}>
                  <Portrait person={hero} size={66} />
                </Ring>
              </motion.span>
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-snug group-hover:underline underline-offset-4" style={{ color: PAPER }}>
                  {hero.name}
                </span>
                <span className="mt-1 flex items-baseline gap-2">
                  <span style={{ ...PIXEL, color: PAPER }} className="text-[28px] leading-none tabular-nums">
                    {formatOne(hero.avg, i18n.language)}
                  </span>
                  <span className="text-[12px]" style={{ color: MIST }}>
                    {t('profile.observatory.inTitles', { count: hero.count })}
                  </span>
                </span>
              </span>
            </button>
            {rest.length > 0 && (
              <ol className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1">
                {rest.slice(0, role === 'cast' ? 8 : 4).map((person, i) => (
                  <motion.li
                    key={`${role}:${person.key}`}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.06 * i }}
                    className="min-w-0"
                  >
                    <button
                      type="button"
                      onClick={() => openPerson(person)}
                      className={`w-full flex flex-col items-center gap-1 rounded-xl py-1.5 transition hover:bg-white/[0.04] ${FOCUS_RING}`}
                      aria-label={`${person.name}: ${summary(person)}`}
                      title={`${person.name}: ${summary(person)}`}
                    >
                      <Ring size={56} stroke={3} fraction={person.count / maxCount} color={affinityColor(person.avg)} glow={false}>
                        <Portrait person={person} size={46} />
                      </Ring>
                      <span className="w-full line-clamp-2 min-h-[2.5em] break-words text-center text-[11px] leading-tight" style={{ color: PAPER }}>
                        {person.name}
                      </span>
                      <span style={{ ...PIXEL, color: MIST }} className="text-[12px] leading-none tabular-nums">
                        {formatOne(person.avg, i18n.language)}
                      </span>
                    </button>
                  </motion.li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <section className="h-full rounded-3xl p-5 sm:p-6 flex flex-col" style={glassPanel('#FB923C')}>
      <ModuleTitle
        title={ownerName ? t('profile.observatory.peopleTitleOf', { name: ownerName }) : t('profile.observatory.peopleTitle')}
        hint={t('profile.observatory.peopleHint')}
      />
      <div className="mt-5 flex-1 flex flex-col justify-between gap-6">
        {group('cast', actors, t('profile.observatory.roleCast'), t('profile.observatory.peopleMinCast'), t('profile.observatory.peopleEmptyCast'))}
        <div className="border-t border-white/[0.07] pt-5">
          {group('director', directors, t('profile.observatory.roleDirector'), t('profile.observatory.peopleMinDirector'), t('profile.observatory.peopleEmptyDirector'))}
        </div>
      </div>

      <PersonPageSheet
        person={sheet}
        onClose={() => setSheet(null)}
        onOpenMovie={openMovie}
        loadingMovieId={loadingMovieId}
        escapeEnabled={!nestedMovie}
      />
      {nestedMovie && <MovieDetailsModal movie={nestedMovie} isOpen={true} onClose={() => setNestedMovie(null)} />}
    </section>
  );
};

export default PeopleOrbit;
