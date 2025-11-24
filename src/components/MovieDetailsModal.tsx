import React, { useState, useEffect } from 'react';
import { X, Star, Loader2, Calendar, Clock, User, Film, AlertCircle, Shield, Globe, Share2, Instagram, Tv } from 'lucide-react';
import { Movie } from '../lib/tmdb';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import RecommendModal from './RecommendModal';
import html2canvas from 'html2canvas';

interface FriendRating {
  user_id: string;
  username: string;
  avatar_url: string | null;
  rating: number;
}

interface MovieDetailsModalProps {
  movie: Movie;
  isOpen: boolean;
  onClose: () => void;
  isOtherUserProfile?: boolean;
  onAddToLibrary?: () => void;
}

const MovieDetailsModal: React.FC<MovieDetailsModalProps> = ({ 
  movie, 
  isOpen, 
  onClose,
  isOtherUserProfile = false,
  onAddToLibrary
}) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [isInLibrary, setIsInLibrary] = useState(false);
  const [friendRatings, setFriendRatings] = useState<FriendRating[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [showRecommendModal, setShowRecommendModal] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (session?.user?.id) {
      checkIfInLibrary();
      loadFriendRatings();
    }
  }, [session?.user?.id, movie.id]);

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

      // Step 4: Combine ratings with profiles
      const formattedRatings: FriendRating[] = ratingsData
        .map((r: any) => {
          const profile = profilesData?.find(p => p.id === r.user_id);
          return {
            user_id: r.user_id,
            username: profile?.username || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            rating: r.rating
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

      const userRating = userMovie?.rating || null;

      // Criar canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');

      canvas.width = 1080;
      canvas.height = 1920;

      // Carregar fundo baseado na nota
      let backgroundPath = '/assets/cinequero.png';
      if (userRating !== null) {
        backgroundPath = `/assets/cine${Math.round(userRating)}.png`;
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

  const handleAddToLibrary = async () => {
    if (!session?.user?.id || adding) return;

    try {
      setAdding(true);

      // First, ensure movie details are stored
      const { error: movieError } = await supabase
        .from('movies')
        .upsert({
          id: movie.id,
          title: movie.title,
          release_date: movie.release_date,
          genres: movie.genres?.map(g => g.name),
          director: movie.credits?.crew?.find(person => person.job === 'Director')?.name
        });

      if (movieError) throw movieError;

      // Then add to user's library
      const { error: libraryError } = await supabase
        .from('user_movies')
        .insert({
          movie_id: movie.id,
          user_id: session.user.id,
        });

      if (libraryError) throw libraryError;

      setIsInLibrary(true);
      toast.success(t('library.inLibrary'));
      if (onAddToLibrary) {
        onAddToLibrary();
      }
    } catch (error) {
      console.error('Error adding movie:', error);
      toast.error(t('library.addToLibrary'));
    } finally {
      setAdding(false);
    }
  };

  if (!isOpen) return null;

  const hasStreamingProviders = movie.watchProviders?.flatrate && movie.watchProviders.flatrate.length > 0;
  const director = movie.credits?.crew?.find(person => person.job === 'Director')?.name || t('movies.unknown');
  const cast = movie.credits?.cast?.slice(0, 5) || [];
  const year = new Date(movie.release_date).getFullYear();
  const isTvShow = movie.media_type === 'tv';
  const runtime = movie.runtime
    ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
    : t('movies.unknown');
  const seasons = movie.number_of_seasons
    ? `${movie.number_of_seasons} ${movie.number_of_seasons === 1 ? 'Season' : 'Seasons'}`
    : t('movies.unknown');

  // Get content rating - prioritize US, then BR, then first available
  const contentRating = movie.content_ratings?.find(r => r.iso_3166_1 === 'US')
    || movie.content_ratings?.find(r => r.iso_3166_1 === 'BR')
    || (movie.content_ratings && movie.content_ratings.length > 0 ? movie.content_ratings[0] : null);

  // Get origin country
  const originCountry = movie.production_countries && movie.production_countries.length > 0
    ? movie.production_countries[0]
    : null;

  // Function to get flag emoji from country code
  const getCountryFlag = (countryCode: string) => {
    if (!countryCode || countryCode.length !== 2) return '🌍';
    const codePoints = countryCode
      .toUpperCase()
      .split('')
      .map(char => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  };

  // Function to get rating badge color
  const getRatingBadgeColor = (certification: string) => {
    const rating = certification.toUpperCase();
    if (rating === 'G' || rating === 'L') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    if (rating === 'PG' || rating === '10') return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    if (rating === 'PG-13' || rating === '12' || rating === '14') return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    if (rating === 'R' || rating === '16') return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400';
    if (rating === 'NC-17' || rating === '18') return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
    return 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300';
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl rounded-xl shadow-xl transform transition-all overflow-y-auto max-h-[calc(100vh-7rem)]" style={{ zIndex: 10 }}>
          <button
            onClick={onClose}
            className="sticky top-4 left-[calc(100%-3.5rem)] z-20 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-full p-2 shadow-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
          >
            <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
          </button>

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
                <div className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                  <img
                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                    alt={movie.title}
                    className="w-full h-auto aspect-[2/3] object-cover"
                    onError={(e) => {
                      e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Image';
                    }}
                  />

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

                              {/* Tooltip no hover */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-3 py-2 bg-gray-900/95 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none shadow-2xl" style={{ zIndex: 50 }}>
                                <div className="font-semibold">{friend.username}</div>
                                <div className="text-yellow-400 flex items-center gap-1">
                                  <span>★</span>
                                  <span>{friend.rating}/10</span>
                                </div>
                                {/* Seta do tooltip */}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                                  <div className="border-4 border-transparent border-t-gray-900/95"></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Desktop: Assistir em */}
                {hasStreamingProviders && (
                  <div className="hidden md:block bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      {t('movies.watchOn')}
                    </h3>
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
                  </div>
                )}
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
                    <button
                      onClick={handleShareToInstagram}
                      disabled={isSharing}
                      className="ml-auto p-1 text-purple-500 hover:text-pink-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Compartilhar no Instagram"
                    >
                      {isSharing ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Instagram className="w-6 h-6" />
                      )}
                    </button>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    {t('movies.synopsis')}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">
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

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
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
                        {isTvShow ? seasons : runtime}
                      </div>
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-center mb-2">
                      <User className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400">{t('movies.director')}</div>
                      <div className="font-medium text-gray-900 dark:text-white text-xs px-1 line-clamp-2 leading-tight" title={director}>{director}</div>
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
                
                {cast.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                      {t('movies.cast')}
                    </h3>
                    <div className="space-y-2">
                      {cast.map((actor) => (
                        <div key={actor.id} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{actor.character}</span>
                          <span className="text-sm text-gray-900 dark:text-white">{actor.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Classificação indicativa - com altura fixa */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 min-h-[120px] flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Shield className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('movies.contentRating')}
                    </h3>
                  </div>
                  <div className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed flex-1">
                    {contentRating?.meaning || t('movies.noContentRating')}
                  </div>
                </div>

              </div>
            </div>

            {/* Action Buttons */}
            {session?.user && (
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowRecommendModal(true)}
                    className="px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 active:bg-orange-700 transition-all flex items-center justify-center font-medium text-sm shadow-lg hover:shadow-xl"
                  >
                    📤 Recomendar
                  </button>

                  {!isInLibrary ? (
                    <button
                      onClick={handleAddToLibrary}
                      disabled={adding}
                      className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-medium text-sm shadow-lg hover:shadow-xl"
                    >
                      {adding ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>{t('library.addToLibrary')}</>
                      )}
                    </button>
                  ) : (
                    <div className="px-4 py-3 bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-center font-medium flex items-center justify-center text-sm shadow-md">
                      <span>✓ {t('movies.inLibrary')}</span>
                    </div>
                  )}
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
    </div>
  );
};

export default MovieDetailsModal;