import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, Users, Loader2, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useDebounce } from 'use-debounce';
import toast from 'react-hot-toast';
import { getFrameClass } from '../lib/frames';
import { getBannerClass } from '../lib/banners';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  plan_type: string;
  avatar_frame: string;
  banner: string;
  active_tag?: {
    emoji: string;
    name: string;
    category: string;
  };
}

export default function Community() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filteredProfiles, setFilteredProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  // Animation variants for staggered animations
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    if (debouncedQuery) {
      searchProfiles();
    } else {
      setFilteredProfiles(profiles);
    }
  }, [debouncedQuery, profiles]);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      
      // Fetch profile data directly from profiles table
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          username,
          avatar_url,
          bio,
          created_at,
          updated_at,
          plan_type,
          avatar_frame,
          banner,
          active_tag
        `);

      if (profilesError) throw profilesError;
      
      // For each profile, get follower and following counts
      const profilesWithCounts = await Promise.all(
        profilesData.map(async (profile) => {
          // Count followers
          const { count: followersCount, error: followersError } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', profile.id);
          
          if (followersError) throw followersError;
          
          // Count following
          const { count: followingCount, error: followingError } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', profile.id);
          
          if (followingError) throw followingError;
          
          return {
            ...profile,
            followers_count: followersCount || 0,
            following_count: followingCount || 0
          };
        })
      );

      setProfiles(profilesWithCounts);
      setFilteredProfiles(profilesWithCounts);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const searchProfiles = async () => {
    setSearching(true);
    const filtered = profiles.filter(profile =>
      profile.username.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      profile.bio?.toLowerCase().includes(debouncedQuery.toLowerCase())
    );
    setFilteredProfiles(filtered);
    setSearching(false);
  };

  const navigateToProfile = (username: string) => {
    navigate(`/profile/${username}`);
  };

  if (loading) {
    return (
      <motion.div 
        className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="p-8 rounded-xl bg-white dark:bg-gray-800/80 shadow-xl border border-gray-100 dark:border-gray-700/30 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-300 font-medium text-center">
            {t('common.loading')}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 dark:from-gray-900 dark:via-blue-900/5 dark:to-purple-900/5 py-8 px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="container mx-auto max-w-7xl">
        <motion.div 
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
          variants={itemVariants}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center gap-3">
            <motion.div
              whileHover={{ rotate: [0, -10, 0], scale: 1.05 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Users className="w-8 h-8 text-blue-500" />
            </motion.div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
              {t('community.title')}
            </h1>
          </div>
          <div className="w-full md:w-96">
            <div className="relative">
              <input
                type="text"
                placeholder={t('community.searchMembers')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md hover:shadow-lg transition-shadow"
                aria-label={t('community.searchMembers')}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-blue-500" />
              )}
            </div>
          </div>
        </motion.div>

        {filteredProfiles.length === 0 ? (
          <motion.div 
            className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <Users className="w-20 h-20 text-gray-400 mx-auto mb-4" />
            </motion.div>
            <motion.h2 
              className="text-2xl font-semibold text-gray-900 dark:text-white mb-2"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              {t('community.noMembers')}
            </motion.h2>
            <motion.p 
              className="text-gray-600 dark:text-gray-400 max-w-md mx-auto"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              {searchQuery
                ? t('community.noMembersMatch')
                : t('community.beFirst')}
            </motion.p>
          </motion.div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {filteredProfiles.map((profile) => (
              <motion.div
                key={profile.id}
                className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl cursor-pointer ${getBannerClass(profile.banner, profile.plan_type === 'premium')}`}
                onClick={() => navigateToProfile(profile.username)}
                role="button"
                tabIndex={0}
                aria-label={`View ${profile.username}'s profile`}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                style={{ transition: 'all 0.15s ease-out' }}
              >
                <div className="relative h-full flex flex-col">
                  {/* Avatar e informações principais */}
                  <div className="p-6 flex-1 flex flex-col">
                    <div className="flex items-start gap-4 mb-4">
                      <div className="relative flex-shrink-0">
                        <div className={`w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ${getFrameClass(profile.avatar_frame, profile.plan_type === 'premium')}`}>
                          {profile.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={profile.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="w-full h-full p-3 text-gray-400" />
                          )}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                            @{profile.username}
                          </h2>
                          {profile.plan_type === 'premium' && (
                            <motion.div
                              whileHover={{ rotate: 360 }}
                              transition={{ duration: 0.3, ease: "easeOut" }}
                              className="flex-shrink-0"
                            >
                              <Crown className="w-5 h-5 text-yellow-400" title={t('premium.title')} />
                            </motion.div>
                          )}
                        </div>

                        {profile.active_tag && (
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                            profile.active_tag.category === 'theme'
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                              : profile.active_tag.category === 'basic'
                              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          }`}>
                            <span>{profile.active_tag.emoji}</span>
                            <span className="truncate max-w-[120px]">{profile.active_tag.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bio */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-4 flex-1">
                      {profile.bio || t('profile.bio')}
                    </p>

                    {/* Stats na parte inferior */}
                    <div className="flex items-center gap-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          <span className="font-bold text-gray-900 dark:text-white">{profile.followers_count}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1">{profile.followers_count === 1 ? 'follower' : 'followers'}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">
                          <span className="font-bold text-gray-900 dark:text-white">{profile.following_count}</span>
                          <span className="text-gray-500 dark:text-gray-400 ml-1">following</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Background animated elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        {Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`bg-particle-${i}`}
            className="absolute w-1 h-1 rounded-full bg-blue-500/20 dark:bg-blue-600/20"
            initial={{ 
              x: `${Math.random() * 100}%`, 
              y: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5
            }}
            animate={{ 
              y: [
                `${Math.random() * 100}%`, 
                `${Math.random() * 100}%`,
                `${Math.random() * 100}%`
              ],
              opacity: [
                Math.random() * 0.5,
                Math.random() * 0.3,
                Math.random() * 0.5
              ]
            }}
            transition={{ 
              duration: 20 + Math.random() * 30,
              repeat: Infinity,
              repeatType: "mirror"
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}