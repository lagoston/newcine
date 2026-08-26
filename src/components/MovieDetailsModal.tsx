import React, { useState, useEffect } from 'react';
import { X, Star, Loader2, Calendar, Clock, User, Film, Shield, Globe, Share2, Instagram, Tv, Users, MessageSquare, Play, ChevronRight, AlertCircle } from 'lucide-react';
import { Movie, getMovieTrailer, getMovieDetailsFromDB } from '../lib/tmdb';
import { getRandomFlavorPhrase } from '../lib/oracleFlavorPhrases';
import { useAuth } from '../lib/auth';
import { supabase, supabaseUrl } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { cache, CACHE_KEYS } from '../lib/cache';
import RecommendModal from './RecommendModal';
import ReviewsModal from './ReviewsModal';
import QuickAddMenu from './QuickAddMenu';
import html2canvas from 'html2canvas';

interface FriendRating {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rating: number;
  review_title?: string | null;
}

interface MovieDetailsModalProps {
  movie: Movie;
  isOpen: boolean;
  onClose: () => void;
  isOtherUserProfile?: boolean;
  onAddToLibrary?: () => void;
  onEpisodeToggle?: () => void;
}

const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({
  movie,
  isOpen,
  onClose,
  isOtherUserProfile = false,
  onAddToLibrary,
  onEpisodeToggle
}) => {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const [isInLibrary, setIsInLibrary] = useState(false);
  const [friendRatings, setFriendRatings] = useState<FriendRating[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showSeasonsModal, setShowSeasonsModal] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<Set<string>>(new Set());
  const [userRating, setUserRating] = useState<number | null>(null);
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [seasons, setSeasons] = useState<any[]>(movie.seasons || []);
  const [showReviewsModal, setShowReviewsModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null | undefined>(undefined);
  const [loadingTrailer, setLoadingTrailer] = useState(false);
  const [oracleSources, setOracleSources] = useState<string[]>([]);
  const [certification, setCertification] = useState<string | null>(null);

  // Top 10 do diretor — busca sob demanda, só quando o usuário clica.
  const [showDirectorTopTen, setShowDirectorTopTen] = useState(false);
  const [directorTopTenLoading, setDirectorTopTenLoading] = useState(false);
  const [directorTopTenError, setDirectorTopTenError] = useState<string | null>(null);
  const [directorTopTenMovies, setDirectorTopTenMovies] = useState<any[]>([]);
  const [directorNestedMovie, setDirectorNestedMovie] = useState<Movie | null>(null);
  const [loadingNestedMovieId, setLoadingNestedMovieId] = useState<number | null>(null);
  const [oracleFlavorPhrases, setOracleFlavorPhrases] = useState<Record<string, string>>({});
  // Controla quais balões estão visíveis agora (não "dispensados" — o padrão
  // é começar ESCONDIDO e aparecer sozinho depois de um tempo, ver useEffect
  // abaixo). Um toque no selo ou no balão alterna manualmente e cancela
  // qualquer temporizador pendente daquele oráculo.
  const [visibleOracleBubbles, setVisibleOracleBubbles] = useState<Set<string>>(new Set());
  const bubbleTimersRef = React.useRef<Record<string, { showTimer?: ReturnType<typeof setTimeout>; hideTimer?: ReturnType<typeof setTimeout> }>>({});

  const clearBubbleTimers = (source: string) => {
    const timers = bubbleTimersRef.current[source];
    if (timers?.showTimer) clearTimeout(timers.showTimer);
    if (timers?.hideTimer) clearTimeout(timers.hideTimer);
    bubbleTimersRef.current[source] = {};
  };

  const toggleOracleBubble = (source: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // O toque "quebra a cadeia" — cancela qualquer aparição/desaparição
    // automática pendente pra esse oráculo, o resto vira controle manual.
    clearBubbleTimers(source);
    setVisibleOracleBubbles((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      return next;
    });
  };

  // Reset seasons when movie changes
  useEffect(() => {
    setSeasons(movie.seasons || []);
    setLoadingSeasons(false);
  }, [movie.id]);

  useEffect(() => {
    if (session?.user?.id) {
      checkIfInLibrary();
      loadFriendRatings();
      loadUserRating();
      if (movie.media_type === 'tv') {
        loadWatchedEpisodes();
      }
    }
  }, [session?.user?.id, movie.id]);

      useEffect(() => {
    // Limpa temporizadores do filme anterior antes de trocar — evita um
    // balão do filme antigo aparecer sozinho depois que o usuário já
    // navegou pra outro filme.
    Object.keys(bubbleTimersRef.current).forEach(clearBubbleTimers);
    setVisibleOracleBubbles(new Set());

    if (movie.media_type === 'tv') {
      setOracleSources([]);
      setOracleFlavorPhrases({});
      return;
    }
    supabase
      .rpc('get_movie_oracle_mood_sources', { movie_id_param: movie.id })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching oracle mood sources:', error);
          return;
        }
        // data vem como [{ card_type, mood_key }, ...] — agrupa por oráculo
        // pra saber exatamente quais humores bateram pra cada um.
        const rows: { card_type: string; mood_key: string }[] = data || [];
        const moodsByOracle: Record<string, string[]> = {};
        rows.forEach((row) => {
          if (!moodsByOracle[row.card_type]) moodsByOracle[row.card_type] = [];
          moodsByOracle[row.card_type].push(row.mood_key);
        });

        const sources = Object.keys(moodsByOracle);
        setOracleSources(sources);

        // Sorteia uma frase característica por selo, respeitando o(s) humor(es)
        // reais que o filme bateu — "Surpresa Aleatória" só entra em jogo se
        // não houver nenhum humor específico (ver getRandomFlavorPhrase). A
        // frase é sorteada UMA VEZ aqui e guardada em estado — mesmo que o
        // balão apareça/suma/seja alternado manualmente depois, a frase
        // continua a mesma durante toda essa abertura do modal.
        const isPt = i18n.language.startsWith('pt');
        const phrases: Record<string, string> = {};
        sources.forEach((source) => {
          const phrase = getRandomFlavorPhrase(source, moodsByOracle[source]);
          if (phrase) phrases[source] = isPt ? phrase.pt : phrase.en;
        });
        setOracleFlavorPhrases(phrases);

        // Temporizador por selo: aparece sozinho 2s depois de abrir o modal,
        // fica visível por 6s, depois retrai sozinho. Um toque a qualquer
        // momento cancela esse ciclo (ver toggleOracleBubble).
        sources.forEach((source) => {
          if (!phrases[source]) return;
          const showTimer = setTimeout(() => {
            setVisibleOracleBubbles((prev) => new Set(prev).add(source));
            const hideTimer = setTimeout(() => {
              setVisibleOracleBubbles((prev) => {
                const next = new Set(prev);
                next.delete(source);
                return next;
              });
            }, 6000);
            bubbleTimersRef.current[source] = { ...bubbleTimersRef.current[source], hideTimer };
          }, 2000);
          bubbleTimersRef.current[source] = { showTimer };
        });
      });

    return () => {
      Object.keys(bubbleTimersRef.current).forEach(clearBubbleTimers);
    };
  }, [movie.id, movie.media_type, i18n.language]);

  // Classificação indicativa — busca direto do movie_cache.content_ratings,
  // que já vem como um array com uma entrada por país (ex: um item com
  // iso_3166_1 "BR" e outro "US", cada um com sua própria "certification").
  // A versão antiga dessa feature às vezes mostrava algo tipo "New York" em
  // vez da nota — sinal claro de estar lendo o campo errado desse array
  // (provavelmente pegando o índice [0] sem checar o país, ou lendo um outro
  // campo qualquer). Aqui filtramos explicitamente pelo país certo e lemos
  // SÓ o campo "certification", nunca outra coisa.
  useEffect(() => {
    const isPt = i18n.language.startsWith('pt');
    supabase
      .from('movie_cache')
      .select('content_ratings')
      .eq('tmdb_id', movie.id)
      .eq('media_type', movie.media_type || 'movie')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data?.content_ratings || !Array.isArray(data.content_ratings)) {
          setCertification(null);
          return;
        }
        const ratings: { iso_3166_1?: string; certification?: string }[] = data.content_ratings;
        const preferredRegion = isPt ? 'BR' : 'US';

        // Tenta o país preferido primeiro, depois US, depois qualquer um —
        // cada candidato passa pela padronização; só aceita o primeiro que
        // a função realmente reconhece (evita mostrar sigla de país que
        // ainda não mapeamos).
        const candidates = [
          ratings.find((r) => r.iso_3166_1 === preferredRegion && r.certification),
          ratings.find((r) => r.iso_3166_1 === 'US' && r.certification),
          ...ratings.filter((r) => r.certification)
        ];

        let standardized: string | null = null;
        for (const candidate of candidates) {
          if (candidate?.certification) {
            standardized = standardizeCertification(candidate.certification);
            if (standardized) break;
          }
        }
        setCertification(standardized);
      });
  }, [movie.id, movie.media_type, i18n.language]);

  useEffect(() => {
    if (isOpen) {
      // Simples overflow hidden - sem position fixed que causa bugs visuais
      const originalOverflow = document.body.style.overflow;
      const originalTouchAction = document.body.style.touchAction;

      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.touchAction = originalTouchAction;
      };
    }
  }, [isOpen]);

  const checkIfInLibrary = async () => {
    try {
      // Check if movie is in library with correct media_type
      const { data, error } = await supabase
        .from('user_movies')
        .select(`
          id,
          movies!inner(media_type)
        `)
        .eq('user_id', session?.user?.id)
        .eq('movie_id', movie.id)
        .eq('movies.media_type', movie.media_type || 'movie')
        .maybeSingle();

      if (error) {
        console.warn('Error checking library:', error);
        return;
      }

      setIsInLibrary(data !== null);
    } catch (error) {
      console.error('Error checking library:', error);
    }
  };

  const loadFriendRatings = async () => {
    if (!session?.user?.id) return;

    try {
      setLoadingFriends(true);

      // Step 1: Get following users
      const { data: followingData, error: followingError } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', session.user.id);

      if (followingError) throw followingError;
      if (!followingData || followingData.length === 0) {
        setFriendRatings([]);
        return;
      }

      const followingIds = followingData.map(f => f.following_id);

      // Step 2: Get ratings from friends for this movie (with correct media_type)
      const { data: ratingsData, error: ratingsError } = await supabase
        .from('user_movies')
        .select(`
          user_id,
          rating,
          movies!inner(media_type)
        `)
        .eq('movie_id', movie.id)
        .eq('movies.media_type', movie.media_type || 'movie')
        .in('user_id', followingIds)
        .not('rating', 'is', null);

      if (ratingsError) throw ratingsError;
      if (!ratingsData || ratingsData.length === 0) {
        setFriendRatings([]);
        return;
      }

            // Step 3: Get profiles for users who rated
      const ratingUserIds = ratingsData.map(r => r.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', ratingUserIds);

      if (profilesError) throw profilesError;

      // Step 3b: Get review titles (quando o amigo escreveu uma) para esse mesmo filme
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('user_id, title')
        .eq('movie_id', movie.id)
        .eq('media_type', movie.media_type || 'movie')
        .in('user_id', ratingUserIds);

      // Step 4: Combine ratings with profiles and review titles
      const formattedRatings: FriendRating[] = ratingsData
        .map((r: any) => {
          const profile = profilesData?.find(p => p.id === r.user_id);
          const review = reviewsData?.find(rv => rv.user_id === r.user_id);
          return {
            user_id: r.user_id,
            username: profile?.username || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            rating: r.rating,
            review_title: review?.title || null
          };
        })
        .filter(r => r.rating !== null)
        .slice(0, 5);

      const shuffled = formattedRatings.sort(() => Math.random() - 0.5);
      setFriendRatings(shuffled);
    } catch (error) {
      console.error('Error loading friend ratings:', error);
      setFriendRatings([]);
    } finally {
      setLoadingFriends(false);
    }
  };

  const loadUserRating = async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('movie_id', movie.id)
        .maybeSingle();

      if (error) throw error;
      setUserRating(data?.rating !== undefined ? data.rating : null);
    } catch (error) {
      console.error('Error loading user rating:', error);
    }
  };

  const loadWatchedEpisodes = async () => {
    if (!session?.user?.id || movie.media_type !== 'tv') return;

    try {
      const { data, error } = await supabase
        .from('watched_episodes')
        .select('season_number, episode_number')
        .eq('user_id', session.user.id)
        .eq('tmdb_id', movie.id);

      if (error) throw error;

      const watched = new Set<string>();
      data?.forEach(ep => {
        watched.add(`${ep.season_number}-${ep.episode_number}`);
      });
      setWatchedEpisodes(watched);
    } catch (error) {
      console.error('Error loading watched episodes:', error);
    }
  };

  const fetchSeasons = async () => {
    if (movie.media_type !== 'tv' || loadingSeasons) return;

    setLoadingSeasons(true);
    try {
      const { data: cached } = await supabase
        .from('movie_cache')
        .select('seasons_data, number_of_seasons')
        .eq('tmdb_id', movie.id)
        .eq('media_type', 'tv')
        .maybeSingle();

      const cachedHasEpisodes =
        cached?.seasons_data?.length > 0 &&
        cached.seasons_data[0]?.episodes?.length > 0;

      if (cachedHasEpisodes) {
        setSeasons(cached.seasons_data);
        movie.seasons = cached.seasons_data;
        return;
      }

      const numberOfSeasons = cached?.number_of_seasons || movie.number_of_seasons || 0;
      if (numberOfSeasons <= 0) return;

      const { fetchTVSeasonsData } = await import('../lib/tmdb');
      const freshSeasons = await fetchTVSeasonsData(movie.id, numberOfSeasons);

      if (freshSeasons.length > 0) {
        setSeasons(freshSeasons);
        movie.seasons = freshSeasons;

        supabase
          .from('movie_cache')
          .update({ seasons_data: freshSeasons, updated_at: new Date().toISOString() })
          .eq('tmdb_id', movie.id)
          .eq('media_type', 'tv')
          .then(() => {});
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
    } finally {
      setLoadingSeasons(false);
    }
  };

  const handleOpenSeasons = async () => {
    setShowSeasonsModal(true);

    const hasDetailedSeasons = seasons.length > 0 && seasons[0]?.episodes?.length > 0;
    if (!hasDetailedSeasons) {
      await fetchSeasons();
    }
  };

  const toggleEpisode = async (seasonNumber: number, episodeNumber: number) => {
    if (!session?.user?.id || !userRating) return;

    const key = `${seasonNumber}-${episodeNumber}`;
    const newWatched = new Set(watchedEpisodes);

    try {
      if (watchedEpisodes.has(key)) {
        // Unmark episode
        const { error } = await supabase
          .from('watched_episodes')
          .delete()
          .eq('user_id', session.user.id)
          .eq('tmdb_id', movie.id)
          .eq('season_number', seasonNumber)
          .eq('episode_number', episodeNumber);

        if (error) throw error;
        newWatched.delete(key);
      } else {
        // Mark episode
        const { error } = await supabase
          .from('watched_episodes')
          .insert({
            user_id: session.user.id,
            tmdb_id: movie.id,
            season_number: seasonNumber,
            episode_number: episodeNumber
          });

        if (error) throw error;
        newWatched.add(key);
      }

      setWatchedEpisodes(newWatched);

      // Trigger parent component refresh
      if (onEpisodeToggle) {
        onEpisodeToggle();
      }

      // Dispatch custom event for profile stats refresh
      window.dispatchEvent(new CustomEvent('episodeToggled'));
    } catch (error) {
      console.error('Error toggling episode:', error);
      toast.error('Failed to update episode status');
    }
  };

  const toggleSeason = async (season: any) => {
    if (!session?.user?.id || !userRating) return;

    const allWatched = season.episodes.every((ep: any) =>
      watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
    );

    try {
      if (allWatched) {
        // Unmark all episodes in season
        const { error } = await supabase
          .from('watched_episodes')
          .delete()
          .eq('user_id', session.user.id)
          .eq('tmdb_id', movie.id)
          .eq('season_number', season.season_number);

        if (error) throw error;

        const newWatched = new Set(watchedEpisodes);
        season.episodes.forEach((ep: any) => {
          newWatched.delete(`${season.season_number}-${ep.episode_number}`);
        });
        setWatchedEpisodes(newWatched);
      } else {
        // Mark all episodes in season
        const episodesToInsert = season.episodes.map((ep: any) => ({
          user_id: session.user.id,
          tmdb_id: movie.id,
          season_number: season.season_number,
          episode_number: ep.episode_number
        }));

        const { error } = await supabase
          .from('watched_episodes')
          .upsert(episodesToInsert, {
            onConflict: 'user_id,tmdb_id,season_number,episode_number'
          });

        if (error) throw error;

        const newWatched = new Set(watchedEpisodes);
        season.episodes.forEach((ep: any) => {
          newWatched.add(`${season.season_number}-${ep.episode_number}`);
        });
        setWatchedEpisodes(newWatched);
      }

      // Trigger parent component refresh
      if (onEpisodeToggle) {
        onEpisodeToggle();
      }

      // Dispatch custom event for profile stats refresh
      window.dispatchEvent(new CustomEvent('episodeToggled'));
    } catch (error) {
      console.error('Error toggling season:', error);
      toast.error('Failed to update season status');
    }
  };

  const handleShareToInstagram = async () => {
    if (!session?.user?.id || isSharing) return;

    setIsSharing(true);

    try {
      // Obter a nota do usuário
      const { data: userMovie, error: ratingError } = await supabase
        .from('user_movies')
        .select('rating')
        .eq('user_id', session.user.id)
        .eq('movie_id', movie.id)
        .maybeSingle();

      if (ratingError) throw ratingError;

      const userRating = userMovie?.rating !== undefined ? userMovie.rating : null;

      // Criar canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = 1080;
      canvas.height = 1920;

      // Carregar fundo baseado na nota
      let backgroundPath = '/assets/cinequero.webp';
      if (userRating !== null) {
        backgroundPath = `/assets/cine${Math.round(userRating)}.webp`;
      }

      const background = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = backgroundPath;
      });

      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);

      // Carregar e desenhar poster do filme (CENTRALIZADO)
      if (movie.poster_path) {
        try {
          const posterUrl = `https://image.tmdb.org/t/p/w500${movie.poster_path}`;
          const response = await fetch(posterUrl, { cache: 'no-store' });
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          const posterImg = await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = blobUrl;
          });

          // Poster CENTRALIZADO e maior
          const posterWidth = 450;
          const posterHeight = 675;
          const posterX = (canvas.width - posterWidth) / 2;
          const posterY = 550;

          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(posterImg, posterX, posterY, posterWidth, posterHeight);

          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;

          URL.revokeObjectURL(blobUrl);
        } catch (error) {
          console.error('Erro ao carregar poster:', error);
        }
      }

      // Desenhar título do filme (ABAIXO DO POSTER, centralizado)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 52px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const titleY = 1280;
      const maxWidth = 900;

      // Quebrar título em linhas
      const words = movie.title.split(' ');
      let line = '';
      let currentY = titleY;

      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && i > 0) {
          ctx.fillText(line.trim(), canvas.width / 2, currentY);
          line = words[i] + ' ';
          currentY += 65;
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line.trim(), canvas.width / 2, currentY);

      // Converter canvas para blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Erro ao gerar imagem');
          setIsSharing(false);
          return;
        }

        // Criar arquivo
        const file = new File([blob], 'cine-oracle-story.png', { type: 'image/png' });

        // Verificar se pode compartilhar
        if (navigator.share && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: `${movie.title} - Cine Oracle`,
              text: `Assisti ${movie.title} e dei nota ${userRating}/10! 🎬`
            });
            toast.success('Compartilhado com sucesso!');
          } catch (error) {
            if ((error as Error).name !== 'AbortError') {
              console.error('Erro ao compartilhar:', error);
              // Fallback: baixar imagem
              downloadImage(canvas);
            }
          } finally {
            setIsSharing(false);
          }
        } else {
          // Fallback: baixar imagem
          downloadImage(canvas);
          setIsSharing(false);
        }
      }, 'image/png');

    } catch (error) {
      console.error('Error sharing to Instagram:', error);
      toast.error('Erro ao compartilhar. Tente novamente.');
      setIsSharing(false);
    }
  };

  const downloadImage = (canvas: HTMLCanvasElement) => {
    const link = document.createElement('a');
    link.download = 'cine-oracle-story.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success('Imagem baixada! Compartilhe no Instagram Stories.');
  };

  const handleOpenTrailer = async () => {
    setShowTrailerModal(true);
    setLoadingTrailer(true);
    setTrailerKey(undefined);
    try {
      const trailer = await getMovieTrailer(movie.id, movie.media_type || 'movie');
      setTrailerKey(trailer?.key || null);
    } catch (error) {
      console.error('Error fetching trailer:', error);
      setTrailerKey(null);
    } finally {
      setLoadingTrailer(false);
    }
  };

  const handleAddToLibrary = async (rating?: number) => {
    if (!session?.user?.id) return;

    const mediaType = movie.media_type || 'movie';
    const isTv = mediaType === 'tv';
    const director = movie.credits?.crew?.find(
      p => p.job === 'Director' || (isTv && p.job === 'Creator')
    )?.name;

    const { error: movieError } = await supabase
      .from('movies')
      .upsert({
        id: movie.id,
        title: movie.title,
        release_date: movie.release_date,
        genres: movie.genres?.map(g => g.name),
        director: director || null,
        media_type: mediaType,
        number_of_seasons: isTv ? (movie.number_of_seasons || null) : null
      }, { onConflict: 'id,media_type' });

    if (movieError) throw movieError;

    const insertData: Record<string, unknown> = {
      movie_id: movie.id,
      media_type: mediaType,
      user_id: session.user.id,
    };
    if (rating !== undefined) insertData.rating = rating;

    const { error: libraryError } = await supabase
      .from('user_movies')
      .insert(insertData);

    if (libraryError) throw libraryError;

    setIsInLibrary(true);
    cache.invalidate(CACHE_KEYS.USER_LIBRARY(session.user.id));
    cache.invalidatePattern('stats:');
    toast.success(t('library.inLibrary'));
    if (onAddToLibrary) {
      onAddToLibrary();
    }
  };

  if (!isOpen) return null;

  const hasStreamingProviders = movie.watchProviders?.flatrate && movie.watchProviders.flatrate.length > 0;

  // For TV shows, look for Creator or Director; for movies, look for Director
  let director = t('movies.unknown');
  if (movie.credits?.crew) {
    const directorPerson = movie.credits.crew.find(person =>
      person.job === 'Director' || person.job === 'Creator' || person.job === 'Executive Producer'
    );
    if (directorPerson) {
      director = directorPerson.name;
    }
  }

  const cast = movie.credits?.cast?.slice(0, 5) || [];
  const year = new Date(movie.release_date).getFullYear();

  // Top 10 do diretor — busca sob demanda, só quando o usuário clica.
  //
  // BUG ENCONTRADO na versão anterior: quando o filme vinha do cache do
  // banco (getCachedMovie em lib/tmdb.ts), o crew do diretor era
  // reconstruído com um ID FALSO fixo (id: 0), só pra preencher o formato
  // esperado — nunca foi o ID real da pessoa no TMDB. A busca por
  // "/person/0/movie_credits" retornava lixo ou vazio dependendo de qual
  // filme aleatório tem ID 0 no TMDB, explicando todos os sintomas
  // relatados: lista vazia mesmo pra diretores com filmes no banco,
  // comportamento diferente dependendo de onde o filme foi aberto (cache
  // do banco vs busca ao vivo do TMDB, que tem ID real), e a impressão de
  // só "puxar o filme atual" quando a resposta vinha inesperada.
  //
  // Correção: NUNCA confiar em um director id vindo do objeto `movie` já
  // carregado sem validar — só usa o id embutido se for maior que 0
  // (sinal de que veio de busca ao vivo real, não do placeholder do
  // cache), senão resolve por nome via /search/person, confiável
  // independente de como o filme chegou até aqui.
  const handleOpenDirectorTopTen = async () => {
    // Retrátil: se já está aberto, o clique fecha, sem mexer nos dados já
    // carregados (reabrir depois mostra a lista de novo sem nova busca).
    if (showDirectorTopTen) {
      setShowDirectorTopTen(false);
      return;
    }

    setShowDirectorTopTen(true);

    // Já tem resultado de uma busca anterior nesse mesmo filme aberto —
    // não busca de novo à toa.
    if (directorTopTenMovies.length > 0 || directorTopTenError) return;

    setDirectorTopTenError(null);

    if (!director || director === t('movies.unknown')) {
      setDirectorTopTenError(t('movies.noDirectorMoviesFound'));
      return;
    }

    setDirectorTopTenLoading(true);
    const tmdbLang = i18n.language.startsWith('pt') ? 'pt-BR' : 'en-US';
    const authHeader = { Authorization: `Bearer ${session?.access_token || ''}` };

    try {
      const embeddedDirector = movie.credits?.crew?.find(
        (person) => person.job === 'Director' && person.id > 0
      );

      let directorPersonId: number | null = embeddedDirector?.id ?? null;

      if (!directorPersonId) {
        const searchUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=${encodeURIComponent(`/search/person?query=${encodeURIComponent(director)}&language=${tmdbLang}`)}`;
        const searchResponse = await fetch(searchUrl, { headers: authHeader });
        if (!searchResponse.ok) throw new Error('search failed');
        const searchJson = await searchResponse.json();
        const bestMatch = searchJson.results?.[0];
        if (!bestMatch?.id) {
          setDirectorTopTenError(t('movies.noDirectorMoviesFound'));
          setDirectorTopTenLoading(false);
          return;
        }
        directorPersonId = bestMatch.id;
      }

      const creditsUrl = `${supabaseUrl}/functions/v1/tmdb-proxy?endpoint=${encodeURIComponent(`/person/${directorPersonId}/movie_credits?language=${tmdbLang}`)}`;
      const creditsResponse = await fetch(creditsUrl, { headers: authHeader });
      if (!creditsResponse.ok) throw new Error('credits fetch failed');
      const creditsJson = await creditsResponse.json();

      const directedCredits = (creditsJson.crew || []).filter((c: any) => c.job === 'Director');

      const seen = new Set<number>();
      const deduped = directedCredits.filter((m: any) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });

      const filtered = deduped
        .filter((m: any) => (m.vote_count || 0) >= 50 && m.id !== movie.id)
        .sort((a: any, b: any) => (b.vote_average || 0) - (a.vote_average || 0))
        .slice(0, 10);

      if (filtered.length === 0) {
        setDirectorTopTenError(t('movies.noDirectorMoviesFound'));
      }
      setDirectorTopTenMovies(filtered);
    } catch (err) {
      console.error('Error fetching director top ten:', err);
      setDirectorTopTenError(t('common.error'));
    } finally {
      setDirectorTopTenLoading(false);
    }
  };

  const handleOpenDirectorMovie = async (movieId: number) => {
    setLoadingNestedMovieId(movieId);
    try {
      const details = await getMovieDetailsFromDB(movieId);
      setDirectorNestedMovie(details);
    } catch (err) {
      console.error('Error loading director movie:', err);
      toast.error(t('common.error'));
    } finally {
      setLoadingNestedMovieId(null);
    }
  };

  const isTvShow = movie.media_type === 'tv';
  const runtime = movie.runtime
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
    : t('movies.unknown');
  const seasonsText = movie.number_of_seasons
    ? `${movie.number_of_seasons} ${movie.number_of_seasons === 1 ? 'Season' : 'Seasons'}`
    : t('movies.unknown');

  // Padroniza QUALQUER classificação de origem (americana, britânica, etc.)
  // pra escala brasileira única (L, +10, +12, +14, +16, +18) — antes,
  // "PG-13" aparecia igual do TMDB, mas um filme "18" não virava "PG-18"
  // nem nada parecido, porque são sistemas de países diferentes, não uma
  // mesma escala com números diferentes. Agora tudo sai no mesmo padrão,
  // não importa de qual país o dado original veio. Não existe "+13" oficial
  // no ClassInd brasileiro — "PG-13" arredonda pra +14, o balde real mais
  // próximo, em vez de inventar uma faixa que não existe de verdade.
  const standardizeCertification = (raw: string): string | null => {
    const upper = raw.trim().toUpperCase();

    // Já no padrão brasileiro
    if (upper === 'L') return 'L';
    if (['10', '12', '14', '16', '18'].includes(upper)) return `+${upper}`;

    // Padrão americano (MPAA)
    const usMap: Record<string, string> = {
      'G': 'L',
      'PG': '+10',
      'PG-13': '+14',
      'R': '+16',
      'NC-17': '+18',
    };
    if (usMap[upper]) return usMap[upper];

    // Padrão britânico (BBFC) — pode aparecer se nem BR nem US tiverem dado
    const ukMap: Record<string, string> = {
      'U': 'L',
      '12A': '+12',
      '15': '+16',
    };
    if (ukMap[upper]) return ukMap[upper];

    // Qualquer coisa não reconhecida (incluindo "NR"/"Not Rated") — melhor
    // não mostrar nada do que mostrar um símbolo enganoso.
    return null;
  };

  // Cores oficiais do selo ClassInd brasileiro: Livre=verde, 10=azul,
  // 12=amarelo, 14=laranja, 16=vermelho, 18=preto.
  const getCertificationColor = (standardized: string): string => {
    if (standardized === '+18') return 'bg-black text-white';
    if (standardized === '+16') return 'bg-red-600 text-white';
    if (standardized === '+14') return 'bg-orange-500 text-white';
    if (standardized === '+12') return 'bg-yellow-500 text-gray-900';
    if (standardized === '+10') return 'bg-blue-500 text-white';
    return 'bg-green-600 text-white';
  };

  // Get origin country - support both API format (production_countries) and cache format (origin_country)
  const getOriginCountry = () => {
    // Try cache format first (origin_country: ["US"])
    if (movie.origin_country && movie.origin_country.length > 0) {
      return {
        iso_3166_1: movie.origin_country[0],
        name: '' // Name will be displayed as flag emoji
      };
    }
    // Fallback to API format (production_countries: [{iso_3166_1: "US", name: "United States"}])
    if (movie.production_countries && movie.production_countries.length > 0) {
      return movie.production_countries[0];
    }
    return null;
  };

  const originCountry = getOriginCountry();

  // Function to get flag emoji from country code
  const getCountryFlag = (countryCode: string) => {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  // Função para obter cor da bolha baseada na nota
  const getBubbleColor = (rating: number) => {
    if (rating === 10) return 'from-purple-400 via-pink-400 to-blue-400'; // Holográfico
    if (rating >= 7) return 'from-green-400 to-emerald-500'; // Verde
    if (rating >= 4) return 'from-orange-400 to-amber-500'; // Laranja
    return 'from-red-400 to-rose-500'; // Vermelho
  };

    // Função para verificar se a nota é 10
  const isPerfectScore = (rating: number) => rating === 10;

  // Mesmas cores usadas no Duelo e na Recomendação do Dia — identidade
  // visual consistente de cada oráculo em todo o site.
    const ORACLE_SEAL: Record<string, { emoji: string; bg: string }> = {
    bogart: { emoji: '🐸', bg: 'bg-emerald-500' },
    fincher: { emoji: '🦊', bg: 'bg-red-500' },
    cypher: { emoji: '🐍', bg: 'bg-yellow-500' }
  };

  // Cor do balão de fala combinando com o selo — amarelo puro fica ilegível
  // com texto branco, por isso a Cobra usa texto escuro em vez de branco.
  const ORACLE_BUBBLE: Record<string, { bg: string; text: string; arrow: string }> = {
    bogart: { bg: 'bg-emerald-600/95', text: 'text-white', arrow: 'border-t-emerald-600' },
    fincher: { bg: 'bg-red-600/95', text: 'text-white', arrow: 'border-t-red-600' },
    cypher: { bg: 'bg-yellow-400/95', text: 'text-gray-900', arrow: 'border-t-yellow-400' }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-xl transform transition-all overflow-y-auto max-h-[calc(100vh-5rem)]" style={{ zIndex: 10 }}>
          <div className="sticky top-0 z-20 flex justify-end p-3">
            <button
              onClick={onClose}
              className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
            </button>
          </div>

          <div className="px-6 pt-2 pb-6">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
                {movie.title}
                <span className="text-sm font-normal text-gray-600 dark:text-gray-400">
                  ({year})
                </span>
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div
                className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg cursor-pointer group/poster"
                onClick={handleOpenTrailer}
              >
                <img
                  src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                  alt={movie.title}
                  className="w-full h-auto aspect-[2/3] object-cover"
                  onError={(e) => {
                    e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image';
                  }}
                />
                                                {/* Selo(s) de oráculo — canto inferior esquerdo, pequeno, discreto.
                    Cada selo tem sua própria frase característica, revelada num
                    balão ao passar o mouse/tocar (evita poluir o pôster, que já
                    tem bolhas de amigos e a indicação de trailer). */}
                {oracleSources.length > 0 && (
                  <div className="absolute bottom-2 left-2 flex items-end gap-1 z-10 pointer-events-auto">
                    {oracleSources.map((source) => {
                      const bubbleStyle = ORACLE_BUBBLE[source] || { bg: 'bg-gray-900/95', text: 'text-white', arrow: 'border-t-gray-900' };
                      const showBubble = !!oracleFlavorPhrases[source] && visibleOracleBubbles.has(source);
                      return (
                        <div key={source} className="relative">
                          <div
                            onClick={(e) => toggleOracleBubble(source, e)}
                            className={`w-6 h-6 rounded-full ${ORACLE_SEAL[source]?.bg || 'bg-gray-500'} ring-2 ring-white/70 dark:ring-gray-800/70 shadow-md flex items-center justify-center text-[11px] cursor-pointer`}
                          >
                            {ORACLE_SEAL[source]?.emoji || '🎬'}
                          </div>
                          {showBubble && (
                            <div
                              className="absolute bottom-full left-0 mb-2 w-48 z-20 cursor-pointer"
                              onClick={(e) => toggleOracleBubble(source, e)}
                            >
                              <div className={`relative ${bubbleStyle.bg} backdrop-blur-sm rounded-xl px-3 py-2 shadow-2xl`}>
                                <p className={`${bubbleStyle.text} text-[10px] italic leading-snug`}>
                                  "{oracleFlavorPhrases[source]}"
                                </p>
                                <div className={`absolute top-full left-3 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent ${bubbleStyle.arrow}`} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Indicação sutil de trailer — canto superior direito, com frase que
                    aparece ao passar o mouse/tocar */}
                <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
                  <span className="text-[10px] font-medium text-white bg-black/50 backdrop-blur-sm px-2 py-1 rounded-full opacity-0 group-hover/poster:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                    {t('movies.clickForTrailer')}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center opacity-60 group-hover/poster:opacity-100 group-hover/poster:bg-black/60 group-hover/poster:scale-110 transition-all duration-200 flex-shrink-0">
                    <Play className="w-4 h-4 text-white fill-white ml-0.5" />
                  </div>
                </div>

                  {/* Bolhas de amigos que avaliaram - limitadas ao poster */}
                  {!loadingFriends && friendRatings.length > 0 && (
                    <div className="absolute inset-0 pointer-events-none">
                      {friendRatings.map((friend, index) => {
                        const positions = [
                          { top: '15%', left: '10%' },
                          { top: '25%', right: '15%' },
                          { top: '50%', left: '8%' },
                          { top: '65%', right: '12%' },
                          { top: '80%', left: '50%', transform: 'translateX(-50%)' }
                        ];
                        const position = positions[index] || positions[0];

                        return (
                          <div
                            key={friend.user_id}
                            className="absolute animate-float-slow pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              ...position,
                              animationDelay: `${index * 0.3}s`,
                              zIndex: 10
                            }}
                          >
                            <div className="relative group">
                              {/* Container principal da bolha */}
                              <div className="relative w-16 h-16">
                                {/* Avatar */}
                                <div className={`absolute inset-0 rounded-full border-3 border-white dark:border-gray-700 shadow-2xl overflow-hidden bg-gradient-to-br ${getBubbleColor(friend.rating)} p-0.5`}>
                                  <div className="w-full h-full rounded-full overflow-hidden bg-gray-800">
                                    {friend.avatar_url ? (
                                      <img
                                        src={friend.avatar_url}
                                        alt={friend.username}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 text-white font-bold text-xl">
                                        {friend.username.charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Badge de nota - Posicionado FORA do avatar */}
                                <div className="absolute -bottom-2 -right-2" style={{ zIndex: 20 }}>
                                  {/* Efeito ping para nota 10 */}
                                  {isPerfectScore(friend.rating) && (
                                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 animate-ping opacity-75"></div>
                                  )}
                                  {/* Badge */}
                                  <div className={`relative w-8 h-8 rounded-full bg-gradient-to-br ${getBubbleColor(friend.rating)} border-3 border-white dark:border-gray-800 shadow-2xl flex items-center justify-center ${isPerfectScore(friend.rating) ? 'shadow-[0_0_20px_rgba(168,85,247,0.8)] ring-2 ring-purple-400/50' : ''}`}>
                                    <span className="text-xs font-extrabold text-white drop-shadow-lg">
                                      {friend.rating}
                                    </span>
                                  </div>
                                </div>
                              </div>

                                                            {friend.review_title ? (
                                /* Tem review — balão sempre visível, igual ao Friends Activity, sem precisar de hover */
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none" style={{ zIndex: 50 }}>
                                  <div className="relative bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl px-2.5 py-1.5 shadow-2xl w-[110px]">
                                    <p className="text-white text-[9px] font-semibold text-center truncate">
                                      {friend.username}
                                    </p>
                                                                        <p className="text-gray-300 text-[9px] italic text-center leading-tight line-clamp-2 whitespace-normal mt-0.5">
                                      "{friend.review_title}"
                                    </p>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-gray-900/95" />
                                  </div>
                                </div>
                              ) : (
                                /* Sem review — mantém o tooltip só no hover, como era antes */
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-2 bg-gray-900/95 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none shadow-2xl" style={{ zIndex: 50 }}>
                                  <div className="font-semibold">{friend.username}</div>
                                  <div className="text-yellow-400 flex items-center gap-1">
                                    <span>★</span>
                                    <span>{friend.rating}/10</span>
                                  </div>
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                                    <div className="border-4 border-transparent border-t-gray-900/95"></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Assistir em - desktop only (mobile shows after cast) */}
                <div className="hidden md:block bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    {t('movies.watchOn')}
                  </h3>
                  {/* Altura máxima + rolagem, mesmo tratamento da sinopse —
                      antes o bloco crescia junto com a quantidade de
                      serviços de streaming. E agora aparece sempre, com
                      mensagem de "não disponível" em vez de sumir — sumir
                      completamente fazia a tela parecer estruturada
                      diferente de filme pra filme. */}
                  <div className="max-h-20 overflow-y-auto">
                    {hasStreamingProviders ? (
                      <div className="flex flex-wrap gap-3">
                        {movie.watchProviders.flatrate.map((provider) => (
                          <div
                            key={provider.provider_id}
                            className="relative group"
                          >
                            <img
                              src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                              alt={provider.provider_name}
                              className="h-10 w-10 rounded-lg object-contain"
                            />
                            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              {provider.provider_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('movies.noStreamingAvailable')}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center">
                    <Star className="w-5 h-5 text-yellow-500 fill-current mr-1" />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {movie.vote_average.toFixed(1)}
                    </span>
                  </div>
                  
                  {movie.userRating !== undefined && (
                    <div className="flex items-center px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded-md">
                      <span className="font-medium text-yellow-700 dark:text-yellow-400">
                        {isOtherUserProfile ? t('movies.friendRating') : t('movies.yourRating')} {movie.userRating}/10
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {movie.genres?.map(genre => (
                    <span key={genre.id} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300">
                      {genre.name}
                    </span>
                  ))}

                  {session?.user && (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setShowRecommendModal(true)}
                        className="p-1 text-orange-500 hover:text-orange-600 transition-colors"
                        title={t('indications.indicateToFriend')}
                      >
                        <Users className="w-6 h-6" />
                      </button>
                      <button
                        onClick={handleShareToInstagram}
                        disabled={isSharing}
                        className="p-1 text-purple-500 hover:text-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Compartilhar no Instagram"
                      >
                        {isSharing ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : (
                          <Instagram className="w-6 h-6" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    {t('movies.synopsis')}
                  </h3>
                  {/* Altura máxima + rolagem interna — antes, sinopses muito
                      longas esticavam o card e desalinhavam o resto do
                      layout com a coluna do pôster ao lado. */}
                  <p className="text-gray-600 dark:text-gray-300 text-sm max-h-32 overflow-y-auto pr-1">
                    {movie.overview || t('movies.noSynopsis')}
                  </p>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-center mb-2">
                      <Calendar className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('movies.year')}</div>
                      <div className="font-medium text-gray-900 dark:text-white text-sm">{year}</div>
                    </div>
                  </div>

                  <div
                    className={`bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 ${isTvShow ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors' : ''}`}
                    onClick={() => isTvShow && handleOpenSeasons()}
                  >
                    <div className="flex items-center justify-center mb-2">
                      {isTvShow ? (
                        <Tv className="w-5 h-5 text-green-500" />
                      ) : (
                        <Clock className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {isTvShow ? 'Seasons' : t('movies.runtime')}
                      </div>
                      <div className="font-medium text-gray-900 dark:text-white text-sm">
                        {isTvShow ? seasonsText : runtime}
                      </div>
                    </div>
                  </div>

                  {/* Classificação — antes tentava mostrar o "motivo" (campo
                      note/meaning do TMDB), mas esse campo é uma anotação
                      livre por TIPO de lançamento (relançamento IMAX,
                      première, digital, etc.), não uma justificativa de
                      censura de verdade — por isso às vezes vinha coisa tipo
                      "Hollywood, California" no lugar. Mostra só o selo,
                      já padronizado (ver standardizeCertification acima).
                      Ícone trocado de AlertCircle (parecia erro) pra Shield,
                      e rótulo encurtado — "Classificação Indicativa" estava
                      esticando o quadrado pro lado, puxando os vizinhos
                      junto (linha inteira do grid cresce igual).

                      IMPORTANTE: esse quadrado agora SEMPRE mostra
                      Classificação (com "—" se o filme não tiver esse dado)
                      — antes, filmes sem classificação mostravam o Diretor
                      aqui no lugar, fazendo a tela parecer "num modelo
                      diferente" dependendo do filme. Agora a estrutura é
                      idêntica pra qualquer filme. */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-center mb-2">
                      <Shield className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('movies.ageLabel')}</div>
                      <div className="flex justify-center mt-0.5">
                        {certification ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded ${getCertificationColor(certification)}`}>
                            {certification}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {originCountry && (
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-center mb-2">
                        <Globe className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-gray-500 dark:text-gray-400">{t('movies.origin')}</div>
                        <div className="font-medium text-gray-900 dark:text-white text-xl" title={originCountry.name}>
                          {getCountryFlag(originCountry.iso_3166_1)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Diretor — sempre em linha própria agora, pra manter a
                    mesma estrutura em qualquer filme (com ou sem
                    classificação disponível). */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-3 justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <User className="w-5 h-5 text-purple-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">{t('movies.director')}:</span>
                        <span className="font-medium text-gray-900 dark:text-white text-sm">{director}</span>
                      </div>
                    </div>
                    {director !== t('movies.unknown') && (
                      <button
                        onClick={handleOpenDirectorTopTen}
                        className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 dark:bg-purple-500/15 dark:hover:bg-purple-500/25 text-purple-600 dark:text-purple-400 text-xs font-semibold rounded-lg transition-colors"
                      >
                        {t('movies.viewTopTen')}
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {showDirectorTopTen && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">
                        {t('movies.directorTopTen', { director })}
                      </p>

                      {directorTopTenLoading && (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                        </div>
                      )}

                      {!directorTopTenLoading && directorTopTenError && (
                        <div className="flex items-center gap-2 py-2 text-sm text-gray-500 dark:text-gray-400">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          {directorTopTenError}
                        </div>
                      )}

                      {!directorTopTenLoading && !directorTopTenError && directorTopTenMovies.length > 0 && (
                        <div className="grid grid-cols-5 gap-2">
                          {directorTopTenMovies.map((m: any) => (
                            <button
                              key={m.id}
                              onClick={() => handleOpenDirectorMovie(m.id)}
                              className="w-full group"
                            >
                              {/* Só o pôster, proporção 2:3 fixa — nenhum
                                  texto embaixo. O título variando de 1 pra
                                  2 linhas entre itens era o que fazia o
                                  CSS Grid esticar cada célula da linha até
                                  a altura da mais alta, dando a impressão
                                  de pôsteres "transpassados" e de tamanhos
                                  diferentes entre si. */}
                              <div className="relative w-full aspect-[2/3] rounded-md overflow-hidden bg-gray-200 dark:bg-gray-600">
                                {m.poster_path ? (
                                  <img
                                    src={`https://image.tmdb.org/t/p/w200${m.poster_path}`}
                                    alt={m.title}
                                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Film className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                {loadingNestedMovieId === m.id && (
                                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                                  </div>
                                )}
                                <div className="absolute bottom-0.5 right-0.5 bg-black/70 rounded px-1 flex items-center gap-0.5">
                                  <Star className="w-2.5 h-2.5 text-amber-400 fill-current" />
                                  <span className="text-[10px] text-white font-semibold">{m.vote_average?.toFixed(1)}</span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    {t('movies.cast')}
                  </h3>
                  {/* Altura máxima + rolagem — elenco grande não estica mais
                      o card (nem os vizinhos), igual à sinopse. */}
                  <div className="max-h-40 overflow-y-auto pr-1">
                    {cast.length > 0 ? (
                      <div className="space-y-2">
                        {cast.map((actor) => (
                          <div key={actor.id} className="flex items-center justify-between">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{actor.character}</span>
                            <span className="text-sm text-gray-900 dark:text-white">{actor.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('movies.noCastAvailable')}</p>
                    )}
                  </div>
                </div>

                {/* Assistir em - mobile only (desktop shows in left column) */}
                <div className="md:hidden bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    {t('movies.watchOn')}
                  </h3>
                  <div className="max-h-20 overflow-y-auto">
                    {hasStreamingProviders ? (
                      <div className="flex flex-wrap gap-3">
                        {movie.watchProviders.flatrate.map((provider) => (
                          <div
                            key={provider.provider_id}
                            className="relative group"
                          >
                            <img
                              src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                              alt={provider.provider_name}
                              className="h-10 w-10 rounded-lg object-contain"
                            />
                            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                              {provider.provider_name}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('movies.noStreamingAvailable')}</p>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Action Buttons */}
            {session?.user && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 gap-3">
                  {!isInLibrary ? (
                    <button
                      onClick={() => setShowQuickAdd(true)}
                      className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-all flex items-center justify-center font-medium text-sm shadow-lg hover:shadow-xl"
                    >
                      {t('library.addToLibrary')}
                    </button>
                  ) : (
                    <div className="px-4 py-3 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-center font-medium flex items-center justify-center text-sm shadow-md">
                      <span>✓ {t('movies.inLibrary')}</span>
                    </div>
                  )}
                  <button
                    onClick={() => setShowReviewsModal(true)}
                    className="px-4 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center justify-center gap-2 font-medium text-sm shadow-md hover:shadow-lg"
                  >
                    <MessageSquare className="w-5 h-5" />
                    Reviews
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      <RecommendModal
        isOpen={showRecommendModal}
        onClose={() => setShowRecommendModal(false)}
        movieId={movie.id}
        movieTitle={movie.title}
        moviePoster={movie.poster_path}
        mediaType={movie.media_type}
      />

      <QuickAddMenu
        movieTitle={movie.title}
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        onAdd={handleAddToLibrary}
      />

      {showTrailerModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
          onClick={() => setShowTrailerModal(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-gray-950 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-white font-semibold truncate pr-4">{movie.title}</h3>
              <button onClick={() => setShowTrailerModal(false)} className="text-gray-400 hover:text-white flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="aspect-video bg-black flex items-center justify-center">
              {loadingTrailer ? (
                <Loader2 className="w-8 h-8 text-white animate-spin" />
              ) : trailerKey ? (
                <iframe
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${trailerKey}`}
                  title="Trailer"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <p className="text-gray-400 text-center px-6">
                  {t('duel.noTrailer')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seasons Modal */}
      {showSeasonsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-10">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {movie.title} - {t('movies.seasonsAndEpisodes')}
              </h3>
              <button
                onClick={() => setShowSeasonsModal(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {loadingSeasons ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
                  <p className="text-gray-500 dark:text-gray-400 mt-2">{t('movies.loadingSeasons')}</p>
                </div>
              ) : !seasons || seasons.length === 0 ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {t('movies.noSeasonsAvailable')}
                </div>
              ) : (
                <>
                  {/* Progress Bar */}
                  {userRating && (() => {
                    const totalEpisodes = seasons.reduce((sum, s) => sum + (s.episodes?.length || 0), 0);
                    const watchedCount = Array.from(watchedEpisodes).length;
                    const progress = totalEpisodes > 0 ? (watchedCount / totalEpisodes) * 100 : 0;

                    return (
                      <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {t('movies.progress')}
                          </span>
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {watchedCount} / {totalEpisodes} {t('movies.episodes').toLowerCase()}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-green-500 to-green-600 h-full rounded-full transition-all duration-500 ease-out"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                          {progress.toFixed(1)}% {t('movies.complete')}
                        </p>
                      </div>
                    );
                  })()}

                  {seasons.map((season: any) => {
                  if (!season.episodes || season.episodes.length === 0) {
                    return null;
                  }

                  const allWatched = season.episodes.every((ep: any) =>
                    watchedEpisodes.has(`${season.season_number}-${ep.episode_number}`)
                  );

                  return (
                  <div key={season.season_number} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className={`p-4 transition-colors ${allWatched && userRating ? 'bg-green-50 dark:bg-green-900/20' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                      <div className="flex items-start gap-4">
                        {season.poster_path && (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${season.poster_path}`}
                            alt={season.name}
                            className="w-16 h-24 object-cover rounded"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {season.name}
                          </h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {season.episode_count} {t('movies.episodes')}
                            {season.air_date && ` • ${new Date(season.air_date).getFullYear()}`}
                          </p>
                          {season.overview && (
                            <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 line-clamp-2">
                              {season.overview}
                            </p>
                          )}
                        </div>
                        {userRating && (
                          <button
                            onClick={() => toggleSeason(season)}
                            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              allWatched
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                            }`}
                          >
                            {allWatched ? (
                              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <div className="w-3 h-3 rounded-full bg-white dark:bg-gray-800" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {season.episodes.map((episode: any) => {
                        const isWatched = watchedEpisodes.has(`${season.season_number}-${episode.episode_number}`);

                        return (
                          <div
                            key={episode.episode_number}
                            className={`p-4 transition-colors ${
                              isWatched && userRating
                                ? 'bg-green-50/50 dark:bg-green-900/10 hover:bg-green-100/50 dark:hover:bg-green-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <h5 className="font-medium text-gray-900 dark:text-white">
                                    {episode.episode_number}. {episode.name}
                                  </h5>
                                  <div className="flex items-center gap-3 flex-shrink-0">
                                    {episode.runtime && (
                                      <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                        {episode.runtime}min
                                      </span>
                                    )}
                                    {userRating && (
                                      <button
                                        onClick={() => toggleEpisode(season.season_number, episode.episode_number)}
                                        className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                                          isWatched
                                            ? 'bg-green-500 hover:bg-green-600'
                                            : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                                        }`}
                                      >
                                        {isWatched ? (
                                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        ) : (
                                          <div className="w-2 h-2 rounded-full bg-white dark:bg-gray-800" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {episode.air_date && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {new Date(episode.air_date).toLocaleDateString()}
                                  </p>
                                )}
                                {episode.overview && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                    {episode.overview}
                                  </p>
                                )}
                                {episode.vote_average > 0 && (
                                  <div className="flex items-center gap-1 mt-2">
                                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {episode.vote_average.toFixed(1)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showReviewsModal && (
        <ReviewsModal
          movie={movie}
          onClose={() => setShowReviewsModal(false)}
          userRating={userRating}
        />
      )}

      {directorNestedMovie && (
        <MovieDetailsModal
          movie={directorNestedMovie}
          isOpen={true}
          onClose={() => setDirectorNestedMovie(null)}
        />
      )}
    </div>
  );
};

export default MovieDetailsModal;