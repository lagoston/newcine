import type {
  AcervoItem,
  AcervoPage,
  BookEntry,
  BookPage,
  CardLineFacts,
  MediaFilter,
  MesaCard,
  MesaMe,
  MesaPayload,
  OracleSlot,
  PredLabel,
  Reason,
  ReactResult,
  Seat,
  TitleLite,
  VerdictCategory,
} from './types';
import type { MesaAction } from './api';

// O mock da Mesa (SPEC §8.7), 05/11/2026. Só existe em DEV: api.ts carrega
// este arquivo com import() dinâmico atrás de `import.meta.env.DEV`, então ele
// nunca entra no pacote de produção. Serve para construir e fotografar todas
// as telas antes de o WP-DB publicar as RPCs, com as MESMAS formas do contrato
// (types.ts). Cenários por ?mesaMock=<nome>: day, recon0, recon9, espelho4,
// passed, ask-chuva, colo, error. Extras de prévia: ?mesaDelay=<ms> (latência
// do mesa_get) e ?mesaNewDay=1 (o "dia" do payload é ontem, para a faixa da
// meia-noite).
//
// Os comentários selados daqui são de mentira, escritos só para a prévia (os
// de verdade vêm de title_oracle_comments). Os pôsteres usam caminhos
// /mesa-<slug>.jpg, que a prévia troca por um cartaz desenhado (o TMDB não
// abre no ambiente de construção).

type Comment = { pt: string; en: string };
interface MockTitle extends TitleLite {
  slug: string;
  comment: Comment;
  pub: number;
}

const P = (slug: string) => `/mesa-${slug}.jpg`;

function title(
  slug: string,
  tmdb_id: number,
  media_type: 'movie' | 'tv',
  title_pt: string,
  title_en: string,
  year: number,
  oracle: OracleSlot,
  mood: string,
  opts: { runtime?: number; ep?: number; seasons?: number; countries?: string[]; director?: string | null; votes?: number; pub?: number; comment: Comment }
): MockTitle {
  return {
    slug,
    tmdb_id,
    media_type,
    title_pt,
    title_en,
    year,
    runtime: opts.runtime ?? null,
    ep_runtime: opts.ep ?? null,
    seasons: opts.seasons ?? null,
    poster_path: P(slug),
    poster_path_pt: null,
    backdrop_path: null,
    oracle,
    mood,
    countries: opts.countries ?? ['US'],
    director: opts.director ?? null,
    vote_count: opts.votes ?? 5000,
    comment: opts.comment,
    pub: opts.pub ?? 7.8,
  };
}

// ---- O acervo de mentira, por oráculo ---------------------------------------

export const MOCK_TITLES: Record<string, MockTitle> = {};
const add = (t: MockTitle) => {
  MOCK_TITLES[t.slug] = t;
  return t;
};

const BOGART = [
  add(title('duna2', 693134, 'movie', 'Duna: Parte Dois', 'Dune: Part Two', 2024, 'bogart', 'adventures', { runtime: 167, director: 'Denis Villeneuve', votes: 6800, pub: 8.2, comment: { pt: 'Villeneuve me deixou grudado na poltrona. Areia até na pipoca.', en: 'Villeneuve glued me to my seat. Sand in the popcorn.' } })),
  add(title('whiplash', 244786, 'movie', 'Whiplash: Em Busca da Perfeição', 'Whiplash', 2014, 'bogart', 'catharsis', { runtime: 107, director: 'Damien Chazelle', votes: 15000, pub: 8.4, comment: { pt: 'Saí suando mais que o baterista. E olha que eu só segurava o balde de pipoca.', en: 'I left sweating more than the drummer. And I was only holding the popcorn.' } })),
  add(title('origem', 27205, 'movie', 'A Origem', 'Inception', 2010, 'bogart', 'mind-blowing', { runtime: 148, director: 'Christopher Nolan', votes: 36000, pub: 8.4, comment: { pt: 'Nolan me deu um nó no cérebro, e a trilha ainda ecoa no pântano.', en: 'Nolan tied my brain in a knot, and the score still echoes in the swamp.' } })),
  add(title('madmax', 76341, 'movie', 'Mad Max: Estrada da Fúria', 'Mad Max: Fury Road', 2015, 'bogart', 'adrenaline', { runtime: 120, director: 'George Miller', votes: 22000, pub: 7.6, comment: { pt: 'Duas horas de motor roncando. Saí com a poltrona tremendo.', en: 'Two hours of roaring engines. My recliner was still shaking.' } })),
  add(title('fleabag', 67070, 'tv', 'Fleabag', 'Fleabag', 2016, 'bogart', 'laugh-out-loud', { ep: 27, seasons: 2, countries: ['GB'], director: null, votes: 4200, pub: 8.3, comment: { pt: 'Ela olha pra câmera e eu juro que olhou pra mim. Doze episódios, maratona de uma noite.', en: 'She looks at the camera and I swear she looked at me. Twelve episodes, one-night binge.' } })),
  add(title('lalaland', 313369, 'movie', 'La La Land: Cantando Estações', 'La La Land', 2016, 'bogart', 'romantic', { runtime: 128, director: 'Damien Chazelle', votes: 17000, pub: 7.9, comment: { pt: 'Saí dançando do sofá. O vizinho de baixo não gostou.', en: 'I danced off the couch. The neighbor downstairs did not approve.' } })),
  add(title('divertida', 150540, 'movie', 'Divertida Mente', 'Inside Out', 2015, 'bogart', 'family-time', { runtime: 95, director: 'Pete Docter', votes: 21000, pub: 7.9, comment: { pt: 'Chorei no meio da pipoca e culpei a Tristeza. Funciona com todo mundo no sofá.', en: 'I cried into the popcorn and blamed Sadness. Works for the whole couch.' } })),
  add(title('interestelar', 157336, 'movie', 'Interestelar', 'Interstellar', 2014, 'bogart', 'adventures', { runtime: 169, director: 'Christopher Nolan', votes: 41462, pub: 8.4, comment: { pt: 'Nolan me mandou pro espaço e eu voltei mais velho que o meu sofá.', en: 'Nolan shot me into space and I came back older than my couch.' } })),
  add(title('cavaleiro', 155, 'movie', 'Batman: O Cavaleiro das Trevas', 'The Dark Knight', 2008, 'bogart', 'adrenaline', { runtime: 152, director: 'Christopher Nolan', votes: 36972, pub: 8.5, comment: { pt: 'Heath Ledger me deixou de mão suada e pipoca intacta.', en: 'Heath Ledger left me with sweaty palms and untouched popcorn.' } })),
];

const FINCHER = [
  add(title('iluminado', 694, 'movie', 'O Iluminado', 'The Shining', 1980, 'fincher', 'dark-and-scary', { runtime: 144, countries: ['GB', 'US'], director: 'Stanley Kubrick', votes: 19308, pub: 8.2, comment: { pt: 'Kubrick simétrico e gelado, Nicholson solto. Não assista sozinho de madrugada.', en: "Kubrick, symmetrical and icy; Nicholson unleashed. Don't watch it alone after midnight." } })),
  add(title('paristexas', 655, 'movie', 'Paris, Texas', 'Paris, Texas', 1984, 'fincher', 'catharsis', { runtime: 145, countries: ['DE', 'FR'], director: 'Wim Wenders', votes: 1900, pub: 8.0, comment: { pt: 'Wenders filma o deserto como quem filma um silêncio. Guardei a cena do vidro pra sempre.', en: 'Wenders films the desert like he is filming a silence. I kept the glass scene forever.' } })),
  add(title('amanhecer', 76, 'movie', 'Antes do Amanhecer', 'Before Sunrise', 1995, 'fincher', 'romantic', { runtime: 101, countries: ['US', 'AT'], director: 'Richard Linklater', votes: 4300, pub: 8.0, comment: { pt: 'Só conversa, e eu não piscava. Hawke e Delpy têm química que dispensa enredo.', en: "Just talking, and I didn't blink. Hawke and Delpy have chemistry that needs no plot." } })),
  add(title('bladerunner', 78, 'movie', 'Blade Runner: O Caçador de Androides', 'Blade Runner', 1982, 'fincher', 'mind-blowing', { runtime: 117, director: 'Ridley Scott', votes: 14000, pub: 7.9, comment: { pt: 'Chuva, neon e fumaça de charuto. Vi na estreia e ainda lembro do cheiro da sala.', en: 'Rain, neon and cigar smoke. Saw it opening night and still remember the smell of the room.' } })),
  add(title('alien', 348, 'movie', 'Alien: O Oitavo Passageiro', 'Alien', 1979, 'fincher', 'dark-and-scary', { runtime: 117, countries: ['GB', 'US'], director: 'Ridley Scott', votes: 15000, pub: 8.1, comment: { pt: 'Um corredor escuro e um gato. Scott me ensinou a ter medo de silêncio.', en: 'A dark corridor and a cat. Scott taught me to fear silence.' } })),
  add(title('twinpeaks', 1920, 'tv', 'Twin Peaks', 'Twin Peaks', 1990, 'fincher', 'drug-trip', { ep: 47, seasons: 2, director: null, votes: 2100, pub: 8.3, comment: { pt: 'Café preto, torta de cereja e Lynch me olhando do quarto vermelho. Assisti em VHS.', en: 'Black coffee, cherry pie and Lynch staring at me from the red room. Watched it on VHS.' } })),
  add(title('sonho', 278, 'movie', 'Um Sonho de Liberdade', 'The Shawshank Redemption', 1994, 'fincher', 'catharsis', { runtime: 142, director: 'Frank Darabont', votes: 28000, pub: 8.7, comment: { pt: 'Esperança cavada com uma colher. Choro toda vez, e já vi umas trinta.', en: "Hope dug out with a spoon. I cry every time, and I've seen it thirty times." } })),
  add(title('psicose', 539, 'movie', 'Psicose', 'Psycho', 1960, 'fincher', 'dark-and-scary', { runtime: 109, director: 'Alfred Hitchcock', votes: 10000, pub: 8.4, comment: { pt: 'Hitchcock me tirou o banho por um ano. Preto e branco que ainda corta.', en: 'Hitchcock took away my showers for a year. Black and white that still cuts.' } })),
];

const CYPHER = [
  add(title('flordapele', 843, 'movie', 'Amor à Flor da Pele', 'In the Mood for Love', 2000, 'cypher', 'romantic', { runtime: 99, countries: ['HK', 'FR'], director: 'Wong Kar-wai', votes: 2900, pub: 8.1, comment: { pt: 'Maggie Cheung de qipao e Tony Leung de olhar baixo. Me derreti em câmera lenta.', en: 'Maggie Cheung in a qipao, Tony Leung looking down. I melted in slow motion.' } })),
  add(title('possession', 21484, 'movie', 'Possessão', 'Possession', 1981, 'cypher', 'drug-trip', { runtime: 124, countries: ['FR', 'DE'], director: 'Andrzej Żuławski', votes: 1100, pub: 7.3, comment: { pt: 'Adjani num corredor de metrô fazendo o que ninguém mais teve coragem. Troquei de pele junto.', en: 'Adjani in a subway corridor doing what no one else dared. I shed my skin with her.' } })),
  add(title('bacurau', 500664, 'movie', 'Bacurau', 'Bacurau', 2019, 'cypher', 'adrenaline', { runtime: 131, countries: ['BR', 'FR'], director: 'Kleber Mendonça Filho', votes: 1600, pub: 7.3, comment: { pt: 'Um povoado que some do mapa e resolve morder de volta. Veneno brasileiro de primeira.', en: 'A village wiped off the map decides to bite back. Top-shelf Brazilian venom.' } })),
  add(title('perfectblue', 10494, 'movie', 'Perfect Blue', 'Perfect Blue', 1997, 'cypher', 'mind-blowing', { runtime: 81, countries: ['JP'], director: 'Satoshi Kon', votes: 2400, pub: 8.3, comment: { pt: 'Satoshi Kon embaralha realidade e espelho até eu duvidar de mim. Obra-prima.', en: 'Satoshi Kon shuffles reality and mirror until I doubt myself. Masterpiece.' } })),
  add(title('stalker', 1398, 'movie', 'Stalker', 'Stalker', 1979, 'cypher', 'catharsis', { runtime: 162, countries: ['SU'], director: 'Andrei Tarkovsky', votes: 1800, pub: 8.1, comment: { pt: 'Tarkovsky arrasta a câmera pela lama e eu rastejo atrás, feliz.', en: 'Tarkovsky drags the camera through the mud and I crawl after it, happy.' } })),
  add(title('dark', 70523, 'tv', 'Dark', 'Dark', 2017, 'cypher', 'mind-blowing', { ep: 55, seasons: 3, countries: ['DE'], director: null, votes: 6000, pub: 8.4, comment: { pt: 'Três temporadas de cavernas e relógios. Anotei a árvore genealógica na parede da toca.', en: 'Three seasons of caves and clocks. I drew the family tree on my den wall.' } })),
  add(title('yourname', 372058, 'movie', 'Your Name.', 'Your Name.', 2016, 'cypher', 'romantic', { runtime: 106, countries: ['JP'], director: 'Makoto Shinkai', votes: 13022, pub: 8.5, comment: { pt: 'Esse eu não precisei rastejar para achar. Todo mundo achou, e chorou junto.', en: "I didn't have to crawl to find this one. Everyone found it, and cried together." } })),
  add(title('samurais', 346, 'movie', 'Os Sete Samurais', 'Seven Samurai', 1954, 'cypher', 'adventures', { runtime: 207, countries: ['JP'], director: 'Akira Kurosawa', votes: 4416, pub: 8.5, comment: { pt: 'Três horas e meia de chuva e lâmina. Kurosawa é cópia rara que todo mundo jura que viu.', en: 'Three and a half hours of rain and steel. Kurosawa is the rare print everyone swears they saw.' } })),
];

// Reservas (cartas novas depois de "Já vi", segundas opiniões).
const RESERVE: Record<Seat, MockTitle[]> = {
  bogart: [BOGART[1], BOGART[2], BOGART[3], BOGART[4], BOGART[5], BOGART[6]],
  fincher: [FINCHER[1], FINCHER[3], FINCHER[4], FINCHER[5], FINCHER[7]],
  cypher: [CYPHER[1], CYPHER[2], CYPHER[3], CYPHER[4], CYPHER[5]],
  espelho: [BOGART[2], FINCHER[2]],
};

// ---- Fábricas -------------------------------------------------------------------

const NO_FACTS: CardLineFacts = {
  bw: false, long: false, series: false, hidden: false, bomb: false, public: null, p10hi: false, anime: false, br: false,
  sequel: false, huge: false, newmood: false, newcountry: false, decade: null, ressalva: false, watchlist: false,
};

let uid = 0;
const nextId = (seat: Seat) => `mock-${seat}-${(uid += 1).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function lite(t: MockTitle): TitleLite {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { slug, comment, pub, ...rest } = t;
  return rest;
}

function factsFor(t: MockTitle, extra: Partial<CardLineFacts> = {}): CardLineFacts {
  const decade = `${Math.floor((t.year ?? 2000) / 10) * 10}s`;
  return {
    ...NO_FACTS,
    long: (t.runtime ?? 0) >= 150,
    series: t.media_type === 'tv',
    hidden: t.vote_count < 2000,
    public: t.pub,
    huge: t.vote_count >= 15000,
    anime: t.countries.includes('JP') && t.slug === 'perfectblue',
    br: t.countries.includes('BR'),
    bw: (t.year ?? 2000) < 1961,
    decade,
    ...extra,
  };
}

function card(
  seat: Seat,
  t: MockTitle,
  o: {
    kind?: MesaCard['kind'];
    state?: MesaCard['state'];
    sealed?: boolean;
    pred?: number | null;
    label?: PredLabel;
    reason: Reason;
    evidence?: Reason[];
    gen?: number;
    second?: boolean;
    facts?: Partial<CardLineFacts>;
    inList?: boolean;
  }
): MesaCard {
  const label = o.label ?? 'number';
  return {
    id: nextId(seat),
    seat,
    kind: o.kind ?? 'main',
    gen: o.gen ?? 0,
    state: o.state ?? 'down',
    sealed: !!o.sealed,
    second_opinion: !!o.second,
    title: lite(t),
    pred: { value: label === 'hidden' ? null : o.pred ?? 8, label },
    comment: { pt: t.comment.pt, en: t.comment.en, ressalva: false },
    reason: o.reason,
    evidence: o.evidence ?? [],
    my: { rating: null, in_watchlist: !!o.inList },
    line_facts: factsFor(t, o.facts),
  };
}

// Os nomes dos fatos são os do banco ao vivo (anchor_tmdb_id, anchor_media_type).
const anchorId = (slug: string) => MOCK_TITLES[slug]?.tmdb_id ?? null;
const anchorDirector = (pt: string, en: string, rating: number, director: string, poster: string): Reason => ({
  type: 'anchor_director',
  facts: { anchor_title_pt: pt, anchor_title_en: en, anchor_poster: P(poster), anchor_rating: rating, director, anchor_tmdb_id: anchorId(poster), anchor_media_type: 'movie' },
});
const anchorKw = (pt: string, en: string, rating: number, themesPt: string[], themesEn: string[], poster: string): Reason => ({
  type: 'anchor_kw',
  facts: { anchor_title_pt: pt, anchor_title_en: en, anchor_poster: P(poster), anchor_rating: rating, themes_pt: themesPt, themes_en: themesEn, anchor_tmdb_id: anchorId(poster), anchor_media_type: 'movie' },
});
const moodAff = (mood: string, avg: number, n: number): Reason => ({ type: 'mood_affinity', facts: { mood, avg, n } });

add(title('chegada', 329865, 'movie', 'A Chegada', 'Arrival', 2016, 'bogart', 'mind-blowing', { runtime: 116, director: 'Denis Villeneuve', votes: 18000, comment: { pt: '', en: '' } }));
add(title('oldboy', 670, 'movie', 'Oldboy', 'Oldboy', 2003, 'cypher', 'dark-and-scary', { runtime: 120, countries: ['KR'], director: 'Park Chan-wook', votes: 9000, comment: { pt: 'Um corredor, um martelo e nenhum corte. Park Chan-wook morde fundo.', en: 'One corridor, one hammer, no cuts. Park Chan-wook bites deep.' } }));
add(title('cinemaparadiso', 11216, 'movie', 'Cinema Paradiso', 'Cinema Paradiso', 1988, 'fincher', 'catharsis', { runtime: 124, countries: ['IT'], director: 'Giuseppe Tornatore', votes: 4400, comment: { pt: 'Esse fala direto com quem nasceu entre rolos de filme. Choro toda vez, confesso.', en: 'This one speaks straight to anyone born among film reels. I cry every time, I confess.' } }));

// ---- Os cenários --------------------------------------------------------------------

const BRUNO_ME: MesaMe = {
  rated: 259,
  rated_movies: 251,
  pred_label: 'number',
  persona: { code: 'MAC', title_pt: 'Ouvinte das Estrelas', title_en: 'Listener of the Stars', character_pt: 'Ellie Arroway', character_en: 'Ellie Arroway', film_tmdb: 686 },
  persona_progress: { counted: 236, threshold: 10, moods_used: 9 },
  top_moods: ['mind-blowing', 'adventures', 'catharsis'],
  card_style: 'default',
};

const ASKS: MesaPayload['asks'] = {
  occasions: [
    { id: 'chuva', grp: 'who', sort: 1, media: 'movie', available: true },
    { id: 'amor', grp: 'who', sort: 2, media: null, available: true },
    { id: 'familia', grp: 'who', sort: 3, media: null, available: true },
    { id: 'galera', grp: 'who', sort: 4, media: null, available: true },
    { id: 'noventa', grp: 'time', sort: 5, media: 'movie', available: true },
    { id: 'episodio', grp: 'time', sort: 6, media: 'tv', available: true },
    { id: 'maratona', grp: 'time', sort: 7, media: 'tv', available: true },
    { id: 'chorar', grp: 'feel', sort: 8, media: null, available: true },
    { id: 'rir', grp: 'feel', sort: 9, media: null, available: true },
    { id: 'susto', grp: 'feel', sort: 10, media: null, available: true },
    { id: 'no', grp: 'feel', sort: 11, media: null, available: true },
    { id: 'colo', grp: 'feel', sort: 12, media: null, available: true },
  ],
  moods: ['mind-blowing', 'dark-and-scary', 'drug-trip', 'adventures', 'catharsis', 'adrenaline', 'romantic', 'family-time', 'laugh-out-loud'],
  season: null,
};

const BASE_FACTS: MesaPayload['facts'] = {
  weekday: 4,
  first_visit: false,
  returning_days: 1,
  yesterday: { flipped: 3, unflipped: 0, cypher_closed: false },
  mood_rising: 'catharsis',
  weak_mood: 'drug-trip',
  code_changed: false,
  verdicts_pending: 0,
  espelho4: false,
  reveal: false,
  live_event: null,
};

const brtDayNow = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const yesterdayOf = (day: string): string => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function basePayload(over: Partial<MesaPayload>): MesaPayload {
  const params = new URLSearchParams(window.location.search);
  const today = brtDayNow();
  return {
    v: 1,
    day: params.get('mesaNewDay') === '1' ? yesterdayOf(today) : today,
    draw_id: `mock-draw-${Math.random().toString(36).slice(2, 8)}`,
    seed: 1928374650,
    ask: null,
    media: 'all',
    mode: 'normal',
    host: 'bogart',
    me: BRUNO_ME,
    cards: [],
    passed: [],
    facts: BASE_FACTS,
    verdicts: [],
    asks: ASKS,
    book: { pages: 12, who_knows_best: 'fincher' },
    ...over,
  };
}

function dailyCards(): MesaCard[] {
  return [
    card('bogart', MOCK_TITLES.duna2, {
      pred: 9,
      reason: anchorDirector('A Chegada', 'Arrival', 10, 'Denis Villeneuve', 'chegada'),
      evidence: [moodAff('adventures', 8.2, 31)],
      facts: { p10hi: true, sequel: true, decade: '2020s' },
    }),
    card('fincher', MOCK_TITLES.iluminado, {
      pred: 9,
      reason: anchorKw('Psicose', 'Psycho', 10, ['isolamento', 'hotel'], ['isolation', 'hotel'], 'psicose'),
      evidence: [moodAff('dark-and-scary', 8.4, 12)],
    }),
    card('cypher', MOCK_TITLES.flordapele, {
      pred: 8,
      sealed: true,
      reason: { type: 'cypher_mood', facts: { mood: 'romantic' } },
      evidence: [{ type: 'cypher_country', facts: { country: 'HK' } }],
      facts: { newmood: true, newcountry: true },
    }),
  ];
}

function scenarioDaily(name: string): MesaPayload {
  switch (name) {
    case 'recon0': {
      const me: MesaMe = { rated: 0, rated_movies: 0, pred_label: 'hidden', persona: null, persona_progress: { counted: 0, threshold: 10, moods_used: 0 }, top_moods: [], card_style: 'default' };
      return basePayload({
        mode: 'recon',
        me,
        facts: { ...BASE_FACTS, first_visit: true, returning_days: null, yesterday: null, mood_rising: null, weak_mood: null },
        book: { pages: 0, who_knows_best: null },
        cards: [
          card('bogart', MOCK_TITLES.interestelar, { kind: 'recon', label: 'hidden', reason: { type: 'recognition', facts: { mood: 'adventures', votes: 41462 } } }),
          card('fincher', MOCK_TITLES.sonho, { kind: 'recon', label: 'hidden', reason: { type: 'recognition', facts: { mood: 'catharsis', votes: 28000 } } }),
          card('cypher', MOCK_TITLES.yourname, { kind: 'recon', label: 'hidden', sealed: true, reason: { type: 'recognition', facts: { mood: 'romantic', votes: 13022 } } }),
        ],
      });
    }
    case 'recon9': {
      const me: MesaMe = { rated: 9, rated_movies: 9, pred_label: 'guess', persona: null, persona_progress: { counted: 9, threshold: 10, moods_used: 4 }, top_moods: ['adventures', 'mind-blowing', 'catharsis'], card_style: 'yugioh' };
      return basePayload({
        mode: 'recon',
        me,
        facts: { ...BASE_FACTS, reveal: true, mood_rising: null },
        book: { pages: 2, who_knows_best: null },
        cards: [
          card('bogart', MOCK_TITLES.cavaleiro, { kind: 'recon', label: 'guess', pred: 8, reason: { type: 'recognition', facts: { mood: 'adrenaline', votes: 36972 } } }),
          card('fincher', MOCK_TITLES.alien, { kind: 'recon', label: 'guess', pred: 7, reason: { type: 'recognition', facts: { mood: 'dark-and-scary', votes: 15000 } } }),
          card('cypher', MOCK_TITLES.yourname, { kind: 'recon', label: 'guess', pred: 8, sealed: true, reason: { type: 'recognition', facts: { mood: 'romantic', votes: 13022 } } }),
          card('espelho', MOCK_TITLES.divertida, { kind: 'reveal', label: 'guess', pred: 8, reason: { type: 'reveal', facts: { missing: 1, mood: 'family-time' } } }),
        ],
      });
    }
    case 'espelho4':
      return basePayload({
        facts: { ...BASE_FACTS, espelho4: true },
        cards: [
          ...dailyCards(),
          card('espelho', MOCK_TITLES.cinemaparadiso, { kind: 'espelho4', pred: 9, reason: { type: 'espelho_best', facts: {} }, facts: { p10hi: true } }),
        ],
      });
    case 'passed':
      return basePayload({
        cards: dailyCards().filter((c) => c.seat !== 'fincher').map((c) => (c.seat === 'cypher' ? { ...c, sealed: false } : c)),
        passed: [{ seat: 'fincher', reason: 'empty' }],
      });
    default:
      return basePayload({
        cards: dailyCards(),
        facts: { ...BASE_FACTS, verdicts_pending: 1 },
        verdicts: [{ card_id: 'mock-verdict-oldboy', oracle: 'cypher', title_pt: 'Oldboy', title_en: 'Oldboy', rating: 9, category: 'over', shown_day: '2026-11-02', ask: null }],
      });
  }
}

// Perguntas: três cartas do acervo de mentira, por ocasião (estáveis por chave).
function askPayload(ask: string, scenario: string, media: MediaFilter, prev: MesaPayload): MesaPayload {
  const [kindRaw, id] = ask.split(':');
  const kind = kindRaw === 'occ' ? 'occasion' : kindRaw === 'mood' ? 'mood' : 'season';
  const occMedia = id === 'noventa' || id === 'chuva' ? 'movie' : id === 'episodio' || id === 'maratona' ? 'tv' : null;
  const allUp = scenario === 'ask-chuva';
  const pick = (list: MockTitle[], salt: number) => list[(id.length * 7 + salt) % list.length];
  let b = pick(BOGART.filter((t) => t.media_type === 'movie'), 1);
  let f = pick(FINCHER.filter((t) => t.media_type === 'movie'), 2);
  let c = pick(CYPHER.filter((t) => t.media_type === 'movie'), 3);
  if (id === 'chuva') {
    b = MOCK_TITLES.lalaland;
    f = MOCK_TITLES.amanhecer;
    c = MOCK_TITLES.stalker;
  }
  if (occMedia === 'tv') {
    b = MOCK_TITLES.fleabag;
    f = MOCK_TITLES.twinpeaks;
    c = MOCK_TITLES.dark;
  }
  const occReason = (t: MockTitle): Reason =>
    kind === 'mood'
      ? { type: 'mood_ask', facts: { mood: id } }
      : id === 'noventa'
        ? { type: 'occasion_runtime', facts: { minutes: t.runtime ?? 95 } }
        : id === 'episodio'
          ? { type: 'occasion_episode', facts: { minutes: t.ep_runtime ?? 27 } }
          : id === 'maratona'
            ? { type: 'occasion_binge', facts: { hours: 22, seasons: t.seasons ?? 2 } }
            : t.oracle === 'fincher'
              ? { type: 'occasion_comment', facts: { oracle: 'fincher' } }
              : { type: 'occasion_tone', facts: { occasion: id, themes_pt: ['melancolia', 'noite'], themes_en: ['melancholy', 'night'] } };
  const state = allUp ? 'up' : 'down';
  const cards: MesaCard[] = [
    card('bogart', b, { pred: 8, state, reason: occReason(b), evidence: [moodAff(b.mood, 8.1, 14)] }),
    card('fincher', f, { pred: 9, state, reason: occReason(f), evidence: [anchorKw('Cinema Paradiso', 'Cinema Paradiso', 10, ['memória'], ['memory'], 'cinemaparadiso')] }),
  ];
  const passed: MesaPayload['passed'] = [];
  if (id === 'colo') passed.push({ seat: 'cypher', reason: 'colo' });
  else cards.push(card('cypher', c, { pred: 7, state, sealed: !allUp, reason: occReason(c), evidence: [{ type: 'hidden', facts: { votes: c.vote_count } }], facts: { newmood: true } }));
  return {
    ...prev,
    draw_id: `mock-ask-${id}`,
    ask: { key: ask, kind, id, media: occMedia },
    media,
    host: 'fincher',
    mode: prev.mode,
    cards,
    passed,
    verdicts: [],
    facts: { ...prev.facts, espelho4: false, reveal: false },
  };
}

// ---- Estado do mock (como o banco: a tiragem fica gravada e os gestos mudam) -----

const draws = new Map<string, MesaPayload>();
const refusedOnce = new Set<string>(); // assentos (draw|seat) com a 2ª opinião usada
const reservesUsed = new Map<string, number>();
let verdictTurn = 0;
const VERDICT_ROTATION: VerdictCategory[] = ['exact', 'over', 'near', 'under', 'ten'];

const scenarioName = () => {
  const v = new URLSearchParams(window.location.search).get('mesaMock');
  return !v || v === '1' ? 'day' : v;
};
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export async function mockMesaGet(ask: string | null, media: MediaFilter): Promise<MesaPayload> {
  const scenario = scenarioName();
  const params = new URLSearchParams(window.location.search);
  await delay(Number(params.get('mesaDelay') ?? 450));
  if (scenario === 'error') {
    await delay(350);
    throw new Error('mock: mesa_get falhou');
  }
  // O cenário ask-chuva abre direto com a pergunta; colo idem (ocasião colo).
  const effectiveAsk = ask ?? (scenario === 'ask-chuva' && !draws.has('opened') ? 'occ:chuva' : scenario === 'colo' && !draws.has('opened') ? 'occ:colo' : null);
  draws.set('opened', basePayload({}));
  const key = `${scenario}|${effectiveAsk ?? 'daily'}|${media}`;
  let p = draws.get(key);
  if (!p) {
    const daily = draws.get(`${scenario}|daily|${media}`) ?? scenarioDaily(scenario);
    draws.set(`${scenario}|daily|${media}`, daily);
    p = effectiveAsk ? askPayload(effectiveAsk, scenario, media, daily) : daily;
    draws.set(key, p);
  }
  return clone(p);
}

function findCard(id: string): { draw: MesaPayload; idx: number } | null {
  for (const [k, d] of draws) {
    if (k === 'opened') continue;
    const idx = d.cards.findIndex((c) => c.id === id);
    if (idx >= 0) return { draw: d, idx };
  }
  return null;
}

function nextReserve(draw: MesaPayload, seat: Seat): MockTitle | null {
  const k = `${draw.draw_id}|${seat}`;
  const used = reservesUsed.get(k) ?? 0;
  const onTable = new Set(draw.cards.map((c) => c.title.tmdb_id));
  const list = RESERVE[seat].filter((t) => !onTable.has(t.tmdb_id));
  if (used >= list.length + 2) return null;
  reservesUsed.set(k, used + 1);
  return list[used % Math.max(1, list.length)] ?? null;
}

export async function mockMesaReact(cardId: string, action: MesaAction): Promise<ReactResult> {
  await delay(action === 'flip' ? 120 : 420);
  if (new URLSearchParams(window.location.search).get('mesaReactFail') === action) return { ok: false, error: 'bad_state' };
  const found = findCard(cardId);
  if (!found) return { ok: false, error: 'not_found' };
  const { draw, idx } = found;
  const c = draw.cards[idx];
  const seat = c.seat;
  if (action === 'flip') {
    if (seat === 'cypher' && c.sealed) {
      const others = draw.cards.filter((x) => x.seat === 'bogart' || x.seat === 'fincher');
      if (others.some((x) => x.state === 'down')) return { ok: false, error: 'sealed' };
    }
    if (c.state === 'down') c.state = 'up';
    c.sealed = false;
    // Virar Bogart e Fincher destrava a Cypher (o servidor recalcula `sealed`).
    const cy = draw.cards.find((x) => x.seat === 'cypher' && x.state === 'down');
    if (cy && draw.cards.filter((x) => x.seat === 'bogart' || x.seat === 'fincher').every((x) => x.state !== 'down')) cy.sealed = false;
    return { ok: true, card: clone(c) };
  }
  if (action === 'want') {
    c.state = 'want';
    c.my.in_watchlist = true;
    return { ok: true, card: clone(c) };
  }
  if (action === 'seen' || action === 'not_seen') {
    const rating = action === 'seen' ? 9 - (verdictTurn % 3) : null;
    c.state = action === 'seen' ? 'seen' : 'not_seen';
    if (rating !== null) c.my.rating = rating;
    c.my.in_watchlist = false;
    const t = nextReserve(draw, seat);
    let replacement: MesaCard | null = null;
    if (t) {
      replacement = card(seat, t, {
        kind: c.kind === 'recon' ? 'recon' : c.kind === 'main' ? 'main' : 'main',
        state: 'up',
        gen: c.gen + 1,
        pred: 8,
        label: c.pred.label,
        reason: c.kind === 'recon' ? { type: 'recognition', facts: { mood: t.mood, votes: t.vote_count } } : anchorKw('A Origem', 'Inception', 10, ['sonhos', 'memória'], ['dreams', 'memory'], 'origem'),
        evidence: c.kind === 'recon' ? [] : [moodAff(t.mood, 8.0, 9)],
      });
      if (seat === 'espelho') replacement = null; // a quarta carta não se repõe
    }
    const before = draw.cards.slice();
    draw.cards = before.map((x, i) => (i === idx ? (replacement ?? x) : x));
    if (!replacement) draw.cards = draw.cards.filter((x) => x.id !== c.id || seat !== 'espelho');
    let verdict: ReactResult['verdict'] = null;
    let persona: ReactResult['persona'] = draw.me.persona;
    let me: ReactResult['me'] | undefined;
    if (rating !== null) {
      verdict = { category: VERDICT_ROTATION[verdictTurn % VERDICT_ROTATION.length], rating };
      verdictTurn += 1;
      const counted = draw.me.persona_progress.counted + 1;
      draw.me = { ...draw.me, rated: draw.me.rated + 1, persona_progress: { ...draw.me.persona_progress, counted, moods_used: Math.max(draw.me.persona_progress.moods_used, counted >= 10 ? 5 : draw.me.persona_progress.moods_used) } };
      // recon9: a 10ª nota faz a Persona nascer (a revelação abre por cima).
      if (!draw.me.persona && counted >= 10) {
        persona = { code: 'MAF', title_pt: 'Explorador de Mundos', title_en: 'World Explorer', character_pt: 'Moana', character_en: 'Moana', film_tmdb: 277834 };
        draw.me = { ...draw.me, persona, pred_label: 'guess' };
      }
      me = { rated: draw.me.rated, pred_label: draw.me.pred_label, persona_progress: draw.me.persona_progress };
    }
    return { ok: true, card: clone(c), replacement: replacement ? clone(replacement) : null, pass: null, verdict, persona, me };
  }
  if (action === 'refuse') {
    c.state = 'refused';
    const k = `${draw.draw_id}|${seat}`;
    if (refusedOnce.has(k) || seat === 'espelho') {
      draw.cards = draw.cards.filter((x) => x.id !== c.id);
      const pass = { seat: seat as OracleSlot, reason: 'refused' as const };
      if (seat !== 'espelho') draw.passed = [...draw.passed, pass];
      return { ok: true, card: clone(c), replacement: null, pass: seat === 'espelho' ? null : pass };
    }
    refusedOnce.add(k);
    const t = nextReserve(draw, seat);
    if (!t) {
      draw.cards = draw.cards.filter((x) => x.id !== c.id);
      const pass = { seat: seat as OracleSlot, reason: 'empty' as const };
      draw.passed = [...draw.passed, pass];
      return { ok: true, card: clone(c), replacement: null, pass };
    }
    const replacement = card(seat, t, { state: 'up', gen: c.gen + 1, second: true, pred: 8, label: c.pred.label, reason: moodAff(t.mood, 7.9, 11), evidence: [] });
    draw.cards = draw.cards.map((x) => (x.id === c.id ? replacement : x));
    return { ok: true, card: clone(c), replacement: clone(replacement), pass: null };
  }
  return { ok: false, error: 'bad_action' };
}

export async function mockMesaAck(ids: string[]): Promise<number> {
  await delay(80);
  return ids.length;
}

// ---- O Livro (sem número previsto, como manda o SPEC §5.9) ----------------------

function bookEntry(t: MockTitle, seat: Seat, state: BookEntry['state'], ask: string | null, rating: number | null, verdict: VerdictCategory | null): BookEntry {
  return {
    card_id: `book-${t.slug}-${seat}`,
    seat,
    oracle: t.oracle,
    kind: seat === 'espelho' ? 'espelho4' : 'main',
    ask,
    title: { tmdb_id: t.tmdb_id, media_type: t.media_type, title_pt: t.title_pt, title_en: t.title_en, year: t.year, poster_path: t.poster_path, poster_path_pt: null },
    comment: { pt: t.comment.pt, en: t.comment.en },
    state,
    rating,
    verdict,
  };
}

export async function mockMesaBook(before: string | null): Promise<BookPage> {
  await delay(380);
  const scenario = scenarioName();
  if (scenario === 'recon0') return { who_knows_best: null, days: [], next_before: null };
  const today = brtDayNow();
  const d1 = yesterdayOf(today);
  const d2 = yesterdayOf(d1);
  const d3 = yesterdayOf(d2);
  if (before) {
    return {
      who_knows_best: 'fincher',
      days: [{ day: yesterdayOf(yesterdayOf(d3)), entries: [bookEntry(MOCK_TITLES.bladerunner, 'fincher', 'seen', null, 10, 'ten'), bookEntry(MOCK_TITLES.possession, 'cypher', 'refused', null, null, null)] }],
      next_before: null,
    };
  }
  return {
    who_knows_best: 'fincher',
    days: [
      { day: today, entries: [bookEntry(MOCK_TITLES.duna2, 'bogart', 'want', null, null, null), bookEntry(MOCK_TITLES.iluminado, 'fincher', 'up', null, null, null)] },
      { day: d1, entries: [bookEntry(MOCK_TITLES.amanhecer, 'fincher', 'seen', 'occ:chuva', 9, 'exact'), bookEntry(MOCK_TITLES.lalaland, 'bogart', 'seen', 'occ:chuva', 6, 'under')] },
      { day: d2, entries: [bookEntry(MOCK_TITLES.oldboy, 'cypher', 'seen', null, 9, 'over'), bookEntry(MOCK_TITLES.whiplash, 'bogart', 'want', null, null, null)] },
      { day: d3, entries: [bookEntry(MOCK_TITLES.cinemaparadiso, 'espelho', 'seen', null, 10, 'ten')] },
    ],
    next_before: d3,
  };
}

// ---- O Acervo (para o WP-ACERVO): 95 itens fictícios em 4 páginas -------------

export async function mockMesaAcervo(oracle: OracleSlot, mood: string, media: 'movie' | 'tv', offset = 0, limit = 30): Promise<AcervoPage> {
  await delay(300);
  const pool = { bogart: BOGART, fincher: FINCHER, cypher: CYPHER }[oracle];
  const total = 95;
  const items: AcervoItem[] = [];
  for (let i = offset; i < Math.min(total, offset + limit); i += 1) {
    const t = pool[i % pool.length];
    items.push({
      tmdb_id: 900000 + i,
      media_type: media,
      title_pt: `${t.title_pt} ${i > pool.length - 1 ? `(${Math.floor(i / pool.length) + 1})` : ''}`.trim(),
      title_en: t.title_en,
      year: t.year,
      poster_path: t.poster_path,
      poster_path_pt: null,
      pred: Math.max(5, 9 - Math.floor(i / 20)),
      in_watchlist: i % 11 === 3,
    });
  }
  const next = offset + limit < total ? offset + limit : null;
  return { oracle, mood, media, total: 110, unrated_total: total, offset, next_offset: next, pred_label: 'number', items };
}
