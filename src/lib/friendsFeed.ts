import { supabase } from './supabase';

// Feed dos Amigos (home): stories feitos das interações dos amigos com as
// obras — avaliou, guardou na watchlist, escreveu resenha. O banco
// (supabase/migrations/20261004500000_friends_feed.sql e as seguintes)
// devolve as 40 interações mais recentes, no máximo 4 por amigo, dos últimos
// 30 dias. Curtir vira sussurro para o amigo; comentar também.
// O dono pode ocultar um story seu da visão dos amigos.
//
// Conquistas também viram stories (media_type 'achievement'): cada tag
// desbloqueada (menos as especiais) e, no lugar das especiais, a conclusão
// das missões de um evento (Halloween, Natal…).

export type StoryKind = 'rate' | 'watchlist' | 'review' | 'tag' | 'event';
export type StoryMediaType = 'movie' | 'tv' | 'achievement';

export interface FeedTagAchievement {
  category: 'basic' | 'theme' | 'community' | 'oracle';
  name: string;
  emoji: string;
}

export interface FeedEventAchievement {
  event_id: string;
  edition: number;
  // 1 no primeiro ano do evento, 2 no segundo…
  level: number;
  emoji: string;
  tags: { tag: string; name: string; emoji: string }[];
}

export interface FeedOwner {
  id: string;
  username: string;
  avatar_url: string | null;
  avatar_frame: string | null;
  plan_type: string | null;
  active_tag: { name?: string; emoji?: string; category?: string } | null;
}

export interface FeedReview {
  title: string | null;
  excerpt: string;
  truncated: boolean;
  has_spoilers: boolean;
}

export interface FeedStory {
  // "<dono>:<movie|tv|achievement>:<id>"
  id: string;
  owner: FeedOwner;
  // obra: id do TMDB; conquista: id da conquista
  movie_id: number;
  media_type: StoryMediaType;
  title: string | null;
  title_pt: string | null;
  title_en: string | null;
  poster_path: string | null;
  poster_path_pt: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  rating: number | null;
  kind: StoryKind;
  review: FeedReview | null;
  // só nas conquistas (kind 'tag' ou 'event')
  achievement?: FeedTagAchievement | FeedEventAchievement | null;
  activity_at: string;
  // o dono ocultou este story dos amigos (só o dono chega a ver um oculto)
  hidden?: boolean;
  like_count: number;
  liked: boolean;
  likers: { username: string; avatar_url: string | null }[];
  comment_count: number;
  seen: boolean;
}

export interface FeedComment {
  id: string;
  content: string;
  created_at: string;
  mine: boolean;
  can_remove: boolean;
  author: { id: string; username: string; avatar_url: string | null };
}

export interface FriendsFeedData {
  stories: FeedStory[];
  // os seus stories como os amigos veem (os 4 mais recentes dos últimos 30
  // dias), mais os que você ocultou entre eles; do mais recente ao mais antigo
  mine: FeedStory[];
  friend_count: number;
}

// Os stories de um mesmo amigo, numa bolinha só (como nos stories do
// Instagram): em ordem cronológica dentro do grupo.
export interface FeedGroup {
  owner: FeedOwner;
  stories: FeedStory[];
  seen: boolean;
  latestAt: string;
}

export const FEED_LIMIT = 40;

export const groupStories = (stories: FeedStory[]): FeedGroup[] => {
  const byOwner = new Map<string, FeedStory[]>();
  stories.forEach((story) => {
    const list = byOwner.get(story.owner.id) ?? [];
    list.push(story);
    byOwner.set(story.owner.id, list);
  });
  const groups: FeedGroup[] = [...byOwner.values()].map((list) => {
    const ordered = [...list].sort((a, b) => a.activity_at.localeCompare(b.activity_at));
    return {
      owner: ordered[0].owner,
      stories: ordered,
      seen: ordered.every((story) => story.seen),
      latestAt: ordered[ordered.length - 1].activity_at,
    };
  });
  // quem tem novidade vem primeiro; dentro de cada metade, o mais recente
  return groups.sort((a, b) => Number(a.seen) - Number(b.seen) || b.latestAt.localeCompare(a.latestAt));
};

// Primeiro story ainda não visto do grupo (ou o primeiro, se já viu tudo).
export const firstUnseenIndex = (group: FeedGroup): number => {
  const index = group.stories.findIndex((story) => !story.seen);
  return index === -1 ? 0 : index;
};

export const isAchievement = (story: Pick<FeedStory, 'media_type'>): boolean => story.media_type === 'achievement';

export const tagAchievementOf = (story: FeedStory): FeedTagAchievement | null =>
  story.kind === 'tag' && story.achievement ? (story.achievement as FeedTagAchievement) : null;

export const eventAchievementOf = (story: FeedStory): FeedEventAchievement | null =>
  story.kind === 'event' && story.achievement ? (story.achievement as FeedEventAchievement) : null;

const isPt = (language: string) => language.toLowerCase().startsWith('pt');

export const storyTitle = (story: FeedStory, language: string): string =>
  (isPt(language) ? story.title_pt ?? story.title : story.title_en ?? story.title) ?? story.title ?? '';

export const storyPoster = (story: FeedStory, language: string): string | null =>
  isPt(language) ? story.poster_path_pt ?? story.poster_path : story.poster_path ?? story.poster_path_pt;

export const storyYear = (story: FeedStory): string | null => story.release_date?.slice(0, 4) ?? null;

// ---------------------------------------------------------------------------
// Chamadas ao banco
// ---------------------------------------------------------------------------

const storyArgs = (story: Pick<FeedStory, 'owner' | 'movie_id' | 'media_type'>) => ({
  p_owner: story.owner.id,
  p_movie_id: story.movie_id,
  p_media_type: story.media_type,
});

export async function fetchFriendsFeed(): Promise<FriendsFeedData> {
  const { data, error } = await supabase.rpc('get_friends_feed', { p_limit: FEED_LIMIT });
  if (error) throw error;
  const payload = (data ?? {}) as Partial<FriendsFeedData> & { me?: FeedStory | null };
  return {
    stories: payload.stories ?? [],
    mine: payload.mine ?? (payload.me ? [payload.me] : []),
    friend_count: payload.friend_count ?? 0,
  };
}

export async function fetchStory(ownerId: string, movieId: number, mediaType: StoryMediaType): Promise<FeedStory | null> {
  const { data, error } = await supabase.rpc('get_feed_story', { p_owner: ownerId, p_movie_id: movieId, p_media_type: mediaType });
  if (error) throw error;
  return (data as FeedStory | null) ?? null;
}

export async function markStoryViewed(story: FeedStory): Promise<void> {
  const { error } = await supabase.rpc('mark_feed_story_viewed', storyArgs(story));
  if (error) console.error('feed: mark viewed', error);
}

export async function toggleStoryLike(story: FeedStory): Promise<{ liked: boolean; like_count: number }> {
  const { data, error } = await supabase.rpc('toggle_feed_like', storyArgs(story));
  if (error) throw error;
  return data as { liked: boolean; like_count: number };
}

// Ocultar / mostrar o próprio story para os amigos.
export async function toggleStoryHidden(story: FeedStory): Promise<boolean> {
  const { data, error } = await supabase.rpc('toggle_feed_story_hidden', { p_movie_id: story.movie_id, p_media_type: story.media_type });
  if (error) throw error;
  return Boolean((data as { hidden?: boolean } | null)?.hidden);
}

export async function fetchStoryComments(story: FeedStory): Promise<FeedComment[]> {
  const { data, error } = await supabase.rpc('get_feed_comments', storyArgs(story));
  if (error) throw error;
  return (data as FeedComment[] | null) ?? [];
}

export async function addStoryComment(story: FeedStory, content: string): Promise<FeedComment> {
  const { data, error } = await supabase.rpc('add_feed_comment', { ...storyArgs(story), p_content: content });
  if (error) throw error;
  return data as FeedComment;
}

export async function removeStoryComment(commentId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_feed_comment', { p_comment_id: commentId });
  if (error) throw error;
  return Boolean(data);
}

// "há 3 h", "ontem"… no idioma do site.
export function relativeTime(iso: string, language: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' });
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / (7 * 86400)), 'week');
  if (abs < 365 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), 'month');
  return rtf.format(Math.round(diffSec / (365 * 86400)), 'year');
}
