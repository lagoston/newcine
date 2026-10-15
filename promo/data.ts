// Dados inventados do comercial (perfis de demonstração, notas fictícias).
// Pôsteres e títulos são os do cache do site (TMDB).
import type { ConnectionDetail, ConnectionSide, ConnectionTitle } from '../src/lib/connection';
import type { UserPersona } from '../src/lib/persona';

export const ME_ID = '00000000-0000-4000-8000-000000000001';
export const EX_ID = '00000000-0000-4000-8000-000000000002';
export const LUCAS_ID = '00000000-0000-4000-8000-000000000003';

export const ME: ConnectionSide = { id: ME_ID, username: 'bia.cine', avatar_url: '/promo/narradora-avatar.jpg', avatar_frame: null, is_premium: false, persona_code: 'MAC' };
export const EX: ConnectionSide = { id: EX_ID, username: 'ex', avatar_url: '/avatar-sapo.webp', avatar_frame: null, is_premium: false, persona_code: 'ZRL' };
export const LUCAS: ConnectionSide = { id: LUCAS_ID, username: 'lucas', avatar_url: '/avatar-raposa.webp', avatar_frame: null, is_premium: false, persona_code: 'MAZ' };

type Film = { pt: string; en: string; p: string; ppt: string; b: string; y: number };
const F: Record<string, Film> = {
  interstellar: { pt: 'Interestelar', en: 'Interstellar', p: '/yQvGrMoipbRoddT0ZR8tPoR7NfX.jpg', ppt: '/tR1XVa5bxgdh2bRw2u0DzrgkO2l.jpg', b: '/8sNiAPPYU14PUepFNeSNGUTiHW.jpg', y: 2014 },
  lalaland: { pt: 'La La Land: Cantando Estações', en: 'La La Land', p: '/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg', ppt: '/AvMietG6xuobpSSdmVnKuTjv4bL.jpg', b: '/nlPCdZlHtRNcF6C9hzUH4ebmV1w.jpg', y: 2016 },
  furious7: { pt: 'Velozes & Furiosos 7', en: 'Furious 7', p: '/ktofZ9Htrjiy0P6LEowsDaxd3Ri.jpg', ppt: '/spydMyyD81HjGJVwZvjajkrWW1h.jpg', b: '/ehzI1mVcnHqB58NqPyQwpMqcVoz.jpg', y: 2015 },
  forrest: { pt: 'Forrest Gump: O Contador de Histórias', en: 'Forrest Gump', p: '/saHP97rTPS5eLmrLQEcANmKrsFl.jpg', ppt: '/d74WpIsH8379TIL4wUxDneRCYv2.jpg', b: '/66Kn4XWhkuPkJxOJyPEx4U2CUfN.jpg', y: 1994 },
  inception: { pt: 'A Origem', en: 'Inception', p: '/xlaY2zyzMfkhk0HSC5VUwzoZPU1.jpg', ppt: '/9e3Dz7aCANy5aRUQF745IlNloJ1.jpg', b: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', y: 2010 },
  eternal: { pt: 'Brilho Eterno de uma Mente sem Lembranças', en: 'Eternal Sunshine of the Spotless Mind', p: '/5MwkWH9tYHv3mV9OdYTMR5qreIz.jpg', ppt: '/zqbwK2ugTPauBQwzcNAM3PxVoww.jpg', b: '/95qi5TJMIBI5VzWHia88Pbrye7Z.jpg', y: 2004 },
  arrival: { pt: 'A Chegada', en: 'Arrival', p: '/pEzNVQfdzYDzVK0XqxERIw2x2se.jpg', ppt: '/3rDwbFpn6z5HJUgDjpfhEePx8VI.jpg', b: '/8MUZz7oPXQftFTslZpRP3CVMOoq.jpg', y: 2016 },
  her: { pt: 'Ela', en: 'Her', p: '/eCOtqtfvn7mxGl6nfmq4b1exJRc.jpg', ppt: '/yyDGhBY8RYXyXYADeFq1BDxpLkl.jpg', b: '/1YnZchmaGc8dchgRPDpR1KGrixA.jpg', y: 2013 },
};

const title = (id: number, key: keyof typeof F, me: number, other: number): ConnectionTitle => {
  const f = F[key];
  return { movie_id: id, media_type: 'movie', title_pt: f.pt, title_en: f.en, poster_path: f.p, poster_path_pt: f.ppt, backdrop_path: f.b, year: String(f.y), rating_me: me, rating_other: other };
};

export const EX_DETAIL: ConnectionDetail = {
  shared_count: 23,
  pct: 18,
  score: 0.18,
  confidence: 'high',
  loved_both: 1,
  hated_both: 0,
  clashes: 9,
  loves: [title(13, 'forrest', 8, 8)],
  hates: [],
  debates: [title(157336, 'interstellar', 10, 3), title(313369, 'lalaland', 9, 2), title(168259, 'furious7', 3, 10)],
  calibrate: [],
};

export const LUCAS_DETAIL: ConnectionDetail = {
  shared_count: 41,
  pct: 91,
  score: 0.91,
  confidence: 'high',
  loved_both: 14,
  hated_both: 3,
  clashes: 1,
  loves: [title(157336, 'interstellar', 10, 10), title(27205, 'inception', 9, 9), title(38, 'eternal', 10, 9), title(329865, 'arrival', 9, 9)],
  hates: [],
  debates: [title(152601, 'her', 9, 7)],
  calibrate: [],
};

// "Assistam juntos": o que a função match-movie devolveria (nenhum dos dois viu).
const watch = (id: number, t: string, poster: string, me: number, other: number) => ({
  id,
  title: t,
  poster_path: poster,
  overview: '',
  scores: [
    { userId: ME_ID, username: ME.username, score: me, wasRated: false },
    { userId: LUCAS_ID, username: LUCAS.username, score: other, wasRated: false },
  ],
  matchScore: (2 * me * other) / (me + other),
});

export const WATCH_MOVIES = [
  watch(693134, 'Duna: Parte Dois', '/VMy4UGsI2u3f4fALGeCqCdsQBb.jpg', 9.4, 9.2),
  watch(335984, 'Blade Runner 2049', '/49pANIZXRAdHUiWjjBv4vxPeqRC.jpg', 9.0, 9.1),
  watch(1124, 'O Grande Truque', '/4AUW2bGbQjWACUREckGJWXmyF0d.jpg', 8.9, 9.0),
  watch(146233, 'Os Suspeitos', '/30YtzPOimO7eG30r8K8rUkqTGNj.jpg', 8.6, 8.8),
  watch(244786, 'Whiplash: Em Busca da Perfeição', '/2msJb27jMeuA101ox4MuTQK4mDa.jpg', 8.8, 8.5),
  watch(1949, 'Zodíaco', '/jFmlV5vUzOt1PgJ82efOhNsWcWX.jpg', 8.3, 8.7),
];

const scores = (pairs: [string, number][]) => pairs.map(([mood_key, films]) => ({ mood_key, score: films * 8.2, films }));

const PERSONA_ROWS: Record<string, Record<string, unknown>> = {
  MAC: { code: 'MAC', sort_order: 14, mood_keys: ['mind-blowing', 'adventures', 'catharsis'], title_pt: 'Ouvinte das Estrelas', title_en: 'Listener of the Stars', character_pt: 'Ellie Arroway', character_en: 'Ellie Arroway', film_title_pt: 'Contato', film_title_en: 'Contact', film_year: 1997, tmdb_id: 686, poster_path: '/bCpMIywuNZeWt3i5UMLEIc0VSwM.jpg', blurb_pt: 'Radioastrônoma que capta uma mensagem vinda das estrelas e atravessa o cosmos atrás de uma resposta — e do pai.', blurb_en: '' },
  ZRL: { code: 'ZRL', sort_order: 82, mood_keys: ['adrenaline', 'romantic', 'laugh-out-loud'], title_pt: 'Marido Infiltrado', title_en: 'Undercover Husband', character_pt: 'John Smith', character_en: 'John Smith', film_title_pt: 'Sr. & Sra. Smith', film_title_en: 'Mr. & Mrs. Smith', film_year: 2005, tmdb_id: 787, poster_path: '/kjD700RtyhveN3ZbOnSvUSne0Qj.jpg', blurb_pt: 'Matador de aluguel que descobre que a esposa trabalha para o lado rival, e que o casamento é a missão mais perigosa.', blurb_en: '' },
  MAZ: { code: 'MAZ', sort_order: 15, mood_keys: ['mind-blowing', 'adventures', 'adrenaline'], title_pt: 'Escolhido do Código', title_en: 'Chosen One of the Code', character_pt: 'Neo', character_en: 'Neo', film_title_pt: 'Matrix', film_title_en: 'The Matrix', film_year: 1999, tmdb_id: 603, poster_path: '/dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg', blurb_pt: 'Hacker que descobre que o mundo é uma simulação — e que talvez seja o único capaz de libertá-lo.', blurb_en: '' },
};

// O que a RPC get_user_persona devolveria.
export const PERSONA_RPC: Record<string, Record<string, unknown>> = {
  [ME_ID]: {
    code: 'MAC', counted: 132, threshold: 10, persona: PERSONA_ROWS.MAC,
    scores: scores([['mind-blowing', 34], ['adventures', 27], ['catharsis', 22], ['romantic', 14], ['dark-and-scary', 11], ['drug-trip', 9], ['adrenaline', 7], ['laugh-out-loud', 5], ['family-time', 3]]),
  },
  [EX_ID]: {
    code: 'ZRL', counted: 64, threshold: 10, persona: PERSONA_ROWS.ZRL,
    scores: scores([['adrenaline', 26], ['romantic', 15], ['laugh-out-loud', 12], ['adventures', 6], ['family-time', 3], ['dark-and-scary', 1], ['mind-blowing', 1], ['catharsis', 0], ['drug-trip', 0]]),
  },
  [LUCAS_ID]: {
    code: 'MAZ', counted: 118, threshold: 10, persona: PERSONA_ROWS.MAZ,
    scores: scores([['mind-blowing', 31], ['adventures', 25], ['adrenaline', 19], ['catharsis', 17], ['dark-and-scary', 10], ['romantic', 8], ['drug-trip', 6], ['laugh-out-loud', 4], ['family-time', 2]]),
  },
};

export const PROFILE_ROWS: Record<string, Record<string, unknown>> = {
  [ME_ID]: { id: ME_ID, username: ME.username, avatar_url: ME.avatar_url, avatar_frame: null, plan_type: 'free', lifetime_premium: false, personalidade_completa: 'MAC' },
};

export const PRELOAD_IMAGES = [
  ...Object.values(F).flatMap((f) => [`https://image.tmdb.org/t/p/w342${f.ppt}`, `https://image.tmdb.org/t/p/w342${f.p}`, `https://image.tmdb.org/t/p/w780${f.b}`, `https://image.tmdb.org/t/p/w185${f.ppt}`]),
  ...WATCH_MOVIES.flatMap((m) => [`https://image.tmdb.org/t/p/w342${m.poster_path}`, `https://image.tmdb.org/t/p/w500${m.poster_path}`, `https://image.tmdb.org/t/p/w185${m.poster_path}`]),
  ...Object.values(PERSONA_ROWS).flatMap((p) => [`https://image.tmdb.org/t/p/w342${p.poster_path}`, `https://image.tmdb.org/t/p/w185${p.poster_path}`]),
  ME.avatar_url as string,
  EX.avatar_url as string,
  LUCAS.avatar_url as string,
];
