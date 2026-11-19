import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Q, isMissingFunction, useCached } from '../../lib/data';
import type { FriendRating } from './shared';

// Quem já viu este título (as bolhas sobre o pôster): amigos primeiro, depois
// resenhas de outras pessoas, depois amigos de amigos — até 5. Desde
// 18/11/2026 mora neste hook, usado só pela seção das bolhas (FriendBubbles):
// quando a resposta chega, só as bolhas re-renderizam, não a ficha inteira.
//
// 19/11/2026 (Reborn, onda 3; rede.md A3): a lista vem pronta do banco, numa
// ida só (get_title_social: mesma ordem dos grupos, mesmo teto de 5). Antes
// eram de 4 a 11 consultas EM SÉRIE a cada abertura (medido na prévia de rede:
// 4 para quem tem amigos que viram o título; quem tem poucos amigos caía sempre
// nos níveis 2 e 3). A resposta fica guardada 2 min por pessoa + título (reabrir
// não pede de novo) e só na memória: é dado de outras pessoas. A cascata antiga
// continua abaixo como PLANO B, para um banco que ainda não tenha a função.

type Entry = { user_id: string; rating: number | null };
type Profile = { id: string; username: string; avatar_url: string | null };
type Review = { user_id: string; title: string | null };

async function fetchFriendRatings(userId: string, movieId: number, mediaType: 'movie' | 'tv'): Promise<FriendRating[]> {
  const MAX_BUBBLES = 5;
  let combined: FriendRating[] = [];
  // Rastreia quem já está em `combined` pra nenhum nível seguinte
  // repetir a mesma pessoa (ex.: um amigo de amigo que também
  // aparece nas reviews aleatórias de terceiros).
  const usedUserIds = new Set<string>();

  // Nível 1: amigos diretos (amizade é simétrica — pega o outro
  // lado da relação, seja qual for quem enviou o pedido
  // originalmente).
  const { data: friendshipData, error: friendshipError } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

  if (friendshipError) throw friendshipError;

  const followingIds = (friendshipData || []).map((f: { requester_id: string; addressee_id: string }) =>
    f.requester_id === userId ? f.addressee_id : f.requester_id
  );

  if (followingIds.length > 0) {
    const { data: allEntriesData, error: entriesError } = await supabase
      .from('user_movies')
      .select(`
        user_id,
        rating,
        movies!inner(media_type)
      `)
      .eq('movie_id', movieId)
      .eq('movies.media_type', mediaType)
      .in('user_id', followingIds);

    if (entriesError) throw entriesError;

    if (allEntriesData && allEntriesData.length > 0) {
      const ratedEntries = allEntriesData.filter((r: Entry) => r.rating !== null);
      // Watchlist-only: mesmo filme presente em user_movies, mas sem
      // nota — é exatamente como o resto do app já identifica "está
      // na watchlist" (rating IS NULL).
      const watchlistOnlyEntries = allEntriesData.filter((r: Entry) => r.rating === null);

      const allUserIds = allEntriesData.map((r: Entry) => r.user_id);

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', allUserIds);

      if (profilesError) throw profilesError;

      const ratedUserIds = ratedEntries.map((r: Entry) => r.user_id);
      const { data: reviewsData } = ratedUserIds.length > 0
        ? await supabase
            .from('reviews')
            .select('user_id, title')
            .eq('movie_id', movieId)
            .eq('media_type', mediaType)
            .in('user_id', ratedUserIds)
        : { data: [] as Review[] };

      const ratedFormatted: FriendRating[] = ratedEntries.map((r: Entry) => {
        const profile = profilesData?.find((p: Profile) => p.id === r.user_id);
        const review = reviewsData?.find((rv: Review) => rv.user_id === r.user_id);
        return {
          user_id: r.user_id,
          username: profile?.username || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          rating: r.rating,
          review_title: review?.title || null,
        };
      });

      const watchlistFormatted: FriendRating[] = watchlistOnlyEntries.map((r: Entry) => {
        const profile = profilesData?.find((p: Profile) => p.id === r.user_id);
        return {
          user_id: r.user_id,
          username: profile?.username || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          rating: null,
          review_title: null,
          is_watchlist_only: true,
        };
      });

      const shuffledRated = ratedFormatted.sort(() => Math.random() - 0.5);
      const shuffledWatchlist = watchlistFormatted.sort(() => Math.random() - 0.5);
      // Prioriza quem avaliou (informação mais rica) e completa com
      // quem só tem na watchlist até o teto de 5 bolhas.
      combined = [...shuffledRated, ...shuffledWatchlist].slice(0, MAX_BUBBLES);
      combined.forEach((f) => usedUserIds.add(f.user_id));
    }
  }

  // Nível 2: se ainda sobram vagas (não só quando combined está
  // totalmente vazio) — completa com reviews ESCRITAS por qualquer
  // outro usuário sobre essa obra (não avaliação simples, tem que
  // ter texto de review de verdade), excluindo quem já apareceu.
  if (combined.length < MAX_BUBBLES) {
    const remaining = MAX_BUBBLES - combined.length;
    const { data: randomReviewsData } = await supabase
      .from('reviews')
      .select('user_id, title')
      .eq('movie_id', movieId)
      .eq('media_type', mediaType)
      .not('title', 'is', null)
      .limit(20);

    const freshReviews = (randomReviewsData || []).filter((r: Review) => !usedUserIds.has(r.user_id));

    if (freshReviews.length > 0) {
      const shuffledReviews = [...freshReviews].sort(() => Math.random() - 0.5).slice(0, remaining);
      const reviewUserIds = shuffledReviews.map((r: Review) => r.user_id);
      const { data: randomProfilesData } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', reviewUserIds);

      const { data: randomRatingsData } = await supabase
        .from('user_movies')
        .select('user_id, rating')
        .eq('movie_id', movieId)
        .in('user_id', reviewUserIds);

      const tier2Formatted: FriendRating[] = shuffledReviews.map((r: Review) => {
        const profile = randomProfilesData?.find((p: Profile) => p.id === r.user_id);
        const ratingEntry = randomRatingsData?.find((rt: Entry) => rt.user_id === r.user_id);
        return {
          user_id: r.user_id,
          username: profile?.username || 'Unknown',
          avatar_url: profile?.avatar_url || null,
          rating: ratingEntry?.rating ?? null,
          review_title: r.title,
        };
      });

      combined = [...combined, ...tier2Formatted];
      tier2Formatted.forEach((f) => usedUserIds.add(f.user_id));
    }
  }

  // Nível 3: ainda sobram vagas — completa com amigos de amigos (2º
  // grau), excluindo quem já é amigo direto, o próprio usuário, e
  // qualquer um já mostrado nos níveis anteriores. Mesma
  // priorização: quem avaliou primeiro, completa com quem só tem
  // na watchlist.
  if (combined.length < MAX_BUBBLES) {
    const remaining = MAX_BUBBLES - combined.length;
    const { data: fofData, error: fofError } = await supabase
      .rpc('get_friends_of_friends', { p_user_id: userId });

    if (fofError) throw fofError;

    const fofIds = (fofData || [])
      .map((r: Entry) => r.user_id)
      .filter((id: string) => !usedUserIds.has(id));

    if (fofIds.length > 0) {
      const { data: fofEntriesData, error: fofEntriesError } = await supabase
        .from('user_movies')
        .select(`
          user_id,
          rating,
          movies!inner(media_type)
        `)
        .eq('movie_id', movieId)
        .eq('movies.media_type', mediaType)
        .in('user_id', fofIds);

      if (fofEntriesError) throw fofEntriesError;

      if (fofEntriesData && fofEntriesData.length > 0) {
        const fofRatedEntries = fofEntriesData.filter((r: Entry) => r.rating !== null);
        const fofWatchlistOnlyEntries = fofEntriesData.filter((r: Entry) => r.rating === null);

        const fofAllUserIds = fofEntriesData.map((r: Entry) => r.user_id);

        const { data: fofProfilesData, error: fofProfilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', fofAllUserIds);

        if (fofProfilesError) throw fofProfilesError;

        const fofRatedUserIds = fofRatedEntries.map((r: Entry) => r.user_id);
        const { data: fofReviewsData } = fofRatedUserIds.length > 0
          ? await supabase
              .from('reviews')
              .select('user_id, title')
              .eq('movie_id', movieId)
              .eq('media_type', mediaType)
              .in('user_id', fofRatedUserIds)
          : { data: [] as Review[] };

        const fofRatedFormatted: FriendRating[] = fofRatedEntries.map((r: Entry) => {
          const profile = fofProfilesData?.find((p: Profile) => p.id === r.user_id);
          const review = fofReviewsData?.find((rv: Review) => rv.user_id === r.user_id);
          return {
            user_id: r.user_id,
            username: profile?.username || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            rating: r.rating,
            review_title: review?.title || null,
          };
        });

        const fofWatchlistFormatted: FriendRating[] = fofWatchlistOnlyEntries.map((r: Entry) => {
          const profile = fofProfilesData?.find((p: Profile) => p.id === r.user_id);
          return {
            user_id: r.user_id,
            username: profile?.username || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            rating: null,
            review_title: null,
            is_watchlist_only: true,
          };
        });

        const fofShuffledRated = fofRatedFormatted.sort(() => Math.random() - 0.5);
        const fofShuffledWatchlist = fofWatchlistFormatted.sort(() => Math.random() - 0.5);
        const tier3Formatted = [...fofShuffledRated, ...fofShuffledWatchlist].slice(0, remaining);
        combined = [...combined, ...tier3Formatted];
      }
    }
  }

  return combined;
}

async function loadTitleSocial(userId: string, movieId: number, mediaType: 'movie' | 'tv'): Promise<FriendRating[]> {
  const { data, error } = await supabase.rpc('get_title_social', { p_id: movieId, p_media_type: mediaType });
  if (isMissingFunction(error)) return fetchFriendRatings(userId, movieId, mediaType);
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as FriendRating[];
}

const NO_FRIENDS: FriendRating[] = [];

export function useTitleFriends(movieId: number, mediaType: 'movie' | 'tv', userId: string | null) {
  const query = useCached<FriendRating[]>(Q.titleSocial(userId, mediaType, movieId), () => loadTitleSocial(userId as string, movieId, mediaType));
  const { error } = query;
  useEffect(() => {
    if (error) console.error('Error loading friend ratings:', error);
  }, [error]);
  // sem login nada é pedido e as bolhas ficam "carregando", como antes
  return { friends: query.data ?? NO_FRIENDS, loading: query.isPending && !error };
}
