import React from 'react';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST } from '../../lib/oracleTheme';
import SectionTitle from './SectionTitle';
import type { TitleMovie } from './shared';

// Onde assistir — aparece embaixo do pôster no desktop e depois da
// sinopse no celular. Sempre presente (com a data de estreia ou "não
// disponível"), pra estrutura da ficha ser a mesma em qualquer filme.

interface TitleWhereToWatchProps {
  watchProviders: TitleMovie['watchProviders'];
  releaseDate: string | undefined;
}

const TitleWhereToWatch: React.FC<TitleWhereToWatchProps> = ({ watchProviders, releaseDate }) => {
  const { t, i18n } = useTranslation();
  const providers = watchProviders?.flatrate || [];
  const hasStreamingProviders = providers.length > 0;

  // Obra ainda não lançada, com data de estreia conhecida — usada pra
  // preencher "Assistir em" com a data em vez da mensagem genérica de "não
  // disponível", já que nesse caso a ausência de streaming não é falta de
  // informação, é só que ainda não chegou lá.
  const releaseDateObj = releaseDate
    ? new Date(releaseDate.length === 10 ? `${releaseDate}T12:00:00` : releaseDate)
    : null;
  const isUpcomingRelease = !!releaseDateObj && !isNaN(releaseDateObj.getTime()) && releaseDateObj.getTime() > Date.now();
  const formattedReleaseDate = releaseDateObj?.toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <SectionTitle>{t('movies.watchOn')}</SectionTitle>
      <div className="mt-3">
        {hasStreamingProviders ? (
          <ul className="flex flex-wrap gap-2.5">
            {providers.map((provider) => (
              <li key={provider.provider_id}>
                <img
                  src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                  alt={provider.provider_name}
                  title={provider.provider_name}
                  loading="lazy"
                  decoding="async"
                  className="w-11 h-11 rounded-xl object-cover ring-1 ring-white/10"
                />
              </li>
            ))}
          </ul>
        ) : isUpcomingRelease ? (
          <p className="text-sm" style={{ color: PAPER }}>
            {t('movies.upcomingRelease', { date: formattedReleaseDate, defaultValue: `Estreia em ${formattedReleaseDate}` })}
          </p>
        ) : (
          <p className="text-sm" style={{ color: MIST }}>{t('movies.noStreamingAvailable')}</p>
        )}
      </div>
    </>
  );
};

export default React.memo(TitleWhereToWatch);
