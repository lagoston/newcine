import React, { useState, useEffect } from 'react';
import { X, User, Loader2, Crown } from 'lucide-react';
import { supabase, getProfile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getFrameClass } from '../lib/frames';

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
  type: 'followers' | 'following';
  onFollowChange: () => void;
}

const ITEMS_PER_PAGE = 20;

export default function FollowersModal({
  isOpen,
  onClose,
  userId,
  type,
  onFollowChange,
}: FollowersModalProps) {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
      if (session?.user) {
        fetchFollowingStatus();
      }
    }
  }, [isOpen, page, userId, type]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      
      // If fetching followers (who follows this user)
      if (type === 'followers') {
        const { data: followData, error: followError } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('following_id', userId)
          .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
          
        if (followError) throw followError;
        
        const followerIds = followData.map(item => item.follower_id);
        
        if (followerIds.length === 0) {
          setProfiles([]);
          setHasMore(false);
          return;
        }
        
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, plan_type, avatar_frame')
          .in('id', followerIds);
          
        if (profilesError) throw profilesError;
        
        setProfiles(prev => page === 0 ? profilesData : [...prev, ...profilesData]);
        setHasMore(followData.length === ITEMS_PER_PAGE);
      } 
      // If fetching following (who this user follows)
      else {
        const { data: followData, error: followError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', userId)
          .range(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE - 1);
          
        if (followError) throw followError;
        
        const followingIds = followData.map(item => item.following_id);
        
        if (followingIds.length === 0) {
          setProfiles([]);
          setHasMore(false);
          return;
        }
        
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, plan_type, avatar_frame')
          .in('id', followingIds);
          
        if (profilesError) throw profilesError;
        
        setProfiles(prev => page === 0 ? profilesData : [...prev, ...profilesData]);
        setHasMore(followData.length === ITEMS_PER_PAGE);
      }
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error('Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  const fetchFollowingStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', session?.user.id);

      if (error) throw error;

      const followingMap: Record<string, boolean> = {};
      data.forEach(item => {
        followingMap[item.following_id] = true;
      });
      setFollowingMap(followingMap);
    } catch (error) {
      console.error('Error fetching following status:', error);
    }
  };

  const handleFollow = async (targetId: string) => {
    if (!session?.user) {
      toast.error('Please sign in to follow users');
      return;
    }

    try {
      if (followingMap[targetId]) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', session.user.id)
          .eq('following_id', targetId);

        if (error) throw error;
        setFollowingMap(prev => ({ ...prev, [targetId]: false }));
        toast.success('Unfollowed successfully');
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({
            follower_id: session.user.id,
            following_id: targetId
          });

        if (error) throw error;
        setFollowingMap(prev => ({ ...prev, [targetId]: true }));
        toast.success('Followed successfully');
      }
      onFollowChange();
    } catch (error) {
      console.error('Error updating follow status:', error);
      toast.error('Failed to update follow status');
    }
  };

  const handleProfileClick = (username: string) => {
    navigate(`/profile/${username}`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {type === 'followers' ? 'Followers' : 'Following'}
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
                No {type} yet
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {profiles.map((profile) => (
                  <div key={profile.id} className="p-4 flex items-center justify-between">
                    <button
                      onClick={() => handleProfileClick(profile.username)}
                      className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
                    >
                      <div className={`w-10 h-10 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile.avatar_frame)}`}>
                        {profile.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={profile.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-full h-full p-2 text-gray-400" />
                        )}
                      </div>
                      <div className="text-left flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          @{profile.username}
                        </span>
                        {profile.plan_type === 'premium' && (
                          <Crown className="w-4 h-4 text-yellow-400" title="Premium member" />
                        )}
                      </div>
                    </button>
                    {session?.user?.id !== profile.id && (
                      <button
                        onClick={() => handleFollow(profile.id)}
                        className={`px-4 py-1 rounded-full text-sm font-medium transition-colors ${
                          followingMap[profile.id]
                            ? 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                            : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                        }`}
                      >
                        {followingMap[profile.id] ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="p-4 text-center">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
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