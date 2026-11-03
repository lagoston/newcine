import type { PokerTeaserPrize, PosterEffect, PosterRarity } from '../../../lib/posterJackpot';

type Row = Record<string, unknown>;
const RARITIES: PosterRarity[] = ['common', 'rare', 'epic', 'legendary'];
const EFFECT_SET: PosterEffect[] = ['none', 'holo', 'negative', 'ultra_red'];

// Um prêmio vindo do banco (poker_prize_json, em snake_case) no formato que
// as telas usam. Qualquer campo torto vira um valor neutro.
export function toPrizeView(value: unknown): PokerTeaserPrize | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Row;
  if (typeof p.id !== 'string') return null;
  const namePt = typeof p.name_pt === 'string' ? p.name_pt : typeof p.namePt === 'string' ? p.namePt : '';
  const nameEn = typeof p.name_en === 'string' ? p.name_en : typeof p.nameEn === 'string' ? p.nameEn : '';
  return {
    id: p.id,
    kind: typeof p.kind === 'string' ? p.kind : 'unknown',
    rarity: RARITIES.includes(p.rarity as PosterRarity) ? (p.rarity as PosterRarity) : 'common',
    namePt: namePt || nameEn || p.id,
    nameEn: nameEn || namePt || p.id,
    articlePt: typeof p.article_pt === 'string' ? p.article_pt : null,
    image: typeof p.image === 'string' ? p.image : null,
    payload: p.payload && typeof p.payload === 'object' ? (p.payload as Record<string, unknown>) : {},
  };
}

// O pôster de um prêmio do tipo "poster": arquivo, efeito e número de série.
export function posterOfPrize(prize: Pick<PokerTeaserPrize, 'image' | 'payload' | 'rarity'>) {
  const poster = prize.payload.poster && typeof prize.payload.poster === 'object' ? (prize.payload.poster as Row) : {};
  const filePath = typeof poster.file_path === 'string' ? poster.file_path : prize.image;
  const rawEffect = (poster.effect ?? prize.payload.effect) as PosterEffect;
  const effect: PosterEffect = EFFECT_SET.includes(rawEffect) ? rawEffect : 'none';
  const serial = typeof poster.serial === 'number' ? poster.serial : null;
  return filePath && filePath.startsWith('/') ? { filePath, effect, serial } : null;
}

// O Grande Blefe — dados pequenos que as entradas (gaveta do Jackpot, faixa
// da home, placar, 18+) compartilham. Sem JSX: só constantes e funções puras.

export type PokerOracleId = 'bogart' | 'cypher' | 'fincher';

// Os três oráculos na mesa: o rosto redondo (o mesmo avatar do app) e a cor
// do bicho (de ORACLES). Rival novo cai no genérico (carrierOf → null).
export const POKER_ORACLES: Record<PokerOracleId, { id: PokerOracleId; avatar: string; color: string }> = {
  bogart: { id: 'bogart', avatar: '/avatar-sapo.webp', color: '#7BC25A' },
  cypher: { id: 'cypher', avatar: '/avatar-cobra.webp', color: '#E2C84A' },
  fincher: { id: 'fincher', avatar: '/avatar-raposa.webp', color: '#EE7A3E' },
};

// Ordem da mesa (sentido horário a partir de você): Sapo, Raposo, Cobra.
export const SEAT_ORDER: PokerOracleId[] = ['bogart', 'fincher', 'cypher'];

export const isPokerOracle = (id: string | null | undefined): id is PokerOracleId =>
  id === 'bogart' || id === 'cypher' || id === 'fincher';

export const carrierOf = (id: string | null | undefined) => (isPokerOracle(id) ? POKER_ORACLES[id] : null);

// Títulos por vitórias (SPEC §2.9). Só para mostrar: quem decide é o servidor.
export type PokerTitleId = 'figurante' | 'duble' | 'coadjuvante' | 'protagonista' | 'estrela' | 'lenda';
export const TITLE_STEPS: { id: PokerTitleId; at: number }[] = [
  { id: 'figurante', at: 0 },
  { id: 'duble', at: 3 },
  { id: 'coadjuvante', at: 10 },
  { id: 'protagonista', at: 25 },
  { id: 'estrela', at: 60 },
  { id: 'lenda', at: 150 },
];

export const isTitleId = (id: unknown): id is PokerTitleId => TITLE_STEPS.some((step) => step.id === id);

export function titleProgress(wins: number, serverId?: string | null) {
  const safe = Math.max(0, Math.floor(wins || 0));
  let index = 0;
  TITLE_STEPS.forEach((step, i) => {
    if (safe >= step.at) index = i;
  });
  // O servidor manda o título; se vier um id conhecido, ele vale.
  if (serverId && isTitleId(serverId)) index = TITLE_STEPS.findIndex((step) => step.id === serverId);
  const current = TITLE_STEPS[index];
  const next = TITLE_STEPS[index + 1] ?? null;
  const span = next ? next.at - current.at : 1;
  const share = next ? Math.max(0, Math.min(1, (safe - current.at) / span)) : 1;
  return { index, current, next, toNext: next ? Math.max(0, next.at - safe) : 0, share };
}

// Os 5 marcos (SPEC §2.9): id da tag, o emoji e a chave do texto.
export const MARKS: { tagId: string; key: 'firstWin' | 'foxHunter' | 'cleanSweep' | 'oscarBluff' | 'sevenNights'; emoji: string; name: string }[] = [
  { tagId: 'poker-first-win', key: 'firstWin', emoji: '🃏', name: 'Opening Night' },
  { tagId: 'poker-fox-hunter', key: 'foxHunter', emoji: '🦊', name: 'Fox Hunter' },
  { tagId: 'poker-clean-sweep', key: 'cleanSweep', emoji: '🧹', name: 'Clean Sweep' },
  { tagId: 'poker-oscar-bluff', key: 'oscarBluff', emoji: '🏆', name: 'Oscar Bluff' },
  { tagId: 'poker-seven-nights', key: 'sevenNights', emoji: '🌙', name: 'Seven Nights' },
];

// Brilho da raridade no cartão do prêmio (as cores do Jackpot).
export const RARITY_GLOW: Record<PosterRarity, string> = {
  common: 'rgba(185,180,174,0.45)',
  rare: 'rgba(94,168,255,0.55)',
  epic: 'rgba(199,125,255,0.6)',
  legendary: 'rgba(255,200,61,0.65)',
};

export const prizeNameOf = (prize: { namePt: string; nameEn: string } | null | undefined, isPt: boolean) =>
  prize ? (isPt ? prize.namePt || prize.nameEn : prize.nameEn || prize.namePt) : '';

// As rotas do salão (o pacote D1 registra em App.tsx).
export const BLEFE_ROUTES = {
  lobby: '/blefe',
  free: '/blefe/mesa',
  scoreboard: '/blefe/placar',
  bounty: (day: string, prizeId: string) =>
    `/blefe/premio?start=1&day=${encodeURIComponent(day)}&prize=${encodeURIComponent(prizeId)}`,
  resume: '/blefe/premio',
};
