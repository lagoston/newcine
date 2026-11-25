import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { tmdbImage } from './tmdbImage';
import { POSTERS_CHANGED_EVENT, clearEquippedCache, loadEquippedPosters, posterKey, useEquippedPoster, useEquippedPosters, type EquippedMap, type EquippedPoster } from './equippedPosters';
import { Q, fetchCached, invalidate, ownerNow, patchCached, peekCached, takeBootPart, useCached, useOwner, type Cached } from './data';

// Poster Jackpot (30/10/2026): a roleta do Oracle Hub que sorteia pôsteres
// alternativos (escolhidos à mão no TMDB) em 4 raridades e 3 efeitos
// especiais, sem nunca repetir um pôster. Todo sorteio, ticket e missão roda
// no banco (migrações 20261030300000, 20261030400000 e 20261030410000); aqui
// ficam os tipos, as chamadas e o pôster equipado de cada pessoa (que troca
// a capa na biblioteca dela e no menu do título).

export type PosterRarity = 'common' | 'rare' | 'epic' | 'legendary';
// 'gold' (03/11/2026, Pôster Poker): o brilho dourado, só dos 9 pôsteres do torneio
// semanal do pôquer. Fica fora de EFFECTS: a roleta nunca sorteia.
export type PosterEffect = 'none' | 'holo' | 'negative' | 'ultra_red' | 'gold';
export type TitleType = 'movie' | 'tv';

export const RARITIES: PosterRarity[] = ['legendary', 'epic', 'rare', 'common'];
export const EFFECTS: PosterEffect[] = ['holo', 'negative', 'ultra_red'];

// Cor de cada raridade (o cinza, o azul, o roxo e o dourado pedidos pelo
// Bruno) e a chance num ticket (a mesma do banco).
export const RARITY_META: Record<PosterRarity, { color: string; glow: string; odds: number }> = {
  // 16/11/2026 (pedido do Bruno): comum 56% e lendário 3% (antes 55% e 4%).
  // 25/11/2026 (pedido do Bruno): raro 32% e épico 9% (antes 28% e 13%; os 4
  // pontos do épico foram para o raro). No banco: migração
  // 20261125190000_jackpot_chances_ovni_numero_vago.sql.
  common: { color: '#B9B4AE', glow: 'rgba(185,180,174,0.5)', odds: 56 },
  rare: { color: '#5EA8FF', glow: 'rgba(94,168,255,0.6)', odds: 32 },
  epic: { color: '#C77DFF', glow: 'rgba(199,125,255,0.65)', odds: 9 },
  legendary: { color: '#FFC83D', glow: 'rgba(255,200,61,0.7)', odds: 3 },
};

export const EFFECT_META: Record<Exclude<PosterEffect, 'none'>, { color: string; odds: number }> = {
  holo: { color: '#67E8F9', odds: 80 },
  negative: { color: '#E5E7EB', odds: 15 },
  ultra_red: { color: '#F87171', odds: 5 },
  gold: { color: '#F4C454', odds: 0 },
};

// 19/11/2026 (Reborn, onda 2b): o endereço das imagens do TMDB mora em lib/tmdbImage.ts
export const posterUrl = (filePath: string, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w342') =>
  tmdbImage(filePath, size);

export interface PosterItem {
  id: number;
  media_type: TitleType;
  tmdb_id: number;
  rarity: PosterRarity;
  // Número de colecionador dentro da raridade (Lendário nº 7…): por ordem de
  // entrada no catálogo e fixo para sempre (migração 20261031090000).
  serial: number | null;
  file_path: string;
  title_pt: string | null;
  title_en: string | null;
  year: number | null;
}

export interface OwnedPoster extends PosterItem {
  effect: PosterEffect;
  equipped: boolean;
  in_library: boolean;
  first_pulled_at: string;
  // 03/11/2026 (pôquer): false = prêmio da mesa do Grande Blefe, que não entra
  // em trocas. Ausente nos servidores antigos (vale como true).
  tradeable?: boolean;
}

export interface JackpotMission {
  key: string;
  // 'poker_play' (03/11/2026): partidas de pôquer até o fim, só a partir da
  // semana em que o servidor ligar a missão.
  kind: 'rate_oracle' | 'rate_mood' | 'whisper' | 'review' | 'watchlist' | 'rate_any' | 'rate_series' | 'rate_classic' | 'poker_play';
  param: string | null;
  target: number;
  progress: number;
  claimed: boolean;
}

// O resumo do pôquer dentro do estado do Jackpot (poker_teaser no banco).
export interface PokerTeaserPrize {
  id: string;
  kind: string;
  rarity: PosterRarity;
  namePt: string;
  nameEn: string;
  articlePt: string | null;
  image: string | null;
  payload: Record<string, unknown>;
}

export interface PokerTeaser {
  day: string;
  // Prêmio de hoje (null num dia sem prêmio gravado).
  prize: PokerTeaserPrize | null;
  // Quem carrega o prêmio na mesa ('bogart' | 'cypher' | 'fincher' | rival novo).
  carrier: string | null;
  stars: number;
  attemptsUsed: number;
  maxAttempts: number;
  wonToday: boolean;
  // Há uma partida com prêmio em andamento.
  active: boolean;
  // A faixa de feltro da home (regra do veredito Q5, decidida no servidor).
  homeStrip: boolean;
  wins: number;
  matches: number;
  // Confirmação 18+ (null enquanto o servidor não mandar o campo).
  ageConfirmed: boolean | null;
}

export interface JackpotGift {
  kind: 'friday13';
  amount: number;
  day: string;
}

// Fichas (01/11/2026): o que era "ticket" no Jackpot virou "ficha" na tela
// (num porta-fichas de cassino). No banco e aqui os campos continuam com os
// nomes antigos: tickets = fichas comuns; special* = fichas especiais.
export interface JackpotState {
  enabled: boolean;
  tickets: number;
  premium: boolean;
  // Fichas especiais: a semanal do Premium (não acumula) + as guardadas
  // (convites e outros meios; acumulam). specialCount soma as duas.
  specialWeekly: boolean;
  specialTickets: number;
  specialAvailable: boolean;
  specialCount: number;
  // A barra da sorte: a cada LUCKY_GOAL giros com ficha, um Giro da Sorte
  // guardado. Desde 18/11/2026 ele é um bônus, não um giro grátis: o próximo
  // giro com ficha (comum ou especial) sai com as chances do Giro da Sorte
  // (LUCKY_ODDS) e gasta a ficha. luckyProgress vai de 0 a 9; luckySpins são
  // os bônus guardados (acumulam; cada giro com ficha usa um).
  luckyProgress: number;
  luckySpins: number;
  luckyGoal: number;
  weekEndsAt: string | null;
  missions: JackpotMission[];
  catalog: Record<PosterRarity | 'total', number>;
  owned: number;
  // Versões novas que ainda podem sair (nunca sai repetido): em qualquer
  // ticket / no especial (só as com efeito).
  remaining: number;
  remainingSpecial: number;
  // Presente ainda não avisado (02/11/2026): hoje só o da sexta-feira 13 da
  // tag Scary Clown (3 fichas especiais). O aviso marca com
  // markJackpotGiftSeen().
  gift: JackpotGift | null;
  // A pessoa tem a Scary Clown: a gaveta lembra a próxima sexta-feira 13.
  friday13Perk: boolean;
  // A ficha grátis de hoje ainda está lá (02/11/2026): o balão da porta.
  dailyChip: boolean;
  // O Grande Blefe (03/11/2026): o resumo do pôquer que o get_jackpot_state
  // traz. null = fechado para esta conta, servidor antigo ou campo torto —
  // nesse caso nada do pôquer aparece (aba, linha, faixa da home).
  poker: PokerTeaser | null;
}

// A ficha do dia acabou de ser pega: a aba Missões mostra a recompensa.
// at = quando (chave para a ficha cair uma vez só).
export interface DailyReward {
  tickets: number;
  at: number;
}

// Um pôster do catálogo (para a fita da roleta).
export interface CatalogPoster {
  id: number;
  rarity: PosterRarity;
  serial: number | null;
  file_path: string;
  media_type: TitleType;
  tmdb_id: number;
}

// Com o que se gira: ficha comum ou especial. 'lucky' era o Giro da Sorte
// grátis, que o banco recusa desde 18/11/2026 (o Giro da Sorte virou o bônus
// do próximo giro com ficha); fica no tipo porque o banco ainda devolve
// kind = 'lucky' num giro que veio com o bônus.
export type PullKind = 'normal' | 'special' | 'lucky';
export type PullChip = 'normal' | 'special';

export const LUCKY_GOAL = 10;
// O Giro da Sorte (16/11/2026, pedido do Bruno): raro 20%, épico 50%, lendário
// 30%, nunca comum (os efeitos seguem o giro com ficha comum). As mesmas do banco.
export const LUCKY_ODDS: Partial<Record<PosterRarity, number>> = { rare: 20, epic: 50, legendary: 30 };

export interface PullResult {
  item: PosterItem;
  effect: PosterEffect;
  kind: PullKind;
  // A ficha que entrou e se o giro veio com o bônus do Giro da Sorte (18/11/2026).
  chip: PullChip;
  lucky: boolean;
  tickets: number;
  specialTickets: number;
  specialWeekly: boolean;
  luckyProgress: number;
  luckySpins: number;
  // Este giro completou a barra (ganhou um Giro da Sorte).
  luckyEarned: boolean;
}

// Monta os campos da ficha especial a partir da semanal e das guardadas.
export const specialFields = (weekly: boolean, bonus: number) => ({
  specialWeekly: weekly,
  specialTickets: bonus,
  specialAvailable: weekly || bonus > 0,
  specialCount: (weekly ? 1 : 0) + bonus,
});

// A fonte dos letreiros (Cinzel Decorative), carregada só quando a roleta
// aparece. 18/11/2026 (Reborn, pacote): ela mora em /fonts (regras em
// src/styles/fonts.css), não mais no Google Fonts; aqui só se adianta o
// download do peso dos letreiros, para o título não aparecer primeiro na letra
// reserva quando a gaveta abre. Funciona sem internet no app.
let fontRequested = false;
export function loadJackpotFont() {
  if (fontRequested || typeof document === 'undefined') return;
  fontRequested = true;
  document.fonts?.load("700 1em 'Cinzel Decorative'").catch(() => undefined);
}

export const titleOf = (item: Pick<PosterItem, 'title_pt' | 'title_en'>, isPt: boolean) =>
  (isPt ? item.title_pt || item.title_en : item.title_en || item.title_pt) || '';

type Row = Record<string, unknown>;
const num = (value: unknown) => (typeof value === 'number' ? value : Number(value) || 0);

const RARITY_SET = new Set<PosterRarity>(['common', 'rare', 'epic', 'legendary']);

// Lê o campo "poker" com desconfiança: qualquer coisa fora do formato vira
// null (o Jackpot nunca cai por causa do pôquer). Só "enabled: true" abre.
export function parsePokerTeaser(value: unknown): PokerTeaser | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Row;
  if (raw.enabled !== true) return null;
  const p = raw.prize && typeof raw.prize === 'object' ? (raw.prize as Row) : null;
  const prize: PokerTeaserPrize | null =
    p && typeof p.id === 'string'
      ? {
          id: p.id,
          kind: typeof p.kind === 'string' ? p.kind : 'unknown',
          rarity: RARITY_SET.has(p.rarity as PosterRarity) ? (p.rarity as PosterRarity) : 'common',
          namePt: typeof p.name_pt === 'string' ? p.name_pt : typeof p.name_en === 'string' ? p.name_en : p.id,
          nameEn: typeof p.name_en === 'string' ? p.name_en : typeof p.name_pt === 'string' ? p.name_pt : p.id,
          articlePt: typeof p.article_pt === 'string' ? p.article_pt : null,
          image: typeof p.image === 'string' ? p.image : null,
          payload: p.payload && typeof p.payload === 'object' ? (p.payload as Record<string, unknown>) : {},
        }
      : null;
  return {
    day: typeof raw.day === 'string' ? raw.day : '',
    prize,
    carrier: typeof raw.carrier === 'string' ? raw.carrier : null,
    stars: Math.max(0, Math.min(4, num(raw.stars))),
    attemptsUsed: num(raw.attempts_used),
    maxAttempts: num(raw.max_attempts) || 3,
    wonToday: raw.won_today === true,
    active: raw.active === true,
    homeStrip: raw.home_strip === true,
    wins: num(raw.wins),
    matches: num(raw.matches),
    ageConfirmed: typeof raw.age_confirmed === 'boolean' ? raw.age_confirmed : null,
  };
}

const parseGift = (value: unknown): JackpotGift | null => {
  const gift = value as Row | null;
  if (!gift || gift.kind !== 'friday13') return null;
  return { kind: 'friday13', amount: num(gift.amount) || 3, day: typeof gift.day === 'string' ? gift.day : '' };
};

async function loadJackpotState(): Promise<JackpotState> {
  // 19/11/2026 (Reborn, onda 2b): na abertura da Home o estado vem no pedido
  // único das pesadas (get_app_bootstrap, parte "jackpot"). Cada parte serve
  // uma vez: recarregar (a gaveta ao abrir, a ficha voadora) chama a RPC.
  const boot = await takeBootPart<unknown>(ownerNow(), 'jackpot');
  let data: unknown = boot?.value;
  if (!boot) {
    const reply = await supabase.rpc('get_jackpot_state');
    if (reply.error) throw reply.error;
    data = reply.data;
  }
  const raw = (data || {}) as Row;
  const catalog = (raw.catalog || {}) as Row;
  return {
    enabled: raw.enabled === true,
    tickets: num(raw.tickets),
    premium: raw.premium === true,
    ...specialFields(raw.special_weekly === true, num(raw.special_tickets)),
    luckyProgress: num(raw.lucky_progress),
    luckySpins: num(raw.lucky_spins),
    luckyGoal: num(raw.lucky_goal) || LUCKY_GOAL,
    weekEndsAt: typeof raw.week_ends_at === 'string' ? raw.week_ends_at : null,
    missions: Array.isArray(raw.missions) ? (raw.missions as JackpotMission[]) : [],
    catalog: {
      common: num(catalog.common),
      rare: num(catalog.rare),
      epic: num(catalog.epic),
      legendary: num(catalog.legendary),
      total: num(catalog.total),
    },
    owned: num(raw.owned),
    remaining: num(raw.remaining),
    remainingSpecial: num(raw.remaining_special),
    gift: parseGift(raw.gift),
    friday13Perk: raw.friday13_perk === true,
    dailyChip: raw.daily_chip === true,
    poker: parsePokerTeaser(raw.poker),
  };
}

// 18/11/2026 (Reborn, onda 2a): o estado do Jackpot é uma consulta da camada
// de dados (chave ['jackpot','state'], vale 1 min). Medido na prévia de rede:
// numa sessão de 6 telas get_jackpot_state saía 3× (a Home, o Perfil e a Home
// de novo, cada um por conta própria) e agora sai 1×. Quem refaz: a ficha
// voadora ('jackpot:chips'), a gaveta ao abrir (refreshJackpotState) e a volta
// ao app depois do prazo. Um giro corrige o saldo com a própria resposta
// (patchJackpotState), sem pedir de novo.
export function fetchJackpotState(): Promise<JackpotState> {
  return fetchCached(Q.jackpotState(ownerNow()), loadJackpotState);
}

// O estado para um componente (undefined enquanto carrega).
export function useJackpotState(): Cached<JackpotState> {
  return useCached(Q.jackpotState(useOwner()), loadJackpotState);
}

// Lê de novo agora (quem está mostrando recebe o estado novo).
export function refreshJackpotState(): Promise<void> {
  return invalidate(['jackpot', 'state']);
}

// Corrige o estado guardado com o que a tela acabou de saber (saldo depois de
// um giro, missão resgatada, ficha do dia pega).
export function patchJackpotState(value: Partial<JackpotState>): void {
  patchCached<JackpotState>(Q.jackpotState(ownerNow()), (current) => ({ ...current, ...value }));
}

// Pega a ficha grátis de hoje (uma por dia, dia de Brasília).
// reason: 'already' (já foi pega hoje) ou 'closed' (Jackpot fechado).
export async function claimDailyChip(): Promise<{ ok: boolean; reason?: 'already' | 'closed'; tickets: number | null }> {
  const { data, error } = await supabase.rpc('jackpot_claim_daily');
  if (error) throw error;
  const raw = (data || {}) as Row;
  return {
    ok: raw.ok === true,
    reason: raw.reason === 'already' || raw.reason === 'closed' ? raw.reason : undefined,
    tickets: typeof raw.tickets === 'number' ? raw.tickets : null,
  };
}

// O aviso do presente foi mostrado (não aparece de novo).
export async function markJackpotGiftSeen(): Promise<void> {
  const { error } = await supabase.rpc('jackpot_gift_seen');
  if (error) throw error;
}

// A próxima sexta-feira 13 a partir de hoje (incluindo hoje), no fuso de
// quem está olhando — para a gaveta lembrar quem tem a Scary Clown.
export function nextFriday13(from = new Date()): Date {
  const day = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < 28; i += 1) {
    const candidate = new Date(day.getFullYear(), day.getMonth() + i, 13);
    if (candidate >= day && candidate.getDay() === 5) return candidate;
  }
  return day;
}

// 18/11/2026 (Reborn, onda 2a): o catálogo é uma consulta da camada de dados
// (chave ['jackpot','catalog'], vale 1 h, guardado no aparelho por pessoa).
// Antes havia a promessa guardada aqui e uma cópia já resolvida na gaveta
// (catalogMemo), criada só porque a promessa não entrega o valor no primeiro
// quadro — é o que peekJackpotCatalog() faz. O banco devolve [] para quem não
// tem a roleta liberada: lista vazia não fica valendo (keys.ts).
async function loadJackpotCatalog(): Promise<CatalogPoster[]> {
  const { data, error } = await supabase.rpc('get_jackpot_catalog');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as CatalogPoster[];
}

export function fetchJackpotCatalog(): Promise<CatalogPoster[]> {
  return fetchCached(Q.jackpotCatalog(ownerNow()), loadJackpotCatalog);
}

// O catálogo que já está guardado, na hora, sem ir à rede (null se não há).
export function peekJackpotCatalog(): CatalogPoster[] | null {
  const owner = ownerNow();
  if (typeof owner !== 'string') return null;
  const list = peekCached<CatalogPoster[]>(Q.jackpotCatalog(owner));
  return list && list.length > 0 ? list : null;
}

// ---------------------------------------------------------------------------
// Coleção e pôster equipado (guardados na memória da página; qualquer
// sorteio ou troca avisa quem estiver mostrando).
// 04/11/2026: o aviso e os caches subiram para antes do primeiro uso (o giro
// e o contrato chamam notifyPostersChanged), e JackpotGift / parseGift /
// EquippedMap também foram para antes de quem os usa: só mudou a ordem, para
// o lint (no-use-before-define) ficar limpo.
// ---------------------------------------------------------------------------

// 22/11/2026: a leitura dos equipados mudou para lib/equippedPosters.ts (um
// arquivo pequeno, que a casca do app pode carregar sem trazer a roleta). Os
// nomes continuam saindo daqui para quem já importava.
export { posterKey, loadEquippedPosters, useEquippedPosters, useEquippedPoster };
export type { EquippedPoster, EquippedMap };

const CHANGED_EVENT = POSTERS_CHANGED_EVENT;
let myPostersPromise: Promise<OwnedPoster[]> | null = null;

export function notifyPostersChanged() {
  myPostersPromise = null;
  clearEquippedCache();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED_EVENT));
}

// O motivo de um giro recusado pelo banco (mensagem da exceção).
export const pullErrorCode = (error: unknown): string => {
  const message = (error as { message?: string })?.message || '';
  return ['no_tickets', 'no_special', 'no_lucky', 'collection_complete', 'jackpot_closed'].find((code) => message.includes(code)) || 'error';
};

export async function pullJackpot(chip: PullChip): Promise<PullResult> {
  const { data, error } = await supabase.rpc('jackpot_pull', { p_kind: chip });
  if (error) throw error;
  const raw = data as Row;
  notifyPostersChanged();
  return {
    item: raw.item as PosterItem,
    effect: raw.effect as PosterEffect,
    kind: raw.kind as PullKind,
    chip: raw.chip === 'special' || raw.chip === 'normal' ? raw.chip : chip,
    lucky: raw.lucky === true || raw.kind === 'lucky',
    tickets: num(raw.tickets),
    specialTickets: num(raw.special_tickets),
    specialWeekly: raw.special_weekly === true,
    luckyProgress: num(raw.lucky_progress),
    luckySpins: num(raw.lucky_spins),
    luckyEarned: raw.lucky_earned === true,
  };
}

export async function claimMission(key: string): Promise<{ tickets: number }> {
  const { data, error } = await supabase.rpc('jackpot_claim_mission', { p_key: key });
  if (error) throw error;
  const raw = data as Row;
  return { tickets: num(raw.tickets) };
}

export function loadMyPosters(): Promise<OwnedPoster[]> {
  if (!myPostersPromise) {
    myPostersPromise = (async () => {
      const { data, error } = await supabase.rpc('get_my_posters');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as OwnedPoster[];
    })().catch((error) => {
      myPostersPromise = null;
      throw error;
    });
  }
  return myPostersPromise;
}

// A coleção de quem está logado (para o menu de equipar na biblioteca).
export function useMyPosters(enabled: boolean): OwnedPoster[] | null {
  const [list, setList] = useState<OwnedPoster[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      loadMyPosters()
        .then((result) => alive && setList(result))
        .catch(() => alive && setList([]));
    load();
    window.addEventListener(CHANGED_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED_EVENT, load);
    };
  }, [enabled]);
  return list;
}

export async function equipPoster(itemId: number, effect: PosterEffect) {
  const { error } = await supabase.rpc('equip_poster', { p_item_id: itemId, p_effect: effect });
  if (error) throw error;
  notifyPostersChanged();
}

export async function unequipPoster(mediaType: TitleType, tmdbId: number) {
  const { error } = await supabase.rpc('unequip_poster', { p_media_type: mediaType, p_tmdb_id: tmdbId });
  if (error) throw error;
  notifyPostersChanged();
}

// ---------------------------------------------------------------------------
// O Mercado Negro da Cobra (04/11/2026, pedido do Bruno): o "contrato" do
// CS:GO. A pessoa entrega `size` pôsteres da mesma raridade e recebe 1 da
// raridade de cima que ainda não tem. Tudo é conferido e sorteado no banco
// (migração 20261104090000_jackpot_contracts.sql); aqui ficam os tipos, as
// duas chamadas e o código de erro. Os números (quantos entram, quanto cada
// efeito soma, o teto e o piso) vêm sempre do servidor, que pode regulá-los
// sem migração: a tela nunca usa constante fixa para eles.
// ---------------------------------------------------------------------------

// As raridades que entram num contrato (o lendário só sai, nunca entra).
export type ContractRarity = 'common' | 'rare' | 'epic';
// Por que um pôster não pode entrar: prêmio da mesa do pôquer (intrável) ou
// apostado numa partida aberta do pôquer.
export type ContractLock = 'prize' | 'staked';

export interface ContractPoster extends PosterItem {
  effect: PosterEffect;
  first_pulled_at: string;
  equipped: boolean;
  // Está numa proposta de troca aberta (a proposta cai se o contrato fechar).
  in_trade: boolean;
  lock: ContractLock | null;
}

export interface ContractTier {
  from: ContractRarity;
  to: Exclude<PosterRarity, 'common'>;
  // Quantas versões (pôster + efeito) da raridade de cima a pessoa ainda pode
  // receber; 0 = degrau completo.
  left: number;
}

export interface ContractBoard {
  // false = contrato fechado para esta pessoa (a aba mostra "em breve").
  open: boolean;
  size: number;
  effectStep: number;
  effectCap: number;
  effectFloor: number;
  tiers: ContractTier[];
  posters: ContractPoster[];
}

export interface ContractResult {
  contractId: number;
  pullId: number;
  poster: PosterItem & { effect: PosterEffect };
  effectChance: number;
  effectRolled: boolean;
  // Quantas versões da raridade de cima ainda faltam depois deste contrato.
  left: number;
}

const CONTRACT_FROM: ContractRarity[] = ['common', 'rare', 'epic'];
const CONTRACT_TO: Record<ContractRarity, ContractTier['to']> = { common: 'rare', rare: 'epic', epic: 'legendary' };
const CONTRACT_EFFECTS = new Set<PosterEffect>(['none', 'holo', 'negative', 'ultra_red']);

// A mesa da Cobra lida com desconfiança (como o resumo do pôquer): campo
// torto vira o valor seguro, e os três degraus saem sempre na mesma ordem.
// Os números caem nos padrões da migração só se o servidor não mandar.
export async function getContractBoard(): Promise<ContractBoard> {
  const { data, error } = await supabase.rpc('get_jackpot_contract_board');
  if (error) throw error;
  const raw = (data || {}) as Row;
  const tierRows = Array.isArray(raw.tiers) ? (raw.tiers as Row[]) : [];
  const tiers = CONTRACT_FROM.map((from) => {
    const row = tierRows.find((tier) => tier && tier.from === from);
    return { from, to: CONTRACT_TO[from], left: row ? Math.max(0, num(row.left)) : 0 };
  });
  const posters = (Array.isArray(raw.posters) ? (raw.posters as Row[]) : [])
    .filter((p) => p && CONTRACT_FROM.includes(p.rarity as ContractRarity) && CONTRACT_EFFECTS.has(p.effect as PosterEffect))
    .map(
      (p): ContractPoster => ({
        ...(p as unknown as PosterItem),
        effect: p.effect as PosterEffect,
        first_pulled_at: typeof p.first_pulled_at === 'string' ? p.first_pulled_at : '',
        equipped: p.equipped === true,
        in_trade: p.in_trade === true,
        lock: p.lock === 'prize' || p.lock === 'staked' ? p.lock : null,
      })
    );
  const size = num(raw.size) || 6;
  return {
    open: raw.open === true,
    size,
    effectStep: raw.effect_step == null ? 10 : num(raw.effect_step),
    effectCap: raw.effect_cap == null ? 60 : num(raw.effect_cap),
    effectFloor: raw.effect_floor == null ? 5 : num(raw.effect_floor),
    tiers,
    posters,
  };
}

// O motivo de um contrato recusado (mensagem da exceção do Postgres), como
// tradeErrorCode das trocas. A ordem importa: 'closed' fica por último porque
// é a palavra mais curta e genérica da lista.
const CONTRACT_ERRORS = [
  'not_authenticated',
  'target_complete',
  'wrong_rarity',
  'bad_rarity',
  'bad_size',
  'bad_item',
  'duplicate',
  'not_owned',
  'exclusive',
  'prize',
  'staked',
  'closed',
] as const;
export type ContractErrorCode = (typeof CONTRACT_ERRORS)[number] | 'error';
export const contractErrorCode = (error: unknown): ContractErrorCode => {
  const message = (error as { message?: string })?.message || '';
  return CONTRACT_ERRORS.find((code) => message.includes(code)) || 'error';
};

// Fecha o contrato. Os itens vão na ordem em que a pessoa pôs na mesa.
// Deu certo: a coleção mudou (6 saíram, 1 entrou), então todo mundo que mostra
// pôsteres é avisado, como num giro.
export async function signContract(rarity: ContractRarity, items: { item_id: number; effect: PosterEffect }[]): Promise<ContractResult> {
  const { data, error } = await supabase.rpc('jackpot_contract', { p_rarity: rarity, p_items: items });
  if (error) throw error;
  const raw = (data || {}) as Row;
  notifyPostersChanged();
  const poster = (raw.poster || {}) as Row;
  return {
    contractId: num(raw.contract_id),
    pullId: num(raw.pull_id),
    poster: { ...(poster as unknown as PosterItem), effect: (CONTRACT_EFFECTS.has(poster.effect as PosterEffect) ? poster.effect : 'none') as PosterEffect },
    effectChance: num(raw.effect_chance),
    effectRolled: raw.effect_rolled === true,
    left: num(raw.left),
  };
}
