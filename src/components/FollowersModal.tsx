import { useState, useEffect } from 'react';
import { User, Crown, Users, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';
import OracleSheet from './OracleSheet';
import { NIGHT, VELVET, PAPER, MIST, FOCUS_RING } from '../lib/oracleTheme';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  plan_type: string;
  avatar_frame: string;
}

interface FollowersModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  // Mantida por compatibilidade: a lista não altera amizades, então nada
  // aqui dispara essa função — quem desfaz amizade é o perfil do amigo.
  onFollowChange?: () => void;
}

const ITEMS_PER_PAGE = 20;

// Antes mostrava duas listas separadas (quem segue / quem é seguido).
// Amizade é mútua, então agora é uma lista única — não existe mais
// "seguidor que eu não sigo de volta".
export default function FollowersModal({ isOpen, onClose, userId }: FollowersModalProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, page, userId]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);

      const { data: friendshipData, error: friendshipError } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);

      if (friendshipError) throw friendshipError;

      const friendIds = (friendshipData || []).map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));

      if (friendIds.length === 0) {
        setProfiles((prev) => (page === 0 ? [] : prev));
        setHasMore(false);
        return;
      }

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, plan_type, avatar_frame')
        .in('id', friendIds);

      if (profilesError) throw profilesError;

      // Ordem alfabética dentro da página — antes vinha na ordem do banco.
      const sorted = [...(profilesData || [])].sort((a, b) => a.username.localeCompare(b.username));
      setProfiles((prev) => (page === 0 ? sorted : [...prev, ...sorted]));
      setHasMore((friendshipData || []).length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error(t('profile.friendsLoadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleProfileClick = (username: string) => {
    navigate(`/profile/${username}`);
    onClose();
  };

  const isFirstLoad = loading && profiles.length === 0;

  return (
    <OracleSheet
      open={isOpen}
      onClose={onClose}
      title={t('profile.friendsLabel', { defaultValue: 'Amigos' })}
      subtitle={profiles.length > 0 ? t('profile.friendsSubtitle') : undefined}
      size="md"
      bodyClassName="px-3 sm:px-4 py-3"
    >
      {isFirstLoad ? (
        <ul className="space-y-1" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-2.5">
              <span className="w-11 h-11 rounded-full bg-white/10 animate-pulse" />
              <span className="h-4 w-32 rounded bg-white/10 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : profiles.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <span className="mx-auto grid place-items-center w-14 h-14 rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/30">
            <Users className="w-7 h-7 text-violet-300" aria-hidden />
          </span>
          <p className="mt-4 font-semibold" style={{ color: PAPER }}>
            {t('profile.noFriendsYet', { defaultValue: 'Nenhum amigo ainda' })}
          </p>
          <p className="mt-1 text-sm" style={{ color: MIST }}>
            {t('profile.noFriendsHint')}
          </p>
        </div>
      ) : (
        <ul className="space-y-0.5">
          {profiles.map((profile) => {
            const isPremiumFriend = profile.plan_type === 'premium';
            const rawFrame = getFrameClass(profile.avatar_frame, isPremiumFriend);
            const frame = !rawFrame || rawFrame === 'ring-0' ? 'ring-2 ring-white/15' : rawFrame;
            return (
              <li key={profile.id}>
                <button
                  onClick={() => handleProfileClick(profile.username)}
                  className={`group w-full justify-start gap-3 px-2 py-2 rounded-xl text-left hover:bg-white/[0.05] transition ${FOCUS_RING}`}
                >
                  {frameUsesComponent(profile.avatar_frame, isPremiumFriend) === 'GhostRiderFrame' && profile.avatar_url ? (
                    <GhostRiderFrame src={profile.avatar_url} alt="" size={44} />
                  ) : (
                    <span className={`block shrink-0 w-11 h-11 rounded-full overflow-hidden ${frame}`} style={{ background: NIGHT }}>
                      {profile.avatar_url ? (
                        <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <span className="w-full h-full grid place-items-center" style={{ color: MIST, background: VELVET }}>
                          <User className="w-5 h-5" aria-hidden />
                        </span>
                      )}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="truncate font-medium" style={{ color: PAPER }}>
                      @{profile.username}
                    </span>
                    {isPremiumFriend && <Crown className="w-4 h-4 shrink-0 text-amber-300" aria-label={t('settings.premium')} />}
                  </span>
                  <ChevronRight className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 transition" style={{ color: MIST }} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && profiles.length > 0 && (
        <div className="pt-3 pb-1 flex justify-center">
          <button
            onClick={() => setPage((prev) => prev + 1)}
            disabled={loading}
            className={`inline-flex items-center gap-2 h-11 px-5 rounded-full border border-white/15 hover:border-white/35 hover:bg-white/5 text-sm font-medium transition disabled:opacity-60 ${FOCUS_RING}`}
            style={{ color: PAPER }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {t('common.loadMore')}
          </button>
        </div>
      )}
    </OracleSheet>
  );
}
