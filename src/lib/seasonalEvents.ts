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
export type SeasonalStepKind = 'rate' | 'watchlist' | 'whisper';

export interface SeasonalStep {
  index: number;
  tag: string;
  name: string;
  emoji: string;
  kind: SeasonalStepKind;
  count: number;
  progress: number;
  unlocked: boolean;
  unlocked_at: string | null;
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
  starts_at: string;
  // fim exclusivo (meia-noite de Brasília do dia seguinte ao último)
  ends_at: string;
  is_active: boolean;
  is_preview: boolean;
  now: string;
  items: SeasonalItem[];
  actions: Partial<Record<SeasonalStepKind, number[]>>;
  steps: SeasonalStep[];
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

// Etapa em andamento: a primeira ainda não conquistada (null = tudo feito).
export const currentStep = (state: SeasonalEventState): SeasonalStep | null => state.steps.find((step) => !step.unlocked) ?? null;
