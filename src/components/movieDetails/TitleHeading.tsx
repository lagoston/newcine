import React from 'react';
import { useTranslation } from 'react-i18next';
import { PAPER, MIST, PIXEL } from '../../lib/oracleTheme';
import { certificationClasses, countryFlag, type TitleMovie } from './shared';
import { useTitleCertification } from './useTitleCertification';

// Título e ficha rápida (ano · duração ou temporadas · selo de classificação
// · bandeira). A classificação chega por conta própria (useTitleCertification)
// e re-renderiza só este cabeçalho.

interface TitleHeadingProps {
  movie: TitleMovie;
  // id do <h2> (o aria-labelledby do diálogo aponta para ele)
  titleId: string;
}

const TitleHeading: React.FC<TitleHeadingProps> = ({ movie, titleId }) => {
  const { t, i18n } = useTranslation();
  const certification = useTitleCertification(movie);
  const isTvShow = movie.media_type === 'tv';

  const releaseSource = movie.release_date || movie.first_air_date || '';
  // Ano lido direto do texto "AAAA-MM-DD": new Date() interpretaria como
  // meia-noite UTC e, no Brasil, um filme de 1º de janeiro viraria do ano
  // anterior.
  const releaseYearNumber = parseInt(releaseSource.slice(0, 4), 10);
  const year = Number.isNaN(releaseYearNumber) ? null : releaseYearNumber;

  const runtime = movie.runtime
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
    : null;
  const seasonCount = movie.number_of_seasons || 0;

  // País de origem — aceita o formato do cache (origin_country: ["US"]) e o
  // da API (production_countries: [{ iso_3166_1, name }]).
  const originCountry = (() => {
    if (movie.origin_country && movie.origin_country.length > 0) {
      return { iso_3166_1: movie.origin_country[0], name: '' };
    }
    if (movie.production_countries && movie.production_countries.length > 0) {
      return movie.production_countries[0];
    }
    return null;
  })();
  const originName = (() => {
    if (!originCountry) return '';
    try {
      return new Intl.DisplayNames([i18n.language], { type: 'region' }).of(originCountry.iso_3166_1) || originCountry.name || originCountry.iso_3166_1;
    } catch {
      return originCountry.name || originCountry.iso_3166_1;
    }
  })();

  // Ficha rápida embaixo do título: ano · duração (ou temporadas) · selo
  // de classificação · bandeira. Cada item só entra se existir.
  const metaItems: React.ReactNode[] = [];
  if (year) {
    metaItems.push(
      <span key="year"><span className="sr-only">{t('movies.year')}: </span>{year}</span>
    );
  }
  if (isTvShow ? seasonCount > 0 : !!runtime) {
    metaItems.push(
      <span key="length">
        <span className="sr-only">{isTvShow ? t('movies.seasons') : t('movies.runtime')}: </span>
        {isTvShow ? t('movieModal.seasonCount', { count: seasonCount }) : runtime}
      </span>
    );
  }
  if (certification) {
    metaItems.push(
      <span
        key="cert"
        title={t('movies.ageLabel')}
        className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-bold leading-none ${certificationClasses(certification)}`}
      >
        <span className="sr-only">{t('movies.ageLabel')}: </span>
        {certification}
      </span>
    );
  }
  if (originCountry) {
    metaItems.push(
      <span key="origin" title={originName} className="text-base leading-none">
        <span className="sr-only">{t('movies.origin')}: {originName} </span>
        <span aria-hidden>{countryFlag(originCountry.iso_3166_1)}</span>
      </span>
    );
  }

  return (
    <div className="text-center md:text-left md:pr-12">
      <h2 id={titleId} style={{ ...PIXEL, color: PAPER }} className="text-[1.9rem] sm:text-4xl leading-[1.05] [text-wrap:balance]">
        {movie.title}
      </h2>
      {metaItems.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-x-2.5 gap-y-1.5 text-sm" style={{ color: MIST }}>
          {metaItems.map((item, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span aria-hidden className="w-1 h-1 rounded-full bg-white/25" />}
              {item}
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
};

export default React.memo(TitleHeading);
