import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, EyeOff, Heart, PenLine, Star, UserPlus } from 'lucide-react';
import type { Movie } from '../../lib/tmdb';
import { INK, MIST, NIGHT, PAPER, PIXEL, VELVET, FOCUS_RING, ratingTone } from '../../lib/oracleTheme';
import {
  fetchFriendsFeed,
  firstUnseenIndex,
  groupStories,
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
// um gomo no anel para cada atividade recente dele (no máximo 10 no total).
// O primeiro é o seu ("Você"). Tocar abre os stories em tela cheia.

const AVATAR = 66;
const REFRESH_AFTER_MS = 60_000;

interface FriendsFeedProps {
  userId: string;
  onMovieClick: (movie: Movie) => void;
}

type ViewerState = { groups: FeedGroup[]; start: { group: number; story: number } };

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
        me: current.me?.id === updated.id ? updated : current.me,
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

  const openOwn = () => {
    if (!data?.me) return;
    const me = data.me;
    setViewer({ groups: [{ owner: me.owner, stories: [me], seen: true, latestAt: me.activity_at }], start: { group: 0, story: 0 } });
  };

  const openMovie = (story: FeedStory) => {
    setViewer(null);
    onMovieClick({
      id: story.movie_id,
      title: storyTitle(story, i18n.language),
      poster_path: storyPoster(story, i18n.language) ?? '',
      media_type: story.media_type,
      release_date: story.release_date ?? '',
    } as Movie);
  };

  const kindBadge = (story: FeedStory, seen: boolean) => {
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

  const groupLabel = (group: FeedGroup) => {
    const latest = group.stories[group.stories.length - 1];
    const what = latest.rating === null ? t('feed.onWatchlist') : `${latest.rating}/10`;
    return `${t('feed.storyOf', { username: group.owner.username })} — ${storyTitle(latest, i18n.language)} (${what})${group.seen ? '' : ` · ${t('feed.unseen')}`}`;
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
            {data?.me && (
              <li className="shrink-0 w-[84px]">
                <button
                  onClick={openOwn}
                  aria-label={data.me.hidden ? `${t('feed.ownStory')} · ${t('feed.hiddenBadge')}` : t('feed.ownStory')}
                  className={`group w-full flex flex-col items-center rounded-2xl pb-1 ${FOCUS_RING}`}
                >
                  <span className="relative transition-transform duration-200 group-hover:scale-105">
                    <span style={{ opacity: data.me.hidden ? 0.55 : 1 }}>
                      <StoryRing size={AVATAR} segments={[false]} avatarUrl={data.me.owner.avatar_url} username={data.me.owner.username} still />
                    </span>
                    {kindBadge(data.me, true)}
                    {data.me.hidden ? (
                      <span
                        className="absolute -top-1 -right-1.5 grid place-items-center w-[24px] h-[24px] rounded-full bg-amber-300"
                        style={{ color: INK, boxShadow: `0 0 0 2.5px ${NIGHT}` }}
                        aria-hidden
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      data.me.like_count + data.me.comment_count > 0 && (
                        <span
                          className="absolute -top-1 -right-1.5 inline-flex items-center gap-0.5 h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white bg-rose-500"
                          style={{ boxShadow: `0 0 0 2.5px ${NIGHT}` }}
                          aria-hidden
                        >
                          <Heart className="w-2.5 h-2.5" fill="currentColor" />
                          {data.me.like_count + data.me.comment_count}
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
          onClose={() => setViewer(null)}
          onStoryUpdate={updateStory}
          onSeen={handleSeen}
          onOpenMovie={openMovie}
        />
      )}
    </section>
  );
};

export default FriendsFeed;
