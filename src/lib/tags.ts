// Fonte única de verdade para as definições de tags/conquistas do site.
// Usado por CustomizeModal.tsx (tela completa de tags, com progresso detalhado)
// e por HomeUserPanels.tsx (dica de "próxima tag" na tela inicial).
// Antes, esses dois arquivos tinham listas duplicadas e independentes — mudar um
// limiar exigia lembrar de editar nos dois lugares. Agora só existe aqui.

export interface ProgressionTag {
  name: string;
  emoji: string;
  minMovies: number;
  maxMovies?: number;
  description: string;
  descriptionPt: string;
  condition?: {
    type: 'rating' | 'genre' | 'director' | 'countries' | 'continents';
    value?: number | number[] | string;
  };
}

export interface ThemeTag {
  id: string;
  name: string;
  emoji: string;
  requirement: string;
  requirementPt: string;
  condition: {
    type: 'rating' | 'genre' | 'director' | 'franchise';
    count: number;
    value?: number | string | number[];
  };
}

export interface CommunityTag {
  name: string;
  emoji: string;
  minFollowers: number;
  maxFollowers?: number;
  description: string;
  descriptionPt: string;
}

export interface OracleTag {
  name: string;
  emoji: string;
  type: 'prediction' | 'recommendation';
  minCount: number;
  maxCount?: number;
  description: string;
  descriptionPt: string;
}

export const PROGRESSION_TAGS: ProgressionTag[] = [
  { name: 'Balcony Regular', emoji: '🎬', minMovies: 1, maxMovies: 19, description: '1 - 19 movies', descriptionPt: '1 - 19 filmes' },
  { name: 'Seat Warmer', emoji: '🪑', minMovies: 20, maxMovies: 49, description: '20 - 49 movies', descriptionPt: '20 - 49 filmes' },
  { name: 'Popcorn Pro', emoji: '🍿', minMovies: 50, maxMovies: 99, description: '50 - 99 movies', descriptionPt: '50 - 99 filmes' },
  { name: 'Reel Addict', emoji: '🎞️', minMovies: 100, maxMovies: 199, description: '100 - 199 movies', descriptionPt: '100 - 199 filmes' },
  { name: 'Cine Elite', emoji: '🏆', minMovies: 200, maxMovies: 499, description: '200 - 499 movies', descriptionPt: '200 - 499 filmes' },
  { name: 'Projectionist Supreme', emoji: '📽️', minMovies: 500, maxMovies: 999, description: '500 - 999 movies', descriptionPt: '500 - 999 filmes' },
  { name: 'Cinematic Guru', emoji: '🧙', minMovies: 1000, description: '1000+ movies', descriptionPt: '1000+ filmes' },
  {
    name: 'CineHater',
    emoji: '👎',
    minMovies: 20,
    description: '20 movies rated 0-2/10',
    descriptionPt: '20 filmes avaliados com 0-2/10',
    condition: { type: 'rating', value: [0, 1, 2] }
  },
  {
    name: 'Golden Reel',
    emoji: '🌟',
    minMovies: 20,
    description: '20 movies rated 10/10',
    descriptionPt: '20 filmes avaliados com 10/10',
    condition: { type: 'rating', value: 10 }
  },
  {
    name: 'Bloody Mary',
    emoji: '🩸',
    minMovies: 50,
    description: '50 Horror movies',
    descriptionPt: '50 filmes de Terror',
    condition: { type: 'genre', value: 'Horror' }
  },
  {
    name: 'Punchliner',
    emoji: '😂',
    minMovies: 50,
    description: '50 Comedy movies',
    descriptionPt: '50 filmes de Comédia',
    condition: { type: 'genre', value: 'Comedy' }
  },
  {
    name: 'Star Gazer',
    emoji: '🚀',
    minMovies: 50,
    description: '50 Sci-Fi movies',
    descriptionPt: '50 filmes de Ficção Científica',
    condition: { type: 'genre', value: 'Science Fiction' }
  },
  {
    name: 'Cine Cupid',
    emoji: '💕',
    minMovies: 50,
    description: '50 Romance movies',
    descriptionPt: '50 filmes de Romance',
    condition: { type: 'genre', value: 'Romance' }
  },
  {
    name: 'Truth Digger',
    emoji: '📹',
    minMovies: 50,
    description: '50 Documentary movies',
    descriptionPt: '50 Documentários',
    condition: { type: 'genre', value: 'Documentary' }
  },
  {
    name: "Director's Cut",
    emoji: '🎥',
    minMovies: 10,
    description: '10 movies from the same director',
    descriptionPt: '10 filmes do mesmo diretor',
    condition: { type: 'director' }
  },
  {
    name: 'Nowhere',
    emoji: '📍',
    minMovies: 30,
    description: '30 different countries',
    descriptionPt: '30 países diferentes',
    condition: { type: 'countries', value: 30 }
  },
  {
    name: 'World Tour',
    emoji: '🌎',
    minMovies: 5,
    description: 'Movies from all 5 continents',
    descriptionPt: 'Filmes dos 5 continentes',
    condition: { type: 'continents', value: 5 }
  }
];

export const THEME_TAGS: ThemeTag[] = [
  { id: 'mockingjay-victor', name: 'Mockingjay Victor', emoji: '🏹', requirement: 'All 5 Hunger Games movies', requirementPt: 'Todos os 5 filmes Jogos Vorazes', condition: { type: 'franchise', count: 5, value: 'Hunger Games' } },
  { id: 'lucky-player', name: 'Lucky Player', emoji: '🎲', requirement: 'Jumanji (1995) and Zathura (2005)', requirementPt: 'Jumanji (1995) e Zathura (2005)', condition: { type: 'franchise', count: 2, value: 'Jumanji-Zathura' } },
  { id: 'death-dodger', name: 'Death Dodger', emoji: '💀', requirement: 'All 5 Final Destination movies', requirementPt: 'Todos os 5 filmes Premonição', condition: { type: 'franchise', count: 5, value: 'Final Destination' } },
  { id: 'hogwarts-graduate', name: 'Hogwarts Graduate', emoji: '🧙‍♂️', requirement: 'All 8 Harry Potter movies', requirementPt: 'Todos os 8 filmes Harry Potter', condition: { type: 'franchise', count: 8, value: 'Harry Potter' } },
  { id: 'force-founder', name: 'Force Founder', emoji: '⚔️', requirement: 'Star Wars Original Trilogy (IV-V-VI)', requirementPt: 'Trilogia Original Star Wars (IV-V-VI)', condition: { type: 'franchise', count: 3, value: 'Star Wars Original' } },
  { id: 'don-of-cinema', name: 'Don of Cinema', emoji: '🎩', requirement: 'The Godfather Trilogy (I-II-III)', requirementPt: 'Trilogia O Poderoso Chefão (I-II-III)', condition: { type: 'franchise', count: 3, value: 'The Godfather' } },
  { id: 'trap-builder', name: 'Trap Builder', emoji: '🏠', requirement: 'Home Alone 1 & 2', requirementPt: 'Esqueceram de Mim 1 & 2', condition: { type: 'franchise', count: 2, value: 'Home Alone' } },
  { id: 'red-pill-adept', name: 'Red-Pill Adept', emoji: '💊', requirement: 'The Matrix Trilogy', requirementPt: 'Trilogia Matrix', condition: { type: 'franchise', count: 3, value: 'The Matrix' } },
  { id: 'flux-capacitor-fan', name: 'Flux-Capacitor Fan', emoji: '⚡', requirement: 'Back to the Future Trilogy', requirementPt: 'Trilogia De Volta para o Futuro', condition: { type: 'franchise', count: 3, value: 'Back to the Future' } },
  { id: 'ring-expert', name: 'Ring Expert', emoji: '💍', requirement: 'LOTR Extended Trilogy', requirementPt: 'Trilogia O Senhor dos Anéis (versão estendida)', condition: { type: 'franchise', count: 3, value: 'The Lord of the Rings' } },
  { id: 'toy-collector', name: 'Toy Collector', emoji: '🧸', requirement: 'All 4 Toy Story movies', requirementPt: 'Todos os 4 filmes Toy Story', condition: { type: 'franchise', count: 4, value: 'Toy Story' } },
  { id: 'whip-crack-scholar', name: 'Whip-Crack Scholar', emoji: '🤠', requirement: 'Indiana Jones Quadrilogy', requirementPt: 'Quadrilogia Indiana Jones', condition: { type: 'franchise', count: 4, value: 'Indiana Jones' } },
  { id: 'sailor', name: 'Sailor', emoji: '🏴‍☠️', requirement: 'All 5 Pirates of the Caribbean movies', requirementPt: 'Todos os 5 filmes Piratas do Caribe', condition: { type: 'franchise', count: 5, value: 'Pirates' } },
  { id: 'senior-mechanic', name: 'Senior Mechanic', emoji: '🏎️', requirement: 'All 10 Fast & Furious main saga movies', requirementPt: 'Todos os 10 filmes principais de Velozes e Furiosos', condition: { type: 'franchise', count: 10, value: 'Fast Saga' } },
  { id: 'cybertron-sentinel', name: 'Cybertron Sentinel', emoji: '🤖', requirement: 'All 7 live-action Transformers movies', requirementPt: 'Todos os 7 filmes live-action Transformers', condition: { type: 'franchise', count: 7, value: 'Transformers' } },
  { id: 'swamp-royalty', name: 'Swamp Royalty', emoji: '👹', requirement: 'All 4 Shrek movies', requirementPt: 'Todos os 4 filmes Shrek', condition: { type: 'franchise', count: 4, value: 'Shrek' } },
  { id: 'dino-tamer', name: 'Dino Tamer', emoji: '🦖', requirement: 'All 6 Jurassic Park/World movies', requirementPt: 'Todos os 6 filmes Jurassic Park/World', condition: { type: 'franchise', count: 6, value: 'Jurassic' } },
  { id: 'banana-boss', name: 'Banana Boss', emoji: '🍌', requirement: 'All 5 Despicable Me/Minions movies', requirementPt: 'Todos os 5 filmes Meu Malvado Favorito/Minions', condition: { type: 'franchise', count: 5, value: 'Minions' } },
  { id: 'baba-yaga', name: 'Baba Yaga', emoji: '🔫', requirement: 'John Wick Saga', requirementPt: 'Saga John Wick', condition: { type: 'franchise', count: 4, value: 'John Wick' } },
  { id: 'casual-drinker', name: 'Casual Drinker', emoji: '🍺', requirement: 'The Hangover Trilogy', requirementPt: 'Trilogia Se Beber Não Case', condition: { type: 'franchise', count: 3, value: 'Hangover' } },
  { id: 'sweetie-pie', name: 'Sweetie Pie', emoji: '🥧', requirement: 'American Pie (original four)', requirementPt: 'American Pie (os quatro originais)', condition: { type: 'franchise', count: 4, value: 'American Pie' } },
  { id: 'visceral-gamer', name: 'Visceral Gamer', emoji: '🎮', requirement: 'Saw Franchise', requirementPt: 'Franquia Jogos Mortais', condition: { type: 'franchise', count: 10, value: 'Saw' } },
  { id: 'nuts', name: 'Nuts', emoji: '🐿️', requirement: 'Ice Age Saga', requirementPt: 'Saga A Era do Gelo', condition: { type: 'franchise', count: 6, value: 'Ice Age' } },
  { id: 'dark-spirit', name: 'Dark Spirit', emoji: '🦇', requirement: 'The Dark Knight Trilogy', requirementPt: 'Trilogia Batman: O Cavaleiro das Trevas', condition: { type: 'franchise', count: 3, value: 'Dark Knight' } },
  { id: 'infinity-gauntlet', name: 'Infinity Gauntlet', emoji: '🧤', requirement: 'All 4 Avengers movies (2012-2019)', requirementPt: 'Todos os 4 filmes Vingadores (2012-2019)', condition: { type: 'franchise', count: 4, value: [24428, 299536, 99861, 299534] } },
  { id: 'sharp-canine', name: 'Sharp Canine', emoji: '🧛', requirement: 'Twilight Saga', requirementPt: 'Saga Crepúsculo', condition: { type: 'franchise', count: 5, value: 'Twilight' } },
  { id: 'primal-essence', name: 'Primal Essence', emoji: '🦍', requirement: 'Planet of the Apes (2011 reboot line)', requirementPt: 'Planeta dos Macacos (reboot de 2011)', condition: { type: 'franchise', count: 4, value: 'Apes Reboot' } }
];

export const COMMUNITY_TAGS: CommunityTag[] = [
  { name: 'Spotlight Spark', emoji: '✨', minFollowers: 1, maxFollowers: 9, description: '1 - 9 followers', descriptionPt: '1 - 9 seguidores' },
  { name: 'Rising Star', emoji: '⭐', minFollowers: 10, maxFollowers: 24, description: '10 - 24 followers', descriptionPt: '10 - 24 seguidores' },
  { name: 'Red-Carpet Regular', emoji: '🎭', minFollowers: 25, maxFollowers: 49, description: '25 - 49 followers', descriptionPt: '25 - 49 seguidores' },
  { name: 'Festival Favorite', emoji: '🎪', minFollowers: 50, maxFollowers: 99, description: '50 - 99 followers', descriptionPt: '50 - 99 seguidores' },
  { name: 'Blockbuster', emoji: '💥', minFollowers: 100, maxFollowers: 199, description: '100 - 199 followers', descriptionPt: '100 - 199 seguidores' },
  { name: 'Cult Legend', emoji: '👑', minFollowers: 200, description: '200+ followers', descriptionPt: '200+ seguidores' }
];

export const ORACLE_TAGS: OracleTag[] = [
  { name: 'Curious Seeker', emoji: '🔍', type: 'prediction', minCount: 10, maxCount: 24, description: '10 - 24 predictions', descriptionPt: '10 - 24 previsões' },
  { name: 'Pattern Hunter', emoji: '🎯', type: 'prediction', minCount: 25, maxCount: 49, description: '25 - 49 predictions', descriptionPt: '25 - 49 previsões' },
  { name: 'Mind Decoder', emoji: '🧠', type: 'prediction', minCount: 50, maxCount: 99, description: '50 - 99 predictions', descriptionPt: '50 - 99 previsões' },
  { name: 'Future Whisperer', emoji: '🔮', type: 'prediction', minCount: 100, maxCount: 199, description: '100 - 199 predictions', descriptionPt: '100 - 199 previsões' },
  { name: "Oracle's Chosen", emoji: '👁️', type: 'prediction', minCount: 200, maxCount: 499, description: '200 - 499 predictions', descriptionPt: '200 - 499 previsões' },
  { name: 'Fate Architect', emoji: '⚡', type: 'prediction', minCount: 500, maxCount: 999, description: '500 - 999 predictions', descriptionPt: '500 - 999 previsões' },
  { name: 'Timeline Overlord', emoji: '⏳', type: 'prediction', minCount: 1000, description: '1000+ predictions', descriptionPt: '1000+ previsões' },
  { name: 'Popcorn Taster', emoji: '🍿', type: 'recommendation', minCount: 10, maxCount: 24, description: '10 - 24 recommendations', descriptionPt: '10 - 24 recomendações' },
  { name: 'Hidden Gem Hunter', emoji: '💎', type: 'recommendation', minCount: 25, maxCount: 49, description: '25 - 49 recommendations', descriptionPt: '25 - 49 recomendações' },
  { name: 'Genre Explorer', emoji: '🗺️', type: 'recommendation', minCount: 50, maxCount: 99, description: '50 - 99 recommendations', descriptionPt: '50 - 99 recomendações' },
  { name: 'Taste Alchemist', emoji: '⚗️', type: 'recommendation', minCount: 100, maxCount: 199, description: '100 - 199 recommendations', descriptionPt: '100 - 199 recomendações' },
  { name: 'Recommendation Lord', emoji: '🏰', type: 'recommendation', minCount: 200, maxCount: 499, description: '200 - 499 recommendations', descriptionPt: '200 - 499 recomendações' },
  { name: 'Galaxy Curator', emoji: '🌌', type: 'recommendation', minCount: 500, maxCount: 999, description: '500 - 999 recommendations', descriptionPt: '500 - 999 recomendações' },
  { name: 'Multiverse Sommelier', emoji: '🍷', type: 'recommendation', minCount: 1000, description: '1000+ recommendations', descriptionPt: '1000+ recomendações' }
];

export const FRANCHISE_MOVIES = {
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