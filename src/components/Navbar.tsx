import React, { useEffect, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Library as LibraryIcon, LogIn, LogOut, User, Eye, Home, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { LogoLockup, LogoMark, LogoWordmark } from './Logo';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import NavbarSearch from './NavbarSearch';
import MobileDock from './MobileDock';
import { WhispersBell, WhispersHost } from './WhispersBell';
import { FOCUS_RING } from '../lib/oracleTheme';
// Carregado sob demanda: a Navbar aparece em TODAS as páginas, então um
// import direto aqui colocava o modal inteiro (~100 KB com as frases do
// Oráculo e os submodais de review/recomendação) no pacote inicial de
// qualquer visita — mesmo que o usuário nunca abrisse um filme pela busca.
const MovieDetailsModal = lazy(() => import('./MovieDetailsModal'));
import { Movie } from '../lib/tmdb';
import { NavbarSeasonalAccent } from './seasonal/SeasonalDecor';

// Topo do site.
//
// Celular e tablet (abaixo de 1024px), no jeito de app:
//
//   [olho]            CineOracle            [sino]
//
// • O Olho Lunar à esquerda leva para o Início (ou volta ao topo, se já
//   estiver lá); o logotipo fica no centro; o sino dos Sussurros, à direita.
// • A navegação fica na barra de vidro da base (MobileDock). O idioma foi
//   para as Configurações do Perfil.
// • Sem conta: assinatura (olho + logotipo) à esquerda, idioma e Entrar à
//   direita.
//
// Computador: assinatura, as cinco páginas no meio e, à direita, busca,
// sino, idioma e Sair.
//
// No topo da página a barra é transparente (fica sobre o fundo da página,
// como nos apps); rolando, vira vidro com uma linha fina embaixo.

function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return scrolled;
}

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, session } = useAuth();
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const { t } = useTranslation();
  const scrolled = useScrolled();
  const onHome = location.pathname === '/';

  const handleMovieSelect = (movie: Movie) => {
    setSelectedMovie(movie);
  };

  // Tocar na marca estando no Início: volta ao topo.
  const handleBrandClick = () => {
    if (onHome) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Item de navegação (computador) — compacto o bastante pra 5 links +
  // busca + sino + idioma + sair caberem sem espremer nada.
  const NavLink = ({ to, icon: Icon, children, labelClassName = 'hidden xl:inline' }: {
    to: string;
    icon: React.ElementType;
    children: React.ReactNode;
    labelClassName?: string;
  }) => {
    // A Central dos Oráculos continua acesa na Biblioteca dos Oráculos e no Duelo.
    const isActive = location.pathname === to || (to === '/oracle' && location.pathname.startsWith('/oracle/'));
    return (
      <Link
        to={to}
        aria-current={isActive ? 'page' : undefined}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 relative whitespace-nowrap ${
          isActive
            ? 'text-white bg-gradient-to-r from-violet-500/25 to-fuchsia-500/25 border border-violet-400/40'
            : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'
        }`}
      >
        <Icon className="h-4.5 w-4.5 flex-shrink-0" strokeWidth={isActive ? 2.25 : 2} />
        <span className={labelClassName}>{children}</span>
      </Link>
    );
  };

  const brandLabel = t('nav.brandHome');

  return (
    <>
    <nav
      className={`fixed top-0 left-0 right-0 z-40 transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300 border-b ${
        scrolled
          ? 'bg-[#120D22]/80 backdrop-blur-2xl backdrop-saturate-150 border-white/[0.07] shadow-lg shadow-black/25'
          : 'bg-transparent border-transparent'
      }`}
    >
      {/* Fio do evento sazonal no pé da barra (só durante o evento). */}
      <NavbarSeasonalAccent />
      <div className="max-w-screen-2xl mx-auto px-2 sm:px-4 lg:px-8">
        {/* Altura total = 3.5rem (+ área segura), a mesma que o App reserva
            no topo de todas as páginas. */}
        <div
          className="relative flex items-center justify-between gap-3"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            minHeight: 'calc(env(safe-area-inset-top) + 3.5rem)',
          }}
        >
          {/* ---------- Celular e tablet ---------- */}
          {user ? (
            <>
              <Link
                to="/"
                onClick={handleBrandClick}
                aria-label={brandLabel}
                className={`lg:hidden grid place-items-center w-11 h-11 min-h-0 min-w-0 rounded-full hover:bg-white/10 transition-colors ${FOCUS_RING}`}
              >
                <LogoMark className="w-[30px] h-auto" />
              </Link>
              <div className="lg:hidden absolute inset-x-0 bottom-0 h-14 flex items-center justify-center pointer-events-none">
                <Link
                  to="/"
                  onClick={handleBrandClick}
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-auto min-h-0 min-w-0 px-3 py-3"
                >
                  <LogoWordmark className="h-3 w-auto" />
                </Link>
              </div>
              <div className="lg:hidden flex items-center">
                <WhispersBell />
              </div>
            </>
          ) : (
            <>
              <Link
                to="/"
                onClick={handleBrandClick}
                aria-label={brandLabel}
                className={`lg:hidden flex items-center min-h-0 min-w-0 h-11 px-2 rounded-xl ${FOCUS_RING}`}
              >
                <LogoLockup markClassName="w-[30px] h-auto" wordClassName="h-3 w-auto" />
              </Link>
              <div className="lg:hidden flex items-center gap-1 pr-1">
                <LanguageSwitcher />
                {location.pathname !== '/auth' && (
                  <Link
                    to="/auth"
                    className="flex items-center h-10 min-h-0 px-4 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white text-sm font-semibold rounded-full"
                  >
                    <LogIn className="h-4 w-4 mr-2" aria-hidden />
                    {t('auth.signIn')}
                  </Link>
                )}
              </div>
            </>
          )}

          {/* ---------- Computador ---------- */}
          <Link
            to="/"
            onClick={handleBrandClick}
            aria-label={brandLabel}
            className={`hidden lg:flex items-center flex-shrink-0 min-h-0 h-11 px-1 rounded-xl ${FOCUS_RING}`}
          >
            <LogoLockup markClassName="w-6 h-auto" wordClassName="h-3 w-auto" />
          </Link>

          {user && (
            <div className="hidden lg:flex flex-1 items-center justify-center gap-1 min-w-0">
              <NavLink to="/" icon={Home}>{t('nav.home')}</NavLink>
              <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
              <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
              <NavLink to="/community" icon={Users}>{t('nav.community')}</NavLink>
              <NavLink to="/profile" icon={User}>{t('nav.profile')}</NavLink>
            </div>
          )}

          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            <NavbarSearch onMovieSelect={handleMovieSelect} />
            {user && <WhispersBell />}
            <LanguageSwitcher />
            {user ? (
              <SignOutButton onSignOut={() => navigate('/auth')} t={t} labelClassName="hidden xl:inline" />
            ) : (
              <Link
                to="/auth"
                className="flex items-center px-5 py-2 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-fuchsia-500/30 transition-all duration-300"
              >
                <LogIn className="h-4 w-4 mr-2" />
                {t('auth.signIn')}
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>

    {user && <MobileDock onMovieSelect={handleMovieSelect} movieOpen={selectedMovie !== null} />}
    {user && <WhispersHost />}

    {selectedMovie && createPortal(
      <Suspense fallback={null}>
      <MovieDetailsModal
        movie={selectedMovie}
        isOpen={true}
        onClose={() => setSelectedMovie(null)}
        onAddToLibrary={() => {
          if (!session) navigate('/auth');
        }}
      />
      </Suspense>,
      document.body
    )}
    </>
  );
}

function SignOutButton({ onSignOut, t, labelClassName = '' }: { onSignOut: () => void; t: (key: string) => string; labelClassName?: string }) {
  const { signOut } = useAuth();
  const handleClick = async () => {
    try {
      await signOut();
      onSignOut();
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  };
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300 font-medium border border-transparent hover:border-red-500/20 whitespace-nowrap"
    >
      <LogOut className="h-4.5 w-4.5" />
      <span className={labelClassName}>{t('auth.signOut')}</span>
    </button>
  );
}

export default Navbar;
