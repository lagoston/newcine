import type { TFunction } from 'i18next';
import { supabase } from './supabase';
import { Q, isMissingFunction, useCached, useOwner } from './data';
import type { SeasonalEventState } from './seasonalEvents';

// O amigo secreto do Natal: a raspadinha (28/11/2026).
//
// Pedido do Bruno: "o primeiro desafio ao invés de um sussurrar deve ser um
// presentinho de verdade, que pode ser dado de 'amigo secreto' de Natal para um
// amigo que só poderá receber um. Uma raspadinha de Natal que poderá dar até 3
// fichas especiais, e com um mínimo de 2 fichas comuns."
//
// As regras moram no banco (migração 20261128110000_amigo_secreto.sql): cada
// pessoa dá uma e ganha no máximo uma por Natal; quem não tem amigo livre deixa
// o Oráculo entregar; quem ganhou só descobre quem deu depois de raspar; o
// sorteio é feito lá, na hora da raspada. Aqui ficam só o formato das
// respostas e as três chamadas.

export interface SecretPerson {
  id: string;
  username: string | null;
  avatar_url: string | null;
  avatar_frame?: string | null;
  plan_type?: string | null;
}

export interface SecretFriendCandidate extends SecretPerson {
  // já ganhou a raspadinha deste Natal (de qualquer pessoa)
  taken: boolean;
}

export interface SecretFriendSent {
  // null: o Oráculo entregou (ou é o ensaio da Conta Diretor)
  to: SecretPerson | null;
  via: 'friend' | 'oracle' | 'trial';
  at?: string;
  // quem ganhou já raspou
  scratched: boolean;
}

export interface SecretFriendReceived {
  scratched: boolean;
  // a raspadinha de mostruário do ensaio da Conta Diretor
  trial?: boolean;
  at?: string;
  edition?: number;
  // só depois de raspada:
  tickets?: number;
  special?: number;
  spots?: number[];
  from?: SecretPerson | null;
}

export interface SecretFriendState {
  // o Natal está no ar (ou é o ensaio do diretor)
  open: boolean;
  trial: boolean;
  edition: number;
  sent: SecretFriendSent | null;
  received: SecretFriendReceived | null;
  friends: SecretFriendCandidate[];
}

export interface ScratchPrize {
  tickets: number;
  special: number;
  // em quais das três janelas (0, 1, 2) saiu ficha especial
  spots: number[];
  from: SecretPerson | null;
  trial?: boolean;
}

// "2 fichas" · "2 fichas e 1 ficha especial"
export const prizeText = (t: TFunction, tickets: number, special: number): string => {
  const common = t('events.christmas.scratch.tickets', { count: tickets });
  if (special <= 0) return common;
  return t('events.christmas.scratch.and', { a: common, b: t('events.christmas.scratch.special', { count: special }) });
};

export type SendError = 'taken' | 'already_sent' | 'not_friend' | 'pick_friend' | 'not_open' | 'bot' | 'failed';

async function fetchSecretFriend(preview: string | null): Promise<SecretFriendState | null> {
  const { data, error } = await supabase.rpc('get_secret_friend', { p_preview: preview });
  if (error) {
    // o site novo antes da migração: o painel segue sem a raspadinha
    if (isMissingFunction(error)) return null;
    throw error;
  }
  const raw = data as Partial<SecretFriendState> | null;
  if (!raw || typeof raw.open !== 'boolean') return null;
  return {
    open: raw.open,
    trial: raw.trial === true,
    edition: Number(raw.edition) || 0,
    sent: raw.sent ?? null,
    received: raw.received ?? null,
    friends: Array.isArray(raw.friends) ? raw.friends : [],
  };
}

// A prévia que o banco precisa saber: só o ensaio da Conta Diretor.
export const secretFriendPreview = (event: Pick<SeasonalEventState, 'id' | 'is_trial'> | null): string | null =>
  event?.is_trial ? event.id : null;

// undefined = ainda chegando; null = não há (visitante, outro evento, função ausente).
export function useSecretFriend(event: SeasonalEventState | null): SecretFriendState | null | undefined {
  const owner = useOwner();
  const on = event?.id === 'christmas' && typeof owner === 'string';
  const preview = secretFriendPreview(event);
  const { data, error } = useCached(Q.secretFriend(on ? owner : undefined, preview), () => fetchSecretFriend(preview));
  if (!on) return null;
  if (data !== undefined) return data;
  return error ? null : undefined;
}

// Dar a raspadinha a um amigo (ou, sem `to`, deixar o Oráculo entregar).
export async function sendSecretFriend(to: string | null, preview: string | null): Promise<{ ok: true; sent: SecretFriendSent } | { ok: false; error: SendError }> {
  const { data, error } = await supabase.rpc('secret_friend_send', { p_to: to, p_preview: preview });
  const raw = data as { ok?: boolean; error?: string; via?: SecretFriendSent['via']; to?: SecretPerson | null } | null;
  if (error || !raw) return { ok: false, error: 'failed' };
  if (!raw.ok) return { ok: false, error: (raw.error as SendError) || 'failed' };
  return { ok: true, sent: { to: raw.to ?? null, via: raw.via ?? 'friend', scratched: false } };
}

// Raspar a que eu ganhei: o banco sorteia e credita as fichas.
export async function scratchSecretFriend(preview: string | null): Promise<ScratchPrize | null> {
  const { data, error } = await supabase.rpc('secret_friend_scratch', { p_preview: preview });
  const raw = data as ({ ok?: boolean } & Partial<ScratchPrize>) | null;
  if (error || !raw?.ok) return null;
  return {
    tickets: Number(raw.tickets) || 0,
    special: Number(raw.special) || 0,
    spots: Array.isArray(raw.spots) ? raw.spots.map(Number) : [],
    from: raw.from ?? null,
    trial: raw.trial === true,
  };
}
