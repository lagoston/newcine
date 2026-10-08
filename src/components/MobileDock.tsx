import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, Library as LibraryIcon, Eye, Users, User, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { PAPER, MIST, ORACLES, FOCUS_RING } from '../lib/oracleTheme';
import { Movie } from '../lib/tmdb';
import MobileSearch, { DOCK_SEARCH_LAYOUT_ID } from './MobileSearch';

// Navegação do celular e do tablet (abaixo de 1024px), no lugar do menu
// hambúrguer do topo e da lupa presa na borda esquerda: uma barra de vidro
// flutuando na base da tela, como no Instagram e no IMDb.
//
//   [ Início  Biblioteca  Oráculo  Comunidade  Perfil ]  ( busca )
//
// • A aba da página atual fica dentro de uma "lente" violeta que desliza
//   de uma aba para a outra. Tocar na aba em que você já está volta ao topo.
// • Perfil mostra a sua foto. (Os sussurros não lidos ficam no sino do topo.)
// • O botão redondo da busca tem o anel nas cores dos três oráculos e vira
//   a barra de busca de vidro (MobileSearch).
// • Com o teclado aberto (digitando uma resenha, um comentário…), a barra
//   sai de cena para não ficar em cima do campo.
// • Enquanto a barra existe, o <html> ganha a classe has-mobile-dock, que
//   dá espaço no fim das páginas e sobe os avisos (src/styles/mobile-dock.css).

interface MobileDockProps {
  onMovieSelect: (movie: Movie) => void;
  // Há um filme aberto (modal do filme) — a busca continua aberta por baixo.
  movieOpen?: boolean;
}

const isTextField = (el: Element | null) => {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return !['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'].includes(el.type);
  return (el as HTMLElement).isContentEditable === true;
};

// Toque + campo de texto em foco = teclado na tela.
function useTypingOnTouch() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia('(pointer: coarse)');
    const update = () => setTyping(coarse.matches && isTextField(document.activeElement));
    // focusout dispara antes do novo foco: confere no quadro seguinte.
    const later = () => requestAnimationFrame(update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', later);
    };
  }, []);
  return typing;
}

const MobileDock: React.FC<MobileDockProps> = ({ onMovieSelect, movieOpen = false }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const typing = useTypingOnTouch();
  const path = location.pathname;
  const onProfile = path === '/profile';

  // Espaço no fim das páginas e avisos acima da barra.
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('has-mobile-dock');
    return () => html.classList.remove('has-mobile-dock');
  }, []);

  // Foto do perfil na aba Perfil (de novo ao voltar do Perfil, onde ela
  // pode ter mudado).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl((data as { avatar_url: string | null } | null)?.avatar_url ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, onProfile]);

  // Trocou de página: a busca fecha.
  useEffect(() => {
    setSearchOpen(false);
  }, [path]);

  const tabs: { to: string; label: string; icon?: typeof Home; active: boolean }[] = [
    { to: '/', label: t('nav.home'), icon: Home, active: path === '/' || path.startsWith('/category/') },
    { to: '/library', label: t('nav.library'), icon: LibraryIcon, active: path === '/library' || path === '/lists' || path === '/add-movies' },
    { to: '/oracle', label: t('nav.oracle'), icon: Eye, active: path === '/oracle' || path.startsWith('/oracle/') },
    { to: '/community', label: t('nav.community'), icon: Users, active: path === '/community' || path.startsWith('/profile/') },
    { to: '/profile', label: t('nav.profile'), active: path === '/profile' || path.startsWith('/premium') },
  ];

  const hidden = typing && !searchOpen;
  const oracleRing = `conic-gradient(from 200deg, ${ORACLES.map((o) => o.color).join(', ')}, ${ORACLES[0].color})`;

  return (
    <>
      <AnimatePresence>
        {!hidden && (
          <motion.nav
            key="mobile-dock"
            aria-label={t('nav.mobileLabel')}
            initial={{ y: 96, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="lg:hidden fixed inset-x-0 z-[45] px-3 pointer-events-none"
            style={{ bottom: 'max(10px, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto w-full max-w-md flex items-center gap-2.5">
              {/* Abas */}
              <motion.ul
                animate={{ opacity: searchOpen ? 0 : 1, scale: searchOpen ? 0.96 : 1 }}
                transition={{ duration: 0.18 }}
                className="co-glass pointer-events-auto flex-1 min-w-0 h-16 px-1.5 flex items-center rounded-full"
                aria-hidden={searchOpen || undefined}
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isProfile = tab.to === '/profile';
                  return (
                    <li key={tab.to} className="flex-1 min-w-0 h-full flex">
                      <Link
                        to={tab.to}
                        aria-label={tab.label}
                        title={tab.label}
                        aria-current={tab.active ? 'page' : undefined}
                        tabIndex={searchOpen ? -1 : undefined}
                        onClick={() => {
                          // Na aba em que já está: volta ao topo.
                          if (tab.active && path === tab.to) window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`relative flex-1 h-full min-w-0 rounded-full ${FOCUS_RING}`}
                      >
                        {tab.active && (
                          <motion.span
                            layoutId="co-dock-lens"
                            transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                            className="absolute inset-y-1.5 inset-x-0.5 rounded-full"
                            style={{
                              background: 'linear-gradient(180deg, rgba(167,139,250,0.34), rgba(139,92,246,0.2))',
                              boxShadow: 'inset 0 0 0 1px rgba(196,181,253,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
                            }}
                            aria-hidden
                          />
                        )}
                        <span className="relative grid place-items-center">
                          {isProfile ? (
                            <span className="relative block">
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl}
                                  alt=""
                                  className="w-7 h-7 rounded-full object-cover"
                                  style={{ boxShadow: tab.active ? `0 0 0 2px ${PAPER}` : '0 0 0 1.5px rgba(243,234,211,0.45)' }}
                                />
                              ) : (
                                <User className="w-6 h-6" strokeWidth={tab.active ? 2.4 : 1.9} style={{ color: tab.active ? PAPER : MIST }} aria-hidden />
                              )}
                            </span>
                          ) : (
                            Icon && <Icon className="w-6 h-6" strokeWidth={tab.active ? 2.4 : 1.9} style={{ color: tab.active ? PAPER : MIST }} aria-hidden />
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </motion.ul>

              {/* Busca: anel nas cores dos três oráculos */}
              {!searchOpen && (
                <motion.button
                  type="button"
                  layoutId={DOCK_SEARCH_LAYOUT_ID}
                  transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                  onClick={() => setSearchOpen(true)}
                  aria-label={t('mobileSearch.open')}
                  aria-haspopup="dialog"
                  className={`co-glass pointer-events-auto relative shrink-0 w-16 h-16 ${FOCUS_RING}`}
                  style={{ borderRadius: 999, color: PAPER }}
                  whileTap={{ scale: 0.92 }}
                >
                  <span
                    className="absolute inset-[3px] rounded-full opacity-80"
                    style={{
                      background: oracleRing,
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))',
                    }}
                    aria-hidden
                  />
                  <Search className="relative w-6 h-6" strokeWidth={2.2} aria-hidden />
                </motion.button>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <MobileSearch open={searchOpen} suspended={searchOpen && movieOpen} onClose={() => setSearchOpen(false)} onMovieSelect={onMovieSelect} />
    </>
  );
};

export default MobileDock;
