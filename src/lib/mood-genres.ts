export const MOOD_GENRE_MAPPING: Record<string, number[]> = {
  // Bem-estar - Adventure, Animation, Romance
  'Feel Good': [12, 16, 10749],
  'Bem-estar': [12, 16, 10749],

  // Preciso chorar - Drama
  'Need to Cry': [18],
  'Preciso chorar': [18],

  // Adrenalina - Action, War, Western
  'Adrenaline Rush': [28, 10752, 37],
  'Adrenalina': [28, 10752, 37],

  // Mente Expandida - Science Fiction, Thriller, Mystery, History, Documentary
  'Mind-Blowing': [878, 53, 9648, 36, 99],
  'Mente Expandida': [878, 53, 9648, 36, 99],

  // Muitas Risadas - Comedy
  'Laugh Out Loud': [35],
  'Muitas Risadas': [35],

  // Calmo e Tranquilo - Family, Fantasy
  'Slow and Calm': [10751, 14],
  'Calmo e Tranquilo': [10751, 14],

  // Romântico - Romance
  'Romantic': [10749],
  'Romântico': [10749],

  // Sombrio e Assustador - Horror, Thriller, Crime
  'Dark and Scary': [27, 53, 80],
  'Sombrio e Assustador': [27, 53, 80],

  // Família - Family, Animation, Adventure, TV Movie
  'Family Time': [10751, 16, 12, 10770],
  'Família': [10751, 16, 12, 10770],

  // Surpresa Aleatória - Todos os gêneros
  'Random Surprise': [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37],
  'Surpresa Aleatória': [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37]
};

export function getMoodGenres(mood: string): number[] {
  return MOOD_GENRE_MAPPING[mood] || MOOD_GENRE_MAPPING['Random Surprise'];
}

const SPECTRUM_NAMES_PT: Record<string, string> = {
  E: 'Emocional',
  I: 'Intelectual',
  C: 'Cultural',
  S: 'Sensorial',
  R: 'Recreativo',
};

const SPECTRUM_NAMES_EN: Record<string, string> = {
  E: 'Emotional',
  I: 'Intellectual',
  C: 'Cultural',
  S: 'Sensorial',
  R: 'Recreational',
};

export function getEssenceLabel(
  letter1: string | null | undefined,
  letter2: string | null | undefined,
  lang: 'pt' | 'en'
): string {
  const map = lang === 'pt' ? SPECTRUM_NAMES_PT : SPECTRUM_NAMES_EN;
  const a = (letter1 && map[letter1]) || '';
  const b = (letter2 && map[letter2]) || '';
  return [a, b].filter(Boolean).join(' ');
}
