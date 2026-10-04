import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Bookmark, ChevronLeft, ChevronRight, Eye, EyeOff, Heart, Loader2, MessageCircle, Quote, Send, Star, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { INK, MIST, NIGHT, PAPER, PIXEL, FOCUS_RING, ratingTone, withAlpha } from '../../lib/oracleTheme';
import {
  addStoryComment,
  fetchStoryComments,
  firstUnseenIndex,
  isAchievement,
  relativeTime,
  removeStoryComment,
  storyPoster,
  storyTitle,
  storyYear,
  toggleStoryHidden,
  toggleStoryLike,
  type FeedComment,
  type FeedGroup,
  type FeedStory,
} from '../../lib/friendsFeed';
import StoryRing from './StoryRing';
import { AchievementBackdrop, AchievementCard } from './AchievementStory';

// "Stories automáticos" do Feed dos Amigos: ocupa a tela, monta um cartão
// com a capa da obra, a nota do amigo e o começo da resenha. Embaixo, curtir
// (vira sussurro para o amigo) e comentar. Avança sozinho; segurar pausa,
// tocar à esquerda volta, à direita avança, arrastar para baixo fecha.

const BASE_MS = 6500;
const MAX_MS = 14000;
const HOLD_MS = 220;

interface StoryViewerProps {
  groups: FeedGroup[];
  start: { group: number; story: number };
  viewerId: string;
  onClose: () => void;
  // curtidas/comentários mudaram (para a fileira do feed acompanhar)
  onStoryUpdate?: (story: FeedStory) => void;
  // o story apareceu na tela (marca como visto)
  onSeen?: (story: FeedStory) => void;
  onOpenMovie?: (story: FeedStory) => void;
}

const durationFor = (story: FeedStory) => {
  if (story.kind === 'event') return 9000;
  if (story.review) return Math.min(MAX_MS, BASE_MS + story.review.excerpt.length * 30);
  return BASE_MS;
};

const StoryViewer: React.FC<StoryViewerProps> = ({ groups: initialGroups, start, viewerId, onClose, onStoryUpdate, onSeen, onOpenMovie }) => {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();

  const [groups, setGroups] = useState(initialGroups);
  const [pos, setPos] = useState(start);
  const [direction, setDirection] = useState(1);
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [typing, setTyping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [comments, setComments] = useState<Record<string, FeedComment[] | 'loading'>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [hideBusy, setHideBusy] = useState(false);
  const [likePulse, setLikePulse] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const elapsed = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pointer = useRef<{ x: number; y: number; at: number } | null>(null);

  const group = groups[pos.group];
  const story = group?.stories[pos.story];
  const isOwn = story?.owner.id === viewerId;
  const duration = story ? durationFor(story) : BASE_MS;
  const paused = holding || typing || drawerOpen || hidden;

  // ---------------------------------------------------------------- navegar
  const goTo = useCallback((groupIndex: number, storyIndex: number, dir: number) => {
    setDirection(dir);
    setPos({ group: groupIndex, story: storyIndex });
  }, []);

  const next = useCallback(() => {
    const current = groups[pos.group];
    if (!current) return onClose();
    if (pos.story < current.stories.length - 1) return goTo(pos.group, pos.story + 1, 1);
    if (pos.group < groups.length - 1) return goTo(pos.group + 1, firstUnseenIndex(groups[pos.group + 1]), 1);
    onClose();
  }, [groups, pos, goTo, onClose]);

  const prev = useCallback(() => {
    if (pos.story > 0) return goTo(pos.group, pos.story - 1, -1);
    if (pos.group > 0) return goTo(pos.group - 1, groups[pos.group - 1].stories.length - 1, -1);
    elapsed.current = 0;
    setProgress(0);
  }, [groups, pos, goTo]);

  const nextRef = useRef(next);
  nextRef.current = next;

  // ------------------------------------------------------- relógio do story
  useEffect(() => {
    elapsed.current = 0;
    setProgress(0);
    setDraft('');
    setDrawerOpen(false);
  }, [story?.id]);

  useEffect(() => {
    if (!story || paused) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const value = Math.min(1, elapsed.current / duration);
      setProgress(value);
      if (value >= 1) {
        nextRef.current();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [story, paused, duration]);

  // ------------------------------------------------------------ visto
  const updateStory = useCallback(
    (updated: FeedStory) => {
      setGroups((list) =>
        list.map((g) => {
          if (!g.stories.some((s) => s.id === updated.id)) return g;
          const stories = g.stories.map((s) => (s.id === updated.id ? updated : s));
          return { ...g, stories, seen: stories.every((s) => s.seen) };
        }),
      );
      onStoryUpdate?.(updated);
    },
    [onStoryUpdate],
  );

  useEffect(() => {
    if (!story || isOwn || story.seen) return;
    onSeen?.(story);
    updateStory({ ...story, seen: true });
    // só quando o story muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  // -------------------------------------------------------- comentários
  const storyComments = story ? comments[story.id] : undefined;
  useEffect(() => {
    if (!story || story.comment_count === 0 || comments[story.id]) return;
    let cancelled = false;
    setComments((map) => ({ ...map, [story.id]: 'loading' }));
    fetchStoryComments(story)
      .then((list) => {
        if (!cancelled) setComments((map) => ({ ...map, [story.id]: list }));
      })
      .catch(() => {
        if (!cancelled) setComments((map) => ({ ...map, [story.id]: [] }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const sendComment = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!story || sending) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const created = await addStoryComment(story, body);
      setComments((map) => {
        const list = map[story.id];
        return { ...map, [story.id]: [...(Array.isArray(list) ? list : []), created] };
      });
      updateStory({ ...story, comment_count: story.comment_count + 1 });
      setDraft('');
      setDrawerOpen(true);
    } catch (error) {
      const message = (error as { message?: string })?.message ?? '';
      toast.error(message.includes('rate_limited') ? t('feed.rateLimited') : t('feed.commentError'));
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (comment: FeedComment) => {
    if (!story) return;
    try {
      const ok = await removeStoryComment(comment.id);
      if (!ok) return;
      setComments((map) => {
        const list = map[story.id];
        return { ...map, [story.id]: Array.isArray(list) ? list.filter((c) => c.id !== comment.id) : list };
      });
      updateStory({ ...story, comment_count: Math.max(0, story.comment_count - 1) });
    } catch {
      toast.error(t('common.error'));
    }
  };

  // ------------------------------------------------------------- curtir
  const toggleLike = async () => {
    if (!story || isOwn || likeBusy) return;
    const optimistic = { ...story, liked: !story.liked, like_count: Math.max(0, story.like_count + (story.liked ? -1 : 1)) };
    updateStory(optimistic);
    if (optimistic.liked) setLikePulse((n) => n + 1);
    setLikeBusy(true);
    try {
      const result = await toggleStoryLike(story);
      updateStory({ ...optimistic, liked: result.liked, like_count: result.like_count });
    } catch {
      updateStory(story);
      toast.error(t('feed.likeError'));
    } finally {
      setLikeBusy(false);
    }
  };

  // ------------------------------------------- ocultar (só o próprio story)
  const toggleHidden = async () => {
    if (!story || !isOwn || hideBusy) return;
    const wasHidden = Boolean(story.hidden);
    updateStory({ ...story, hidden: !wasHidden });
    setHideBusy(true);
    try {
      const hidden = await toggleStoryHidden(story);
      updateStory({ ...story, hidden });
      toast.success(hidden ? t('feed.hiddenToast') : t('feed.shownToast'));
    } catch {
      updateStory({ ...story, hidden: wasHidden });
      toast.error(t('common.error'));
    } finally {
      setHideBusy(false);
    }
  };

  // ------------------------------------------------------- tela e teclado
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('visibilitychange', onVisibility);
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement | null)?.tagName === 'INPUT';
      if (e.key === 'Escape') {
        e.preventDefault();
        if (inField) return inputRef.current?.blur();
        if (drawerOpen) return setDrawerOpen(false);
        return onClose();
      }
      if (inField) return;
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onClose, drawerOpen]);

  // toque: rápido = navegar; segurar = pausa; arrastar para baixo = fechar
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pointer.current = { x: e.clientX, y: e.clientY, at: performance.now() };
    setHolding(true);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const startPoint = pointer.current;
    pointer.current = null;
    setHolding(false);
    if (!startPoint) return;
    const dy = e.clientY - startPoint.y;
    const dx = e.clientX - startPoint.x;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? next() : prev();
    if (performance.now() - startPoint.at > HOLD_MS) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.32) prev();
    else next();
  };
  const cancelPointer = () => {
    pointer.current = null;
    setHolding(false);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const tone = story ? ratingTone(story.rating) : ratingTone(null);
  const poster = story ? storyPoster(story, lang) : null;
  const title = story ? storyTitle(story, lang) : '';
  const year = story ? storyYear(story) : null;
  const commentList = Array.isArray(storyComments) ? storyComments : [];
  const preview = commentList.slice(-2);

  const ambient = useMemo(() => {
    if (!story) return undefined;
    const image = story.backdrop_path ? `https://image.tmdb.org/t/p/w780${story.backdrop_path}` : poster ? `https://image.tmdb.org/t/p/w342${poster}` : null;
    return image;
  }, [story, poster]);

  if (!group || !story) return null;

  const kindLabel = t(`feed.kind.${story.kind}`);
  const achievement = isAchievement(story);
  const openOwnerProfile = () => {
    onClose();
    navigate(isOwn ? '/profile' : `/profile/${story.owner.username}`);
  };
  const hasMany = groups.length > 1 || group.stories.length > 1;
  const spoilerHidden = Boolean(story.review?.has_spoilers && !revealed[story.id]);

  const slide = {
    enter: (dir: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * 70, scale: 0.97 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir: number) => (reduceMotion ? { opacity: 0 } : { opacity: 0, x: dir * -70, scale: 0.97 }),
  };

  const renderInput = (inDrawer: boolean) => (
    <form onSubmit={sendComment} className="flex items-center gap-2" onPointerDown={stop} onPointerUp={stop}>
      {!isOwn && !inDrawer && (
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={story.liked}
          aria-label={story.liked ? t('feed.unlike') : t('feed.like')}
          className={`relative shrink-0 inline-flex items-center gap-1.5 h-11 pl-2.5 pr-3 rounded-full transition hover:bg-white/10 ${FOCUS_RING}`}
          style={{ color: story.liked ? '#FB7185' : PAPER }}
        >
          <Heart key={likePulse} className={`w-6 h-6 ${likePulse && story.liked ? 'co-like-pop' : ''}`} fill={story.liked ? 'currentColor' : 'none'} aria-hidden />
          {story.like_count > 0 && <span className="text-sm font-semibold tabular-nums">{story.like_count}</span>}
        </button>
      )}
      <label className="relative flex-1 min-w-0">
        <span className="sr-only">{t('feed.comments')}</span>
        <input
          ref={inDrawer ? undefined : inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 500))}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          maxLength={500}
          enterKeyHint="send"
          placeholder={isOwn ? t('feed.replyPlaceholder') : t('feed.commentPlaceholder', { username: story.owner.username })}
          className="w-full h-11 rounded-full pl-4 pr-12 text-sm outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-fuchsia-300/80 placeholder:text-white/45 transition"
          style={{ background: 'rgba(18,13,34,0.55)', color: PAPER }}
        />
        {draft.trim() && (
          <button
            type="submit"
            disabled={sending}
            aria-label={t('feed.send')}
            className={`absolute right-1 top-1 grid place-items-center w-9 h-9 rounded-full text-white bg-gradient-to-br from-fuchsia-500 to-violet-600 hover:brightness-110 disabled:opacity-60 transition ${FOCUS_RING}`}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
          </button>
        )}
      </label>
      {!inDrawer && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('feed.comments')}
          className={`shrink-0 inline-flex items-center gap-1.5 h-11 px-2.5 rounded-full transition hover:bg-white/10 ${FOCUS_RING}`}
          style={{ color: PAPER }}
        >
          <MessageCircle className="w-6 h-6" aria-hidden />
          {story.comment_count > 0 && <span className="text-sm font-semibold tabular-nums">{story.comment_count}</span>}
        </button>
      )}
    </form>
  );

  const avatarSmall = (url: string | null, name: string, size = 22) =>
    url ? (
      <img src={url} alt="" className="shrink-0 rounded-full object-cover ring-1 ring-white/20" style={{ width: size, height: size }} />
    ) : (
      <span className="shrink-0 grid place-items-center rounded-full ring-1 ring-white/20 text-[10px]" style={{ width: size, height: size, background: NIGHT, color: PAPER }}>
        {name.charAt(0).toUpperCase()}
      </span>
    );

  return createPortal(
    <div className="fixed inset-0 z-[10020] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={t('feed.storyOf', { username: story.owner.username })}>
      {/* fundo: a obra borrada, escurecida */}
      <div className="absolute inset-0" style={{ background: NIGHT }} onClick={onClose} aria-hidden>
        {ambient && (
          <img
            key={ambient}
            src={ambient}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40 scale-110"
            style={{ filter: 'blur(40px) saturate(1.2)' }}
          />
        )}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(18,13,34,0.35), rgba(18,13,34,0.92) 75%)' }} />
      </div>

      {/* setas do desktop, fora do cartão (só quando há mais de um story) */}
      {hasMany && (
        <>
          <button
            onClick={prev}
            aria-label={t('feed.prev')}
            className={`hidden sm:grid absolute left-[max(1rem,calc(50%-310px))] top-1/2 -translate-y-1/2 z-10 place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <ChevronLeft className="w-6 h-6" aria-hidden />
          </button>
          <button
            onClick={next}
            aria-label={t('feed.next')}
            className={`hidden sm:grid absolute right-[max(1rem,calc(50%-310px))] top-1/2 -translate-y-1/2 z-10 place-items-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur transition ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            <ChevronRight className="w-6 h-6" aria-hidden />
          </button>
        </>
      )}

      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={group.owner.id}
          custom={direction}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="relative w-full h-[100dvh] sm:h-[min(92vh,860px)] sm:w-[min(460px,92vw)] sm:rounded-[28px] overflow-hidden flex flex-col shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:ring-1 sm:ring-white/10"
          style={{ background: NIGHT }}
        >
          {/* conquista: a cena dela; obra: a capa, grande e borrada */}
          {achievement ? (
            <AchievementBackdrop story={story} />
          ) : (
          <div aria-hidden className="absolute inset-0 overflow-hidden">
            {poster && (
              <img
                src={`https://image.tmdb.org/t/p/w342${poster}`}
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-125 opacity-60"
                style={{ filter: 'blur(26px) saturate(1.25)' }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse 70% 45% at 50% 38%, ${withAlpha(tone.color, 0.22)}, transparent 70%), linear-gradient(to bottom, rgba(18,13,34,0.78), rgba(18,13,34,0.25) 22%, rgba(18,13,34,0.35) 55%, rgba(18,13,34,0.94) 82%)`,
              }}
            />
          </div>
          )}

          <div className="relative z-10 flex flex-col h-full" style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)' }}>
            {/* barras de progresso: uma por story deste amigo */}
            <div className="flex gap-1 px-3" aria-hidden>
              {group.stories.map((s, i) => (
                <span key={s.id} className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(243,234,211,0.28)' }}>
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${i < pos.story ? 100 : i === pos.story ? progress * 100 : 0}%`,
                      background: PAPER,
                    }}
                  />
                </span>
              ))}
            </div>

            {/* cabeçalho */}
            <div className="flex items-center gap-3 px-3 pt-3">
              <StoryRing size={36} segments={[false]} avatarUrl={story.owner.avatar_url} username={story.owner.username} ringWidth={2} gap={2} still />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold truncate" style={{ color: PAPER }}>
                  {isOwn ? t('feed.ownStory') : `@${story.owner.username}`}
                </p>
                <p className="text-xs truncate" style={{ color: MIST }}>
                  {kindLabel} · <time dateTime={story.activity_at}>{relativeTime(story.activity_at, lang)}</time>
                  {paused && !typing && !drawerOpen && <span className="ml-1.5">· {t('feed.paused')}</span>}
                </p>
              </div>
              {isOwn && (
                <button
                  onClick={toggleHidden}
                  disabled={hideBusy}
                  aria-pressed={Boolean(story.hidden)}
                  title={story.hidden ? t('feed.showToFriends') : t('feed.hideFromFriends')}
                  className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold transition disabled:opacity-60 ${FOCUS_RING} ${
                    story.hidden ? 'bg-amber-300 hover:bg-amber-200' : 'bg-white/10 hover:bg-white/20'
                  }`}
                  style={{ color: story.hidden ? INK : PAPER }}
                >
                  {hideBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                  ) : story.hidden ? (
                    <Eye className="w-4 h-4" aria-hidden />
                  ) : (
                    <EyeOff className="w-4 h-4" aria-hidden />
                  )}
                  {story.hidden ? t('feed.show') : t('feed.hide')}
                </button>
              )}
              <button
                ref={closeRef}
                onClick={onClose}
                aria-label={t('feed.close')}
                className={`shrink-0 grid place-items-center w-11 h-11 -mr-1 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
                style={{ color: PAPER }}
              >
                <X className="w-6 h-6" aria-hidden />
              </button>
            </div>

            {/* a obra (toque à esquerda volta, à direita avança) */}
            <div
              className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-6 pt-2 pb-3 select-none touch-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={cancelPointer}
              onPointerLeave={() => holding && cancelPointer()}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={story.id}
                  className="flex flex-col items-center w-full"
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {isOwn && story.hidden && (
                    <p
                      className="mb-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-semibold"
                      style={{ background: 'rgba(252,211,77,0.16)', color: '#FDE68A', boxShadow: 'inset 0 0 0 1px rgba(252,211,77,0.4)' }}
                    >
                      <EyeOff className="w-3.5 h-3.5" aria-hidden />
                      {t('feed.hiddenNote')}
                    </p>
                  )}
                  {achievement ? (
                    <>
                      <AchievementCard story={story} />
                      <button
                        onPointerDown={stop}
                        onPointerUp={stop}
                        onClick={openOwnerProfile}
                        className={`mt-5 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 transition ${FOCUS_RING}`}
                        style={{ color: PAPER }}
                      >
                        {t('feed.viewProfile')}
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="relative">
                        <div
                          className="relative aspect-[2/3] rounded-2xl overflow-hidden ring-1 ring-white/15"
                          style={{
                            height: story.review ? 'min(31dvh, 280px)' : 'min(42dvh, 360px)',
                            background: NIGHT,
                            boxShadow: `0 30px 60px -24px rgba(0,0,0,0.9), 0 0 70px -18px ${withAlpha(tone.color, 0.55)}`,
                          }}
                        >
                          {poster ? (
                            <img src={`https://image.tmdb.org/t/p/w500${poster}`} alt={title} draggable={false} className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <span className="absolute inset-0 grid place-items-center p-4 text-center" style={{ ...PIXEL, color: MIST }}>
                              {title}
                            </span>
                          )}
                        </div>
                        {/* a nota do amigo (ou o marcador da watchlist) */}
                        <span
                          className="absolute -right-4 -bottom-4 grid place-items-center w-[60px] h-[60px] rounded-full"
                          style={{
                            background: INK,
                            boxShadow: `inset 0 0 0 2.5px ${tone.color}, 0 12px 26px -10px rgba(0,0,0,0.9), 0 0 24px -4px ${withAlpha(tone.color, 0.6)}`,
                          }}
                          aria-label={story.rating === null ? t('feed.onWatchlist') : `${story.rating}/10`}
                        >
                          {story.rating === null ? (
                            <Bookmark className="w-6 h-6" style={{ color: tone.color }} fill="currentColor" aria-hidden />
                          ) : (
                            <span className="flex flex-col items-center leading-none" style={{ color: tone.color }} aria-hidden>
                              <span style={PIXEL} className="text-[26px] leading-none">{story.rating}</span>
                              <Star className="mt-0.5 w-3 h-3" fill="currentColor" />
                            </span>
                          )}
                        </span>
                      </div>

                      <h3 style={{ ...PIXEL, color: PAPER }} className="mt-6 max-w-full text-center text-2xl leading-tight line-clamp-2 break-words">
                        {title}
                      </h3>
                      <p className="mt-1 text-xs" style={{ color: MIST }}>
                        {[year, story.media_type === 'tv' ? t('feed.tv') : t('feed.movie'), story.rating === null ? t('feed.onWatchlist') : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {onOpenMovie && (
                        <button
                          onPointerDown={stop}
                          onPointerUp={stop}
                          onClick={() => onOpenMovie(story)}
                          className={`mt-2 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 transition ${FOCUS_RING}`}
                          style={{ color: PAPER }}
                        >
                          {t('feed.viewWork')}
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden />
                        </button>
                      )}

                      {story.review && (
                        <div
                          className="relative mt-4 w-full rounded-2xl px-4 py-3.5 text-left"
                          style={{ background: 'rgba(18,13,34,0.62)', boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.12)' }}
                        >
                          <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: PAPER }}>
                            <Quote className="w-4 h-4 shrink-0" style={{ color: tone.color }} fill="currentColor" aria-hidden />
                            <span className="line-clamp-1">{story.review.title || t('feed.review')}</span>
                          </p>
                          <p
                            className="mt-1 text-sm leading-relaxed line-clamp-4"
                            style={{ color: MIST, filter: spoilerHidden ? 'blur(6px)' : undefined }}
                            aria-hidden={spoilerHidden}
                          >
                            {story.review.truncated ? `${story.review.excerpt.replace(/[\s.,;:…]+$/, '')}…` : story.review.excerpt}
                          </p>
                          {spoilerHidden && (
                            <button
                              onPointerDown={stop}
                              onPointerUp={stop}
                              onClick={() => setRevealed((map) => ({ ...map, [story.id]: true }))}
                              className={`absolute inset-0 grid place-items-center rounded-2xl ${FOCUS_RING}`}
                            >
                              <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-xs font-semibold" style={{ background: INK, color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(243,234,211,0.2)' }}>
                                <EyeOff className="w-3.5 h-3.5" aria-hidden />
                                {t('feed.spoiler')} · {t('feed.revealSpoiler')}
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* coração que estoura ao curtir */}
              {likePulse > 0 && story.liked && !reduceMotion && (
                <Heart
                  key={`burst-${likePulse}`}
                  aria-hidden
                  className="co-heart-burst pointer-events-none absolute left-1/2 top-[42%] w-24 h-24"
                  style={{ color: '#FB7185', filter: 'drop-shadow(0 10px 30px rgba(251,113,133,0.6))' }}
                  fill="currentColor"
                />
              )}
            </div>

            {/* curtidas e comentários */}
            <div className="px-3 sm:px-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}>
              {isOwn && story.like_count > 0 && (
                <p className="mb-2 flex items-center gap-2 text-xs" style={{ color: MIST }}>
                  <span className="flex -space-x-1.5">
                    {story.likers.map((liker) => (
                      <span key={liker.username}>{avatarSmall(liker.avatar_url, liker.username, 20)}</span>
                    ))}
                  </span>
                  <Heart className="w-3.5 h-3.5 shrink-0" style={{ color: '#FB7185' }} fill="currentColor" aria-hidden />
                  <span className="truncate">{t('feed.likes', { count: story.like_count })}</span>
                </p>
              )}

              {preview.length > 0 && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  className={`mb-2.5 w-full text-left rounded-xl px-1 py-1 hover:bg-white/5 transition ${FOCUS_RING}`}
                >
                  <ul className="space-y-1.5">
                    {preview.map((comment) => (
                      <li key={comment.id} className="flex items-start gap-2 text-sm leading-snug">
                        {avatarSmall(comment.author.avatar_url, comment.author.username)}
                        <span className="min-w-0 line-clamp-2" style={{ color: PAPER }}>
                          <span className="font-semibold">@{comment.author.username}</span>{' '}
                          <span style={{ color: MIST }}>{comment.content}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {story.comment_count > preview.length && (
                    <span className="mt-1.5 block pl-[30px] text-xs font-semibold" style={{ color: MIST }}>
                      {t('feed.viewComments', { count: story.comment_count })}
                    </span>
                  )}
                </button>
              )}

              {renderInput(false)}
            </div>
          </div>

          {/* gaveta de comentários */}
          <AnimatePresence>
            {drawerOpen && (
              <>
                <motion.div
                  key="shade"
                  className="absolute inset-0 z-20 bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setDrawerOpen(false)}
                  aria-hidden
                />
                <motion.section
                  key="drawer"
                  className="absolute inset-x-0 bottom-0 z-30 flex flex-col max-h-[74%] rounded-t-3xl ring-1 ring-white/10"
                  style={{ background: NIGHT, paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}
                  initial={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                  animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { y: '100%' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                  aria-label={t('feed.comments')}
                >
                  <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
                    <span aria-hidden className="absolute left-1/2 top-2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/20" />
                    <h4 className="pt-2 text-sm font-semibold" style={{ color: PAPER }}>
                      {t('feed.comments')}
                      {story.comment_count > 0 && <span style={{ color: MIST }}> · {story.comment_count}</span>}
                    </h4>
                    <button
                      onClick={() => setDrawerOpen(false)}
                      aria-label={t('feed.close')}
                      className={`grid place-items-center w-10 h-10 -mr-1.5 rounded-full hover:bg-white/10 transition ${FOCUS_RING}`}
                      style={{ color: MIST }}
                    >
                      <X className="w-5 h-5" aria-hidden />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto px-4">
                    {storyComments === 'loading' ? (
                      <div className="py-8 grid place-items-center">
                        <Loader2 className="w-5 h-5 animate-spin text-fuchsia-300" aria-hidden />
                      </div>
                    ) : commentList.length === 0 ? (
                      <p className="py-8 text-center text-sm" style={{ color: MIST }}>
                        {isOwn ? t('feed.noCommentsOwn') : t('feed.noComments')}
                      </p>
                    ) : (
                      <ul className="pb-2">
                        {commentList.map((comment) => (
                          <li key={comment.id} className="group flex items-start gap-3 py-2.5">
                            {avatarSmall(comment.author.avatar_url, comment.author.username, 32)}
                            <div className="min-w-0 flex-1">
                              <p className="text-xs" style={{ color: MIST }}>
                                <span className="font-semibold" style={{ color: PAPER }}>@{comment.author.username}</span>
                                {comment.author.id === story.owner.id && <span className="ml-1.5 px-1.5 py-px rounded text-[10px] font-semibold bg-white/10">{t('feed.author')}</span>}
                                <span> · {relativeTime(comment.created_at, lang)}</span>
                              </p>
                              <p className="mt-0.5 text-sm leading-relaxed break-words whitespace-pre-line" style={{ color: PAPER }}>
                                {comment.content}
                              </p>
                            </div>
                            {comment.can_remove && (
                              <button
                                onClick={() => removeComment(comment)}
                                aria-label={t('feed.removeComment')}
                                title={t('feed.removeComment')}
                                className={`shrink-0 grid place-items-center w-9 h-9 rounded-full opacity-60 hover:opacity-100 hover:bg-white/10 transition ${FOCUS_RING}`}
                                style={{ color: MIST }}
                              >
                                <Trash2 className="w-4 h-4" aria-hidden />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="px-3 pt-2 border-t border-white/[0.07]">{renderInput(true)}</div>
                </motion.section>
              </>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body,
  );
};

export default StoryViewer;
