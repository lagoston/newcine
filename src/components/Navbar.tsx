import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Library as LibraryIcon, LogIn, LogOut, User, Menu, X, Eye, Search, Home } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import Logo from './Logo';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadWhispers, setUnreadWhispers] = useState(0);
  const { t } = useTranslation();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error during sign out:', error);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchUnreadWhispers();

      const channel = supabase
        .channel('whispers-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'friend_indications',
            filter: `to_user_id=eq.${user.id}`
          },
          () => {
            fetchUnreadWhispers();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id]);

  const fetchUnreadWhispers = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase.rpc('count_unread_indications', {
        user_id_input: user.id
      });

      if (error) throw error;
      setUnreadWhispers(data || 0);
    } catch (error) {
      console.error('Error fetching unread whispers:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/add-movies?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsMenuOpen(false);
    }
  };

  const NavLink = ({ to, icon: Icon, children, showBadge = false }) => (
    <Link
      to={to}
      onClick={() => setIsMenuOpen(false)}
      className={`flex items-center px-4 py-2 rounded-xl font-medium transition-all duration-300 relative ${
        location.pathname === to
          ? 'text-blue-400 bg-blue-500/15 border border-blue-400/20'
          : 'text-gray-300 hover:text-white hover:bg-white/10 border border-transparent'
      }`}
    >
      <div className="relative">
        <Icon className="h-5 w-5 mr-2" />
        {showBadge && unreadWhispers > 0 && (
          <span className="absolute -top-0.5 right-0.5 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
        )}
      </div>
      <span>{children}</span>
    </Link>
  );

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/70 backdrop-blur-2xl border-b border-white/10 shadow-lg transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between" style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: '1rem',
          minHeight: 'calc(env(safe-area-inset-top) + 3.5rem)'
        }}>
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-white group">
              <div className="transform transition-transform duration-300 group-hover:scale-110">
                <Logo className="mr-2" />
              </div>
              <span className="text-xl font-bold hidden xs:block bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">CineOracle</span>
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-3">
            {user && (
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nav.searchMovies')}
                  className="w-48 lg:w-64 px-3 py-2 pl-9 text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white placeholder-gray-400 transition-all"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </form>
            )}
            {user ? (
              <>
                <NavLink to="/" icon={Home}>{t('nav.home')}</NavLink>
                <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
                <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
                <NavLink to="/profile" icon={User} showBadge={true}>{t('nav.profile')}</NavLink>
                <button
                  onClick={handleSignOut}
                  className="flex items-center px-4 py-2 text-gray-300 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300 font-medium border border-transparent hover:border-red-500/20"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  <span>{t('auth.signOut')}</span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="flex items-center px-5 py-2 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all duration-300"
              >
                <LogIn className="h-4 w-4 mr-2" />
                {t('auth.signIn')}
              </Link>
            )}
            <LanguageSwitcher />
          </div>

          <div className="flex items-center md:hidden">
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
        <div className="md:hidden border-t border-white/10 bg-slate-900/95 backdrop-blur-2xl">
          <div className="px-4 py-3 space-y-2">
            {user && (
              <form onSubmit={handleSearch} className="relative mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nav.searchMovies')}
                  className="w-full px-3 py-2.5 pl-9 text-sm bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-white placeholder-gray-400"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </form>
            )}
            {user ? (
              <>
                <NavLink to="/" icon={Home}>{t('nav.home')}</NavLink>
                <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
                <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
                <NavLink to="/profile" icon={User} showBadge={true}>{t('nav.profile')}</NavLink>
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full px-4 py-3 text-gray-300 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300 font-medium"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  <span>{t('auth.signOut')}</span>
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center justify-center w-full px-4 py-3 bg-gradient-to-r from-blue-600 via-cyan-600 to-blue-600 text-white text-sm font-semibold rounded-xl hover:shadow-lg transition-all"
              >
                <LogIn className="h-4 w-4 mr-2" />
                {t('auth.signIn')}
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;