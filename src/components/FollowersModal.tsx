import React, { useState, useEffect } from 'react';
import { X, User, Loader2, Crown } from 'lucide-react';
import GlassLoader from './GlassLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { getFrameClass, frameUsesComponent } from '../lib/frames';
import { GhostRiderFrame } from './GhostRiderFrame';

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
  onFollowChange: () => void;
}

const ITEMS_PER_PAGE = 20;

// Antes mostrava duas listas separadas (quem segue / quem é seguido).
// Amizade é mútua, então agora é uma lista única — não existe mais
// "seguidor que eu não sigo de volta".
export default function FollowersModal({
  isOpen,
  onClose,
  userId,
  onFollowChange,
}: FollowersModalProps) {
  const { session } = useAuth();
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

      const friendIds = (friendshipData || []).map((f) =>
        f.requester_id === userId ? f.addressee_id : f.requester_id
      );

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

      setProfiles((prev) => (page === 0 ? profilesData : [...prev, ...profilesData]));
      setHasMore((friendshipData || []).length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileClick = (username: string) => {
    navigate(`/profile/${username}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto pt-[calc(env(safe-area-inset-top)+4rem)]">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {t('profile.friendsLabel', { defaultValue: 'Amigos' })}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {profiles.length === 0 && !loading ? (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                {t('profile.noFriendsYet', { defaultValue: 'Nenhum amigo ainda' })}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {profiles.map((profile) => (
                  <div key={profile.id} className="p-4 flex items-center justify-between">
                    <button
                      onClick={() => handleProfileClick(profile.username)}
                      className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
                    >
                      {frameUsesComponent(profile.avatar_frame) === 'GhostRiderFrame' && profile.avatar_url ? (
                        <GhostRiderFrame src={profile.avatar_url} alt={profile.username} size={40} />
                      ) : (
                      <div className={`w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile.avatar_frame)}`}>
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.username}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <User className="w-full h-full p-2 text-gray-400" />
                        )}
                      </div>
                      )}
                      <div className="text-left flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          @{profile.username}
                        </span>
                        {profile.plan_type === 'premium' && (
                          <Crown className="w-4 h-4 text-yellow-400" title="Premium member" />
                        )}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="p-4 flex justify-center">
                <GlassLoader size="sm" />
              </div>
            )}

            {hasMore && !loading && (
              <div className="p-4 text-center">
                <button
                  onClick={() => setPage(prev => prev + 1)}
                  className="px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                >
                  Load more
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}