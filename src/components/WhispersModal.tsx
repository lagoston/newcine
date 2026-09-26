import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Loader2, Trash2, Tv, Trophy, MessageCircle, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useWhispers } from '../contexts/WhispersContext';
import { Movie, getMovieDetails, getMovieDetailsFromDB } from '../lib/tmdb';
import MovieDetailsModal from './MovieDetailsModal';
import OptimizedPoster from './OptimizedPoster';
import OracleSheet from './OracleSheet';
import { VELVET, PAPER, MIST, PIXEL } from '../lib/oracleTheme';

interface WhispersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  // Chamado quando um pedido de amizade é aceito daqui — a página que abriu
  // o modal (Profile.tsx) recarrega a contagem de amigos sem reload.
  onFriendAccepted?: () => void;
}

// Cada tipo novo de notificação entra neste union e ganha um bloco no
// render — o resto (filtros, seções, apagar) já funciona para ele.
interface Whisper {
  id: string;
  from_user_id: string | null;
  type: 'movie' | 'friend_request' | 'new_episode' | 'tag_unlocked';
  movie_id?: number;
  movie_title?: string;
  movie_poster?: string;
  message?: string;
  read: boolean;
  created_at: string;
  media_type?: 'movie' | 'tv';
  season_number?: number;
  episode_number?: number;
  episode_name?: string;
  tag_name?: string;
  tag_emoji?: string;
  tag_category?: string;
  from_user: { username: string; avatar_url: string | null } | null;
}

type Filter = 'all' | 'friend_request' | 'movie' | 'new_episode' | 'tag_unlocked';

const FILTER_LABEL: Record<Filter, string> = {
  all: 'indications.filterAll',
  friend_request: 'indications.filterFriends',
  movie: 'indications.filterRecs',
  new_episode: 'indications.filterEpisodes',
  tag_unlocked: 'indications.filterTags',
};

function relativeTime(iso: string, lang: string): string {
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 30 * 86400) return rtf.format(Math.round(diffSec / (7 * 86400)), 'week');
  if (abs < 365 * 86400) return rtf.format(Math.round(diffSec / (30 * 86400)), 'month');
  return rtf.format(Math.round(diffSec / (365 * 86400)), 'year');
}

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';
const ghostButton = `inline-flex items-center gap-1.5 px-3.5 rounded-lg text-sm font-medium border border-white/15 hover:border-white/35 hover:bg-white/5 transition disabled:opacity-50 ${focusRing}`;
const primaryButton = `inline-flex items-center gap-1.5 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110 transition disabled:opacity-50 ${focusRing}`;

export default function WhispersModal({ isOpen, onClose, onFriendAccepted }: WhispersModalProps) {
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { refetchUnreadCount } = useWhispers();

  const [whispers, setWhispers] = useState<Whisper[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);

  // Guardados em ref: as funções do contexto/i18n podem mudar de identidade
  // a cada render e não devem disparar uma nova busca.
  const refetchRef = useRef(refetchUnreadCount);
  refetchRef.current = refetchUnreadCount;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (!isOpen || !session?.user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setFilter('all');
        setConfirmDeleteId(null);
        const { data, error } = await supabase
          .from('friend_indications')
          .select(`
            *,
            from_user:profiles!from_user_id (
              username,
              avatar_url
            )
          `)
          .eq('to_user_id', session.user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (cancelled) return;

        const list: Whisper[] = (data || []).map((row: Whisper) => ({ ...row, from_user: row.from_user || null }));
        const unread = list.filter((w) => !w.read).map((w) => w.id);
        setWhispers(list);
        // "Novos" = o que estava sem ler quando o modal abriu; continua
        // destacado durante esta visita mesmo depois de marcado como lido.
        setFreshIds(new Set(unread));

        if (unread.length > 0) {
          await supabase.from('friend_indications').update({ read: true }).in('id', unread);
          refetchRef.current();
        }
      } catch (error) {
        console.error('Error fetching whispers:', error);
        toast.error(tRef.current('indications.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isOpen, session?.user?.id]);

  const presentTypes = useMemo(() => Array.from(new Set(whispers.map((w) => w.type))), [whispers]);
  const filters: Filter[] = presentTypes.length > 1 ? ['all', ...presentTypes] : [];
  const visible = filter === 'all' ? whispers : whispers.filter((w) => w.type === filter);
  const fresh = visible.filter((w) => freshIds.has(w.id));
  const earlier = visible.filter((w) => !freshIds.has(w.id));

  const handleDelete = async (whisper: Whisper) => {
    if (!session?.user?.id) return;
    setBusyId(whisper.id);
    try {
      const { error } = await supabase
        .from('friend_indications')
        .delete()
        .match({ id: whisper.id, to_user_id: session.user.id });
      if (error) throw error;
      setWhispers((prev) => prev.filter((w) => w.id !== whisper.id));
      toast.success(t('indications.deleted'));
    } catch (error) {
      console.error('Error deleting whisper:', error);
      toast.error(t('indications.deleteError'));
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  };

  // Recusar não deixa rastro (respond_to_friend_request apaga a linha de
  // friendships); em qualquer resposta o sussurro some, já que foi resolvido.
  const handleRespond = async (whisper: Whisper, accept: boolean) => {
    if (!session?.user?.id || !whisper.from_user_id) return;
    setBusyId(whisper.id);
    try {
      const { data, error } = await supabase.rpc('respond_to_friend_request', {
        p_addressee_id: session.user.id,
        p_requester_id: whisper.from_user_id,
        p_accept: accept,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'respond_failed');

      await supabase.from('friend_indications').delete().match({ id: whisper.id, to_user_id: session.user.id });
      setWhispers((prev) => prev.filter((w) => w.id !== whisper.id));
      refetchUnreadCount();
      if (accept) onFriendAccepted?.();

      toast.success(
        accept
          ? t('indications.friendRequestAccepted', { username: whisper.from_user?.username })
          : t('indications.friendRequestDeclined')
      );
    } catch (error) {
      console.error('Error responding to friend request:', error);
      toast.error(t('indications.respondError'));
    } finally {
      setBusyId(null);
    }
  };

  const openMovie = async (whisper: Whisper, mediaType?: 'movie' | 'tv') => {
    if (!whisper.movie_id) return;
    setBusyId(whisper.id);
    try {
      const movie = mediaType
        ? await getMovieDetails(whisper.movie_id, mediaType)
        : await getMovieDetailsFromDB(whisper.movie_id);
      setSelectedMovie(movie);
    } catch (error) {
      console.error('Error loading movie:', error);
      toast.error(t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  const lang = i18n.language;

  const renderAvatar = (whisper: Whisper) => {
    if (whisper.from_user) {
      return whisper.from_user.avatar_url ? (
        <img src={whisper.from_user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-1 ring-white/15" />
      ) : (
        <span className="w-10 h-10 rounded-full grid place-items-center ring-1 ring-white/15 text-lg" style={{ ...PIXEL, background: VELVET, color: PAPER }}>
          {whisper.from_user.username.charAt(0).toUpperCase()}
        </span>
      );
    }
    const Icon = whisper.type === 'tag_unlocked' ? Trophy : Tv;
    return (
      <span className="w-10 h-10 rounded-full grid place-items-center ring-1 ring-white/15 text-violet-200" style={{ background: VELVET }}>
        <Icon className="w-[18px] h-[18px]" aria-hidden />
      </span>
    );
  };

  const headline = (whisper: Whisper) => {
    if (whisper.from_user) {
      const verb = whisper.type === 'friend_request' ? t('indications.sentFriendRequest') : t('indications.recommended');
      return (
        <>
          <span className="font-semibold" style={{ color: PAPER }}>{whisper.from_user.username}</span> {verb}
        </>
      );
    }
    return (
      <span className="font-semibold" style={{ color: PAPER }}>
        {whisper.type === 'tag_unlocked' ? t('indications.tagUnlockedHeader') : t('indications.newEpisodeLabel')}
      </span>
    );
  };

  const posterBlock = (whisper: Whisper, mediaType: 'movie' | 'tv' | undefined, detail: React.ReactNode) => (
    <button
      onClick={() => openMovie(whisper, mediaType)}
      disabled={busyId === whisper.id}
      className={`mt-3 w-full flex justify-start items-start gap-3.5 text-left rounded-xl group ${focusRing}`}
    >
      <span className="relative shrink-0 w-14 aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10" style={{ background: VELVET }}>
        {whisper.movie_poster && (
          <OptimizedPoster
            src={`https://image.tmdb.org/t/p/w185${whisper.movie_poster}`}
            alt={whisper.movie_title || ''}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {busyId === whisper.id && (
          <span className="absolute inset-0 grid place-items-center bg-black/50">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          </span>
        )}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block font-semibold leading-snug line-clamp-2 group-hover:underline underline-offset-4" style={{ color: PAPER }}>
          {whisper.movie_title}
        </span>
        {detail}
      </span>
    </button>
  );

  const renderBody = (whisper: Whisper) => {
    switch (whisper.type) {
      case 'movie':
        return posterBlock(
          whisper,
          whisper.media_type,
          whisper.message ? (
            <span className="mt-1.5 block text-sm leading-relaxed line-clamp-3" style={{ color: MIST }}>“{whisper.message}”</span>
          ) : null
        );
      case 'new_episode':
        return posterBlock(
          whisper,
          'tv',
          <span className="mt-1 block text-sm" style={{ color: MIST }}>
            <span style={PIXEL} className="text-violet-200">S{whisper.season_number}E{whisper.episode_number}</span>
            {whisper.episode_name ? ` · ${whisper.episode_name}` : ''}
          </span>
        );
      case 'tag_unlocked':
        return (
          <div className="mt-3 flex items-center gap-3.5">
            <span className="w-14 h-14 shrink-0 rounded-xl grid place-items-center text-3xl ring-1 ring-white/10" style={{ background: VELVET }} aria-hidden>
              {whisper.tag_emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold leading-snug" style={{ color: PAPER }}>{whisper.tag_name}</span>
              <span className="block mt-0.5 text-sm" style={{ color: MIST }}>{t('indications.tagUnlockedLabel')}</span>
            </span>
          </div>
        );
      default:
        return null;
    }
  };

  const renderActions = (whisper: Whisper) => {
    const busy = busyId === whisper.id;

    if (confirmDeleteId === whisper.id) {
      return (
        <>
          <span className="text-sm mr-1" style={{ color: PAPER }}>{t('indications.deleteAsk')}</span>
          <button onClick={() => handleDelete(whisper)} disabled={busy} className={`${ghostButton} text-rose-200 border-rose-300/30 hover:border-rose-300/60`}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" aria-hidden />}
            {t('common.delete')}
          </button>
          <button onClick={() => setConfirmDeleteId(null)} className={ghostButton} style={{ color: PAPER }}>
            {t('common.cancel')}
          </button>
        </>
      );
    }

    if (whisper.type === 'friend_request') {
      return (
        <>
          <button onClick={() => handleRespond(whisper, true)} disabled={busy} className={primaryButton}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" aria-hidden />}
            {t('indications.acceptRequest')}
          </button>
          <button onClick={() => handleRespond(whisper, false)} disabled={busy} className={ghostButton} style={{ color: PAPER }}>
            {t('indications.declineRequest')}
          </button>
          <button onClick={() => goTo(`/profile/${whisper.from_user?.username}`)} className={`${ghostButton} border-transparent`} style={{ color: MIST }}>
            {t('indications.viewProfile')}
          </button>
        </>
      );
    }

    if (whisper.type === 'tag_unlocked') {
      return (
        <button onClick={() => goTo('/profile')} className={ghostButton} style={{ color: PAPER }}>
          <Trophy className="w-4 h-4 text-amber-300" aria-hidden />
          {t('indications.viewTags')}
        </button>
      );
    }

    return (
      <button onClick={() => openMovie(whisper, whisper.type === 'new_episode' ? 'tv' : whisper.media_type)} disabled={busy} className={ghostButton} style={{ color: PAPER }}>
        {whisper.type === 'new_episode' ? t('indications.viewEpisode') : t('indications.viewMovie')}
      </button>
    );
  };

  const renderItem = (whisper: Whisper) => (
    <li key={whisper.id} className="relative flex gap-4 py-5 border-b border-white/[0.06] last:border-b-0">
      {freshIds.has(whisper.id) && (
        <span className="absolute -left-3 sm:-left-4 top-[2.1rem] w-1.5 h-1.5 rounded-full bg-fuchsia-400" aria-hidden />
      )}
      <div className="shrink-0">{renderAvatar(whisper)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed pt-2" style={{ color: MIST }}>
            {headline(whisper)}
            <span aria-hidden> · </span>
            <time dateTime={whisper.created_at} title={new Date(whisper.created_at).toLocaleString(lang)}>
              {relativeTime(whisper.created_at, lang)}
            </time>
          </p>
          {whisper.type !== 'friend_request' && confirmDeleteId !== whisper.id && (
            <button
              onClick={() => setConfirmDeleteId(whisper.id)}
              aria-label={t('common.delete')}
              title={t('common.delete')}
              className={`shrink-0 -mr-2 -mt-1 rounded-full hover:bg-white/10 transition ${focusRing}`}
              style={{ color: MIST }}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        {renderBody(whisper)}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">{renderActions(whisper)}</div>
      </div>
    </li>
  );

  const freshCount = freshIds.size;

  return (
    <>
      <OracleSheet
        open={isOpen}
        onClose={onClose}
        title={t('profile.whispers')}
        subtitle={!loading ? (freshCount > 0 ? t('indications.subtitleNew', { count: freshCount }) : t('indications.subtitleNone')) : undefined}
        size="lg"
        escapeEnabled={!selectedMovie}
      >
        {loading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="w-7 h-7 animate-spin text-fuchsia-400" />
          </div>
        ) : whispers.length === 0 ? (
          <div className="py-12 text-center">
            <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center ring-1 ring-white/10 text-violet-200" style={{ background: VELVET }}>
              <MessageCircle className="w-6 h-6" aria-hidden />
            </span>
            <p style={{ ...PIXEL, color: PAPER }} className="mt-5 text-2xl">{t('indications.empty')}</p>
            <p className="mt-2 text-sm leading-relaxed max-w-sm mx-auto" style={{ color: MIST }}>{t('indications.emptyHint')}</p>
          </div>
        ) : (
          <>
            {filters.length > 0 && (
              <div className="-mx-5 sm:mx-0 px-5 sm:px-0 flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {filters.map((key) => {
                  const active = filter === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(key)}
                      aria-pressed={active}
                      className={`shrink-0 px-3.5 rounded-full text-sm font-medium border transition ${focusRing} ${
                        active ? 'border-violet-300/60 bg-violet-500/20' : 'border-white/15 hover:border-white/30'
                      }`}
                      style={{ color: active ? PAPER : MIST }}
                    >
                      {t(FILTER_LABEL[key])}
                    </button>
                  );
                })}
              </div>
            )}

            {fresh.length > 0 && (
              <section className="mt-4">
                <h3 className="text-sm font-semibold" style={{ color: PAPER }}>{t('indications.sectionNew')}</h3>
                <ul>{fresh.map(renderItem)}</ul>
              </section>
            )}
            {earlier.length > 0 && (
              <section className={fresh.length > 0 ? 'mt-6' : 'mt-2'}>
                {fresh.length > 0 && (
                  <h3 className="text-sm font-semibold" style={{ color: PAPER }}>{t('indications.sectionEarlier')}</h3>
                )}
                <ul>{earlier.map(renderItem)}</ul>
              </section>
            )}
          </>
        )}
      </OracleSheet>

      {selectedMovie && (
        <MovieDetailsModal movie={selectedMovie} isOpen onClose={() => setSelectedMovie(null)} />
      )}
    </>
  );
}