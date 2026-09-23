import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Library as LibraryIcon, LogIn, LogOut, User, Menu, X, Eye, Home, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Logo from './Logo';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import NavbarSearch from './NavbarSearch';
import FloatingMobileSearch from './FloatingMobileSearch';
import MovieDetailsModal from './MovieDetailsModal';
import { Movie } from '../lib/tmdb';
import { useWhispers } from '../contexts/WhispersContext';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, session } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // unreadWhispers vem do Context agora — antes esse componente tinha
  // seu PRÓPRIO estado e subscription, uma cópia separada da que o
  // Profile.tsx também mantinha por conta própria; as duas podiam
  // dessincronizar (e a do Profile nem funcionava de verdade, já que
  // escutava o nome de tabela errado). Uma fonte de verdade só agora.
  const { unreadCount: unreadWhispers } = useWhispers();
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const { t } = useTranslation();

  const handleMovieSelect = (movie: Movie) => {
    setIsMenuOpen(false);
    setSelectedMovie(movie);
  };

  // Item de navegação — compacto o bastante pra 5 links + busca + idioma
  // + sair caberem numa navbar de largura real sem espremer nada, mas
  // sem abrir mão do ícone (clareza) nem do texto (acessibilidade).
  const NavLink = ({ to, icon: Icon, children, showBadge = false }: {
    to: string;
    icon: React.ElementType;
    children: React.ReactNode;
    showBadge?: boolean;
  }) => {
    const isActive = location.pathname === to;
    return (
      <Link
        to={to}
        onClick={() => setIsMenuOpen(false)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-300 relative whitespace-nowrap ${
          isActive
            ? 'text-white bg-gradient-to-r from-violet-500/25 to-fuchsia-500/25 border border-violet-400/40'
            : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'
        }`}
      >
        <div className="relative flex-shrink-0">
          <Icon className="h-4.5 w-4.5" strokeWidth={isActive ? 2.25 : 2} />
          {showBadge && unreadWhispers > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full ring-2 ring-slate-900 animate-pulse" />
          )}
        </div>
        <span className="hidden xl:inline">{children}</span>
      </Link>
    );
  };

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-40 bg-slate-950/75 backdrop-blur-2xl border-b border-white/10 shadow-lg shadow-black/20 transition-all duration-300">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3" style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: '1rem',
          minHeight: 'calc(env(safe-area-inset-top) + 3.5rem)'
        }}>
          {/* Zona esquerda — identidade, tamanho fixo */}
          <Link to="/" className="flex items-center text-white group flex-shrink-0">
            <div className="transform transition-transform duration-300 group-hover:scale-110">
              <Logo className="mr-2" />
            </div>
            <span className="text-xl font-bold hidden xs:block bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">CineOracle</span>
          </Link>

          {/* Zona central — navegação, cresce e centraliza no espaço
              que sobra entre logo e ações, em vez de disputar espaço
              dentro de um único bloco à direita. */}
          {user && (
            <div className="hidden lg:flex flex-1 items-center justify-center gap-1 min-w-0">
              <NavLink to="/" icon={Home}>{t('nav.home')}</NavLink>
              <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
              <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
              <NavLink to="/community" icon={Users}>{t('nav.community')}</NavLink>
              <NavLink to="/profile" icon={User} showBadge={true}>{t('nav.profile')}</NavLink>
            </div>
          )}

          {/* Zona direita — busca + idioma + sessão, tamanho fixo */}
          <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
            <NavbarSearch onMovieSelect={handleMovieSelect} />
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

          {/* Mobile — idioma sempre visível + hambúrguer */}
          <div className="flex items-center lg:hidden gap-1 flex-shrink-0">
            <LanguageSwitcher />
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Toggle menu"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-2xl">
          <div className="px-4 py-3 space-y-1.5">
            {user ? (
              <>
                <NavLink to="/" icon={Home}>{t('nav.home')}</NavLink>
                <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
                <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
                <NavLink to="/community" icon={Users}>{t('nav.community')}</NavLink>
                <NavLink to="/profile" icon={User} showBadge={true}>{t('nav.profile')}</NavLink>
                <div className="my-2 border-t border-white/10" />
                <SignOutButton onSignOut={() => { setIsMenuOpen(false); navigate('/auth'); }} t={t} />
              </>
            ) : (
              <Link
                to="/auth"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-center w-full px-4 py-3 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all"
              >
                <LogIn className="h-4 w-4 mr-2" />
                {t('auth.signIn')}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>

    {user && <FloatingMobileSearch onMovieSelect={handleMovieSelect} />}

    {selectedMovie && createPortal(
      <MovieDetailsModal
        movie={selectedMovie}
        isOpen={true}
        onClose={() => setSelectedMovie(null)}
        onAddToLibrary={() => {
          if (!session) navigate('/auth');
        }}
      />,
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