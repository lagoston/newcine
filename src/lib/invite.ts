import toast from 'react-hot-toast';
import { supabase } from './supabase';
import { IS_NATIVE_APP } from './platform';
import i18n from '../i18n';

// Convites (31/10/2026): quem cria a conta pelo link de alguém ganha 3
// tickets especiais do Poster Jackpot, e quem convidou também.
//
// Caminho do código:
//   1. o link é https://www.cineoracle.com/auth?signup=true&convite=<código>;
//      ao abrir o site, captureInviteFromUrl() guarda o código neste
//      navegador e tira o parâmetro da barra de endereço;
//   2. no cadastro, o código vai junto (raw_user_meta_data.invite_code);
//   3. quando o e-mail é confirmado, o banco credita os dois (gatilho
//      zz_jackpot_invite_on_confirm). No primeiro login o site ainda chama
//      redeem_invite como segunda chance, e avisa a pessoa.

const KEY = 'cineoracle:invite';
const MAX_AGE = 30 * 86400000;
export const SITE_URL = 'https://www.cineoracle.com';
export const INVITE_REWARD = 3;

const clean = (code: string | null | undefined) => (code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);

export function captureInviteFromUrl() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const code = clean(url.searchParams.get('convite'));
    if (!code) return;
    window.localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    url.searchParams.delete('convite');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // sem armazenamento: o convite não é guardado
  }
}

export function getPendingInvite(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!code || !at || Date.now() - at > MAX_AGE) {
      window.localStorage.removeItem(KEY);
      return null;
    }
    return clean(code) || null;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nada a limpar
  }
}

export const inviteLink = (code: string) => `${SITE_URL}/auth?signup=true&convite=${encodeURIComponent(code)}`;

export interface MyInvite {
  code: string;
  link: string;
  joined: number;
  rewarded: number;
}

export async function getMyInvite(): Promise<MyInvite> {
  const { data, error } = await supabase.rpc('get_my_invite');
  if (error) throw error;
  const raw = (data || {}) as { code?: string; joined?: number; rewarded?: number };
  const code = raw.code || '';
  return { code, link: inviteLink(code), joined: Number(raw.joined) || 0, rewarded: Number(raw.rewarded) || 0 };
}

export async function getInvitePreview(code: string): Promise<{ username: string; avatar_url: string | null } | null> {
  const { data, error } = await supabase.rpc('get_invite_preview', { p_code: code });
  if (error || !data) return null;
  return data as { username: string; avatar_url: string | null };
}

// Segunda chance no login: só quando há um convite guardado neste navegador.
let redeeming = false;
export async function redeemPendingInvite() {
  const code = getPendingInvite();
  if (!code || redeeming) return;
  redeeming = true;
  try {
    const { data, error } = await supabase.rpc('redeem_invite', { p_code: code });
    if (error) return; // tenta de novo no próximo login
    clearPendingInvite();
    const res = (data || {}) as { status?: string; inviter?: string | null };
    if (res.status === 'ok') {
      toast.success(i18n.t('invite.redeemed', { name: res.inviter || '', count: INVITE_REWARD }), { duration: 6000 });
    }
  } finally {
    redeeming = false;
  }
}

// Compartilhar o convite: folha do Android no app, Web Share no celular,
// senão copia o link.
export async function shareInvite(link: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = i18n.t('invite.shareText', { count: INVITE_REWARD });
  const title = 'CineOracle';
  try {
    if (IS_NATIVE_APP) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, url: link, dialogTitle: i18n.t('invite.shareDialog') });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title, text, url: link });
      return 'shared';
    }
  } catch (error) {
    const name = (error as { name?: string })?.name || '';
    const message = String((error as { message?: string })?.message || '');
    if (name === 'AbortError' || /cancel/i.test(message)) return 'cancelled';
  }
  return (await copyInvite(link)) ? 'copied' : 'failed';
}

export async function copyInvite(link: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = link;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}
