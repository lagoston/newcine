import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { getTVSeasons, getWatchedEpisodesForProfile } from '../../lib/tmdb';
import { emit } from '../../lib/bus';
import { useEvent } from '../../hooks/useEvent';
import type { TitleMovie, TitleSeason } from './shared';
import { patchTitleMe, useTitleMe } from './useTitleMe';

// As temporadas de uma série e os episódios marcados como vistos. Fica na
// casca do menu: o botão "Temporadas e episódios" (a contagem) e a gaveta das
// temporadas usam os dois. As ações (marcar episódio, marcar temporada, abrir)
// não mudam de identidade a cada render (useEvent), para as seções memorizadas
// não re-renderizarem à toa.

const NO_SEASONS: TitleSeason[] = [];
const NO_EPISODES: Set<string> = new Set();

interface Options {
  movie: TitleMovie;
  userId: string | null;
  // a nota de quem olha (só marca episódio quem já avaliou a série)
  userRating: number | null;
  isOtherUserProfile: boolean;
  profileUserId?: string;
  onEpisodeToggle?: () => void;
}

export function useTitleEpisodes({ movie, userId, userRating, isOtherUserProfile, profileUserId, onEpisodeToggle }: Options) {
  const movieId = movie.id;
  const isTv = movie.media_type === 'tv';
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(NO_EPISODES);
  const [pendingEpisodes, setPendingEpisodes] = useState<Set<string>>(NO_EPISODES);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [seasons, setSeasons] = useState<TitleSeason[]>(movie.seasons || NO_SEASONS);

  // Reset seasons when movie changes
  useEffect(() => {
    setSeasons(movie.seasons || NO_SEASONS);
    setLoadingSeasons(false);
    // só quando o título é outro: a troca do item da lista pelos detalhes
    // completos (mesmo id) não mexe nas temporadas já mostradas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);

  // 19/11/2026 (Reborn, onda 3): os episódios vistos de QUEM OLHA vêm da
  // resposta única "eu e este título" (useTitleMe → get_title_me, parte
  // "episodes"); antes era uma consulta só para isto a cada série aberta. O
  // perfil de outra pessoa continua na leitura dela (getWatchedEpisodesForProfile).
  // `mine` undefined = ainda não chegou; null = plano B (a consulta de sempre).
  const me = useTitleMe(movieId, isTv ? 'tv' : 'movie');
  const own = !(isOtherUserProfile && profileUserId);
  const mine = !own ? null : me === undefined ? undefined : me === null ? null : me.episodes;
  // só o que a pessoa acabou de marcar vai para a cópia guardada (ver abaixo)
  const touched = useRef(false);

  useEffect(() => {
    if (!userId || !isTv) return;
    if (mine === undefined) return;
    if (mine) {
      setWatchedEpisodes((prev) => {
        const same = prev.size === mine.length && mine.every((ep) => prev.has(`${ep.season_number}-${ep.episode_number}`));
        return same ? prev : new Set(mine.map((ep) => `${ep.season_number}-${ep.episode_number}`));
      });
      return;
    }
    let alive = true;
    (async () => {
      try {
        // Em perfil de outra pessoa, os episódios marcados como assistidos
        // são os DELA — usa a variante que respeita visibilidade de
        // perfil e lê da conta do dono, não de quem está olhando.
        if (isOtherUserProfile && profileUserId) {
          const watched = await getWatchedEpisodesForProfile(userId, profileUserId, movieId);
          if (alive) setWatchedEpisodes(watched);
          return;
        }

        const { data, error } = await supabase
          .from('watched_episodes')
          .select('season_number, episode_number')
          .eq('user_id', userId)
          .eq('tmdb_id', movieId);

        if (error) throw error;

        const watched = new Set<string>();
        data?.forEach((ep: { season_number: number; episode_number: number }) => {
          watched.add(`${ep.season_number}-${ep.episode_number}`);
        });
        if (alive) setWatchedEpisodes(watched);
      } catch (error) {
        console.error('Error loading watched episodes:', error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, movieId, isTv, isOtherUserProfile, profileUserId, mine]);

  // Marcou ou desmarcou: a cópia guardada de "eu e este título" recebe a lista
  // nova (o menu aberto não relê, e reabrir já vem certo).
  useEffect(() => {
    if (!touched.current || !userId || !isTv || !own) return;
    touched.current = false;
    patchTitleMe(userId, movieId, 'tv', {
      episodes: Array.from(watchedEpisodes, (key) => {
        const [season, episode] = key.split('-').map(Number);
        return { season_number: season, episode_number: episode };
      }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedEpisodes]);

  const fetchSeasons = async () => {
    if (!isTv || loadingSeasons) return;

    setLoadingSeasons(true);
    try {
      const { data: cached } = await supabase
        .from('movie_cache')
        .select('seasons_data, number_of_seasons')
        .eq('tmdb_id', movieId)
        .eq('media_type', 'tv')
        .maybeSingle();

      const cachedSeasons: TitleSeason[] | undefined = cached?.seasons_data;
      const cachedHasEpisodes =
        !!cachedSeasons && cachedSeasons.length > 0 &&
        (cachedSeasons[0]?.episodes?.length ?? 0) > 0;

      if (cachedSeasons && cachedHasEpisodes) {
        setSeasons(cachedSeasons);
        // guardado no próprio título: da próxima vez já abre com os episódios
        movie.seasons = cachedSeasons;
        return;
      }

      const numberOfSeasons = cached?.number_of_seasons || movie.number_of_seasons || 0;
      if (numberOfSeasons <= 0) return;

      // Série sem os episódios no banco: a cache-title busca e grava.
      const freshSeasons = await getTVSeasons(movieId);
      if (freshSeasons.length > 0) {
        setSeasons(freshSeasons);
        movie.seasons = freshSeasons;
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  // Chamado ao abrir a gaveta das temporadas: busca os episódios se o título
  // ainda não os trouxe.
  const ensureSeasons = useEvent(async () => {
    const hasDetailedSeasons = seasons.length > 0 && (seasons[0]?.episodes?.length ?? 0) > 0;
    if (!hasDetailedSeasons) {
      await fetchSeasons();
    }
  });

  const toggleEpisode = useEvent(async (seasonNumber: number, episodeNumber: number) => {
    // isOtherUserProfile bloqueado aqui também, não só escondendo o
    // botão — defesa em profundidade contra marcar episódio na conta de
    // outra pessoa por qualquer caminho de código.
    if (!userId || userRating === null || isOtherUserProfile) return;

    const key = `${seasonNumber}-${episodeNumber}`;

    // Trava contra cliques concorrentes no MESMO episódio — clicar de
    // novo antes da chamada anterior terminar fazia duas chamadas
    // decidirem "marcar" (ou "desmarcar") a partir do mesmo estado
    // desatualizado, e a segunda podia falhar por violar a chave única
    // da tabela, ou inverter o que a primeira acabara de fazer.
    if (pendingEpisodes.has(key)) return;
    setPendingEpisodes((prev) => new Set(prev).add(key));

    // A decisão de marcar/desmarcar também precisa vir do estado mais
    // recente no momento em que a chamada REALMENTE começa — não do
    // valor capturado quando o componente renderizou.
    const wasWatched = watchedEpisodes.has(key);

    try {
      if (wasWatched) {
        // Unmark episode
        const { error } = await supabase
          .from('watched_episodes')
          .delete()
          .eq('user_id', userId)
          .eq('tmdb_id', movieId)
          .eq('season_number', seasonNumber)
          .eq('episode_number', episodeNumber);

        if (error) throw error;
      } else {
        // Mark episode
        const { error } = await supabase
          .from('watched_episodes')
          .insert({
            user_id: userId,
            tmdb_id: movieId,
            season_number: seasonNumber,
            episode_number: episodeNumber
          });

        if (error) throw error;
      }

      // Forma funcional — sempre parte do estado mais recente, mesmo
      // que outras chamadas pra episódios diferentes tenham terminado
      // e atualizado o estado enquanto esta ainda estava em rede. Sem
      // isso, marcar vários episódios rapidamente fazia cada resposta
      // sobrescrever o Set inteiro a partir de uma foto antiga,
      // perdendo as marcações que já tinham "chegado" antes dela.
      touched.current = true;
      setWatchedEpisodes((prev) => {
        const next = new Set(prev);
        if (wasWatched) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });

      // Trigger parent component refresh
      if (onEpisodeToggle) {
        onEpisodeToggle();
      }

      // Avisa quem depende disto (estatísticas do perfil, progresso das
      // séries). 18/11/2026: pelo barramento (lib/bus.ts), que repete o evento
      // antigo de window 'episodeToggled' para quem ainda escuta por lá.
      emit('title:episodes', { id: movieId });
    } catch (error) {
      console.error('Error toggling episode:', error);
      toast.error('Failed to update episode status');
    } finally {
      setPendingEpisodes((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  });

  const toggleSeason = useEvent(async (season: TitleSeason) => {
    if (!userId || userRating === null || isOtherUserProfile) return;

    const seasonKey = `season-${season.season_number}-all`;
    if (pendingEpisodes.has(seasonKey)) return;
    setPendingEpisodes((prev) => new Set(prev).add(seasonKey));

    const episodes = season.episodes || [];
    const allWatched = episodes.every((ep) =>
      watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
    );

    try {
      if (allWatched) {
        // Unmark all episodes in season
        const { error } = await supabase
          .from('watched_episodes')
          .delete()
          .eq('user_id', userId)
          .eq('tmdb_id', movieId)
          .eq('season_number', season.season_number);

        if (error) throw error;

        // Forma funcional — parte sempre do estado mais recente, não
        // de uma foto capturada antes da chamada de rede terminar.
        touched.current = true;
        setWatchedEpisodes((prev) => {
          const next = new Set(prev);
          episodes.forEach((ep) => {
            next.delete(`${season.season_number}-${ep.episode_number}`);
          });
          return next;
        });
      } else {
        // Mark all episodes in season
        const episodesToInsert = episodes.map((ep) => ({
          user_id: userId,
          tmdb_id: movieId,
          season_number: season.season_number,
          episode_number: ep.episode_number
        }));

        const { error } = await supabase
          .from('watched_episodes')
          .upsert(episodesToInsert, {
            onConflict: 'user_id,tmdb_id,season_number,episode_number'
          });

        if (error) throw error;

        touched.current = true;
        setWatchedEpisodes((prev) => {
          const next = new Set(prev);
          episodes.forEach((ep) => {
            next.add(`${season.season_number}-${ep.episode_number}`);
          });
          return next;
        });
      }

      // Trigger parent component refresh
      if (onEpisodeToggle) {
        onEpisodeToggle();
      }

      emit('title:episodes', { id: movieId });
    } catch (error) {
      console.error('Error toggling season:', error);
      toast.error('Failed to update season status');
    } finally {
      setPendingEpisodes((prev) => {
        const next = new Set(prev);
        next.delete(seasonKey);
        return next;
      });
    }
  });

  return { seasons, loadingSeasons, ensureSeasons, watchedEpisodes, pendingEpisodes, toggleEpisode, toggleSeason };
}
