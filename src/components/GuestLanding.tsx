import React, { Suspense, lazy } from 'react';
import { Movie } from '../lib/tmdb';
import LandingHero from './landing/LandingHero';
import './landing/landing.css';

// As seções abaixo do herói vêm num pedaço separado do build (ver
// landing/LandingSections): quem já tem conta não baixa a página de visitante.
const LandingSections = lazy(() => import('./landing/LandingSections'));

// Home de quem ainda não tem conta — o "cartão de visitas" do CineOracle.
//
// 04/11/2026 (pedido do Bruno: a página tinha ficado para trás depois de
// tantas atualizações). Reescrita para vender o CineOracle de hoje, primeiro
// para um cinéfilo; o jogo entra no fim, como tempero:
//   1. Herói — "Sua nota, antes do play.": a mão das cartas dos oráculos e o
//      ingresso do filme nº 1 da semana, com a nota do público e a sua ("?").
//   2. Como funciona — avaliar de 0 a 10 (e a Watchlist, e o IMDb), a nota
//      prevista com a chance de 10, a Persona.
//   3. Os três oráculos — o que cada corredor guarda, com títulos reais das
//      prateleiras de cada um (tocar abre o menu do título).
//   4. A Persona — as nove prateleiras e uma personalidade real (MCR).
//   5. Amigos — Feed dos Amigos, Sussurros e Conexão.
//   6. Entre uma sessão e outra — Poster Jackpot, tags e eventos, perfil.
//   7. Em alta esta semana — a lista ao vivo do TMDB.
//   8. A faixa de papel com o convite final.
// Tudo é feito das peças do próprio site (cartas, selo da nota prevista,
// cores das notas e das prateleiras, anel dos stories, PosterArt, molduras
// e banners) — nada de ilustração genérica. Os dados de exemplo estão em
// landing/landingData.ts, com a origem de cada um.
//
// As props são as mesmas de antes (Home.tsx não muda): a lista em alta, o
// carregamento e os cliques que abrem o menu do título.

interface GuestLandingProps {
  movies: Movie[];
  loading: boolean;
  onMovieClick: (movie: Movie) => void;
  onMovieHover: (movie: Movie) => void;
  onViewAll: () => void;
}

const GuestLanding: React.FC<GuestLandingProps> = ({ movies, loading, onMovieClick, onMovieHover, onViewAll }) => (
  <div className="relative min-h-screen overflow-x-hidden">
    <LandingHero movies={movies} loading={loading} onMovieClick={onMovieClick} />
    {/* Enquanto o pedaço de baixo chega, o espaço fica reservado (a página
        não "pula" se alguém rolar muito rápido). */}
    <Suspense fallback={<div className="min-h-[100vh] border-t border-white/[0.07]" aria-busy="true" />}>
      <LandingSections movies={movies} loading={loading} onMovieClick={onMovieClick} onMovieHover={onMovieHover} onViewAll={onViewAll} />
    </Suspense>
  </div>
);

export default GuestLanding;
