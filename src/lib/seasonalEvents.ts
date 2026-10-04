import type { OracleId } from './oracleTheme';

// Eventos sazonais (Halloween em outubro, Natal em dezembro e os que vierem).
//
// O banco é a fonte da verdade (supabase/migrations/20261004100000_seasonal_events.sql):
// janela de cada evento, seleção de filmes, etapas e tags. Aqui ficam só o
// formato do que get_seasonal_event_state() devolve e a cara de cada tema
// (cores e símbolo). Para um tema novo: uma linha em seasonal_events, as
// tags em special_tags, uma entrada em SEASONAL_THEMES e os textos em
// events.<id> nos arquivos de idioma.

export type SeasonalEventId = 'halloween' | 'christmas';
export type SeasonalStepKind = 'rate' | 'watchlist' | 'whisper' | 'review';

export interface SeasonalStep {
  index: number;
  // tag desta edição: 'ho-ho-ho' no 1º Natal, 'ho-ho-ho-2' no 2º ("Ho Ho Ho II")…
  tag: string;
  // a tag-mãe ('ho-ho-ho'): chave dos textos em events.<id>.steps.<base_tag>
  base_tag: string;
  name: string;
  emoji: string;
  kind: SeasonalStepKind;
  count: number;
  progress: number;
  unlocked: boolean;
  unlocked_at: string | null;
  // missão de presente: quem já tinha visto quase a lista toda antes do
  // evento (18 de 20 → a 1ª, 19 → as duas primeiras, 20 → as três)
  credited: boolean;
  // a etapa anterior já foi conquistada (a primeira sempre está liberada)
  available: boolean;
}

export interface SeasonalItem {
  id: number;
  oracle: OracleId | null;
}

export interface SeasonalEventState {
  id: SeasonalEventId;
  edition: number;
  // 1 no primeiro ano do evento, 2 no segundo… (as tags ganham II, III…)
  level: number;
  starts_at: string;
  // fim exclusivo (meia-noite de Brasília do dia seguinte ao último)
  ends_at: string;
  is_active: boolean;
  is_preview: boolean;
  now: string;
  items: SeasonalItem[];
  actions: Partial<Record<SeasonalStepKind, number[]>>;
  steps: SeasonalStep[];
  // filmes da lista que a pessoa já tinha avaliado antes do evento
  pre_rated: number;
  list_size: number;
  decoration_tag: string | null;
  decoration_unlocked: boolean;
}

export interface SeasonalTheme {
  id: SeasonalEventId;
  emoji: string;
  // cor principal (abóbora / vermelho) e a versão clara, para texto
  accent: string;
  accentText: string;
  // cor de apoio (violeta-bruxa / verde-pinheiro)
  second: string;
  // brilho (luz de vela / dourado)
  glow: string;
  // texto sobre a cor principal
  ink: string;
  // fundo do painel e contorno em degradê
  surface: string;
  panelBackground: string;
  border: string;
}

export const SEASONAL_THEMES: Record<SeasonalEventId, SeasonalTheme> = {
  halloween: {
    id: 'halloween',
    emoji: '🎃',
    accent: '#FF8A1F',
    accentText: '#FDBA74',
    second: '#A855F7',
    glow: '#FFD08A',
    ink: '#1A0B05',
    surface: '#170B1F',
    panelBackground:
      'radial-gradient(ellipse 70% 60% at 88% 0%, rgba(255,138,31,0.22), transparent 62%), radial-gradient(ellipse 60% 70% at 0% 100%, rgba(168,85,247,0.20), transparent 70%), #170B1F',
    border: 'linear-gradient(135deg, rgba(255,138,31,0.9), rgba(168,85,247,0.4) 45%, rgba(255,138,31,0.6))',
  },
  christmas: {
    id: 'christmas',
    emoji: '🎄',
    accent: '#E5484D',
    accentText: '#FCA5A5',
    second: '#2FB36B',
    glow: '#F5C451',
    ink: '#1A0507',
    surface: '#0D1A16',
    panelBackground:
      'radial-gradient(ellipse 70% 60% at 88% 0%, rgba(245,196,81,0.18), transparent 62%), radial-gradient(ellipse 60% 70% at 0% 100%, rgba(229,72,77,0.18), transparent 70%), #0D1A16',
    border: 'linear-gradient(135deg, rgba(229,72,77,0.9), rgba(245,196,81,0.5) 45%, rgba(47,179,107,0.75))',
  },
};

export const isSeasonalEventId = (value: unknown): value is SeasonalEventId =>
  value === 'halloween' || value === 'christmas';

// ?evento=natal na URL liga a prévia de um evento fora da época (só visual).
// ?evento=off desliga.
export const PREVIEW_ALIASES: Record<string, SeasonalEventId> = {
  halloween: 'halloween',
  'dia-das-bruxas': 'halloween',
  natal: 'christmas',
  christmas: 'christmas',
};

const BRASILIA = 'America/Sao_Paulo';

// "03/10" (pt) / "10/03" (en), no dia de Brasília — é o relógio do site.
export const formatDayMonth = (date: Date, language: string): string =>
  new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit', timeZone: BRASILIA }).format(date);

// Último dia do evento (o fim guardado é a meia-noite seguinte).
export const lastDayOf = (state: Pick<SeasonalEventState, 'ends_at'>): Date => new Date(new Date(state.ends_at).getTime() - 1);

// Dias que faltam contando hoje (31/10 = 1).
export const daysLeft = (state: Pick<SeasonalEventState, 'ends_at'>, now = Date.now()): number =>
  Math.max(0, Math.ceil((new Date(state.ends_at).getTime() - now) / 86_400_000));

// Filmes da seleção que já contaram para o evento, por tipo de ação.
export const countedIds = (state: SeasonalEventState, kind: SeasonalStepKind): Set<number> => new Set(state.actions[kind] ?? []);

// Chave dos textos de uma etapa (events.<id>.steps.<chave>): a tag-mãe, a
// mesma em todas as edições.
export const stepTextKey = (step: Pick<SeasonalStep, 'tag' | 'base_tag'>): string => step.base_tag || step.tag;

// Etapa em andamento: a primeira ainda não conquistada (null = tudo feito).
export const currentStep = (state: SeasonalEventState): SeasonalStep | null => state.steps.find((step) => !step.unlocked) ?? null;

// ---------------------------------------------------------------------------
// Decoração do perfil
// ---------------------------------------------------------------------------

// A decoração aparece o ano inteiro em quem estiver USANDO a última tag do
// evento no perfil (profiles.active_tag guarda o nome da tag). `aliases`:
// nomes antigos da mesma tag (a do Halloween se chamava "Pumpkin Head").
export const DECORATION_TAGS: Record<SeasonalEventId, { id: string; name: string; aliases?: string[] }> = {
  halloween: { id: 'pumpkin-head', name: 'Headless Horseman', aliases: ['Pumpkin Head'] },
  christmas: { id: 'ho-ho-ho', name: 'Ho Ho Ho' },
};

// Edições seguintes do mesmo evento: o 2º Natal dá "Ho Ho Ho II" (id
// 'ho-ho-ho-2'), o 3º "Ho Ho Ho III" ('ho-ho-ho-3')… — o banco cria as tags
// (ensure_seasonal_edition_tags). Todas decoram o perfil do mesmo jeito.
const ROMAN_VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

export const toRoman = (n: number): string => {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = Math.max(0, Math.floor(n));
  let out = '';
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
};

// "XIV" → 14; null se não for um numeral romano bem escrito.
export const fromRoman = (text: string): number | null => {
  if (!/^[IVXLCDM]+$/.test(text)) return null;
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    const value = ROMAN_VALUES[text[i]];
    const next = ROMAN_VALUES[text[i + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total > 0 && toRoman(total) === text ? total : null;
};

export const editionTagId = (baseId: string, level: number): string => (level > 1 ? `${baseId}-${level}` : baseId);

export interface TagDecoration {
  eventId: SeasonalEventId;
  // id da tag que a pessoa precisa ter (o da edição certa)
  tagId: string;
  level: number;
}

export const decorationForActiveTag = (activeTag: { name?: string; category?: string } | null | undefined): TagDecoration | null => {
  if (!activeTag || activeTag.category !== 'special' || !activeTag.name) return null;
  const full = activeTag.name.trim();
  // "Ho Ho Ho II" → base "Ho Ho Ho", nível 2
  const candidates: [string, number][] = [[full, 1]];
  const match = /^(.*\S)\s+([IVXLCDM]+)$/.exec(full);
  const suffixLevel = match ? fromRoman(match[2]) : null;
  if (match && suffixLevel && suffixLevel > 1) candidates.unshift([match[1], suffixLevel]);
  for (const [name, level] of candidates) {
    const eventId = (Object.keys(DECORATION_TAGS) as SeasonalEventId[]).find(
      (id) => DECORATION_TAGS[id].name === name || (DECORATION_TAGS[id].aliases ?? []).includes(name),
    );
    if (eventId) return { eventId, tagId: editionTagId(DECORATION_TAGS[eventId].id, level), level };
  }
  return null;
};

// O grande dia de cada tema (contagem regressiva da decoração).
export const EVENT_DAY: Record<SeasonalEventId, { month: number; day: number }> = {
  halloween: { month: 10, day: 31 },
  christmas: { month: 12, day: 25 },
};

// Dias até o próximo grande dia, no calendário de Brasília (0 = é hoje).
export const daysUntilEventDay = (eventId: SeasonalEventId, now = new Date()): number => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: BRASILIA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const y = get('year');
  const today = Date.UTC(y, get('month') - 1, get('day'));
  const { month, day } = EVENT_DAY[eventId];
  let target = Date.UTC(y, month - 1, day);
  if (target < today) target = Date.UTC(y + 1, month - 1, day);
  return Math.round((target - today) / 86_400_000);
};

