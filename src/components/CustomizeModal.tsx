import React, { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Tag, Layout, Crown, Star, BrainCircuit, Users, Lock, Loader2, Check, Palette, User, Film } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { frames, FrameId } from '../lib/frames';
import { banners, BannerId } from '../lib/banners';
import { motion, AnimatePresence } from 'framer-motion';

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

type TabType = 'frames' | 'banners' | 'tags' | 'cards';
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

interface OracleTag {
  name: string;
  emoji: string;
  type: 'prediction' | 'recommendation';
  minCount: number;
  maxCount?: number;
  description: string;
}

interface ActiveTag {
  category: TagCategory;
  name: string;
  emoji: string;
}

export type CardStyle = 'default' | 'yugioh' | 'horror';

interface OracleCard {
  id: CardStyle;
  name: string;
  isPremium: boolean;
  requiredTag?: string;
  images: {
    bogart: string;
    fincher: string;
    cypher: string;
  };
}

const PROGRESSION_TAGS: ProgressionTag[] = [
  { name: 'Balcony Regular', emoji: '', minMovies: 1, maxMovies: 19, description: '1 - 19 movies' },
  { name: 'Seat Warmer', emoji: '', minMovies: 20, maxMovies: 49, description: '20 - 49 movies' },
  { name: 'Popcorn Pro', emoji: '', minMovies: 50, maxMovies: 99, description: '50 - 99 movies' },
  { name: 'Reel Addict', emoji: '', minMovies: 100, maxMovies: 199, description: '100 - 199 movies' },
  { name: 'Cine Elite', emoji: '', minMovies: 200, maxMovies: 499, description: '200 - 499 movies' },
  { name: 'Projectionist Supreme', emoji: '', minMovies: 500, maxMovies: 999, description: '500 - 999 movies' },
  { name: 'Cinematic Guru', emoji: '', minMovies: 1000, description: '1000+ movies' },
  {
    name: 'CineHater',
    emoji: '',
    minMovies: 20,
    description: '20 movies rated 0-2/10',
    condition: { type: 'rating', value: [0, 1, 2] }
  },
  {
    name: 'Golden Reel',
    emoji: '',
    minMovies: 20,
    description: '20 movies rated 10/10',
    condition: { type: 'rating', value: 10 }
  },
  {
    name: 'Bloody Mary',
    emoji: '',
    minMovies: 50,
    description: '50 Horror movies',
    condition: { type: 'genre', value: 'Horror' }
  },
  {
    name: 'Punchliner',
    emoji: '',
    minMovies: 50,
    description: '50 Comedy movies',
    condition: { type: 'genre', value: 'Comedy' }
  },
  {
    name: 'Star Gazer',
    emoji: '',
    minMovies: 50,
    description: '50 Sci-Fi movies',
    condition: { type: 'genre', value: 'Science Fiction' }
  },
  {
    name: 'Cine Cupid',
    emoji: '',
    minMovies: 50,
    description: '50 Romance movies',
    condition: { type: 'genre', value: 'Romance' }
  },
  {
    name: 'Truth Digger',
    emoji: '',
    minMovies: 50,
    description: '50 Documentary movies',
    condition: { type: 'genre', value: 'Documentary' }
  },
  {
    name: "Director's Cut",
    emoji: '',
    minMovies: 10,
    description: '10 movies from the same director',
    condition: { type: 'director' }
  }
];

const THEME_TAGS: ThemeTag[] = [
  {
    id: 'mockingjay-victor',
    name: 'Mockingjay Victor',
    emoji: '',
    requirement: 'All 5 Hunger Games movies',
    condition: { type: 'franchise', count: 5, value: 'Hunger Games' }
  },
  {
    id: 'lucky-player',
    name: 'Lucky Player',
    emoji: '',
    requirement: 'Jumanji (1995) and Zathura (2005)',
    condition: { type: 'franchise', count: 2, value: 'Jumanji-Zathura' }
  },
  {
    id: 'death-dodger',
    name: 'Death Dodger',
    emoji: '',
    requirement: 'All 5 Final Destination movies',
    condition: { type: 'franchise', count: 5, value: 'Final Destination' }
  },
  {
    id: 'hogwarts-graduate',
    name: 'Hogwarts Graduate',
    emoji: '',
    requirement: 'All 8 Harry Potter movies',
    condition: { type: 'franchise', count: 8, value: 'Harry Potter' }
  },
  {
    id: 'force-founder',
    name: 'Force Founder',
    emoji: '',
    requirement: 'Star Wars Original Trilogy (IV-V-VI)',
    condition: { type: 'franchise', count: 3, value: 'Star Wars Original' }
  },
  {
    id: 'don-of-cinema',
    name: 'Don of Cinema',
    emoji: '',
    requirement: 'The Godfather Trilogy (I-II-III)',
    condition: { type: 'franchise', count: 3, value: 'The Godfather' }
  },
  {
    id: 'trap-builder',
    name: 'Trap Builder',
    emoji: '',
    requirement: 'Home Alone 1 & 2',
    condition: { type: 'franchise', count: 2, value: 'Home Alone' }
  },
  {
    id: 'red-pill-adept',
    name: 'Red-Pill Adept',
    emoji: '',
    requirement: 'The Matrix Trilogy',
    condition: { type: 'franchise', count: 3, value: 'The Matrix' }
  },
  {
    id: 'flux-capacitor-fan',
    name: 'Flux-Capacitor Fan',
    emoji: '',
    requirement: 'Back to the Future Trilogy',
    condition: { type: 'franchise', count: 3, value: 'Back to the Future' }
  },
  {
    id: 'ring-expert',
    name: 'Ring Expert',
    emoji: '',
    requirement: 'LOTR Extended Trilogy',
    condition: { type: 'franchise', count: 3, value: 'The Lord of the Rings' }
  },
  {
    id: 'toy-collector',
    name: 'Toy Collector',
    emoji: '',
    requirement: 'All 4 Toy Story movies',
    condition: { type: 'franchise', count: 4, value: 'Toy Story' }
  },
  {
    id: 'whip-crack-scholar',
    name: 'Whip-Crack Scholar',
    emoji: '',
    requirement: 'Indiana Jones Quadrilogy',
    condition: { type: 'franchise', count: 4, value: 'Indiana Jones' }
  },
  {
    id: 'sailor',
    name: 'Sailor',
    emoji: '',
    requirement: 'All 5 Pirates of the Caribbean movies',
    condition: { type: 'franchise', count: 5, value: 'Pirates' }
  },
  {
    id: 'senior-mechanic',
    name: 'Senior Mechanic',
    emoji: '',
    requirement: 'All 10 Fast & Furious main saga movies',
    condition: { type: 'franchise', count: 10, value: 'Fast Saga' }
  },
  {
    id: 'cybertron-sentinel',
    name: 'Cybertron Sentinel',
    emoji: '',
    requirement: 'All 7 live-action Transformers movies',
    condition: { type: 'franchise', count: 7, value: 'Transformers' }
  },
  {
    id: 'swamp-royalty',
    name: 'Swamp Royalty',
    emoji: '',
    requirement: 'All 4 Shrek movies',
    condition: { type: 'franchise', count: 4, value: 'Shrek' }
  },
  {
    id: 'dino-tamer',
    name: 'Dino Tamer',
    emoji: '',
    requirement: 'All 6 Jurassic Park/World movies',
    condition: { type: 'franchise', count: 6, value: 'Jurassic' }
  },
  {
    id: 'banana-boss',
    name: 'Banana Boss',
    emoji: '',
    requirement: 'All 5 Despicable Me/Minions movies',
    condition: { type: 'franchise', count: 5, value: 'Minions' }
  },
  {
    id: 'baba-yaga',
    name: 'Baba Yaga',
    emoji: '',
    requirement: 'John Wick Saga',
    condition: { type: 'franchise', count: 4, value: 'John Wick' }
  },
  {
    id: 'casual-drinker',
    name: 'Casual Drinker',
    emoji: '',
    requirement: 'The Hangover Trilogy',
    condition: { type: 'franchise', count: 3, value: 'Hangover' }
  },
  {
    id: 'sweetie-pie',
    name: 'Sweetie Pie',
    emoji: '',
    requirement: 'American Pie (original four)',
    condition: { type: 'franchise', count: 4, value: 'American Pie' }
  },
  {
    id: 'visceral-gamer',
    name: 'Visceral Gamer',
    emoji: '',
    requirement: 'Saw Franchise',
    condition: { type: 'franchise', count: 10, value: 'Saw' }
  },
  {
    id: 'nuts',
    name: 'Nuts',
    emoji: '',
    requirement: 'Ice Age Saga',
    condition: { type: 'franchise', count: 6, value: 'Ice Age' }
  },
  {
    id: 'dark-spirit',
    name: 'Dark Spirit',
    emoji: '',
    requirement: 'The Dark Knight Trilogy',
    condition: { type: 'franchise', count: 3, value: 'Dark Knight' }
  },
  {
    id: 'infinity-gauntlet',
    name: 'Infinity Gauntlet',
    emoji: '',
    requirement: 'All 4 Avengers movies (2012-2019)',
    condition: { type: 'franchise', count: 4, value: [24428, 299536, 99861, 299534] }
  },
  {
    id: 'sharp-canine',
    name: 'Sharp Canine',
    emoji: '',
    requirement: 'Twilight Saga',
    condition: { type: 'franchise', count: 5, value: 'Twilight' }
  },
  {
    id: 'primal-essence',
    name: 'Primal Essence',
    emoji: '',
    requirement: 'Planet of the Apes (2011 reboot line)',
    condition: { type: 'franchise', count: 4, value: 'Apes Reboot' }
  }
];

const COMMUNITY_TAGS: CommunityTag[] = [
  { name: 'Spotlight Spark', emoji: '', minFollowers: 1, maxFollowers: 9, description: '1 - 9 followers' },
  { name: 'Rising Star', emoji: '', minFollowers: 10, maxFollowers: 24, description: '10 - 24 followers' },
  { name: 'Red-Carpet Regular', emoji: '', minFollowers: 25, maxFollowers: 49, description: '25 - 49 followers' },
  { name: 'Festival Favorite', emoji: '', minFollowers: 50, maxFollowers: 99, description: '50 - 99 followers' },
  { name: 'Blockbuster', emoji: '', minFollowers: 100, maxFollowers: 199, description: '100 - 199 followers' },
  { name: 'Cult Legend', emoji: '', minFollowers: 200, description: '200+ followers' }
];

const ORACLE_TAGS: OracleTag[] = [
  { name: 'Curious Seeker', emoji: '', type: 'prediction', minCount: 10, maxCount: 24, description: '10 - 24 predictions' },
  { name: 'Pattern Hunter', emoji: '', type: 'prediction', minCount: 25, maxCount: 49, description: '25 - 49 predictions' },
  { name: 'Mind Decoder', emoji: '', type: 'prediction', minCount: 50, maxCount: 99, description: '50 - 99 predictions' },
  { name: 'Future Whisperer', emoji: '', type: 'prediction', minCount: 100, maxCount: 199, description: '100 - 199 predictions' },
  { name: 'Oracle\'s Chosen', emoji: '', type: 'prediction', minCount: 200, maxCount: 499, description: '200 - 499 predictions' },
  { name: 'Fate Architect', emoji: '', type: 'prediction', minCount: 500, maxCount: 999, description: '500 - 999 predictions' },
  { name: 'Timeline Overlord', emoji: '', type: 'prediction', minCount: 1000, description: '1000+ predictions' },
  { name: 'Popcorn Taster', emoji: '', type: 'recommendation', minCount: 10, maxCount: 24, description: '10 - 24 recommendations' },
  { name: 'Hidden Gem Hunter', emoji: '', type: 'recommendation', minCount: 25, maxCount: 49, description: '25 - 49 recommendations' },
  { name: 'Genre Explorer', emoji: '', type: 'recommendation', minCount: 50, maxCount: 99, description: '50 - 99 recommendations' },
  { name: 'Taste Alchemist', emoji: '', type: 'recommendation', minCount: 100, maxCount: 199, description: '100 - 199 recommendations' },
  { name: 'Recommendation Lord', emoji: '', type: 'recommendation', minCount: 200, maxCount: 499, description: '200 - 499 recommendations' },
  { name: 'Galaxy Curator', emoji: '', type: 'recommendation', minCount: 500, maxCount: 999, description: '500 - 999 recommendations' },
  { name: 'Multiverse Sommelier', emoji: '', type: 'recommendation', minCount: 1000, description: '1000+ recommendations' }
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
  'Shrek': [808, 809, 810, 10192],
  'Jurassic': [329, 330, 331, 135397, 351286, 507086],
  'Minions': [39538, 93456, 324852, 211672, 438148],
  'John Wick': [245891, 324552, 458156, 603692],
  'Hangover': [18785, 45243, 109439],
  'American Pie': [2105, 2770, 8273, 71552],
  'Saw': [176, 215, 214, 663, 11917, 22804, 41439, 298250, 602734, 951491],
  'Ice Age': [425, 950, 8355, 57800, 278154, 774825],
  'Dark Knight': [272, 155, 49026],
  'Transformers': [424783, 1858, 91314, 667538, 335988, 8373, 38356],
  'Twilight': [122, 121, 240, 50619, 50620],
  'Apes Reboot': [61791, 119450, 281338, 653346]
} as const;

const ORACLE_CARDS: Record<CardStyle, OracleCard> = {
  default: {
    id: 'default',
    name: 'Default',
    isPremium: false,
    images: {
      bogart: '/assets/BOGART.png',
      fincher: '/assets/FINCHER.png',
      cypher: '/assets/CYPHER.png'
    }
  },
  yugioh: {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    isPremium: true,
    images: {
      bogart: '/assets/BOGART2.png',
      fincher: '/assets/FINCHER2.png',
      cypher: '/assets/CYPHER2.png'
    }
  },
  horror: {
    id: 'horror',
    name: 'Horror',
    isPremium: true,
    requiredTag: 'Bloody Mary',
    images: {
      bogart: '/assets/BOGART3.png',
      fincher: '/assets/FINCHER3.png',
      cypher: '/assets/CYPHER3.png'
    }
  }
};

const getTagColorClasses = (category: string) => {
  switch (category) {
    case 'basic':
      return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
    case 'theme':
      return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
    case 'community':
      return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
    case 'oracle':
      return 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400';
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
        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
        : 'bg-yellow-600 text-white hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600';
    case 'community':
      return isActive
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600';
    case 'oracle':
      return isActive
        ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
        : 'bg-pink-600 text-white hover:bg-pink-700 dark:bg-pink-500 dark:hover:bg-pink-600';
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
  const [oracleTagProgress, setOracleTagProgress] = useState<Record<string, number>>({});
  const [activeTag, setActiveTag] = useState<ActiveTag | null>(null);
  const [savingTag, setSavingTag] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<FrameId>('default');
  const [selectedBanner, setSelectedBanner] = useState<BannerId>('default');
  const [selectedCard, setSelectedCard] = useState<CardStyle>('default');

  useEffect(() => {
    if (session?.user?.id && isOpen) {
      fetchProfile();
      fetchRatedMoviesCount();
      fetchThemeTagProgress();
      fetchBasicTagProgress();
      fetchOracleTagProgress();
      fetchActiveTag();
      fetchFollowersCount();
    }
  }, [session?.user?.id, isOpen]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_frame, banner, card_style')
        .eq('id', session?.user?.id)
        .single();

      if (error) throw error;
      if (data?.avatar_frame) {
        setSelectedFrame(data.avatar_frame as FrameId);
      }
      if (data?.banner) {
        setSelectedBanner(data.banner as BannerId);
      }
      if (data?.card_style) {
        setSelectedCard(data.card_style as CardStyle);
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

      const isCurrentlyActive = activeTag?.name === tag.name;
      const newTag = isCurrentlyActive ? null : { category, name: tag.name, emoji: tag.emoji };

      const { error } = await supabase
        .from('profiles')
        .update({ active_tag: newTag })
        .eq('id', session.user.id);

      if (error) throw error;

      setActiveTag(newTag);
      toast.success(isCurrentlyActive ? 'Tag removed' : 'Tag updated successfully');
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

  const handleCardSelect = async (cardStyle: CardStyle) => {
    if (!session?.user?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          card_style: cardStyle,
          updated_at: new Date().toISOString()
        })
        .eq('id', session.user.id);

      if (error) throw error;

      setSelectedCard(cardStyle);
      toast.success('Card style updated successfully');
    } catch (error) {
      console.error('Error updating card style:', error);
      toast.error('Failed to update card style');
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
        const ratingCounts = {
          lowRatings: userMovies.filter(m => m.rating <= 2).length,
          perfectRatings: userMovies.filter(m => m.rating === 10).length
        };

        progress['CineHater'] = ratingCounts.lowRatings;
        progress['Golden Reel'] = ratingCounts.perfectRatings;

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

        THEME_TAGS.forEach(tag => {
          if (tag.condition.type === 'franchise' && Array.isArray(tag.condition.value)) {
            const watchedCount = tag.condition.value.filter(id => ratedMovieIds.has(id)).length;
            progress[tag.id] = watchedCount;
          }
        });
      }

      setThemeTagProgress(progress);
    } catch (error) {
      console.error('Error fetching theme tag progress:', error);
    }
  };

  const fetchOracleTagProgress = async () => {
    if (!session?.user?.id) return;

    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('oracle_predictions_count, oracle_recommendations_count')
        .eq('id', session.user.id)
        .single();

      if (error) throw error;

      const progress: Record<string, number> = {};

      if (profileData) {
        const predictionsCount = profileData.oracle_predictions_count || 0;
        const recommendationsCount = profileData.oracle_recommendations_count || 0;

        ORACLE_TAGS.forEach(tag => {
          const count = tag.type === 'prediction' ? predictionsCount : recommendationsCount;
          progress[tag.name] = count;
        });
      }

      setOracleTagProgress(progress);
    } catch (error) {
      console.error('Error fetching oracle tag progress:', error);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'frames', label: 'Avatars', icon: ImageIcon },
    { id: 'banners', label: 'Banners', icon: Layout },
    { id: 'tags', label: 'Tags', icon: Tag },
    { id: 'cards', label: 'Cards', icon: Film }
  ] as const;

  const tagCategories = [
    { id: 'basic', label: 'Basic', icon: Tag },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'community', label: 'Community', icon: Users },
    { id: 'oracle', label: 'Oracle', icon: BrainCircuit }
  ] as const;

  const renderFrameContent = () => {
    const defaultFrame = frames.default;
    const otherFrames = Object.values(frames).filter(frame => frame.id !== 'default');

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        <motion.div
          key={defaultFrame.id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className={`relative aspect-square rounded-2xl overflow-hidden ${selectedFrame === defaultFrame.id ? 'ring-4 ring-blue-500 shadow-lg shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
        >
          <button
            onClick={() => handleFrameSelect(defaultFrame.id as FrameId)}
            className="w-full h-full p-4 relative group bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-300"
          >
            <div className={`w-full h-full rounded-full overflow-hidden ${defaultFrame.className} shadow-xl`}>
              <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
                <User className="w-1/2 h-1/2 text-white" />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-2 flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                {defaultFrame.name}
              </span>
            </div>
            {selectedFrame === defaultFrame.id && (
              <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full">
                <Check className="w-4 h-4" />
              </div>
            )}
          </button>
        </motion.div>

        {otherFrames.map((frame, index) => {
          const isPremiumLocked = frame.isPremium && !isPremium;
          const requiredTagProgress = frame.requiredTag ? (themeTagProgress[frame.requiredTag] || 0) : 0;
          const requiredTagMet = !frame.requiredTag || (requiredTagProgress >= (THEME_TAGS.find(t => t.id === frame.requiredTag)?.condition.count || 0));
          const isLocked = isPremiumLocked || !requiredTagMet;

          return (
            <motion.div
              key={frame.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: (index + 1) * 0.03 }}
              className={`relative aspect-square rounded-2xl overflow-hidden ${
                isLocked ? 'opacity-60' : ''
              } ${selectedFrame === frame.id ? 'ring-4 ring-blue-500 shadow-lg shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
            >
              <button
                onClick={() => !isLocked && handleFrameSelect(frame.id as FrameId)}
                disabled={isLocked}
                className="w-full h-full p-4 relative group bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-700 transition-all duration-300 disabled:cursor-not-allowed disabled:hover:from-gray-100 disabled:hover:to-gray-200 dark:disabled:hover:from-gray-700 dark:disabled:hover:to-gray-800"
              >
                <div className={`w-full h-full rounded-full overflow-hidden ${frame.className} shadow-xl`}>
                  <div className="w-full h-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center">
                    <User className="w-1/2 h-1/2 text-white" />
                  </div>
                </div>
                <div className="absolute inset-x-0 bottom-2 flex items-center justify-center">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white/80 dark:bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                    {frame.name}
                  </span>
                </div>
                {isLocked && (
                  <div className="absolute top-2 right-2 z-10">
                    {isPremiumLocked ? (
                      <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                        <Crown className="w-3.5 h-3.5" />
                        <span>Premium</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-gray-500 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                        <Lock className="w-3.5 h-3.5" />
                        <span>Tag</span>
                      </div>
                    )}
                  </div>
                )}
                {!isLocked && selectedFrame === frame.id && (
                  <div className="absolute top-2 right-2 bg-blue-500 text-white p-1.5 rounded-full">
                    <Check className="w-4 h-4" />
                  </div>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderBannerContent = () => {
    const defaultBanner = banners.default;
    const otherBanners = Object.values(banners).filter(banner => banner.id !== 'default');

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <motion.div
          key={defaultBanner.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`relative rounded-2xl overflow-hidden ${selectedBanner === defaultBanner.id ? 'ring-4 ring-blue-500 shadow-xl shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
        >
          <button
            onClick={() => handleBannerSelect(defaultBanner.id as BannerId)}
            className="w-full h-full relative group transition-all duration-300 hover:scale-[1.02]"
          >
            <div className="bg-gradient-to-br from-gray-100 via-gray-200 to-gray-300 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 rounded-2xl p-8 h-36 w-full flex items-center justify-center">
              <h3 className="text-lg font-bold text-gray-800 dark:text-white text-center">
                {defaultBanner.name}
              </h3>
            </div>
            {selectedBanner === defaultBanner.id && (
              <div className="absolute top-3 right-3 bg-blue-500 text-white p-1.5 rounded-full z-10">
                <Check className="w-4 h-4" />
              </div>
            )}
          </button>
        </motion.div>

        {otherBanners.map((banner, index) => {
          const isPremiumLocked = banner.isPremium && !isPremium;
          const requiredTagProgress = banner.requiredTag ? (themeTagProgress[banner.requiredTag] || 0) : 0;
          const requiredTagMet = !banner.requiredTag || (requiredTagProgress >= (THEME_TAGS.find(t => t.id === banner.requiredTag)?.condition.count || 0));
          const isLocked = isPremiumLocked || !requiredTagMet;

          return (
            <motion.div
              key={banner.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: (index + 1) * 0.05 }}
              className={`relative rounded-2xl overflow-hidden ${
                isLocked ? 'opacity-60' : ''
              } ${selectedBanner === banner.id ? 'ring-4 ring-blue-500 shadow-xl shadow-blue-500/30' : 'ring-1 ring-white/20'}`}
            >
              <button
                onClick={() => !isLocked && handleBannerSelect(banner.id as BannerId)}
                disabled={isLocked}
                className="block w-full relative group transition-all duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <div className={`rounded-2xl p-8 h-36 w-full flex items-center justify-center ${banner.className}`}>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white z-10 relative text-center line-clamp-2 w-full px-8">
                    {banner.name}
                  </h3>
                  {isLocked && (
                    <div className="absolute top-3 right-3 z-10">
                      {isPremiumLocked ? (
                        <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
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
                    <div className="absolute top-3 right-3 bg-blue-500 text-white p-1.5 rounded-full z-10">
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>
    );
  };

  const renderCardContent = () => {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {Object.values(ORACLE_CARDS).map((card, index) => {
          const isPremiumLocked = card.isPremium && !isPremium;
          const requiredTagProgress = card.requiredTag ? (themeTagProgress[card.requiredTag] || 0) : 0;
          const isTagUnlocked = card.requiredTag ? requiredTagProgress >= 50 : true;
          const isLocked = isPremiumLocked || !isTagUnlocked;

          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
              className={`relative rounded-2xl overflow-hidden border-2 ${
                selectedCard === card.id
                  ? 'border-blue-500 shadow-xl shadow-blue-500/30'
                  : 'border-white/20 dark:border-gray-700/60'
              } ${isLocked ? 'opacity-60' : ''} bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl`}
            >
              <button
                onClick={() => !isLocked && handleCardSelect(card.id)}
                disabled={isLocked}
                className="w-full p-5 hover:bg-white/30 dark:hover:bg-gray-700/30 transition-all disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      {card.name}
                    </h3>
                    {isPremiumLocked ? (
                      <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-amber-500 text-black text-xs font-bold px-3 py-1.5 rounded-full">
                        <Crown className="w-4 h-4" />
                        <span>Premium</span>
                      </div>
                    ) : !isTagUnlocked ? (
                      <div className="flex items-center gap-1.5 bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-bold px-3 py-1.5 rounded-full">
                        <Lock className="w-4 h-4" />
                        <span>{card.requiredTag}</span>
                      </div>
                    ) : selectedCard === card.id ? (
                      <div className="bg-blue-500 text-white p-1.5 rounded-full">
                        <Check className="w-4 h-4" />
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
                      <img
                        src={card.images.bogart}
                        alt="Bogart"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
                      <img
                        src={card.images.fincher}
                        alt="Fincher"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
                      <img
                        src={card.images.cypher}
                        alt="Cypher"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                    Oracle Recommendation Cards
                  </p>
                </div>
              </button>
            </motion.div>
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
                    className={`relative group rounded-2xl border ${
                      isUnlocked
                        ? 'border-green-300/50 dark:border-green-700/50 bg-green-50/50 dark:bg-green-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200 backdrop-blur-sm ${
                      isUnlocked ? 'hover:border-green-400 dark:hover:border-green-600' : ''
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
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
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
                    <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-green-400 to-emerald-500'
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
                  className={`relative group rounded-2xl border ${
                    isUnlocked
                      ? 'border-yellow-300/50 dark:border-yellow-700/50 bg-yellow-50/50 dark:bg-yellow-900/20'
                      : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                  } p-4 transition-all duration-200 backdrop-blur-sm ${
                    isUnlocked ? 'hover:border-yellow-400 dark:hover:border-yellow-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{tag.emoji}</span>
                        <span className={`text-sm font-medium ${
                          isUnlocked
                            ? 'text-yellow-700 dark:text-yellow-400'
                            : 'text-gray-400 dark:text-gray-500'
                        }`}>
                          {tag.name}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {tag.requirement}
                      </p>
                      <div className="mt-2 text-sm">
                        <span className={isUnlocked ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}>
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
                        className={`px-3 py-1 text-sm rounded-lg transition-colors ${
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
                  <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isUnlocked
                          ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
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
                    className={`relative group rounded-2xl border ${
                      isUnlocked
                        ? 'border-blue-300/50 dark:border-blue-700/50 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200 backdrop-blur-sm ${
                      isUnlocked ? 'hover:border-blue-400 dark:hover:border-blue-600' : ''
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
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
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
                    <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-blue-400 to-cyan-500'
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
          <div className="space-y-6">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-4 space-y-1">
              <div>Predictions: {oracleTagProgress['Curious Seeker'] || 0}</div>
              <div>Recommendations: {oracleTagProgress['Popcorn Taster'] || 0}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ORACLE_TAGS.map((tag) => {
                const progress = oracleTagProgress[tag.name] || 0;
                const isUnlocked = progress >= tag.minCount;
                const progressPercentage = tag.maxCount
                  ? Math.min(100, (progress - tag.minCount) / (tag.maxCount - tag.minCount) * 100)
                  : progress >= tag.minCount ? 100 : (progress / tag.minCount) * 100;
                const isActive = activeTag?.name === tag.name;

                return (
                  <div
                    key={tag.name}
                    className={`relative group rounded-2xl border ${
                      isUnlocked
                        ? 'border-pink-300/50 dark:border-pink-700/50 bg-pink-50/50 dark:bg-pink-900/20'
                        : 'border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30'
                    } p-4 transition-all duration-200 backdrop-blur-sm ${
                      isUnlocked ? 'hover:border-pink-400 dark:hover:border-pink-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{tag.emoji}</span>
                          <span className={`text-sm font-medium ${
                            isUnlocked
                              ? 'text-pink-700 dark:text-pink-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}>
                            {tag.name}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          {tag.description}
                        </p>
                        <div className="mt-2 text-sm">
                          <span className={isUnlocked ? 'text-pink-600 dark:text-pink-400' : 'text-gray-500 dark:text-gray-400'}>
                            {progress}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            /{tag.maxCount || tag.minCount}+
                          </span>
                        </div>
                      </div>
                      {!isUnlocked ? (
                        <Lock className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <button
                          onClick={() => handleUseTag(tag, 'oracle')}
                          disabled={savingTag}
                          className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                            getCategoryButtonStyle(isActive, 'oracle')
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
                    <div className="mt-3 h-1.5 bg-gray-200/80 dark:bg-gray-700/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isUnlocked
                            ? 'bg-gradient-to-r from-pink-400 to-rose-500'
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
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
        <div className="flex min-h-full items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="relative w-full max-w-4xl bg-white/90 dark:bg-gray-800/90 rounded-2xl shadow-2xl transform transition-all backdrop-blur-xl border border-white/20 dark:border-gray-700/50"
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-cyan-600 dark:from-blue-400 dark:to-cyan-400">
                Customize Profile
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="flex space-x-2 border-b border-gray-200/50 dark:border-gray-700/50 mb-6 pb-2">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center px-4 py-2.5 text-sm font-medium rounded-xl transition-all ${
                      activeTab === id
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {label}
                  </button>
                ))}
              </div>

              <div className="min-h-[400px] max-h-[60vh] overflow-y-auto pr-2">
                {activeTab === 'frames' && renderFrameContent()}
                {activeTab === 'banners' && renderBannerContent()}
                {activeTab === 'cards' && renderCardContent()}
                {activeTab === 'tags' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap gap-2">
                      {tagCategories.map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          onClick={() => setActiveTagCategory(id)}
                          className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                            activeTagCategory === id
                              ? getTagColorClasses(id)
                              : 'bg-gray-100/80 text-gray-600 hover:bg-gray-200 dark:bg-gray-700/50 dark:text-gray-400 dark:hover:bg-gray-700'
                          }`}
                        >
                          <Icon className="w-4 h-4 mr-2" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="bg-gray-50/80 dark:bg-gray-700/30 rounded-2xl p-6 backdrop-blur-sm">
                      {loading ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                      ) : (
                        renderTagContent(activeTagCategory)
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-4 p-6 border-t border-gray-200/50 dark:border-gray-700/50">
              <button
                onClick={() => {
                  if (onSave) onSave();
                  onClose();
                }}
                className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Salvar
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
};

export default CustomizeModal;
