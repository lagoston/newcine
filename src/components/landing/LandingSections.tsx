import React from 'react';
import type { Movie } from '../../lib/tmdb';
import LandingSteps from './LandingSteps';
import LandingOracles from './LandingOracles';
import LandingPersona from './LandingPersona';
import LandingFriends from './LandingFriends';
import LandingExtras from './LandingExtras';
import LandingTrending from './LandingTrending';
import LandingFinal from './LandingFinal';

// Tudo o que vem depois do herói na home de visitante (04/11/2026), num
// pedaço próprio do build: o GuestLanding carrega este arquivo com lazy().
// Motivo: o Home.tsx importa o GuestLanding direto, então sem a divisão
// quem já tem conta baixaria a página de visitante inteira junto com a home
// dele. Assim, o herói chega com a Home e o resto vem logo atrás.

export interface LandingSectionsProps {
  movies: Movie[];
  loading: boolean;
  onMovieClick: (movie: Movie) => void;
  onMovieHover: (movie: Movie) => void;
  onViewAll: () => void;
}

const LandingSections: React.FC<LandingSectionsProps> = ({ movies, loading, onMovieClick, onMovieHover, onViewAll }) => (
  <>
    <LandingSteps />
    <LandingOracles onMovieClick={onMovieClick} />
    <LandingPersona />
    <LandingFriends onMovieClick={onMovieClick} />
    <LandingExtras />
    <LandingTrending movies={movies} loading={loading} onMovieClick={onMovieClick} onMovieHover={onMovieHover} onViewAll={onViewAll} />
    <LandingFinal />
  </>
);

export default LandingSections;
