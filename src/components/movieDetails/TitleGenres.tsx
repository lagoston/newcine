import React from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MIST } from '../../lib/oracleTheme';
import { MOOD_TAG_CONFIG, displayGenres, lighten, type TitleMovie } from './shared';

// A prateleira dos oráculos é a "mãe" dos gêneros: vem primeiro, na cor
// dela, com a bolinha que brilha, e os gêneros (no máximo 3) saem de dentro
// dela, no mesmo tom mais claro e um pouco menores. Lugar reservado desde a
// abertura; a linha entra com um fade.

interface TitleGenresProps {
  genres: TitleMovie['genres'];
  // a prateleira do título e se ela já foi consultada (useTitleMood, na casca)
  moodKey: string | null;
  moodLoaded: boolean;
  loggedIn: boolean;
}

const TitleGenres: React.FC<TitleGenresProps> = ({ genres, moodKey, moodLoaded, loggedIn }) => {
  const { t, i18n } = useTranslation();
  // Prateleira e gêneros: a linha espera a prateleira (consulta rápida)
  // pra entrar inteira, com fade, em vez de os gêneros serem empurrados.
  const shownGenres = displayGenres(genres, i18n.language.startsWith('pt'));
  const mood = moodKey ? MOOD_TAG_CONFIG[moodKey] : undefined;
  const genresReady = !loggedIn || moodLoaded;

  if (!(shownGenres.length > 0 || mood || (loggedIn && !moodLoaded))) return null;

  return (
    <div className="mt-2.5 h-7 flex items-center justify-center md:justify-start">
      {genresReady && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="min-w-0 max-w-full flex items-center text-sm"
        >
          {mood && (
            <span
              className="relative z-10 shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: mood.color }}
              title={t('movieModal.oracleShelf')}
            >
              <span aria-hidden className="w-1.5 h-1.5 rounded-full" style={{ background: mood.color, boxShadow: `0 0 8px ${mood.color}` }} />
              <span className="sr-only">{t('movieModal.oracleShelf')}: </span>
              {t(mood.labelKey)}
            </span>
          )}
          {mood && shownGenres.length > 0 && (
            // A faixa dos gêneros desliza para fora de trás da
            // prateleira (o recorte começa logo depois dela).
            <span className="min-w-0 flex overflow-hidden">
              <span className="sr-only">{t('movieModal.genres')}: </span>
              <motion.span
                initial={{ x: '-100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="min-w-0 block truncate text-xs font-medium"
                style={{ color: lighten(mood.color, 0.45) }}
              >
                {shownGenres.map((genre) => (
                  <React.Fragment key={genre}>
                    <span aria-hidden className="mx-1.5 opacity-60">·</span>
                    {genre}
                  </React.Fragment>
                ))}
              </motion.span>
            </span>
          )}
          {!mood && shownGenres.length > 0 && (
            <span className="min-w-0 truncate" style={{ color: MIST }}>
              <span className="sr-only">{t('movieModal.genres')}: </span>
              {shownGenres.join(' · ')}
            </span>
          )}
        </motion.p>
      )}
    </div>
  );
};

export default React.memo(TitleGenres);
