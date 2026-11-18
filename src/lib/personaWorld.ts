import { supabase } from './supabase';
import { MOODS, MOOD_BY_KEY, MOOD_BY_LETTER } from './moods';
import { parseUserPersona, type UserPersona } from './persona';

// A Persona viva (13/11/2026): a cabine e a mariposa.
//
// Pedido do Bruno: "Quero que cada filme adicionado conte, que o usuário
// anseie por preencher e ver no que está se metamorfoseando, como as mudanças
// de sua vida refletem na mudança cinematográfica", com cara da era do Club
// Penguin e do Habbo Hotel, "o Tamagotchi dos filmes", "sempre mantendo a
// sanidade mental". Plano e conta em claude/persona-viva.md.
//
// A ideia em uma linha: a cabine guarda tudo o que a pessoa avaliou; a
// mariposa veste o que ela anda vendo.
//
// Este arquivo é o motor: lê o que o banco manda (get_persona_world) e tira
// dali tudo o que a cena desenha. É conta pura, sem relógio: nada decai, nada
// depende do dia. Parar de usar não muda um pixel.
//
//   • Trio: as três letras do código, da mais forte para a mais fraca. O
//     código já vem do banco com a regra dos 10 pontos (a prateleira de fora só
//     entra quando abre uma nota 10 inteira sobre a mais fraca do trio).
//   • Forma vizinha: a Persona em que ela viraria se a prateleira de fora mais
//     forte entrasse. Três graus: longe, perto (está a até 10 pontos de
//     empatar) e quase (já passou, mas sem os 10 de vantagem: é o casulo).
//   • Nível do estúdio: quantos títulos a pessoa avaliou, em degraus com
//     número certo (LEVEL_AT). Cada nível traz um móvel e a mariposa cresce.
//   • Fase: os últimos 30 títulos de prateleira contra o todo. É o que as asas
//     vestem. Só vale a partir de 45 títulos de prateleira (antes disso a
//     janela é quase a história inteira).
//
// Os limiares (10 pontos, 30 títulos, 45) foram calibrados nas contas reais de
// 13/11/2026 (20 com Persona); reajustar com mais gente.
//
// 15/11/2026 (tarde), correção do Bruno: "não aquele troço de envergadura, não
// dá nem para entender o que é aquilo. Tem que ser número real, tipo tanto
// filme: 250, pum, já sobe para outra categoria. E vamos mudar esse nome 8
// milímetros, 35 milímetros […] ninguém entende. Tem que ser estúdio nível 1,
// estúdio nível 2." E: "deixe mais difícil a gamificação do próprio estúdio".
//   • Saíram a envergadura (G = Σ √n nos dez baldes) e as bitolas (de 8 mm a
//     Cinerama). O estúdio agora tem níveis de 1 a 10, pelo número de títulos
//     avaliados (filmes e séries, de dentro e de fora das prateleiras).
//   • Ficou mais difícil. Com a envergadura, quem espalhava as notas chegava
//     ao 4º degrau (Super 16) com uns 100 títulos e ao 5º (35 mm) com 250;
//     agora o nível 4 pede 200 e o 5, 350. Em 15/11 a conta com mais títulos
//     (267) está no nível 4, e mais da metade das contas com Persona, no 1 ou
//     no 2.

export const PHASE_WINDOW = 30;
export const PHASE_MIN = 45;
export const PHASE_DISTINCT = 0.25;
export const MARGIN = 10;

// Os níveis do estúdio. O nível 1 chega com a Persona (10 títulos das
// prateleiras, em 3 humores); do 2 em diante, LEVEL_AT[nível] é o número de
// títulos avaliados que o nível pede.
export const MAX_LEVEL = 10;
export const LEVEL_AT: number[] = [0, 0, 50, 100, 200, 350, 500, 750, 1000, 1500, 2000];
// O móvel que chega com cada nível (chave de texto em personaWorld.furniture).
export const FURNITURE: Record<number, string> = { 1: 'projector', 2: 'armchair', 3: 'rug', 4: 'lamp', 5: 'popcorn', 6: 'plant', 7: 'curtain', 8: 'chair', 9: 'bigScreen', 10: 'marquee' };
// O estágio da cena: 0 = ovo, 1 = lagarta; a partir de 2, a mariposa (nível + 1).
export const stageOfLevel = (level: number): number => level + 1;

// Os bichinhos do estúdio (15/11/2026, tarde). Pedido do Bruno: "as tags de 200
// filmes dos três oráculos […] devem desbloquear um animalzinho de estimação
// para o estúdio. O sapo vai liberar um sapinho de pixel que vai ficar pulando
// ao redor do estúdio. A raposa vai liberar uma raposinha com a caminha dela.
// E a cobra vai liberar aquele aquário que a gente tinha excluído. Agora ele
// vai ter utilidade, vai ter a cobra dentro dele."
// As tags são a Quick Tongue (🐸), a Keen Sense (🦊) e a Underworld King (🐍):
// 200 títulos avaliados da curadoria de cada oráculo.
export const PET_GOAL = 200;
export type PetId = 'frog' | 'fox' | 'snake';
export const PET_ORACLE: Record<PetId, 'bogart' | 'fincher' | 'cypher'> = { frog: 'bogart', fox: 'fincher', snake: 'cypher' };

export const LETTERS: string[] = MOODS.map((m) => m.letter);

export interface WorldTitle {
  id: number;
  type: 'movie' | 'tv';
  rating: number;
  // letra da prateleira, ou null para os títulos de fora (o Arquivo)
  letter: string | null;
  titlePt: string | null;
  titleEn: string | null;
  poster: string | null;
}

export interface WorldMolt {
  at: string;
  from: string | null;
  to: string;
  no: number | null;
}

export interface WorldPoster {
  // o caminho da imagem no TMDB
  path: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  effect: string;
}

export interface PersonaWorld {
  persona: UserPersona | null;
  rated: number;
  out: number;
  counted: number;
  // os últimos 30 títulos de prateleira, do mais antigo ao mais novo
  window: { letter: string; rating: number }[];
  // as notas dos últimos 9 títulos de cada prateleira (as tampas das latas)
  recent: Record<string, number[]>;
  // as prateleiras dos primeiros títulos (os gomos da lagarta)
  first: string[];
  eyes: WorldTitle[];
  last: WorldTitle[];
  best: Record<string, WorldTitle[]>;
  molts: WorldMolt[];
  // 14/11/2026 (o estúdio): as tags que a pessoa conquistou, da mais antiga à
  // mais nova. As que liberam um objeto viram esse objeto no estúdio (hoje só
  // a caixa do Clube do Terror, da Deadly Sleeping).
  tags: { id: string; at: string }[];
  // 14/11/2026 (noite): os 4 últimos pôsteres que a pessoa ganhou no Poster
  // Jackpot, do mais novo ao mais antigo. São os quadros da parede do estúdio
  // (antes eram os títulos de nota 10). Sem nenhum, a parede fica vazia.
  posters: WorldPoster[];
  // 15/11/2026 (tarde): em que lugar do chão a pessoa pôs cada objeto (o nome
  // do objeto → o número do lugar; studio.ts). O que não está aqui fica no
  // lugar de costume.
  layout: Record<string, number>;
  // 17/11/2026 (o inventário): os objetos que a pessoa guardou (não aparecem
  // na sala) e os que ela girou (o número de quartos de volta; hoje só 0 ou 1)
  stored: string[];
  turn: Record<string, number>;
  // Conta Diretor: o "estúdio completo" (nível máximo, todos os objetos), só na tela dela
  preview?: boolean;
  // quantos títulos da curadoria de cada oráculo a pessoa avaliou
  oracle: { bogart: number; fincher: number; cypher: number };
  // 17/11/2026 (noite): a recomendação que a pessoa escolheu em cada humor
  // (letra → título), para o cartão dos móveis dos humores. Sem escolha, o
  // cartão usa o mais bem avaliado da prateleira (best).
  picks: Record<string, WorldTitle>;
  // 17/11/2026 (noite): os móveis do estúdio que a Cobra deu no pôquer (ids
  // de poker_items: 'studio-rifle', 'studio-turntable')
  items: string[];
  // os bichinhos: em que nota (a contagem de títulos avaliados) cada um
  // chegou, isto é, a 200ª da curadoria do oráculo dele (null = ainda não)
  pets: Record<PetId, number | null>;
}

export type Neighbor = 'far' | 'near' | 'cocoon';

export interface WorldState {
  hasTrio: boolean;
  code: string | null;
  // letras do trio, da mais forte para a mais fraca
  trio: string[];
  // as 9 letras, da mais forte para a mais fraca
  rank: string[];
  films: Record<string, number>;
  score: Record<string, number>;
  rated: number;
  out: number;
  counted: number;
  // forma vizinha
  weakest: string | null;
  challenger: string | null;
  gap: number;
  nextCode: string | null;
  neighbor: Neighbor;
  // o estágio da cena (0 = ovo, 1 = lagarta, nível + 1 depois) e o nível do estúdio (0 = sem Persona)
  stage: number;
  level: number;
  // quantos títulos o próximo nível pede (null = não há próximo) e quantos faltam
  nextAt: number | null;
  toNext: number;
  // o caminho até o próximo nível, de 0 a 1 (antes da Persona: até os 10 títulos das prateleiras)
  levelBar: number;
  // fase
  essence: Record<string, number>;
  now: Record<string, number>;
  phaseAvailable: boolean;
  phaseDistinct: boolean;
  phaseMood: string | null;
  phaseLeft: number;
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

const parseTitle = (raw: unknown): WorldTitle | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Row;
  const id = num(r.id);
  if (!id) return null;
  return {
    id,
    type: r.type === 'tv' ? 'tv' : 'movie',
    rating: num(r.r),
    letter: strOrNull(r.m),
    titlePt: strOrNull(r.title_pt),
    titleEn: strOrNull(r.title_en),
    poster: strOrNull(r.poster),
  };
};
const parseTitles = (raw: unknown): WorldTitle[] => (Array.isArray(raw) ? raw.map(parseTitle).filter((x): x is WorldTitle => Boolean(x)) : []);

// O arranjo salvo: { v: 2, at: { slot: 4, fox: 7 }, off: ['plant'], rot: { chair: 1 } }.
// Só entram números inteiros de lugar. O v1 (até 17/11/2026) só tinha o `at`.
export function parseLayout(raw: unknown): Record<string, number> {
  const at = raw && typeof raw === 'object' ? (raw as Row).at : null;
  const out: Record<string, number> = {};
  if (!at || typeof at !== 'object') return out;
  Object.entries(at as Row).forEach(([item, place]) => {
    if (typeof place === 'number' && Number.isInteger(place) && place >= 0) out[item] = place;
  });
  return out;
}
// os guardados (no inventário, fora da sala)
export function parseStored(raw: unknown): string[] {
  const off = raw && typeof raw === 'object' ? (raw as Row).off : null;
  return Array.isArray(off) ? Array.from(new Set(off.filter((item): item is string => typeof item === 'string' && /^[a-z]{2,16}$/.test(item)))) : [];
}
// os girados: objeto → quartos de volta (0 a 3)
export function parseTurn(raw: unknown): Record<string, number> {
  const rot = raw && typeof raw === 'object' ? (raw as Row).rot : null;
  const out: Record<string, number> = {};
  if (!rot || typeof rot !== 'object') return out;
  Object.entries(rot as Row).forEach(([item, turn]) => {
    if (typeof turn === 'number' && Number.isInteger(turn) && turn > 0 && turn < 4) out[item] = turn;
  });
  return out;
}

// O arranjo inteiro: onde cada objeto está, o que está guardado e o que está girado.
export interface StudioArrangement {
  at: Record<string, number>;
  off: string[];
  rot: Record<string, number>;
}
export const arrangementOf = (world: Pick<PersonaWorld, 'layout' | 'stored' | 'turn'>): StudioArrangement => ({ at: { ...world.layout }, off: [...world.stored], rot: { ...world.turn } });

export function parsePersonaWorld(data: unknown): PersonaWorld | null {
  if (!data || typeof data !== 'object') return null;
  const raw = data as Row;
  const recent: Record<string, number[]> = {};
  if (raw.recent && typeof raw.recent === 'object') {
    Object.entries(raw.recent as Row).forEach(([letter, list]) => {
      if (MOOD_BY_LETTER[letter] && Array.isArray(list)) recent[letter] = list.map(num);
    });
  }
  const best: Record<string, WorldTitle[]> = {};
  if (raw.best && typeof raw.best === 'object') {
    Object.entries(raw.best as Row).forEach(([letter, list]) => {
      if (MOOD_BY_LETTER[letter]) best[letter] = parseTitles(list);
    });
  }
  const picks: Record<string, WorldTitle> = {};
  if (raw.picks && typeof raw.picks === 'object') {
    Object.entries(raw.picks as Row).forEach(([letter, title]) => {
      const parsed = MOOD_BY_LETTER[letter] ? parseTitle(title) : null;
      if (parsed) picks[letter] = parsed;
    });
  }
  const oracle = (raw.oracle && typeof raw.oracle === 'object' ? raw.oracle : {}) as Row;
  const pets = (raw.pets && typeof raw.pets === 'object' ? raw.pets : {}) as Row;
  const petAt = (value: unknown): number | null => (typeof value === 'number' && value > 0 ? value : null);
  return {
    persona: parseUserPersona(raw.persona),
    rated: num(raw.rated),
    out: num(raw.out),
    counted: num(raw.counted),
    window: Array.isArray(raw.window)
      ? (raw.window as unknown[])
          .map((w) => (Array.isArray(w) ? { letter: String(w[0]), rating: num(w[1]) } : null))
          .filter((w): w is { letter: string; rating: number } => Boolean(w && MOOD_BY_LETTER[w.letter]))
      : [],
    recent,
    first: Array.isArray(raw.first) ? (raw.first as unknown[]).map(String).filter((l) => MOOD_BY_LETTER[l]) : [],
    eyes: parseTitles(raw.eyes),
    last: parseTitles(raw.last),
    best,
    molts: Array.isArray(raw.molts)
      ? (raw.molts as Row[])
          .map((m) => ({ at: String(m.at ?? ''), from: strOrNull(m.from), to: String(m.to ?? ''), no: m.no == null ? null : num(m.no) }))
          .filter((m) => m.to.length === 3)
      : [],
    tags: Array.isArray(raw.tags)
      ? (raw.tags as Row[]).map((tag) => ({ id: String(tag.id ?? ''), at: String(tag.at ?? '') })).filter((tag) => tag.id)
      : [],
    posters: Array.isArray(raw.posters)
      ? (raw.posters as Row[])
          .map((poster): WorldPoster | null => {
            const path = strOrNull(poster.path);
            const rarity = String(poster.rarity ?? '');
            if (!path) return null;
            return { path, rarity: rarity === 'rare' || rarity === 'epic' || rarity === 'legendary' ? rarity : 'common', effect: String(poster.effect ?? 'none') };
          })
          .filter((poster): poster is WorldPoster => Boolean(poster))
          .slice(0, 4)
      : [],
    layout: parseLayout(raw.layout),
    stored: parseStored(raw.layout),
    turn: parseTurn(raw.layout),
    oracle: { bogart: num(oracle.bogart), fincher: num(oracle.fincher), cypher: num(oracle.cypher) },
    picks,
    items: Array.isArray(raw.items) ? (raw.items as unknown[]).filter((item): item is string => typeof item === 'string') : [],
    pets: { frog: petAt(pets.frog), fox: petAt(pets.fox), snake: petAt(pets.snake) },
  };
}

// Grava o arranjo do próprio estúdio e devolve o que ficou guardado. Desde
// 17/11/2026 vai também o inventário (off) e o giro (rot); o app antigo, que só
// manda o `at`, não apaga os dois (o banco mantém o que estava).
export async function savePersonaLayout(arrangement: StudioArrangement): Promise<StudioArrangement> {
  const { data, error } = await supabase.rpc('set_persona_studio_layout', { p_layout: { v: 2, at: arrangement.at, off: arrangement.off, rot: arrangement.rot } });
  if (error) throw error;
  return { at: parseLayout(data), off: parseStored(data), rot: parseTurn(data) };
}

// A recomendação de um humor (17/11/2026, noite). Pedido do Bruno: "Troque
// 'Seu Favorito da Prateleira' por 'Sua Recomendação'. Adicione um botão para
// o usuário escolher um título avaliado dessa prateleira."
//   • fetchMyMoodTitles: os títulos que a pessoa avaliou numa prateleira, da
//     maior nota para a menor (para escolher);
//   • saveMoodPick: grava a escolha (o banco confere que o título é dela e da
//     prateleira) e guarda aqui, para o cartão mostrar na hora, sem buscar o
//     estúdio de novo (myMoodPick).
export async function fetchMyMoodTitles(moodKey: string): Promise<WorldTitle[]> {
  const { data, error } = await supabase.rpc('get_my_mood_titles', { p_mood: moodKey });
  if (error) throw error;
  return parseTitles(data);
}
const myPicks = new Map<string, WorldTitle>();
export const myMoodPick = (letter: string): WorldTitle | null => myPicks.get(letter) ?? null;
export async function saveMoodPick(moodKey: string, title: WorldTitle): Promise<void> {
  const { error } = await supabase.rpc('set_persona_mood_pick', { p_mood: moodKey, p_media_type: title.type, p_tmdb_id: title.id });
  if (error) throw error;
  const mood = MOOD_BY_KEY[moodKey];
  if (mood) myPicks.set(mood.letter, { ...title, letter: mood.letter });
}

// Conta Diretor (16/11/2026): "estúdio completo" na tela do diretor mostra, só
// na cena da própria conta e só neste aparelho, os três bichinhos e a caixa do
// Clube do Terror, para ver como ficam sem precisar ganhá-los. O banco não muda.
// 17/11/2026 (Bruno: "o estúdio 'completo' não está de fato completo em seu
// nível máximo, não tem nem a cadeira nem o tapete"): agora é o nível máximo,
// com todos os móveis (worldState lê `preview`), e a caixa do Arquivo.
let studioPreviewOwner: string | null = null;
export function setStudioPreviewOwner(userId: string | null): void {
  studioPreviewOwner = userId;
}

function withStudioPreview(world: PersonaWorld): PersonaWorld {
  const first = Math.max(1, world.rated);
  const tags = world.tags.some((tag) => /^deadly-sleeping(-[0-9]+)?$/.test(tag.id))
    ? world.tags
    : [...world.tags, { id: 'deadly-sleeping', at: new Date().toISOString() }];
  return {
    ...world,
    tags,
    preview: true,
    pets: { frog: world.pets.frog ?? first, fox: world.pets.fox ?? first, snake: world.pets.snake ?? first },
  };
}

// A cena de alguém (a sua, ou a de um perfil que você pode ver).
export async function fetchPersonaWorld(userId: string): Promise<PersonaWorld | null> {
  const { data, error } = await supabase.rpc('get_persona_world', { p_user_id: userId });
  if (error) throw error;
  const world = parsePersonaWorld(data);
  return world && studioPreviewOwner === userId ? withStudioPreview(world) : world;
}

const sortByMoodOrder = (letters: string[]): string => letters.slice().sort((a, b) => LETTERS.indexOf(a) - LETTERS.indexOf(b)).join('');

// O retrato que a cena desenha.
export function worldState(world: PersonaWorld): WorldState {
  const films: Record<string, number> = {};
  const score: Record<string, number> = {};
  LETTERS.forEach((l) => {
    films[l] = 0;
    score[l] = 0;
  });
  const rank: string[] = [];
  (world.persona?.scores ?? []).forEach((s) => {
    const mood = MOOD_BY_KEY[s.moodKey];
    if (!mood) return;
    films[mood.letter] = s.films;
    score[mood.letter] = s.score;
    rank.push(mood.letter);
  });
  LETTERS.forEach((l) => {
    if (!rank.includes(l)) rank.push(l);
  });

  const code = world.persona?.code ?? null;
  const trio = code ? rank.filter((l) => code.includes(l)) : [];
  const hasTrio = trio.length === 3;

  let weakest: string | null = null;
  let challenger: string | null = null;
  let gap = -Infinity;
  let nextCode: string | null = null;
  let neighbor: Neighbor = 'far';
  if (hasTrio) {
    weakest = trio[2];
    challenger = rank.find((l) => !trio.includes(l) && films[l] > 0) ?? null;
    if (challenger) {
      gap = score[challenger] - score[weakest];
      nextCode = sortByMoodOrder([trio[0], trio[1], challenger]);
      neighbor = gap >= 0 ? 'cocoon' : gap >= -MARGIN ? 'near' : 'far';
    }
  }

  // o nível: com a Persona, o maior degrau que os títulos avaliados já alcançaram
  let level = 0;
  if (hasTrio) {
    level = 1;
    for (let l = 2; l <= MAX_LEVEL; l += 1) if (world.rated >= LEVEL_AT[l]) level = l;
    // o estúdio completo do diretor: o nível máximo, com todos os móveis
    if (world.preview) level = MAX_LEVEL;
  }
  const stage = hasTrio ? stageOfLevel(level) : world.rated > 0 ? 1 : 0;
  const nextAt = level > 0 && level < MAX_LEVEL ? LEVEL_AT[level + 1] : null;
  const levelBar = level === 0 ? Math.max(0, Math.min(1, world.counted / 10)) : nextAt ? Math.max(0, Math.min(1, (world.rated - LEVEL_AT[level]) / (nextAt - LEVEL_AT[level]))) : 1;

  const sumScore = LETTERS.reduce((acc, l) => acc + score[l], 0);
  const winScore: Record<string, number> = {};
  LETTERS.forEach((l) => {
    winScore[l] = 0;
  });
  let winTotal = 0;
  world.window.forEach((w) => {
    winScore[w.letter] += w.rating;
    winTotal += w.rating;
  });
  const essence: Record<string, number> = {};
  const phase: Record<string, number> = {};
  let distance = 0;
  let phaseMood: string | null = null;
  let bestDiff = -Infinity;
  LETTERS.forEach((l) => {
    essence[l] = sumScore ? score[l] / sumScore : 0;
    phase[l] = winTotal ? winScore[l] / winTotal : 0;
    distance += Math.abs(phase[l] - essence[l]);
    if (phase[l] - essence[l] > bestDiff) {
      bestDiff = phase[l] - essence[l];
      phaseMood = l;
    }
  });
  const phaseAvailable = world.counted >= PHASE_MIN;

  return {
    hasTrio,
    code: hasTrio ? code : null,
    trio,
    rank,
    films,
    score,
    rated: world.rated,
    out: world.out,
    counted: world.counted,
    weakest,
    challenger,
    gap,
    nextCode,
    neighbor,
    stage,
    level,
    nextAt,
    toNext: nextAt ? Math.max(0, nextAt - world.rated) : 0,
    levelBar,
    essence,
    now: phaseAvailable ? phase : essence,
    phaseAvailable,
    phaseDistinct: phaseAvailable && distance / 2 >= PHASE_DISTINCT,
    phaseMood,
    phaseLeft: Math.max(0, PHASE_MIN - world.counted),
  };
}

// O nome do nível, como aparece na tela: "Estúdio nível 4" (antes da Persona, "Ovo" ou "Lagarta").
export const levelText = (t: (key: string, options?: Record<string, unknown>) => string, st: Pick<WorldState, 'level' | 'stage'>): string =>
  st.level > 0 ? t('personaWorld.level.name', { n: st.level }) : t(st.stage === 0 ? 'personaWorld.level.egg' : 'personaWorld.level.larva');

// O nome de cada forma (as mudas e a forma vizinha mostram o título da Persona
// de outros códigos). A tabela cine_personas é pública; guarda o que já veio.
export interface PersonaName {
  titlePt: string;
  titleEn: string;
}
const nameCache = new Map<string, PersonaName>();
export async function fetchPersonaNames(codes: string[]): Promise<Record<string, PersonaName>> {
  const wanted = Array.from(new Set(codes.filter((code) => code && code.length === 3)));
  const missing = wanted.filter((code) => !nameCache.has(code));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('cine_personas').select('code, title_pt, title_en').in('code', missing);
    if (error) throw error;
    (data ?? []).forEach((row: { code: string; title_pt: string | null; title_en: string | null }) => {
      nameCache.set(row.code, { titlePt: row.title_pt ?? '', titleEn: row.title_en ?? '' });
    });
  }
  const out: Record<string, PersonaName> = {};
  wanted.forEach((code) => {
    const hit = nameCache.get(code);
    if (hit) out[code] = hit;
  });
  return out;
}
