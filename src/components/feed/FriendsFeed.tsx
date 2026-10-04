import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, Heart, PenLine, Play, Star, Users } from 'lucide-react';
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

// Feed dos Amigos, na home logo abaixo das Recomendações do Dia. Junta o que
// antes eram "Melhores dos amigos", "Na watchlist dos amigos" e "Atividade
// dos amigos": uma fileira de avatares no jeito dos stories, um por amigo,
// com um gomo no anel para cada atividade recente dele (no máximo 10 no
// total). Tocar abre os stories em tela cheia.

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
  const unseenCount = (data?.stories ?? []).filter((story) => !story.seen).length;

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
  const noFriends = data !== null && data.friend_count === 0;
  const noActivity = data !== null && data.friend_count > 0 && groups.length === 0;

  return (
    <section className="border-t border-white/[0.07] pt-10 pb-8 sm:pt-12 sm:pb-10" aria-labelledby="friends-feed-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2 id="friends-feed-title" style={{ ...PIXEL, color: PAPER }} className="min-w-0 text-2xl sm:text-3xl leading-tight">
            {t('feed.title')}
          </h2>
          {groups.length > 0 && (
            <button
              onClick={() => openGroup(0)}
              aria-label={t('feed.playAll')}
              className={`shrink-0 inline-flex items-center justify-center gap-2 h-10 w-10 sm:w-auto sm:px-4 rounded-full sm:rounded-lg text-sm font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition ${FOCUS_RING}`}
              style={{ color: PAPER }}
            >
              <Play className="w-4 h-4" fill="currentColor" aria-hidden />
              <span className="hidden sm:inline">{t('feed.playAll')}</span>
            </button>
          )}
        </div>
        <p className="mt-1.5 text-sm" style={{ color: MIST }}>
          {unseenCount > 0 && (
            <span className="inline-flex items-center h-5 px-2 mr-2 rounded-full align-[1px] text-[11px] font-semibold text-white bg-gradient-to-r from-fuchsia-500 to-violet-500">
              {t('feed.newCount', { count: unseenCount })}
            </span>
          )}
          {t('feed.subtitle')}
        </p>
      </div>

      {loading ? (
        <ol className="mt-5 flex gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] overflow-hidden" aria-hidden>
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="shrink-0 w-[84px] flex flex-col items-center">
              <span className="w-[76px] h-[76px] rounded-full bg-white/10 animate-pulse" />
              <span className="mt-3 h-3 w-14 rounded bg-white/10 animate-pulse" />
            </li>
          ))}
        </ol>
      ) : failed ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-5">
          <p className="text-sm" style={{ color: MIST }}>
            {t('feed.loadError')}{' '}
            <button onClick={load} className={`font-semibold underline underline-offset-4 rounded ${FOCUS_RING}`} style={{ color: PAPER }}>
              {t('feed.retry')}
            </button>
          </p>
        </div>
      ) : noFriends || noActivity ? (
        <div className="mx-auto max-w-6xl px-5 sm:px-8 mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6 rounded-2xl ring-1 ring-white/10 p-6" style={{ background: VELVET }}>
            <span className="w-12 h-12 shrink-0 rounded-xl grid place-items-center ring-1 ring-violet-300/30 text-violet-200" style={{ background: 'rgba(255,255,255,0.03)' }} aria-hidden>
              <Users className="w-6 h-6" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold" style={{ color: PAPER }}>
                {noFriends ? t('feed.emptyNoFriendsTitle') : t('feed.emptyNoActivityTitle')}
              </p>
              <p className="mt-1 text-sm leading-relaxed max-w-lg" style={{ color: MIST }}>
                {noFriends ? t('feed.emptyNoFriendsText') : t('feed.emptyNoActivityText')}
              </p>
            </div>
            {noFriends && (
              <Link
                to="/community"
                className={`shrink-0 inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition ${FOCUS_RING}`}
              >
                {t('feed.openCommunity')}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="co-feed-row mt-4 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {/* rola de ponta a ponta; o recuo acompanha a margem do conteúdo */}
          <ol className="flex gap-3 sm:gap-4 px-5 sm:px-8 xl:px-[max(2rem,calc((100vw-72rem)/2+2rem))] pt-2 pb-2">
            {data?.me && (
              <li className="shrink-0 w-[84px]">
                <button
                  onClick={openOwn}
                  aria-label={t('feed.ownStory')}
                  className={`group w-full flex flex-col items-center rounded-2xl pb-1 ${FOCUS_RING}`}
                >
                  <span className="relative transition-transform duration-200 group-hover:scale-105">
                    <StoryRing size={AVATAR} segments={[false]} avatarUrl={data.me.owner.avatar_url} username={data.me.owner.username} still />
                    {kindBadge(data.me, true)}
                    {data.me.like_count + data.me.comment_count > 0 && (
                      <span
                        className="absolute -top-1 -right-1.5 inline-flex items-center gap-0.5 h-[22px] px-1.5 rounded-full text-[11px] font-bold text-white bg-rose-500"
                        style={{ boxShadow: `0 0 0 2.5px ${NIGHT}` }}
                        aria-hidden
                      >
                        <Heart className="w-2.5 h-2.5" fill="currentColor" />
                        {data.me.like_count + data.me.comment_count}
                      </span>
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
