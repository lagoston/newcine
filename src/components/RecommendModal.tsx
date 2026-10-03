import { useState, useEffect } from 'react';
import { Search, Send, Loader2, Film, Users } from 'lucide-react';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { requestSeasonalRefresh } from '../contexts/SeasonalEventContext';

interface Follower {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface RecommendModalProps {
  isOpen: boolean;
  onClose: () => void;
  movieId: number;
  movieTitle: string;
  moviePoster: string;
  mediaType?: 'movie' | 'tv';
}

const RecommendModal = ({ isOpen, onClose, movieId, movieTitle, moviePoster, mediaType = 'movie' }: RecommendModalProps) => {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [filteredFollowers, setFilteredFollowers] = useState<Follower[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFollower, setSelectedFollower] = useState<Follower | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      loadFollowers();
    }
  }, [isOpen, session?.user?.id]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredFollowers(followers);
    } else {
      const filtered = followers.filter(f =>
        f.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFollowers(filtered);
    }
  }, [searchQuery, followers]);

  const loadFollowers = async () => {
    if (!session?.user?.id) return;

    try {
      setLoading(true);

      const { data: friendshipData, error: followersError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`);

      if (followersError) throw followersError;

      if (!friendshipData || friendshipData.length === 0) {
        setFollowers([]);
        setFilteredFollowers([]);
        return;
      }

      const followerIds = friendshipData.map(f =>
        f.requester_id === session.user.id ? f.addressee_id : f.requester_id
      );

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', followerIds);

      if (profilesError) throw profilesError;

      const formattedFollowers = profilesData?.map(p => ({
        id: p.id,
        username: p.username,
        avatar_url: p.avatar_url
      })) || [];

      setFollowers(formattedFollowers);
      setFilteredFollowers(formattedFollowers);
    } catch (error) {
      console.error('Error loading followers:', error);
      toast.error(t('indications.loadFriendsError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendRecommendation = async () => {
    if (!selectedFollower || !session?.user?.id) return;
    if (message.trim().length === 0) {
      toast.error(t('indications.writeMessage'));
      return;
    }

    try {
      setSending(true);

      const { data: canSend, error: checkError } = await supabase.rpc('can_send_indication', {
        user_id_input: session.user.id
      });

      if (checkError) throw checkError;

      if (!canSend) {
        const { data: limit, error: limitError } = await supabase.rpc('get_user_indication_limit', {
          user_id_input: session.user.id
        });

        if (limitError) {
          console.error('Error getting limit:', limitError);
        }

        const isPremium = limit === 20;

        if (isPremium) {
          toast.error(
            t('indications.premiumDailyLimit', { limit: 20 }),
            { duration: 5000 }
          );
        } else {
          toast.error(
            t('indications.dailyLimit', { limit: 5 }) + ' ' + t('indications.upgradeToPremium'),
            { duration: 5000 }
          );
        }
        setSending(false);
        return;
      }

      const { error } = await supabase
        .from('friend_indications')
        .insert({
          from_user_id: session.user.id,
          to_user_id: selectedFollower.id,
          movie_id: movieId,
          movie_title: movieTitle,
          movie_poster: moviePoster,
          message: message.trim(),
          read: false,
          type: 'movie',
          media_type: mediaType
        });

      if (error) {
        console.error('Error inserting indication:', error);
        throw error;
      }

      toast.success(t('indications.indicationSent', { username: selectedFollower.username }));
      // sussurrar um filme da seleção de Natal conta para o evento
      requestSeasonalRefresh();
      onClose();
      setSelectedFollower(null);
      setMessage('');
      setSearchQuery('');
    } catch (error) {
      console.error('Error sending indication:', error);
      toast.error(t('indications.sendError'));
    } finally {
      setSending(false);
    }
  };

  const resetSelection = () => {
    setSelectedFollower(null);
    setMessage('');
  };

  const avatarFor = (f: Follower, size: string) => (
    f.avatar_url ? (
      <img src={f.avatar_url} alt="" className={`${size} rounded-full object-cover ring-1 ring-white/15`} loading="lazy" decoding="async" />
    ) : (
      <span className={`${size} rounded-full grid place-items-center font-semibold ring-1 ring-white/15`} style={{ background: VELVET, color: PAPER }}>
        {f.username.charAt(0).toUpperCase()}
      </span>
    )
  );

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('indications.indicateMovie')}
      subtitle={movieTitle}
      size="md"
      zIndexClass="z-[10010]"
      bodyClassName="px-5 sm:px-7 py-5"
      footer={selectedFollower ? (
        <button
          onClick={handleSendRecommendation}
          disabled={sending || message.trim().length === 0}
          className={`w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white font-semibold shadow-lg shadow-fuchsia-900/30 transition disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden /> : <Send className="w-5 h-5" aria-hidden />}
          {t('indications.sendIndication')}
        </button>
      ) : undefined}
    >
      {!selectedFollower ? (
        <>
          <label className="relative block">
            <span className="sr-only">{t('indications.selectFollower')}</span>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none" style={{ color: MIST }} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('indications.selectFollower')}
              className="w-full h-12 pl-11 pr-4 rounded-xl ring-1 ring-white/10 focus:ring-2 focus:ring-fuchsia-300/70 outline-none text-[15px] placeholder:text-[#BDB4D6]/70"
              style={{ background: VELVET, color: PAPER }}
            />
          </label>

          {loading ? (
            <ul className="mt-4 space-y-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="h-16 rounded-xl animate-pulse" style={{ background: VELVET }} />
              ))}
            </ul>
          ) : filteredFollowers.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-8 h-8 mx-auto" style={{ color: MIST }} aria-hidden />
              <p className="mt-3 font-medium" style={{ color: PAPER }}>
                {followers.length === 0 ? t('indications.noFollowers') : t('indications.noFriendMatch')}
              </p>
              {followers.length === 0 && (
                <p className="mt-1 text-sm" style={{ color: MIST }}>{t('indications.noFriendsHint')}</p>
              )}
            </div>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {filteredFollowers.map((follower) => (
                <li key={follower.id}>
                  <button
                    onClick={() => setSelectedFollower(follower)}
                    className={`group w-full flex justify-start items-center gap-3.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-left transition ${FOCUS_RING}`}
                  >
                    {avatarFor(follower, 'w-11 h-11 shrink-0')}
                    <span className="flex-1 min-w-0 font-medium truncate" style={{ color: PAPER }}>@{follower.username}</span>
                    <Send className="w-[18px] h-[18px] shrink-0 opacity-60 group-hover:opacity-100 transition text-orange-300" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3.5 p-3 rounded-xl ring-1 ring-white/10" style={{ background: VELVET }}>
            <span className="relative shrink-0 w-12 aspect-[2/3] rounded-md overflow-hidden ring-1 ring-white/10" style={{ background: NIGHT }}>
              {moviePoster ? (
                <img src={`https://image.tmdb.org/t/p/w92${moviePoster}`} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <Film className="absolute inset-0 m-auto w-5 h-5" style={{ color: MIST }} aria-hidden />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm" style={{ color: MIST }}>{t('indications.sendingTo')}</span>
              <span className="flex items-center gap-2 mt-1 min-w-0">
                {avatarFor(selectedFollower, 'w-7 h-7 shrink-0 text-xs')}
                <span className="font-semibold truncate" style={{ color: PAPER }}>@{selectedFollower.username}</span>
              </span>
            </span>
            <button
              onClick={resetSelection}
              className={`shrink-0 h-11 px-3 rounded-lg text-sm font-medium hover:bg-white/10 transition ${FOCUS_RING}`}
              style={{ color: MIST }}
            >
              {t('indications.changeFriend')}
            </button>
          </div>

          <label className="block">
            <span className="block text-sm font-medium mb-2" style={{ color: PAPER }}>{t('indications.writeMessage')}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('indications.messagePlaceholder')}
              rows={4}
              maxLength={500}
              autoFocus
              className="w-full px-4 py-3 rounded-xl ring-1 ring-white/10 focus:ring-2 focus:ring-fuchsia-300/70 outline-none resize-none text-[15px] leading-relaxed placeholder:text-[#BDB4D6]/70"
              style={{ background: VELVET, color: PAPER }}
            />
            <span className="block mt-1 text-xs text-right tabular-nums" style={{ color: MIST }}>{message.length}/500</span>
          </label>
        </div>
      )}
    </OracleSheet>
  );
};

export default RecommendModal;