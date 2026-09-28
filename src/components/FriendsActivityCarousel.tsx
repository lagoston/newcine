import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Star, Bookmark } from 'lucide-react';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import { NIGHT, VELVET, PAPER, MIST, PIXEL, FOCUS_RING, ratingTone } from '../lib/oracleTheme';

// Atividade dos amigos — a mecânica antiga de volta, no tema noite: cada
// amigo é uma bolha de perfil com um balão em cima contando o último título
// que ele avaliou (com a nota, na cor da nota) ou guardou na watchlist. Os
// amigos aparecem em páginas (4 no celular, 6 no tablet, 8 no desktop) que
// se alternam sozinhas a cada 6 segundos; arrastar pro lado ou tocar num
// pontinho troca na mão e para a troca automática. Passar o mouse por cima
// também pausa.

export interface FriendActivity {
  id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string | null;
  lastRatedTitle: string | null;
  lastRating: number | null;
}

const ROTATE_MS = 6000;
const SWIPE_THRESHOLD = 50;

function usePageSize(): number {
  const read = () => {
    if (typeof window === 'undefined') return 4;
    if (window.matchMedia('(min-width: 1024px)').matches) return 8;
    if (window.matchMedia('(min-width: 640px)').matches) return 6;
    return 4;
  };
  const [size, setSize] = useState(read);
  useEffect(() => {
    const queries = [window.matchMedia('(min-width: 1024px)'), window.matchMedia('(min-width: 640px)')];
    const update = () => setSize(read());
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return size;
}

const FriendsActivityCarousel: React.FC<{ friends: FriendActivity[] }> = ({ friends }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const pageSize = usePageSize();
  const pageCount = Math.max(1, Math.ceil(friends.length / pageSize));

  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState(1);
  const [autoPaused, setAutoPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const dragged = useRef(false);

  // Mudou o tamanho da página (girou o celular, redimensionou): volta pra 1ª.
  useEffect(() => {
    setPage(0);
  }, [pageSize]);

  useEffect(() => {
    if (pageCount <= 1 || autoPaused || hovering) return;
    const id = setInterval(() => {
      setDirection(1);
      setPage((p) => (p + 1) % pageCount);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [pageCount, autoPaused, hovering]);

  const goTo = (next: number, dir: number) => {
    setAutoPaused(true);
    setDirection(dir);
    setPage(((next % pageCount) + pageCount) % pageCount);
  };

  const handleDragEnd = (_e: unknown, info: { offset: { x: number } }) => {
    if (Math.abs(info.offset.x) > SWIPE_THRESHOLD && pageCount > 1) {
      const dir = info.offset.x < 0 ? 1 : -1;
      goTo(page + dir, dir);
    }
    // o toque que termina um arraste não deve abrir o perfil
    setTimeout(() => {
      dragged.current = false;
    }, 60);
  };

  const current = Math.min(page, pageCount - 1);
  const visible = friends.slice(current * pageSize, current * pageSize + pageSize);
  const slide = {
    enter: (dir: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * 40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * -40 }),
  };

  const renderFriend = (friend: FriendActivity) => {
    const frameRaw = getFrameClass(friend.avatar_frame || undefined, friend.plan_type === 'premium');
    const frame = !frameRaw || frameRaw === 'ring-0' ? 'ring-2 ring-white/15' : frameRaw;
    const tone = friend.lastRating !== null ? ratingTone(friend.lastRating) : null;
    const edge = tone ? tone.ring : friend.lastRatedTitle ? 'rgba(125,211,252,0.45)' : 'rgba(255,255,255,0.12)';

    return (
      <li key={friend.id} className="min-w-0 shrink-0 basis-1/4 sm:basis-1/6 lg:basis-[12.5%] px-1 sm:px-1.5">
        <button
          onClick={() => {
            if (!dragged.current) navigate(`/profile/${friend.username}`);
          }}
          aria-label={
            friend.lastRatedTitle
              ? `@${friend.username} — ${friend.lastRatedTitle}${friend.lastRating !== null ? ` (${friend.lastRating})` : ` (${t('profile.onWatchlist')})`}`
              : `@${friend.username}`
          }
          className={`group w-full h-full flex flex-col items-center justify-end rounded-xl text-center ${FOCUS_RING}`}
          style={{ minHeight: 0 }}
        >
          {/* O balão da última atividade */}
          <span className="relative w-full max-w-[128px] mb-3">
            <span
              className="block rounded-xl px-1.5 py-1.5 sm:px-2.5 sm:py-2 shadow-lg transition-transform duration-200 group-hover:-translate-y-0.5"
              style={{ background: VELVET, boxShadow: `inset 0 0 0 1.5px ${edge}, 0 10px 24px -12px rgba(0,0,0,0.8)` }}
            >
              {friend.lastRatedTitle ? (
                <>
                  <span className="text-[10.5px] sm:text-xs font-semibold leading-tight line-clamp-2 min-h-[2.5em] break-words [hyphens:auto]" style={{ color: PAPER }} lang={i18n.language}>
                    {friend.lastRatedTitle}
                  </span>
                  {tone ? (
                    <span className="mt-1 flex items-center justify-center gap-1 text-sm leading-none" style={{ ...PIXEL, color: tone.color }} aria-hidden>
                      <Star className="w-3 h-3 fill-current" />
                      {friend.lastRating}
                    </span>
                  ) : (
                    <span className="mt-1 flex items-center justify-center gap-1 text-[10px] leading-none text-sky-300" aria-hidden>
                      <Bookmark className="w-3 h-3" />
                      {t('profile.onWatchlist')}
                    </span>
                  )}
                </>
              ) : (
                <span className="block py-1 text-[11px] leading-tight" style={{ color: MIST }}>
                  {t('profile.noRecentActivity')}
                </span>
              )}
            </span>
            {/* rabinho do balão apontando pra bolha */}
            <span
              aria-hidden
              className="absolute left-1/2 top-full -translate-x-1/2 -mt-[5px] w-2.5 h-2.5 rotate-45"
              style={{ background: VELVET, boxShadow: `inset -1.5px -1.5px 0 0 ${edge}` }}
            />
          </span>

          {/* A bolha do perfil */}
          {frameUsesComponent(friend.avatar_frame || undefined, friend.plan_type === 'premium') === 'GhostRiderFrame' && friend.avatar_url ? (
            <GhostRiderFrame src={friend.avatar_url} alt="" size={56} />
          ) : (
            <span className={`block w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full overflow-hidden transition-transform duration-200 group-hover:scale-105 ${frame}`} style={{ background: NIGHT }}>
              {friend.avatar_url ? (
                <img src={friend.avatar_url} alt="" draggable={false} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <span className="w-full h-full grid place-items-center text-xl font-semibold" style={{ color: PAPER }}>
                  {friend.username.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
          )}
          <span className="mt-2 max-w-full text-xs sm:text-sm font-semibold truncate group-hover:underline underline-offset-4" style={{ color: PAPER }}>
            @{friend.username}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-roledescription="carousel"
      aria-label={t('profile.friendsActivity')}
    >
      <div className="grid overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.ol
            key={`${pageSize}:${current}`}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            drag={pageCount > 1 ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragStart={() => {
              dragged.current = true;
            }}
            onDragEnd={handleDragEnd}
            className="flex justify-center items-stretch -mx-1 sm:-mx-1.5 pt-1 pb-1 cursor-grab active:cursor-grabbing"
            style={{ gridArea: '1 / 1' }}
          >
            {visible.map(renderFriend)}
          </motion.ol>
        </AnimatePresence>
      </div>

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-center" role="tablist" aria-label={t('profile.friendsActivity')}>
          {Array.from({ length: pageCount }, (_, i) => {
            const active = i === current;
            return (
              <button
                key={i}
                role="tab"
                aria-selected={active}
                aria-label={`${i + 1} / ${pageCount}`}
                onClick={() => goTo(i, i >= current ? 1 : -1)}
                className="grid place-items-center"
                style={{ minWidth: 0, minHeight: 0, width: 30, height: 28, padding: 0 }}
              >
                <span
                  className="block rounded-full transition-all duration-300"
                  style={{ height: 8, width: active ? 22 : 8, background: active ? '#A78BFA' : 'rgba(189,180,214,0.3)' }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FriendsActivityCarousel;
