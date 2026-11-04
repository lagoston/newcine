import type React from 'react';
import type { Movie } from '../../lib/tmdb';
import { withAlpha, type OracleId } from '../../lib/oracleTheme';
import type { MoodKey } from '../../lib/moods';
import type { PersonaEntry } from '../../lib/persona';
import type { PosterEffect, PosterRarity } from '../../lib/posterJackpot';

// Dados fixos da home de visitante (04/11/2026). Quem não tem conta não pode
// consultar o banco (as prateleiras, a persona e o catálogo do Poster Jackpot
// pedem login), então a página mostra o produto com exemplos REAIS copiados
// do banco nesta data — nada aqui é inventado:
//   • ORACLE_SHELF: títulos que estão mesmo nas prateleiras de cada oráculo
//     (recommendation_pools: card_type + mood_key) e os pôsteres do
//     movie_cache (poster_path_pt em português, poster_path em inglês);
//   • PERSONA_EXAMPLE: a personalidade MCR da tabela cine_personas;
//   • JACKPOT_FAN: os três pôsteres de Breaking Bad do catálogo
//     (poster_items 2, 1 e 3) — os mesmos da porta do Poster Jackpot.
// Se um destes títulos sair do banco, a página continua de pé (é só um
// exemplo), mas vale trocar por outro que ainda esteja lá.

export interface LandingTitle {
  id: number;
  type: 'movie' | 'tv';
  titlePt: string;
  titleEn: string;
  posterPt: string;
  posterEn: string;
  year: number;
  // a prateleira (humor) em que o título mora no corredor do oráculo
  mood: MoodKey;
  // nota do público no TMDB (movie_cache.vote_average em 04/11/2026)
  publicScore: number;
}

export const ORACLE_SHELF: Record<OracleId, LandingTitle[]> = {
  bogart: [
    { id: 157336, type: 'movie', titlePt: 'Interestelar', titleEn: 'Interstellar', posterPt: '/tR1XVa5bxgdh2bRw2u0DzrgkO2l.jpg', posterEn: '/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg', year: 2014, mood: 'adventures', publicScore: 8.5 },
    { id: 496243, type: 'movie', titlePt: 'Parasita', titleEn: 'Parasite', posterPt: '/bNGW8zYA91VqTZfV3jnKHPEKKvB.jpg', posterEn: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', year: 2019, mood: 'mind-blowing', publicScore: 8.5 },
    { id: 1018, type: 'movie', titlePt: 'Cidade dos Sonhos', titleEn: 'Mulholland Drive', posterPt: '/nLAE1zU4jLX3qxx4d87Nz7DsqQg.jpg', posterEn: '/x7A59t6ySylr1L7aubOQEA480vM.jpg', year: 2001, mood: 'drug-trip', publicScore: 7.8 },
  ],
  fincher: [
    { id: 103, type: 'movie', titlePt: 'Taxi Driver', titleEn: 'Taxi Driver', posterPt: '/hvJvOYRrF9xxvNzg2Jd9PYWu7c3.jpg', posterEn: '/ekstpH614fwDX8DUln1a2Opz0N8.jpg', year: 1976, mood: 'catharsis', publicScore: 8.1 },
    { id: 348, type: 'movie', titlePt: 'Alien', titleEn: 'Alien', posterPt: '/rFHzJrkO1kNIezb6rFog5oCJUEn.jpg', posterEn: '/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg', year: 1979, mood: 'dark-and-scary', publicScore: 8.2 },
    { id: 655, type: 'movie', titlePt: 'Paris, Texas', titleEn: 'Paris, Texas', posterPt: '/m9LAmYN699kB7zfDmtx2Nk4gYn9.jpg', posterEn: '/sP27Qm4THyRZyHjHYMfIDtJP6YE.jpg', year: 1984, mood: 'catharsis', publicScore: 8.1 },
  ],
  cypher: [
    { id: 1398, type: 'movie', titlePt: 'Stalker', titleEn: 'Stalker', posterPt: '/ftyrhQS0Kedc55ev4IgBlKSF0ez.jpg', posterEn: '/1qhOyf5C4s9ZdvY8d5JDx9DFMeT.jpg', year: 1979, mood: 'catharsis', publicScore: 8.1 },
    { id: 843, type: 'movie', titlePt: 'Amor à Flor da Pele', titleEn: 'In the Mood for Love', posterPt: '/yCKaf65zoySg2iJdsews4Rafl7C.jpg', posterEn: '/iYypPT4bhqXfq1b6EnmxvRt6b2Y.jpg', year: 2000, mood: 'romantic', publicScore: 8.1 },
    { id: 14337, type: 'movie', titlePt: 'Primer', titleEn: 'Primer', posterPt: '/xEoq2WmDzpzxhkHEsmOYOg6BPg6.jpg', posterEn: '/xEoq2WmDzpzxhkHEsmOYOg6BPg6.jpg', year: 2004, mood: 'mind-blowing', publicScore: 6.7 },
  ],
};

// O título da demonstração da nota prevista ("Como funciona", passo 2):
// Brilho Eterno, que mora em Mind-Blowing no corredor do Bogart. A nota e a
// chance de 10 do passo 2 são ilustrativas — a página marca como "Exemplo".
export const PREDICTION_EXAMPLE: LandingTitle & { predicted: number; chance10: number } = {
  id: 38,
  type: 'movie',
  titlePt: 'Brilho Eterno de uma Mente sem Lembranças',
  titleEn: 'Eternal Sunshine of the Spotless Mind',
  posterPt: '/zqbwK2ugTPauBQwzcNAM3PxVoww.jpg',
  posterEn: '/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg',
  year: 2004,
  mood: 'mind-blowing',
  publicScore: 8.1,
  predicted: 9,
  chance10: 0.41,
};

// A personalidade MCR (Mind-Blowing + Catarse + Romântico), copiada de
// cine_personas. As barras de força são de exemplo (cada pessoa tem as suas).
export const PERSONA_EXAMPLE: PersonaEntry = {
  code: 'MCR',
  sortOrder: 0,
  moodKeys: ['mind-blowing', 'catharsis', 'romantic'],
  titlePt: 'Apagador de Memórias',
  titleEn: 'Memory Eraser',
  characterPt: 'Joel Barish',
  characterEn: 'Joel Barish',
  filmTitlePt: 'Brilho Eterno de uma Mente sem Lembranças',
  filmTitleEn: 'Eternal Sunshine of the Spotless Mind',
  filmYear: 2004,
  tmdbId: 38,
  posterPath: '/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg',
  blurbPt: 'Homem tímido que decide apagar a ex da memória e tenta salvá-la no meio do processo.',
  blurbEn: 'A shy man who decides to erase his ex from his memory and tries to save her halfway through.',
  characterImagePath: '/744ybMaYRry1IQKoDakMc4GEU4L.jpg',
  characterImageFocus: '14% 50%',
  actorName: null,
  works: [],
};
export const PERSONA_EXAMPLE_STRENGTH: { mood: MoodKey; share: number }[] = [
  { mood: 'mind-blowing', share: 1 },
  { mood: 'catharsis', share: 0.74 },
  { mood: 'romantic', share: 0.58 },
];

// O leque do Poster Jackpot: Breaking Bad épico, raro e lendário (holográfico).
export const JACKPOT_FAN: { filePath: string; rarity: PosterRarity; effect: PosterEffect }[] = [
  { filePath: '/ucbjrMJJA40RCShpDJPDxwcPW8M.jpg', rarity: 'epic', effect: 'none' },
  { filePath: '/A6dblGBAZAgPICoO1rtP8Du7lPh.jpg', rarity: 'rare', effect: 'none' },
  { filePath: '/nNqVVwbNTxrOD5FP7GJvdj0AXPt.jpg', rarity: 'legendary', effect: 'holo' },
];

export const isPt = (language: string) => language.startsWith('pt');
export const titleName = (title: LandingTitle, language: string) => (isPt(language) ? title.titlePt : title.titleEn);
export const titlePoster = (title: LandingTitle, language: string) => (isPt(language) ? title.posterPt : title.posterEn);

// O mínimo para abrir o menu do título (MovieDetailsModal): a home busca o
// resto (getFullTitle) assim que o modal abre.
export const asMovie = (title: LandingTitle, language: string): Movie =>
  ({
    id: title.id,
    title: titleName(title, language),
    poster_path: titlePoster(title, language),
    overview: '',
    release_date: `${title.year}-01-01`,
    vote_average: title.publicScore,
    runtime: 0,
    genres: [],
    media_type: title.type,
  }) as Movie;

export const formatScore = (score: number, language: string) =>
  score.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Faixa de vidro das demonstrações (o mesmo vidro dos blocos do perfil, sem
// desfoque de fundo — ver glassPanel em lib/oracleTheme). Mora aqui, e não
// em LandingBits, para aquele arquivo exportar só componentes (o Fast
// Refresh do Vite pede isso).
export const demoPanel = (accent: string): React.CSSProperties => ({
  background: [
    `radial-gradient(120% 90% at 100% 0%, ${withAlpha(accent, 0.18)}, transparent 62%)`,
    'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012) 55%)',
    'rgba(28,20,51,0.56)',
  ].join(', '),
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px ${withAlpha(accent, 0.26)}, 0 18px 40px -26px rgba(0,0,0,0.7)`,
});
