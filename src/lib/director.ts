// Conta Diretor (16/11/2026). Pedido do Bruno: uma conta escondida da
// comunidade, com tudo liberado e os menus de teste, para ver o site como ele
// fica sem mexer no de mais ninguém.
//
// O banco é quem decide (esquema privado `director`, migrações
// 20261116150000…160000). Aqui no site só há:
//   • get_director_state(): uma dica de tela, com a mesma forma para todo
//     mundo ({director, mfa, recent}). Quem falsificar a resposta no navegador
//     vê menus que não funcionam: toda função de diretor confere de novo.
//   • as preferências da tela do diretor (prévia de evento, estúdio completo),
//     guardadas só neste aparelho.
//   • o botão de pânico: larga o papel e sai de todos os aparelhos.
//
// Nada disto é segredo (o pacote do site é público); a segurança está no banco.
import { supabase } from './supabase';
import type { SeasonalEventId } from './seasonalEvents';

export interface DirectorState {
  // papel ativo (nível 1: menus de teste, prévias e desbloqueáveis da própria conta)
  director: boolean;
  // nível 2: papel + código do app autenticador nesta sessão
  mfa: boolean;
  // nível 3: código digitado há menos de 15 minutos
  recent: boolean;
}

export const NO_DIRECTOR: DirectorState = { director: false, mfa: false, recent: false };

export async function fetchDirectorState(): Promise<DirectorState> {
  const { data, error } = await supabase.rpc('get_director_state');
  if (error || !data || typeof data !== 'object') return NO_DIRECTOR;
  const raw = data as Record<string, unknown>;
  return { director: raw.director === true, mfa: raw.mfa === true, recent: raw.recent === true };
}

// Botão de pânico: o banco tira o papel (só volta por SQL) e a sessão cai em
// todos os aparelhos. A conta continua escondida.
export async function directorSelfRevoke(): Promise<void> {
  const { error } = await supabase.rpc('director_self_revoke');
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'global' });
}

// ---------------------------------------------------------------------------
// Preferências da tela do diretor (só neste aparelho)
// ---------------------------------------------------------------------------

export interface DirectorPrefs {
  // evento mostrado fora da época (o banco só aceita a prévia do diretor)
  eventPreview: SeasonalEventId | null;
  // o estúdio com os três bichinhos e todos os objetos de tag
  studioAll: boolean;
}

export const DEFAULT_PREFS: DirectorPrefs = { eventPreview: null, studioAll: false };

const prefsKey = (userId: string) => `cineoracle:director:${userId}`;

export function readDirectorPrefs(userId: string): DirectorPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(prefsKey(userId)) || 'null');
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    const event = (raw as Record<string, unknown>).eventPreview;
    return {
      eventPreview: event === 'halloween' || event === 'christmas' ? event : null,
      studioAll: (raw as Record<string, unknown>).studioAll === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeDirectorPrefs(userId: string, prefs: DirectorPrefs): void {
  try {
    localStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

// Efeitos de nome pedem resenhas escritas (1, 10, 30). O banco libera para o
// diretor; a tela usa esta contagem para desenhar e destrancar igual.
export const DIRECTOR_REVIEW_PASS = 1000;
