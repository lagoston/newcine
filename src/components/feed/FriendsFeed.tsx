import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, EyeOff, Heart, PenLine, Star, UserPlus } from 'lucide-react';
import type { Movie } from '../../lib/tmdb';
import { INK, MIST, NIGHT, PAPER, PIXEL, VELVET, FOCUS_RING, ratingTone, tagCategoryStyle } from '../../lib/oracleTheme';
import { SEASONAL_THEMES, isSeasonalEventId } from '../../lib/seasonalEvents';
import { fetchTagProgress, unlockedPinsFrom } from '../../lib/tagProgress';
import { syncUnlockedTagsFromHome } from '../../lib/tagNotifications';
import {
  eventAchievementOf,
  fetchFriendsFeed,
  firstUnseenIndex,
  groupStories,
  isAchievement,
  tagAchievementOf,
  markStoryViewed,
  storyPoster,
  storyTitle,
  type FeedGroup,
  type FeedStory,
  type FriendsFeedData,
} from '../../lib/friendsFeed';
import StoryRing from './StoryRing';
import StoryViewer from './StoryViewer';

// Feed dos Amigos, no topo da home (só os avatares, sem título, como nos
// stories do Instagram). Junta o que antes eram "Melhores dos amigos", "Na
// watchlist dos amigos" e "Atividade dos amigos": um avatar por amigo, com
// um gomo no anel para cada atividade recente dele (até 5 por amigo, 50 no
// total, dos últimos 30 dias; os que o amigo ocultou não são repostos).
// O primeiro é o seu ("Você"). Tocar abre os stories em tela cheia.

const AVATAR = 66;
const REFRESH_AFTER_MS = 60_000;
// de quanto em quanto tempo a home confere as tags (tag nova vira story)
const TAG_SYNC_EVERY_MS = 15 * 60_000;

interface FriendsFeedProps {
  userId: string;
  onMovieClick: (movie: Movie) => void;
}

type ViewerState = { groups: FeedGroup[]; start: { group: number; story: number }; own?: boolean };

const FriendsFeed: React.FC<FriendsFeedProps> = ({ userId, onMovieClick }) => {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<FriendsFeedData | null>(null);
  const [failed, setFailed] = useState(false);
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const lastFetch = useRef(0);

  const load = useCallback(async () => {
    lastFetch.current = Date.now();
    try {
      const result = await fetchFriendsFeed();
      setData(result);
      setFailed(false);
    } catch (error) {
      console.error('feed: load', error);
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, userId]);

  // Tags: a home confere de tempos em tempos (em segundo plano) se surgiu
  // alguma nova — ela vira aviso e story. Na primeira vez da pessoa o banco
  // só registra o que ela já tem.
  useEffect(() => {
    if (!userId) return;
    const key = `cineoracle:tagSyncAt:${userId}`;
    let last = 0;
    try {
      last = Number(localStorage.getItem(key) || 0);
    } catch {
      last = 0;
    }
    if (Date.now() - last < TAG_SYNC_EVERY_MS) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        localStorage.setItem(key, String(Date.now()));
      } catch {
        // sem localStorage: confere de novo na próxima visita
      }
      try {
        const progress = await fetchTagProgress(userId);
        const created = await syncUnlockedTagsFromHome(userId, unlockedPinsFrom(progress));
        if (created > 0 && !cancelled) load();
      } catch (error) {
        console.error('feed: tag sync', error);
      }
    }, 2500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId, load]);

  // voltou para a aba depois de um tempo: atualiza (sem atrapalhar quem está vendo)
  useEffect(() => {
    const onFocus = () => {
      if (!viewer && Date.now() - lastFetch.current > REFRESH_AFTER_MS) load();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load, viewer]);

  const groups = useMemo(() => groupStories(data?.stories ?? []), [data?.stories]);

  const updateStory = useCallback((updated: FeedStory) => {
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        stories: current.stories.map((story) => (story.id === updated.id ? updated : story)),
        mine: current.mine.map((story) => (story.id === updated.id ? updated : story)),
      };
    });
  }, []);

  const handleSeen = useCallback((story: FeedStory) => {
    markStoryViewed(story);
  }, []);

  const openGroup = (index: number) => {
    // a ordem fica congelada enquanto o visualizador está aberto
    setViewer({ groups, start: { group: index, story: firstUnseenIndex(groups[index]) } });
  };

  // os seus stories, do mais antigo ao mais recente (como os dos amigos)
  const mine = useMemo(() => [...(data?.mine ?? [])].sort((a, b) => a.activity_at.localeCompare(b.activity_at)), [data?.mine]);
  const latestMine = mine[mine.length - 1];
  const mineHidden = mine.filter((story) => story.hidden).length;
  const mineReactions = mine.reduce((sum, story) => sum + story.like_count + story.comment_count, 0);

  const openOwn = () => {
    if (!latestMine) return;
    setViewer({
      groups: [{ owner: latestMine.owner, stories: mine, seen: true, latestAt: latestMine.activity_at }],
      start: { group: 0, story: 0 },
      own: true,
    });
  };

  const closeViewer = () => {
    // ocultar/mostrar muda quais dos seus stories os amigos veem: recarrega
    if (viewer?.own) load();
    setViewer(null);
  };

  const openMovie = (story: FeedStory) => {
    if (isAchievement(story)) return;
    setViewer(null);
    onMovieClick({
      id: story.movie_id,
      title: storyTitle(story, i18n.language),
      poster_path: storyPoster(story, i18n.language) ?? '',
      media_type: story.media_type as 'movie' | 'tv',
      release_date: story.release_date ?? '',
    } as Movie);
  };

  const kindBadge = (story: FeedStory, seen: boolean) => {
    if (isAchievement(story)) {
      const tag = tagAchievementOf(story);
      const event = eventAchievementOf(story);
      const color = tag
        ? tagCategoryStyle(tag.category).accent
        : event && isSeasonalEventId(event.event_id)
          ? SEASONAL_THEMES[event.event_id].accent
          : '#A78BFA';
      return (
        <span
          className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 inline-flex items-center h-[22px] px-2 rounded-full text-[13px] leading-none whitespace-nowrap"
          style={{ background: color, boxShadow: `0 0 0 2.5px ${NIGHT}`, opacity: seen ? 0.78 : 1 }}
          aria-hidden
        >
          {tag?.emoji ?? event?.emoji ?? '🏅'}
        </span>
      );
    }
    const tone = ratingTone(story.rating);
    return (
      <span
        className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 inline-flex items-center gap-1 h-[22px] px-2 rounded-full text-[12px] leading-none whitespace-nowrap"
        style={{ background: tone.color, color: INK, boxShadow: `0 0 0 2.5px ${NIGHT}`, opacity: seen ? 0.78 : 1 }}
        aria-hidden
      >
        {story.rating === null ? (
          <Bookmark className="w-3 h-3" fill="currentColor" />
        ) : (
          <>
            <Star className="w-3 h-3" fill="currentColor" />
            <span style={PIXEL} className="text-[13px] leading-none">{story.rating}</span>
          </>
        )}
        {story.kind === 'review' && <PenLine className="w-3 h-3" />}
      </span>
    );
  };

  const storyLabel = (story: FeedStory) => {
    const tag = tagAchievementOf(story);
    if (tag) return `${t('feed.achievement.tagEyebrow')}: ${tag.name}`;
    const event = eventAchievementOf(story);
    if (event) return t('feed.achievement.eventEyebrow', { event: t(`feed.event.${event.event_id}`, { defaultValue: event.event_id }), edition: event.edition });
    const what = story.rating === null ? t('feed.onWatchlist') : `${story.rating}/10`;
    return `${storyTitle(story, i18n.language)} (${what})`;
  };

  const groupLabel = (group: FeedGroup) => {
    const latest = group.stories[group.stories.length - 1];
    return `${t('feed.storyOf', { username: group.owner.username })} — ${storyLabel(latest)}${group.seen ? '' : ` · ${t('feed.unseen')}`}`;
  };

  const loading = data === null && !failed;
  const showFindFriends = data !== null && groups.length === 0;

  return (
    // Sem título: só os avatares no topo da home, como nos stories do Instagram.
    <section aria-label={t('feed.title')} className="border-b border-white/[0.06] pt-3 sm:pt-5 pb-2">
      {loading ? (
        <ol className="flex gap-3 sm:gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pt-2 pb-1 overflow-hidden" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="shrink-0 w-[84px] flex flex-col items-center">
              <span className="w-[78px] h-[78px] rounded-full bg-white/10 animate-pulse" />
              <span className="mt-3 h-3 w-14 rounded bg-white/10 animate-pulse" />
            </li>
          ))}
        </ol>
      ) : failed ? null : (
        <div className="co-feed-row overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {/* rola de ponta a ponta; o recuo acompanha a margem do conteúdo */}
          <ol className="flex gap-3 sm:gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pt-2 pb-1">
            {latestMine && (
              <li className="shrink-0 w-[84px]">
                <button
                  onClick={openOwn}
                  aria-label={mineHidden === mine.length ? `${t('feed.ownStory')} · ${t('feed.hiddenBadge')}` : t('feed.ownStory')}
                  className={`group w-full flex flex-col items-center rounded-2xl pb-1 ${FOCUS_RING}`}
                >
                  <span className="relative transition-transform duration-200 group-hover:scale-105">
                    <span style={{ opacity: mineHidden === mine.length ? 0.55 : 1 }}>
                      <StoryRing size={AVATAR} segments={mine.map(() => false)} avatarUrl={latestMine.owner.avatar_url} username={latestMine.owner.username} still />
                    </span>
                    {kindBadge(latestMine, true)}
                    {mineHidden > 0 ? (
                      <span
                        className="absolute -top-1 -right-1.5 grid place-items-center w-[24px] h-[24px] rounded-full bg-amber-300"
                        style={{ color: INK, boxShadow: `0 0 0 2.5px ${NIGHT}` }}
                        aria-hidden
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      mineReactions > 0 && (
                        <span
                          className="absolute -top-1 -right-1.5 inline-flex items-center gap-0.5 h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white bg-rose-500"
                          style={{ boxShadow: `0 0 0 2.5px ${NIGHT}` }}
                          aria-hidden
                        >
                          <Heart className="w-2.5 h-2.5" fill="currentColor" />
                          {mineReactions}
                        </span>
                      )
                    )}
                  </span>
                  <span className="mt-3 max-w-full text-xs font-semibold truncate" style={{ color: MIST }}>
                    {t('feed.you')}
                  </span>
                </button>
              </li>
            )}
            {groups.map((group, index) => {
              const latest = group.stories[group.stories.length - 1];
              return (
                <li key={group.owner.id} className="shrink-0 w-[84px]">
                  <button
                    onClick={() => openGroup(index)}
                    aria-label={groupLabel(group)}
                    className={`group w-full flex flex-col items-center rounded-2xl pb-1 ${FOCUS_RING}`}
                  >
                    <span className="relative transition-transform duration-200 group-hover:scale-105">
                      <StoryRing
                        size={AVATAR}
                        segments={group.stories.map((story) => !story.seen)}
                        avatarUrl={group.owner.avatar_url}
                        username={group.owner.username}
                      />
                      {kindBadge(latest, group.seen)}
                    </span>
                    <span
                      className={`mt-3 max-w-full text-xs truncate ${group.seen ? 'font-medium' : 'font-semibold'}`}
                      style={{ color: group.seen ? MIST : PAPER }}
                    >
                      @{group.owner.username}
                    </span>
                  </button>
                </li>
              );
            })}
            {/* sem atividade de amigos ainda: um convite no lugar dos stories */}
            {showFindFriends && (
              <li className="shrink-0 w-[84px]">
                <Link
                  to="/community"
                  aria-label={t('feed.findFriendsLabel')}
                  className={`group w-full flex flex-col items-center rounded-2xl pb-1 ${FOCUS_RING}`}
                >
                  <span
                    className="grid place-items-center w-[78px] h-[78px] rounded-full transition-transform duration-200 group-hover:scale-105"
                    style={{ border: '2px dashed rgba(243,234,211,0.3)', background: VELVET, color: PAPER }}
                    aria-hidden
                  >
                    <UserPlus className="w-6 h-6" />
                  </span>
                  <span className="mt-3 max-w-full text-xs font-semibold truncate" style={{ color: MIST }}>
                    {t('feed.findFriends')}
                  </span>
                </Link>
              </li>
            )}
          </ol>
        </div>
      )}

      {viewer && (
        <StoryViewer
          groups={viewer.groups}
          start={viewer.start}
          viewerId={userId}
          onClose={closeViewer}
          onStoryUpdate={updateStory}
          onSeen={handleSeen}
          onOpenMovie={openMovie}
        />
      )}
    </section>
  );
};

export default FriendsFeed;
