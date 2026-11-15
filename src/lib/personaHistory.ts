import { supabase } from './supabase';
import { MOOD_BY_LETTER } from './moods';
import { mapPersonaEntry, PERSONA_THRESHOLD, type PersonaEntry, type UserPersona } from './persona';
import { LETTERS, MARGIN, type PersonaWorld, type WorldTitle } from './personaWorld';

// "Reviver desde o início" (14/11/2026): a história da própria pessoa, nota a
// nota, para o estúdio voltar no tempo.
//
// Pedido do Bruno: o modal "deve herdar aquela barra 'reviver desde o início'
// dentro do protótipo, devidamente adaptada para nosso modelo do estúdio". No
// protótipo ela ficava numa bancada de testes; aqui ela mora embaixo da cena.
//
// O banco manda a lista de notas em ordem (get_persona_history, só para a
// própria pessoa). O resto é conta, a mesma do protótipo e do banco:
//   • a Persona nasce com 10 títulos em 3 prateleiras, pelas 3 mais fortes;
//   • depois, a prateleira de fora só entra no trio quando abre 10 pontos
//     sobre a mais fraca dele (a regra dos 10 pontos).
// Com a lista e essa conta dá para montar o estúdio como ele estava depois de
// qualquer nota (worldAt): as latas, as asas, os olhos, a bitola, as mudas e
// os objetos de tag já conquistados naquele
// dia. Os quadros da parede (os pôsteres do Jackpot) não têm história
// guardada: ficam os de hoje.
//
// 14/11/2026 (noite): a barra deixou de ter botão e de passar sozinha. É a
// terceira barra do modal (EvolutionBar), e quem move é a pessoa.

export interface HistoryRow {
  // o dia em que o título entrou (Brasília), "2026-03-14"
  day: string;
  rating: number;
  // a prateleira, ou null para os títulos de fora (o Arquivo)
  letter: string | null;
  type: 'movie' | 'tv';
  id: number;
  titlePt: string | null;
  titleEn: string | null;
  poster: string | null;
}

export interface PersonaHistory {
  rows: HistoryRow[];
  // depois de cada nota, o trio que valia (null antes de a Persona nascer)
  steps: (string[] | null)[];
  // as mudas: em que nota (índice) a Persona nasceu ou trocou de forma
  molts: { index: number; from: string | null; to: string }[];
}

const order = (letter: string) => LETTERS.indexOf(letter);
const codeOf = (trio: string[]) => trio.slice().sort((a, b) => order(a) - order(b)).join('');
const rankOf = (films: Record<string, number>, score: Record<string, number>) => LETTERS.slice().sort((a, b) => score[b] - score[a] || films[b] - films[a] || order(a) - order(b));
const zero = (): Record<string, number> => Object.fromEntries(LETTERS.map((letter) => [letter, 0]));

// Passa pela lista inteira uma vez e guarda, a cada nota, o trio que valia.
function buildTimeline(rows: HistoryRow[]): Pick<PersonaHistory, 'steps' | 'molts'> {
  const films = zero();
  const score = zero();
  let trio: string[] | null = null;
  const steps: (string[] | null)[] = [];
  const molts: PersonaHistory['molts'] = [];
  rows.forEach((row, index) => {
    if (row.letter) {
      films[row.letter] += 1;
      score[row.letter] += row.rating;
    }
    const counted = LETTERS.reduce((sum, letter) => sum + films[letter], 0);
    const used = LETTERS.filter((letter) => films[letter] > 0).length;
    const rank = rankOf(films, score);
    if (counted >= PERSONA_THRESHOLD && used >= 3) {
      if (!trio) {
        trio = rank.slice(0, 3);
        molts.push({ index, from: null, to: codeOf(trio) });
      } else {
        const current: string[] = trio;
        const weakest = current.slice().sort((a, b) => rank.indexOf(a) - rank.indexOf(b))[2];
        const challenger = rank.find((letter) => !current.includes(letter) && films[letter] > 0);
        if (challenger && score[challenger] - score[weakest] >= MARGIN) {
          const before = codeOf(current);
          trio = current.filter((letter) => letter !== weakest).concat([challenger]);
          molts.push({ index, from: before, to: codeOf(trio) });
        }
      }
    }
    steps.push(trio ? trio.slice() : null);
  });
  return { steps, molts };
}

export async function fetchPersonaHistory(userId: string): Promise<PersonaHistory | null> {
  const { data, error } = await supabase.rpc('get_persona_history', { p_user_id: userId });
  if (error) throw error;
  const raw = (data as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(raw)) return null;
  const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
  const rows: HistoryRow[] = raw
    .map((item): HistoryRow | null => {
      if (!Array.isArray(item)) return null;
      const letter = text(item[2]);
      const id = Number(item[4]) || 0;
      if (!id) return null;
      return {
        day: String(item[0] ?? ''),
        rating: Number(item[1]) || 0,
        letter: letter && MOOD_BY_LETTER[letter] ? letter : null,
        type: item[3] === 'tv' ? 'tv' : 'movie',
        id,
        titlePt: text(item[5]),
        titleEn: text(item[6]),
        poster: text(item[7]),
      };
    })
    .filter((row): row is HistoryRow => Boolean(row));
  return { rows, ...buildTimeline(rows) };
}

// As Personas (personagem, filme, capa) dos códigos por onde a história passou.
const entryCache = new Map<string, PersonaEntry>();
export async function fetchPersonaEntries(codes: string[]): Promise<Record<string, PersonaEntry>> {
  const wanted = Array.from(new Set(codes.filter((code) => code && code.length === 3)));
  const missing = wanted.filter((code) => !entryCache.has(code));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('cine_personas').select('*').in('code', missing);
    if (error) throw error;
    (data ?? []).forEach((row: Record<string, unknown>) => {
      const entry = mapPersonaEntry(row);
      if (entry.code) entryCache.set(entry.code, entry);
    });
  }
  const out: Record<string, PersonaEntry> = {};
  wanted.forEach((code) => {
    const hit = entryCache.get(code);
    if (hit) out[code] = hit;
  });
  return out;
}

const titleOf = (row: HistoryRow): WorldTitle => ({ id: row.id, type: row.type, rating: row.rating, letter: row.letter, titlePt: row.titlePt, titleEn: row.titleEn, poster: row.poster });

// O estúdio como ele estava depois de k notas. `today` é a cena de hoje (dela
// vêm o que a história não guarda: a Watchlist e as tags com a data).
export function worldAt(history: PersonaHistory, k: number, today: PersonaWorld, entries: Record<string, PersonaEntry>): PersonaWorld {
  const rows = history.rows.slice(0, Math.max(0, Math.min(k, history.rows.length)));
  const films = zero();
  const score = zero();
  const shelf: HistoryRow[] = [];
  let out = 0;
  rows.forEach((row) => {
    if (row.letter) {
      films[row.letter] += 1;
      score[row.letter] += row.rating;
      shelf.push(row);
    } else out += 1;
  });
  const trio = rows.length > 0 ? history.steps[rows.length - 1] : null;
  const code = trio ? codeOf(trio) : null;
  const rank = rankOf(films, score);
  const persona: UserPersona = {
    code,
    counted: shelf.length,
    threshold: today.persona?.threshold || PERSONA_THRESHOLD,
    scores: rank.map((letter) => ({ moodKey: MOOD_BY_LETTER[letter].key, score: score[letter], films: films[letter] })),
    persona: code ? (entries[code] ?? null) : null,
    worksSeen: {},
  };

  const recent: Record<string, number[]> = {};
  const best: Record<string, WorldTitle[]> = {};
  LETTERS.forEach((letter) => {
    const mine = shelf.filter((row) => row.letter === letter);
    if (mine.length === 0) return;
    recent[letter] = mine.slice(-9).map((row) => row.rating);
    best[letter] = mine
      .map((row, index) => ({ row, index }))
      .sort((a, b) => b.row.rating - a.row.rating || b.index - a.index)
      .slice(0, 4)
      .map((item) => titleOf(item.row));
  });
  const lastShelf = shelf.slice(-30);
  const eyePool = shelf.length < 45 ? shelf : lastShelf;
  const day = rows.length > 0 ? rows[rows.length - 1].day : '';

  return {
    persona,
    rated: rows.length,
    out,
    counted: shelf.length,
    window: lastShelf.map((row) => ({ letter: row.letter as string, rating: row.rating })),
    recent,
    first: code ? [] : shelf.slice(0, 12).map((row) => row.letter as string),
    eyes: eyePool
      .filter((row) => row.rating >= 9)
      .slice(-6)
      .reverse()
      .map(titleOf),
    last: rows.slice(-6).reverse().map(titleOf),
    best,
    molts: history.molts
      .filter((molt) => molt.index < rows.length)
      .slice(-24)
      .map((molt) => ({ at: history.rows[molt.index].day, from: molt.from, to: molt.to, no: molt.index + 1 })),
    // os objetos de tag que a pessoa já tinha naquele dia (a caixa do Clube do Terror)
    tags: day ? today.tags.filter((tag) => tag.at.slice(0, 10) <= day) : [],
    posters: today.posters,
  };
}
