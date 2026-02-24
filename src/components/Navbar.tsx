import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LibraryIcon, LogIn, LogOut, User, Menu, X, Eye, Search } from 'lucide-react';
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
      className={`flex items-center px-4 py-2 rounded-lg font-medium transition-all duration-300 relative ${
        location.pathname === to
          ? 'text-blue-600 dark:text-blue-400 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 shadow-sm'
          : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/80 dark:hover:bg-gray-800/50'
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
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between" style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: '1rem',
          minHeight: 'calc(env(safe-area-inset-top) + 3.5rem)'
        }}>
          <div className="flex items-center">
            <Link to="/" className="flex items-center text-gray-900 dark:text-white group">
              <div className="transform transition-transform duration-300 group-hover:scale-110">
                <Logo className="mr-2" />
              </div>
              <span className="text-xl font-bold hidden xs:block text-white drop-shadow-lg">CineOracle</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {user && (
              <form onSubmit={handleSearch} className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nav.searchMovies')}
                  className="w-48 lg:w-64 px-3 py-1.5 pl-9 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </form>
            )}
            {user ? (
              <>
                <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
                <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
                <NavLink to="/profile" icon={User} showBadge={true}>{t('nav.profile')}</NavLink>
                <button
                  onClick={handleSignOut}
                  className="flex items-center px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-300 font-medium"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  <span>{t('auth.signOut')}</span>
                </button>
              </>
            ) : (
              <NavLink to="/auth" icon={LogIn}>{t('auth.signIn')}</NavLink>
            )}
            <LanguageSwitcher />
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center md:hidden">
            <LanguageSwitcher />
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
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

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-gray-200/50 dark:border-gray-700/50 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md">
          <div className="px-4 py-3 space-y-2">
            {user && (
              <form onSubmit={handleSearch} className="relative mb-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('nav.searchMovies')}
                  className="w-full px-3 py-2 pl-9 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                />
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              </form>
            )}
            {user ? (
              <>
                <NavLink to="/library" icon={LibraryIcon}>{t('nav.library')}</NavLink>
                <NavLink to="/oracle" icon={Eye}>{t('nav.oracle')}</NavLink>
                <NavLink to="/profile" icon={User} showBadge={true}>{t('nav.profile')}</NavLink>
                <button
                  onClick={handleSignOut}
                  className="flex items-center w-full px-4 py-3 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-300 font-medium"
                >
                  <LogOut className="h-5 w-5 mr-3" />
                  <span>{t('auth.signOut')}</span>
                </button>
              </>
            ) : (
              <NavLink to="/auth" icon={LogIn}>{t('auth.signIn')}</NavLink>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;