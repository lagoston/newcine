import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { PAPER, MIST, PIXEL, VELVET, NIGHT, FOCUS_RING, glassPanel, ratingTone, withAlpha } from '../../lib/oracleTheme';
import { RANK_MEDALS } from '../../lib/libraryLayouts';
import { PROFILE_IMAGE_BASE } from '../../lib/castPhotos';
import { getMovieDetailsFromDB, type Movie } from '../../lib/tmdb';
import PersonPageSheet, { type PersonSeed } from '../PersonPageSheet';
import MovieDetailsModal from '../MovieDetailsModal';
import type { ObservatoryPerson } from '../../hooks/useTasteObservatory';
import { ModuleTitle, formatOne } from './observatoryKit';

// As pessoas que a pessoa mais ama no cinema: os atores e os diretores com a
// maior média de nota (13/10/2026). Uma chave troca entre Atuação e Direção;
// cada um é um pódio — ouro no meio, prata e bronze dos lados, cada um no
// seu degrau — com a foto, o nome e a média; os seguintes (4º e 5º) vêm em
// linhas embaixo. Tocar abre a página da pessoa (com o "Você e…" e o Top 10
// dela).
//
// Corte: 3 títulos para ator (cada filme tem vários atores, então 1 ou 2
// títulos não dizem muito) e 2 para diretor. Biblioteca pequena, com menos
// de 3 atores no corte: ele cai para 2. O rótulo mostra o corte que valeu.

interface PeopleOrbitProps {
  actors: ObservatoryPerson[];
  directors: ObservatoryPerson[];
  ownerName?: string;
}

const Portrait: React.FC<{ person: ObservatoryPerson; size: number; ring?: string }> = ({ person, size, ring }) => {
  const [failed, setFailed] = useState(false);
  const photo = !failed && person.photo ? `${PROFILE_IMAGE_BASE}${person.photo}` : null;
  return (
    <span
      className="relative grid place-items-center shrink-0 rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        background: VELVET,
        boxShadow: ring ? `0 0 0 2px ${NIGHT}, 0 0 0 4px ${ring}, 0 10px 26px -10px ${ring}` : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
      }}
    >
      <span style={{ ...PIXEL, color: MIST }} className={size > 50 ? 'text-xl' : 'text-sm'} aria-hidden>
        {person.name.charAt(0)}
      </span>
      {photo && <img src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 w-full h-full object-cover" />}
    </span>
  );
};

// A média, sempre como número, na cor da faixa da nota.
const RatingPill: React.FC<{ avg: number; language: string; size?: 'md' | 'sm' }> = ({ avg, language, size = 'md' }) => {
  const tone = ratingTone(Math.round(avg));
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full tabular-nums leading-none ${size === 'md' ? 'h-7 px-2.5 text-[15px]' : 'h-6 px-2 text-[13px]'}`}
      style={{ ...PIXEL, color: tone.color, background: withAlpha(tone.color, 0.12), boxShadow: `inset 0 0 0 1px ${withAlpha(tone.color, 0.35)}` }}
    >
      {formatOne(avg, language)}
    </span>
  );
};

// Ordem no pódio: prata, ouro, bronze. Altura de cada degrau.
const PODIUM_ORDER = [1, 0, 2];
const STEP_HEIGHT = [44, 30, 20];
const PORTRAIT = [76, 60, 60];

const PeopleOrbit: React.FC<PeopleOrbitProps> = ({ actors, directors, ownerName }) => {
  const { t, i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [sheet, setSheet] = useState<PersonSeed | null>(null);
  const [nestedMovie, setNestedMovie] = useState<Movie | null>(null);
  const [loadingMovieId, setLoadingMovieId] = useState<number | null>(null);
  const [role, setRole] = useState<'cast' | 'director'>(actors.length === 0 && directors.length > 0 ? 'director' : 'cast');

  const openPerson = (person: ObservatoryPerson, personRole: 'cast' | 'director') => {
    if (!person.id) {
      toast.error(t('profile.observatory.personUnavailable'));
      return;
    }
    setSheet({ id: person.id, name: person.name, profilePath: person.photo, role: personRole });
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

  const group = (groupRole: 'cast' | 'director', list: ObservatoryPerson[], empty: string) => {
    const podium = list.slice(0, 3);
    const rest = list.slice(3, 5);
    return (
      <div>
        {list.length === 0 ? (
          <p className="mt-3 text-[13px]" style={{ color: MIST }}>
            {empty}
          </p>
        ) : (
          <>
            <ol className="mt-3 grid grid-cols-3 items-end gap-2">
              {PODIUM_ORDER.map((place) => {
                const person = podium[place];
                if (!person) return <li key={place} aria-hidden />;
                const medal = RANK_MEDALS[place];
                return (
                  <motion.li
                    key={`${groupRole}:${person.key}`}
                    className="min-w-0"
                    initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: place === 0 ? 0.05 : 0.18 + place * 0.08, type: 'spring', stiffness: 220, damping: 22 }}
                  >
                    <button
                      type="button"
                      onClick={() => openPerson(person, groupRole)}
                      className={`group w-full flex flex-col items-center justify-end gap-1.5 rounded-2xl text-center ${FOCUS_RING}`}
                      aria-label={`${place + 1}. ${person.name}: ${summary(person)}`}
                      title={`${person.name}: ${summary(person)}`}
                    >
                      <span className="transition-transform duration-300 group-hover:-translate-y-0.5">
                        <Portrait person={person} size={PORTRAIT[place]} ring={medal} />
                      </span>
                      <span className="w-full mt-1 line-clamp-2 min-h-[2.4em] break-words text-[12.5px] font-medium leading-tight group-hover:underline underline-offset-2" style={{ color: PAPER }}>
                        {person.name}
                      </span>
                      <RatingPill avg={person.avg} language={i18n.language} size={place === 0 ? 'md' : 'sm'} />
                      <span
                        className="mt-1 w-full grid place-items-center rounded-t-xl"
                        style={{
                          height: STEP_HEIGHT[place],
                          background: `linear-gradient(180deg, ${withAlpha(medal, 0.26)}, ${withAlpha(medal, 0.05)})`,
                          boxShadow: `inset 0 1.5px 0 ${withAlpha(medal, 0.75)}`,
                        }}
                        aria-hidden
                      >
                        <span style={{ ...PIXEL, color: medal }} className="text-[15px] leading-none">
                          {place + 1}
                        </span>
                      </span>
                    </button>
                  </motion.li>
                );
              })}
            </ol>
            {rest.length > 0 && (
              <ol className="mt-2 space-y-1" start={4}>
                {rest.map((person, i) => (
                  <li key={`${groupRole}:${person.key}`}>
                    <button
                      type="button"
                      onClick={() => openPerson(person, groupRole)}
                      className={`group w-full flex items-center justify-start gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-white/[0.04] ${FOCUS_RING}`}
                      aria-label={`${i + 4}. ${person.name}: ${summary(person)}`}
                    >
                      <span style={{ ...PIXEL, color: MIST }} className="w-4 shrink-0 text-center text-[13px] leading-none">
                        {i + 4}
                      </span>
                      <Portrait person={person} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium group-hover:underline underline-offset-2" style={{ color: PAPER }}>
                          {person.name}
                        </span>
                        <span className="block text-[11px]" style={{ color: MIST }}>
                          {t('profile.observatory.inTitles', { count: person.count })}
                        </span>
                      </span>
                      <RatingPill avg={person.avg} language={i18n.language} size="sm" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    );
  };

  const list = role === 'cast' ? actors : directors;
  // Corte que valeu: 3 para ator (2 quando a biblioteca é pequena), 2 para diretor.
  const minRule = role === 'cast' && !actors.some((p) => p.count < 3) ? 3 : 2;

  return (
    <section className="h-full rounded-3xl p-5 sm:p-6 flex flex-col" style={glassPanel('#F5C451')}>
      <ModuleTitle
        title={ownerName ? t('profile.observatory.peopleTitleOf', { name: ownerName }) : t('profile.observatory.peopleTitle')}
        hint={t('profile.observatory.peopleHint')}
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div role="tablist" aria-label={t('profile.observatory.peopleTitle')} className="inline-flex p-1 rounded-full ring-1 ring-white/10" style={{ background: 'rgba(18,13,34,0.6)' }}>
          {(['cast', 'director'] as const).map((id) => {
            const active = role === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRole(id)}
                className={`relative h-9 min-h-[36px] px-4 rounded-full text-[13px] font-semibold transition ${FOCUS_RING}`}
                style={{ color: active ? NIGHT : MIST }}
              >
                {active && (
                  <motion.span
                    layoutId="people-role-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: '#F5C451' }}
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{id === 'cast' ? t('profile.observatory.roleCast') : t('profile.observatory.roleDirector')}</span>
              </button>
            );
          })}
        </div>
        {list.length > 0 && (
          <span className="text-[11px] text-right" style={{ color: MIST }}>
            {t('profile.observatory.peopleMin', { count: minRule })}
          </span>
        )}
      </div>
      <div className="mt-2 flex-1" role="tabpanel">
        <AnimatePresence mode="wait">
          <motion.div
            key={role}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
          >
            {role === 'cast'
              ? group('cast', actors, t('profile.observatory.peopleEmptyCast'))
              : group('director', directors, t('profile.observatory.peopleEmptyDirector'))}
          </motion.div>
        </AnimatePresence>
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
