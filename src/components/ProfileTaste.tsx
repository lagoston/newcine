import React, { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import RatingSpectrum from './RatingSpectrum';
import EssenceRing from './profile/EssenceRing';
import PeopleOrbit from './profile/PeopleOrbit';
import DecadeReel from './profile/DecadeReel';
import GemCard from './profile/GemCard';
import { useTasteObservatory } from '../hooks/useTasteObservatory';
import type { MovieWithRating } from '../hooks/useProfileData';
import type { UserPersona } from '../lib/persona';
import { PAPER, MIST, PIXEL, ratingTone, glassPanel, colorWithAlpha, PROFILE_ACCENTS } from '../lib/oracleTheme';

// Peças do "retrato de gosto" de um perfil — usadas no seu Perfil e no
// perfil de outra pessoa, pra que os dois falem exatamente a mesma língua:
//   • os números ficam no painel de leitura (profile/TasteHud)
//   • ProfileTasteGrid: o observatório (personalidade + roda dos humores,
//     notas, pessoas, décadas, joia e globo)
//   • ProfileSectionHeading: título Pixelify + dica de cada seção

// Os blocos de estatística são painéis de vidro (glassPanel em
// lib/oracleTheme): a superfície do perfil translúcida, com o reflexo da
// cor de cada bloco. ProfileGlassAmbient põe luzes suaves atrás deles, para
// o vidro ter o que refletir.
export const PROFILE_CARD = 'rounded-2xl p-5 sm:p-6';

// Luzes atrás dos painéis de vidro: manchas grandes e suaves (a primeira na
// cor do banner do dono, quando há). Vai dentro de um container
// "relative isolate". A máscara apaga as bordas da camada, para as manchas
// sumirem aos poucos em vez de terminar numa linha reta.
const AMBIENT_MASK = 'radial-gradient(closest-side, #000 55%, transparent 100%)';

export const ProfileGlassAmbient: React.FC<{ accent?: string }> = ({ accent = '#8B5CF6' }) => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-x-0 -top-10 -bottom-10 -z-10"
    style={{
      background: [
        `radial-gradient(38% 26% at 18% 14%, ${colorWithAlpha(accent, 0.22)}, transparent 70%)`,
        'radial-gradient(34% 24% at 82% 32%, rgba(232,121,249,0.16), transparent 70%)',
        'radial-gradient(36% 22% at 22% 64%, rgba(56,189,248,0.13), transparent 70%)',
        'radial-gradient(40% 22% at 78% 86%, rgba(45,212,191,0.12), transparent 70%)',
      ].join(', '),
      WebkitMaskImage: AMBIENT_MASK,
      maskImage: AMBIENT_MASK,
    }}
  />
);

export const ProfileSectionHeading: React.FC<{ title: string; hint?: string; action?: React.ReactNode }> = ({ title, hint, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h2 style={{ ...PIXEL, color: PAPER }} className="text-2xl sm:text-3xl leading-tight">
        {title}
      </h2>
      {hint && (
        <p className="mt-1 text-sm" style={{ color: MIST }}>
          {hint}
        </p>
      )}
    </div>
    {action}
  </div>
);

// ---------------------------------------------------------------------------
// Retrato de gosto — o observatório (12/10/2026, refeito em 13/10)
// ---------------------------------------------------------------------------
//
// Cada coisa leva ao que mostra: humor → prateleira, pessoa → página da
// pessoa, década → filmes, país → filmes, joia → o filme. A nota aparece
// sempre como número, na cor da faixa dela.
//   • Personalidade + roda dos humores (um anel com os 9 humores, os temas
//     flutuando dentro e a personalidade ao lado) — no topo, largura toda
//   • Notas (espectro)
//   • Pessoas (pódio de atores e diretores) | Décadas (linha do tempo + os
//     melhores da década, com "Organizar" no seu perfil)
//   • Joia menos conhecida (nota 7 ou mais) | Globo (atlas)

const TasteGlobe = lazy(() => import('./profile/TasteGlobe'));

interface ProfileTasteGridProps {
  userId?: string;
  movies: MovieWithRating[];
  persona: UserPersona | null;
  personaLoading?: boolean;
  // Seu próprio perfil (textos em "você", Organizar as décadas).
  isOwn?: boolean;
  ratingCounts: number[];
  countryCounts: Record<string, number>;
  countryAvgRatings: Record<string, number>;
  onViewCountryMovies?: (countryCode: string, countryName: string) => void;
  // Rótulo da nota do dono do perfil na joia ("Sua nota" / "Nota de @fulano").
  ownerRatingLabel?: string;
  // Perfil de outra pessoa: o @ dela nos títulos ("Temas que @fulano mais ama").
  ownerName?: string;
  // Título do espectro de notas (padrão: "Distribuição de notas") e o que
  // fazer ao tocar numa nota (ex.: ir pra prateleira dela na Coleção).
  ratingTitle?: string;
  onJumpToRating?: (rating: number) => void;
  // Cartões extras (ex.: pins de outra pessoa).
  extra?: React.ReactNode;
}

export const ProfileTasteGrid: React.FC<ProfileTasteGridProps> = ({
  userId,
  movies,
  persona,
  personaLoading = false,
  isOwn = false,
  ratingCounts,
  countryCounts,
  countryAvgRatings,
  onViewCountryMovies,
  ownerRatingLabel,
  ownerName,
  ratingTitle,
  onJumpToRating,
  extra,
}) => {
  const { t, i18n } = useTranslation();
  const observatory = useTasteObservatory(userId, movies, persona);
  const ratingLabel = ownerRatingLabel ?? t('home.desk.yourRating');

  return (
    <div className="space-y-4">
      <EssenceRing
        slices={observatory.moods}
        counted={observatory.moodsCounted}
        persona={persona}
        personaLoading={personaLoading}
        topKeywords={observatory.topKeywords}
        isOwn={isOwn}
        ownerName={ownerName}
      />

      <div className={`${PROFILE_CARD} rounded-3xl`} style={glassPanel(observatory.prior ? ratingTone(Math.round(observatory.prior)).color : PROFILE_ACCENTS.rated)}>
        <RatingSpectrum counts={ratingCounts} average={null} onJump={onJumpToRating} title={ratingTitle ?? t('profile.stats.ratingDistribution')} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="min-w-0">
          <PeopleOrbit actors={observatory.actors} directors={observatory.directors} ownerName={ownerName} />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <DecadeReel bands={observatory.bands} favorite={observatory.favorite} ownerName={ownerName} onSaveOrder={isOwn ? observatory.saveDecadeOrder : undefined} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="min-w-0">
          <GemCard gems={observatory.gems} ownerRatingLabel={ratingLabel} />
        </div>
        <div className="lg:col-span-2 min-w-0">
          <Suspense fallback={<div className="h-[420px] rounded-3xl animate-pulse" style={glassPanel('#2DD4BF')} />}>
            <TasteGlobe countryCounts={countryCounts} countryAvgRatings={countryAvgRatings} language={i18n.language} onViewMovies={onViewCountryMovies} />
          </Suspense>
        </div>
      </div>

      {extra && <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">{extra}</div>}
    </div>
  );
};
