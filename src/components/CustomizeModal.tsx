import React, { useState, useEffect } from 'react';
import { X, ImageIcon, Tag, Layout, Crown, Star, BrainCircuit, Users, Lock, Loader2, Check, Palette, User } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { frames, FrameId } from '../lib/frames';
import { banners, BannerId } from '../lib/banners';

interface CustomizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

interface Frame {
  id: string;
  name: string;
  isPremium: boolean;
  className: string;
}

type TabType = 'frames' | 'banners' | 'tags';
type TagCategory = 'basic' | 'theme' | 'community' | 'oracle';

interface ProgressionTag {
  name: string;
  emoji: string;
  minMovies: number;
  maxMovies?: number;
  description: string;
  condition?: {
    type: 'rating' | 'genre' | 'director';
    value?: number | number[] | string;
  };
}

interface ThemeTag {
  id: string;
  name: string;
  emoji: string;
  requirement: string;
  condition: {
    type: 'rating' | 'genre' | 'director' | 'franchise';
    count: number;
    value?: number | string | number[];
  };
}

interface CommunityTag {
  name: string;
  emoji: string;
  minFollowers: number;
  maxFollowers?: number;
  description: string;
}

interface ActiveTag {
  category: TagCategory;
  name: string;
  emoji: string;
}

const PROGRESSION_TAGS: ProgressionTag[] = [
  { name: 'Balcony Regular', emoji: '🎫', minMovies: 1, maxMovies: 19, description: '1 - 19 movies' },
  { name: 'Seat Warmer', emoji: '💺', minMovies: 20, maxMovies: 49, description: '20 - 49 movies' },
  { name: 'Popcorn Pro', emoji: '🍿', minMovies: 50, maxMovies: 99, description: '50 - 99 movies' },
  { name: 'Reel Addict', emoji: '📽', minMovies: 100, maxMovies: 199, description: '100 - 199 movies' },
  { name: 'Cine Elite', emoji: '🎞', minMovies: 200, maxMovies: 499, description: '200 - 499 movies' },
  { name: 'Projectionist Supreme', emoji: '🎬', minMovies: 500, maxMovies: 999, description: '500 - 999 movies' },
  { name: 'Cinematic Guru', emoji: '🎭', minMovies: 1000, description: '1000+ movies' },
  { 
    name: 'CineHater', 
    emoji: '🔥', 
    minMovies: 20, 
    description: '20 movies rated 0-2/10',
    condition: { type: 'rating', value: [0, 1, 2] }
  },
  { 
    name: 'Golden Reel', 
    emoji: '🏆', 
    minMovies: 20, 
    description: '20 movies rated 10/10',
    condition: { type: 'rating', value: 10 }
  },
  { 
    name: 'Bloody Mary', 
    emoji: '🩸', 
    minMovies: 50, 
    description: '50 Horror movies',
    condition: { type: 'genre', value: 'Horror' }
  },
  { 
    name: 'Punchliner', 
    emoji: '🤣', 
    minMovies: 50, 
    description: '50 Comedy movies',
    condition: { type: 'genre', value: 'Comedy' }
  },
  { 
    name: 'Star Gazer', 
    emoji: '🚀', 
    minMovies: 50, 
    description: '50 Sci-Fi movies',
    condition: { type: 'genre', value: 'Science Fiction' }
  },
  { 
    name: 'Cine Cupid', 
    emoji: '💖', 
    minMovies: 50, 
    description: '50 Romance movies',
    condition: { type: 'genre', value: 'Romance' }
  },
  { 
    name: 'Truth Digger', 
    emoji: '📚', 
    minMovies: 50, 
    description: '50 Documentary movies',
    condition: { type: 'genre', value: 'Documentary' }
  },
  { 
    name: "Director's Cut", 
    emoji: '🎥', 
    minMovies: 10, 
    description: '10 movies from the same director',
    condition: { type: 'director' }
  }
];

const THEME_TAGS: ThemeTag[] = [
  {
    id: 'mockingjay-victor',
    name: 'Mockingjay Victor',
    emoji: '🏹',
    requirement: 'All 5 Hunger Games movies',
    condition: { type: 'franchise', count: 5, value: 'Hunger Games' }
  },
  {
    id: 'lucky-player',
    name: 'Lucky Player',
    emoji: '🎲',
    requirement: 'Jumanji (1995) and Zathura (2005)',
    condition: { type: 'franchise', count: 2, value: 'Jumanji-Zathura' }
  },
  {
    id: 'death-dodger',
    name: 'Death Dodger',
    emoji: '☠️',
    requirement: 'All 5 Final Destination movies',
    condition: { type: 'franchise', count: 5, value: 'Final Destination' }
  },
  {
    id: 'hogwarts-graduate',
    name: 'Hogwarts Graduate',
    emoji: '🧙',
    requirement: 'All 8 Harry Potter movies',
    condition: { type: 'franchise', count: 8, value: 'Harry Potter' }
  },
  {
    id: 'force-founder',
    name: 'Force Founder',
    emoji: '🌌',
    requirement: 'Star Wars Original Trilogy (IV-V-VI)',
    condition: { type: 'franchise', count: 3, value: 'Star Wars Original' }
  },
  {
    id: 'don-of-cinema',
    name: 'Don of Cinema',
    emoji: '🍷',
    requirement: 'The Godfather Trilogy (I-II-III)',
    condition: { type: 'franchise', count: 3, value: 'The Godfather' }
  },
  {
    id: 'trap-builder',
    name: 'Trap Builder',
    emoji: '🪤',
    requirement: 'Home Alone 1 & 2',
    condition: { type: 'franchise', count: 2, value: 'Home Alone' }
  },
  {
    id: 'red-pill-adept',
    name: 'Red-Pill Adept',
    emoji: '💊',
    requirement: 'The Matrix Trilogy',
    condition: { type: 'franchise', count: 3, value: 'The Matrix' }
  },
  {
    id: 'flux-capacitor-fan',
    name: 'Flux-Capacitor Fan',
    emoji: '⚡',
    requirement: 'Back to the Future Trilogy',
    condition: { type: 'franchise', count: 3, value: 'Back to the Future' }
  },
  {
    id: 'ring-expert',
    name: 'Ring Expert',
    emoji: '💍',
    requirement: 'LOTR Extended Trilogy',
    condition: { type: 'franchise', count: 3, value: 'The Lord of the Rings' }
  },
  {
    id: 'toy-collector',
    name: 'Toy Collector',
    emoji: '🦖',
    requirement: 'All 4 Toy Story movies',
    condition: { type: 'franchise', count: 4, value: 'Toy Story' }
  },
  {
    id: 'whip-crack-scholar',
    name: 'Whip-Crack Scholar',
    emoji: '🥾',
    requirement: 'Indiana Jones Quadrilogy',
    condition: { type: 'franchise', count: 4, value: 'Indiana Jones' }
  },
  {
    id: 'sailor',
    name: 'Sailor',
    emoji: '🏴‍☠️',
    requirement: 'All 5 Pirates of the Caribbean movies',
    condition: { type: 'franchise', count: 5, value: 'Pirates' }
  },
  {
    id: 'senior-mechanic',
    name: 'Senior Mechanic',
    emoji: '🔧',
    requirement: 'All 10 Fast & Furious main saga movies',
    condition: { type: 'franchise', count: 10, value: 'Fast Saga' }
  },
  {
    id: 'cybertron-sentinel',
    name: 'Cybertron Sentinel',
    emoji: '🤖',
    requirement: 'All 7 live-action Transformers movies',
    condition: { type: 'franchise', count: 7, value: 'Transformers' }
  },
  {
    id: 'swamp-royalty',
    name: 'Swamp Royalty',
    emoji: '🧅',
    requirement: 'All 4 Shrek movies',
    condition: { type: 'franchise', count: 4, value: 'Shrek' }
  },
  {
    id: 'dino-tamer',
    name: 'Dino Tamer',
    emoji: '🦴',
    requirement: 'All 6 Jurassic Park/World movies',
    condition: { type: 'franchise', count: 6, value: 'Jurassic' }
  },
  {
    id: 'banana-boss',
    name: 'Banana Boss',
    emoji: '🍌',
    requirement: 'All 5 Despicable Me/Minions movies',
    condition: { type: 'franchise', count: 5, value: 'Minions' }
  },
  {
    id: 'baba-yaga',
    name: 'Baba Yaga',
    emoji: '🃏',
    requirement: 'John Wick Saga',
    condition: { type: 'franchise', count: 4, value: 'John Wick' }
  },
  {
    id: 'casual-drinker',
    name: 'Casual Drinker',
    emoji: '🥃',
    requirement: 'The Hangover Trilogy',
    condition: { type: 'franchise', count: 3, value: 'Hangover' }
  },
  {
    id: 'sweetie-pie',
    name: 'Sweetie Pie',
    emoji: '🥧',
    requirement: 'American Pie (original four)',
    condition: { type: 'franchise', count: 4, value: 'American Pie' }
  },
  {
    id: 'visceral-gamer',
    name: 'Visceral Gamer',
    emoji: '♟️',
    requirement: 'Saw Franchise',
    condition: { type: 'franchise', count: 10, value: 'Saw' }
  },
  {
    id: 'nuts',
    name: 'Nuts',
    emoji: '🌰',
    requirement: 'Ice Age Saga',
    condition: { type: 'franchise', count: 6, value: 'Ice Age' }
  },
  {
    id: 'dark-spirit',
    name: 'Dark Spirit',
    emoji: '🦇',
    requirement: 'The Dark Knight Trilogy',
    condition: { type: 'franchise', count: 3, value: 'Dark Knight' }
  },
  {
    id: 'cybertron-sentinel',
    name: 'Cybertron Sentinel',
    emoji: '🤖',
    requirement: 'Transformers Franchise',
    condition: { type: 'franchise', count: 5, value: 'Transformers' }
  },
  {
    id: 'sharp-canine',
    name: 'Sharp Canine',
    emoji: '🦷',
    requirement: 'Twilight Saga',
    condition: { type: 'franchise', count: 5, value: 'Twilight' }
  },
  {
    id: 'primal-essence',
    name: 'Primal Essence',
    emoji: '🦍',
    requirement: 'Planet of the Apes (2011 reboot line)',
    condition: { type: 'franchise', count: 4, value: 'Apes Reboot' }
  }
];

const COMMUNITY_TAGS: CommunityTag[] = [
  { name: 'Spotlight Spark', emoji: '✨', minFollowers: 1, maxFollowers: 9, description: '1 - 9 followers' },
  { name: 'Rising Star', emoji: '🌠', minFollowers: 10, maxFollowers: 24, description: '10 - 24 followers' },
  { name: 'Red-Carpet Regular', emoji: '👠', minFollowers: 25, maxFollowers: 49, description: '25 - 49 followers' },
  { name: 'Festival Favorite', emoji: '🏵️', minFollowers: 50, maxFollowers: 99, description: '50 - 99 followers' },
  { name: 'Blockbuster', emoji: '💥', minFollowers: 100, maxFollowers: 199, description: '100 - 199 followers' },
  { name: 'Cult Legend', emoji: '🌟', minFollowers: 200, description: '200+ followers' }
];

const FRANCHISE_MOVIES = {
  'Jumanji-Zathura': [8844, 6795],
  'Harry Potter': [671, 672, 673, 674, 675, 767, 12444, 12445],
  'Star Wars Original': [11, 1891, 1892],
  'The Godfather': [238, 240, 242],
  'Home Alone': [771, 772],
  'The Matrix': [603, 604, 605],
  'Back to the Future': [105, 165, 196],
  'The Lord of the Rings': [120, 121, 122],
  'Toy Story': [862, 863, 10193, 301528],
  'Indiana Jones': [85, 89, 90, 91],
  'Hunger Games': [70160, 101299, 131631, 131634, 695721],
  'Final Destination': [9532, 9358, 9286, 19912, 55779],
  'Pirates': [22, 58, 285, 1865, 166426],
  'Fast Saga': [9799, 584, 9615, 13804, 51497, 82992, 168259, 337339, 385128, 385687],
  'Transformers': [185, 8373, 38356, 91314, 335988, 424783, 667538],
  'Shrek': [808, 809, 810, 10192],
  'Jurassic': [329, 330, 331, 135397, 351286, 507086],
  'Minions': [39538, 93456, 324852, 211672, 438148],
  'John Wick': [245891, 324552, 458156, 603692],
  'Hangover': [18785, 45243, 109439],
  'American Pie': [2105, 2770, 8273, 71552],
  'Saw': [176, 215, 214, 663, 11917, 22804, 41439, 298250, 602734, 951491],
  'Ice Age': [425, 950, 8355, 57800, 278154, 774825],
  'Dark Knight': [272, 155, 49026],
  'Transformers': [1858, 8373, 8588, 424783, 521777],
  'Twilight': [122, 121, 240, 50619, 50620],
  'Apes Reboot': [61791, 119450, 281338, 653346]
} as const;

const getTagColorClasses = (category: string) => {
  switch (category) {
    case 'basic':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'theme':
      return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    case 'community':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    default:
      return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
  }
};

const getCategoryButtonStyle = (isActive: boolean, category: string) => {
  switch (category) {
    case 'basic':
      return isActive
        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600';
    case 'theme':
      return isActive
        ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
        : 'bg-purple-600 text-white hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600';
    case 'community':
      return isActive
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
    default:
      return isActive
        ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
        : 'bg-gray-600 text-white hover:bg-gray-700 dark:bg-gray-500 dark:hover:bg-gray-600';
  }
};

const CustomizeModal: React.FC<CustomizeModalProps> = ({ isOpen, onClose, onSave }) => {
  const { session, isPremium } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('frames');
  const [activeTagCategory, setActiveTagCategory] = useState<TagCategory>('basic');
  const [ratedMoviesCount, setRatedMoviesCount] = useState<number>(0);
  const [followersCount, setFollowersCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [themeTagProgress, setThemeTagProgress] = useState<Record<string, number>>({});
  const [basicTagProgress, setBasicTagProgress] = useState<Record<string, number>>({});
  const [activeTag, setActiveTag] = useState<ActiveTag | null>(null);
  const [savingTag, setSavingTag] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<FrameId>('default');
  const [selectedBanner, setSelectedBanner] = useState<BannerId>('default');

  useEffect(() => {
    if (session?.user?.id && isOpen) {
      fetchProfile();
      fetchRatedMoviesCount();
      fetchThemeTagProgress();
      fetchBasicTagProgress();
      fetchActiveTag();
      fetchFollowersCount();
    }
  }, [session?.user?.id, isOpen]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_frame, banner')
        .eq('id', session?.user?.id)
        .single();

      if (error) throw error;
      if (data?.avatar_frame) {
        setSelectedFrame(data.avatar_frame as FrameId);
      }
      if (data?.banner) {
        setSelectedBanner(data.banner as BannerId);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const fetchFollowersCount = async () => {
    try {
      const { count, error } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', session?.user?.id);

      if (error) throw error;
      setFollowersCount(count || 0);
    } catch (error) {
      console.error('Error fetching followers count:', error);
    }
  };

  const fetchActiveTag = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('active_tag')
        .eq('id', session?.user?.id)
        .single();

      if (error) throw error;
      if (data?.active_tag) {
        setActiveTag(data.active_tag as ActiveTag);
      }
    } catch (error) {
      console.error('Error fetching active tag:', error);
    }
  };

  const handleUseTag = async (tag: { name: string; emoji: string }, category: TagCategory) => {
    if (!session?.user?.id || savingTag) return;

    try {
      setSavingTag(true);
      const newTag: ActiveTag = { category, name: tag.name, emoji: tag.emoji };

      const { error } = await supabase
        .from('profiles')
        .update({ active_tag: newTag })
        .eq('id', session.user.id);

      if (error) throw error;

      setActiveTag(newTag);
      toast.success('Tag updated successfully');
    } catch (error) {
      console.error('Error updating tag:', error);
      toast.error('Failed to update tag');
    } finally {
      setSavingTag(false);
    }
  };

  const handleFrameSelect = async (frameId: FrameId) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          avatar_frame: frameId,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setSelectedFrame(frameId);
      toast.success('Frame updated successfully');
    } catch (error) {
      console.error('Error updating frame:', error);
      toast.error('Failed to update frame');
    }
  };

  const handleBannerSelect = async (bannerId: BannerId) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          banner: bannerId,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setSelectedBanner(bannerId);
      toast.success('Banner updated successfully');
    } catch (error) {
      console.error('Error updating banner:', error);
      toast.error('Failed to update banner');
    }
  };

  const fetchRatedMoviesCount = async () => {
    try {
      setLoading(true);
      const { count, error } = await supabase
        .from('user_movies')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session?.user?.id)
        .not('rating', 'is', null);

      if (error) throw error;
      setRatedMoviesCount(count || 0);
    } catch (error) {
      console.error('Error fetching rated movies count:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBasicTagProgress = async () => {
    if (!session?.user?.id) return;

    try {
      const progress: Record<string, number> = {};

      const { data: userMovies, error: userMoviesError } = await supabase
        .from('user_movies')
        .select(`
          movie_id,
          rating,
          movies:movie_id (
            genres,
            director
          )
        `)
        .eq('user_id', session.user.id)
        .not('rating', 'is', null);

      if (userMoviesError) throw userMoviesError;

      if (userMovies) {
        // Track ratings
        const ratingCounts = {
          lowRatings: userMovies.filter(m => m.rating <= 2).length,
          perfectRatings: userMovies.filter(m => m.rating === 10).length
        };

        progress['CineHater'] = ratingCounts.lowRatings;
        progress['Golden Reel'] = ratingCounts.perfectRatings;

        // Track genres
        const genreCounts: Record<string, number> = {};
        const directorCounts: Record<string, number> = {};

        userMovies.forEach(({ movies }) => {
          if (movies?.genres) {
            movies.genres.forEach(genre => {
              genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            });
          }
          if (movies?.director) {
            directorCounts[movies.director] = (directorCounts[movies.director] || 0) + 1;
          }
        });

        progress['Bloody Mary'] = genreCounts['Horror'] || 0;
        progress['Punchliner'] = genreCounts['Comedy'] || 0;
        progress['Star Gazer'] = genreCounts['Science Fiction'] || 0;
        progress['Cine Cupid'] = genreCounts['Romance'] || 0;
        progress['Truth Digger'] = genreCounts['Documentary'] || 0;

        // Track director with most movies
        progress["Director's Cut"] = Math.max(...Object.values(directorCounts), 0);
      }

      setBasicTagProgress(progress);
    } catch (error) {
      console.error('Error fetching basic tag progress:', error);
    }
  };

  const fetchThemeTagProgress = async () => {
    if (!session?.user?.id) return;

    try {
      const progress: Record<string, number> = {};

      const { data: userMovies, error: userMoviesError } = await supabase
        .from('user_movies')
        .select('movie_id')
        .eq('user_id', session.user.id)
        .not('rating', 'is', null);

      if (!userMoviesError && userMovies) {
        const ratedMovieIds = new Set(userMovies.map(movie => movie.movie_id));

        Object.entries(FRANCHISE_MOVIES).forEach(([franchise, movieIds]) => {
          const watchedCount = movieIds.filter(id => ratedMovieIds.has(id)).length;
          const tagId = THEME_TAGS.find(tag => 
            tag.condition.type === 'franchise' && 
            tag.condition.value === franchise
          )?.id;
          
          if (tagId) {
            progress[tagId] = watchedCount;
          }
        });
      }

      setThemeTagProgress(progress);
    } catch (error) {
      console.error('Error fetching theme tag progress:', error);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'frames', label: 'Avatars', icon: ImageIcon },
    { id: 'banners', label: 'Banners', icon: Layout },
    { id: 'tags', label: 'Tags', icon: Tag }
  ] as const;

  const tagCategories = [
    { id: 'basic', label: 'Basic', icon: Tag },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'community', label: 'Community', icon: Users },
    { id: 'oracle', label: 'Oracle', icon: BrainCircuit }
  ] as const;

  const renderFrameContent = () => {
    // Get default frame first
    const defaultFrame = frames.default;
    // Get all other frames
    const otherFrames = Object.values(frames).filter(frame => frame.id !== 'default');
    
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {/* Default frame always first */}
        <div
          key={defaultFrame.id}
          className={`relative aspect-square rounded-lg border border-transparent ${selectedFrame === defaultFrame.id ? 'ring-2 ring-blue-500' : ''}`}
        >
          <button
            onClick={() => handleFrameSelect(defaultFrame.id as FrameId)}
            className="w-full h-full p-4 relative group"
          >
            <div className={`w-full h-full rounded-full overflow-hidden ${defaultFrame.className}`}>
              <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <User className="w-1/2 h-1/2 text-gray-400" />
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-medium text-gray-900 dark:text-white bg-white/80 dark:bg-black/50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                {defaultFrame.name}
              </span>
            </div>
          </button>
        </div>

        {/* Rest of the frames */}
        {otherFrames.map((frame) => {
          const isPremiumLocked = frame.isPremium && !isPremium;
          const requiredTagProgress = frame.requiredTag ? (themeTagProgress[frame.requiredTag] || 0) : 0;
          const requiredTagMet = !frame.requiredTag || (requiredTagProgress >= (THEME_TAGS.find(t => t.id === frame.requiredTag)?.condition.count || 0));
          const isLocked = isPremiumLocked || !requiredTagMet;

          return (
            <div
              key={frame.id}
              className={`relative aspect-square rounded-lg border ${
                isLocked ? 'border-gray-200 dark:border-gray-700 opacity-50' : 'border-transparent'
              } ${selectedFrame === frame.id ? 'ring-2 ring-blue-500' : ''}`}
            >
              <button
                onClick={() => !isLocked && handleFrameSelect(frame.id as FrameId)}
                disabled={isLocked}
                className="w-full h-full p-4 relative group"
              >
                <div className={`w-full h-full rounded-full overflow-hidden ${frame.className}`}>
                  <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                    <User className="w-1/2 h-1/2 text-gray-400" />
                  </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-medium text-gray-900 dark:text-white bg-white/80 dark:bg-black/50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    {frame.name}
                  </span>
                </div>
                {isLocked && (
                  <div className="absolute top-2 right-2">
                    {isPremiumLocked ? (
                      <div className="flex items-center gap-1 bg-yellow-400 text-black text-xs font-medium px-2 py-1 rounded-full">
                        <Crown className="w-3 h-3" />
                        <span>Premium</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-gray-500 text-white text-xs font-medium px-2 py-1 rounded-full">
                        <Lock className="w-3 h-3" />
                        <span>Tag</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderBannerContent = () => {
    // Get default banner first
    const defaultBanner = banners.default;
    // Get all other banners
    const otherBanners = Object.values(banners).filter(banner => banner.id !== 'default');

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Default banner always first */}
        <div
          key={defaultBanner.id}
          className={`relative rounded-xl overflow-hidden ${selectedBanner === defaultBanner.id ? 'ring-4 ring-blue-500 shadow-lg shadow-blue-500/50' : ''}`}
        >
          <button
            onClick={() => handleBannerSelect(defaultBanner.id as BannerId)}
            className="w-full h-full relative group transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 rounded-xl p-6 h-32 w-full flex items-center justify-center">
              <h3 className="text-base font-bold text-gray-900 dark:text-white text-center line-clamp-2">
                {defaultBanner.name}
              </h3>
            </div>
            {selectedBanner === defaultBanner.id && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full z-10">
                <Check className="w-4 h-4" />
              </div>
            )}
          </button>
        </div>

        {/* Other banners - All same size */}
        {otherBanners.map((banner) => {
          const isPremiumLocked = banner.isPremium && !isPremium;
          const requiredTagProgress = banner.requiredTag ? (themeTagProgress[banner.requiredTag] || 0) : 0;
          const requiredTagMet = !banner.requiredTag || (requiredTagProgress >= (THEME_TAGS.find(t => t.id === banner.requiredTag)?.condition.count || 0));
          const isLocked = isPremiumLocked || !requiredTagMet;

          return (
            <div
              key={banner.id}
              className={`relative rounded-xl overflow-hidden ${
                isLocked ? 'opacity-60' : ''
              } ${selectedBanner === banner.id ? 'ring-4 ring-blue-500 shadow-lg shadow-blue-500/50' : ''}`}
            >
              <button
                onClick={() => !isLocked && handleBannerSelect(banner.id as BannerId)}
                disabled={isLocked}
                className="block w-full relative group transition-all duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className={`rounded-xl p-6 h-32 w-full flex items-center justify-center ${banner.className}`}>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white z-10 relative text-center line-clamp-2 w-full px-8">
                    {banner.name}
                  </h3>
                  {isLocked && (
                    <div className="absolute top-2 right-2 z-10">
                      {isPremiumLocked ? (
                        <div className="flex items-center gap-1.5 bg-yellow-400 text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                          <Crown className="w-4 h-4" />
                          <span>Premium</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-gray-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                          <Lock className="w-4 h-4" />
                          <span>Tag</span>
                        </div>
                      )}
                    </div>
                  )}
                  {!isLocked && selectedBanner === banner.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full z-10">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  const renderTagContent = (category: TagCategory) => {
    switch (category) {
      case 'basic':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Progress: {ratedMoviesCount} movies rated
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROGRESSION_TAGS.map((tag) => {
                const progress = tag.condition
                  ? basicTagProgress[tag.name] || 0
                  : ratedMoviesCount;
                const isUnlocked = progress >= tag.minMovies;
                const progressPercentage = tag.maxMovies 
                  ? Math.min(100, (progress - tag.minMovies) / (tag.maxMovies - tag.minMovies) * 100)
                  : progress >= tag.minMovies ? 100 : (progress / tag.minMovies) * 100;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative group rounded-lg border ${
                      isUnlocked
                        ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                    } p-4 transition-all duration-200 ${
                      isUnlocked ? 'hover:border-green-300 dark:hover:border-green-700' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${
                            isUnlocked
                              ? 'text-green-700 dark:text-green-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}>
                            {progress}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            /{tag.minMovies}
                          </span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'basic')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            getCategoryButtonStyle(isActive, 'basic')
                          }`}
                        >
                          {isActive ? (
                            <span className="flex items-center">
                              <Check className="w-4 h-4 mr-1" />
                              Active
                            </span>
                          ) : savingTag ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Use'
                          )}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-green-500 dark:bg-green-400'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'theme':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {THEME_TAGS.map((tag) => {
              const progress = themeTagProgress[tag.id] || 0;
              const isUnlocked = progress >= tag.condition.count;
              const isActive = activeTag?.name === tag.name;

              return (
                <div
                  key={tag.id}
                  className={`relative group rounded-lg border ${
                    isUnlocked
                      ? 'border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/10'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                  } p-4 transition-all duration-200 ${
                    isUnlocked ? 'hover:border-purple-300 dark:hover:border-purple-700' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{tag.emoji}</span>
                        <span className={`text-sm font-medium ${
                          isUnlocked
                            ? 'text-purple-700 dark:text-purple-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {tag.name}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {tag.requirement}
                      </p>
                      <div className="mt-2 text-sm">
                        <span className={isUnlocked ? 'text-purple-600 dark:text-purple-400' : 'text-gray-500 dark:text-gray-400'}>
                          {progress}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">
                          /{tag.condition.count}
                        </span>
                      </div>
                    </div>
                    {!isUnlocked ? (
                      <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                    ) : (
                      <button
                        onClick={() => handleUseTag(tag, 'theme')}
                        disabled={savingTag}
                        className={`px-3 py-1 text-sm rounded-md transition-colors ${
                          getCategoryButtonStyle(isActive, 'theme')
                        }`}
                      >
                        {isActive ? (
                          <span className="flex items-center">
                            <Check className="w-4 h-4 mr-1" />
                            Active
                          </span>
                        ) : savingTag ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Use'
                        )}
                      </button>
                    )}
                  </div>
                  <div className="mt-3 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isUnlocked
                          ? 'bg-purple-500 dark:bg-purple-400'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      style={{ width: `${Math.min(100, (progress / tag.condition.count) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        );

      case 'community':
        return (
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Progress: {followersCount} followers
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {COMMUNITY_TAGS.map((tag) => {
                const isUnlocked = followersCount >= tag.minFollowers;
                const progress = tag.maxFollowers
                  ? Math.min(100, (followersCount - tag.minFollowers) / (tag.maxFollowers - tag.minFollowers) * 100)
                  : followersCount >= tag.minFollowers ? 100 : 0;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative group rounded-lg border ${
                      isUnlocked
                        ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
                    } p-4 transition-all duration-200 ${
                      isUnlocked ? 'hover:border-blue-300 dark:hover:border-blue-700' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${
                            isUnlocked
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}>
                            {followersCount}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            /{tag.maxFollowers || tag.minFollowers}+
                          </span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'community')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-md transition-colors ${
                            getCategoryButtonStyle(isActive, 'community')
                          }`}
                        >
                          {isActive ? (
                            <span className="flex items-center">
                              <Check className="w-4 h-4 mr-1" />
                              Active
                            </span>
                          ) : savingTag ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Use'
                          )}
                        </button>
                      )}
                    </div>
                    <div className="mt-3 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-blue-500 dark:bg-blue-400'
                            : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'oracle':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <div className="h-10 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 dark:text-gray-500">
              Oracle Whisperer
            </div>
            <div className="h-10 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 dark:text-gray-500">
              Prediction Master
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-4xl bg-white dark:bg-gray-800 rounded-xl shadow-xl transform transition-all">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Customize Profile
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
            <div className="flex space-x-4 border-b border-gray-200 dark:border-gray-700 mb-6">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center px-4 py-2 -mb-px text-sm font-medium transition-colors ${
                    activeTab === id
                      ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2 hidden sm:block" />
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-[400px]">
              {activeTab === 'frames' && renderFrameContent()}
              {activeTab === 'banners' && renderBannerContent()}
              {activeTab === 'tags' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-2">
                    {tagCategories.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        onClick={() => setActiveTagCategory(id)}
                        className={`flex items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          activeTagCategory === id
                            ? getTagColorClasses(id)
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Icon className="w-4 h-4 mr-2 hidden sm:block" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                      </div>
                    ) : (
                      renderTagContent(activeTagCategory)
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-4 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                if (onSave) onSave();
                onClose();
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomizeModal;