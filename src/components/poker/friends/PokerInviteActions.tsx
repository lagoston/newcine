import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { PokerClientError } from '../../../lib/poker/client/apiTypes';
import { friendsApi, type InviteState } from '../../../lib/poker/client/friends';
import { BLEFE_ROUTES } from '../jackpot/pokerMeta';

// O convite para a mesa com amigos nos Sussurros (03/11/2026, fase 3 — G3). O banco cria o
// sussurro (`friend_indications.type = 'poker_invite'`, `poker_room_id`, `message` = código);
// este pedaço mostra a aposta da sala e [Entrar] / [Recusar] ali mesmo, ou só o estado
// (entrou, recusou, encheu, começou, fechou). Entrar abre o Pôster Poker na sala.
//
// Encaixe no WhispersModal (arquivo do coordenador), três linhas:
//   • isJackpotWhisper: incluir `type === 'poker_invite'` (filtro "Jogos/Jackpot");
//   • headline: verbo `t('poker.friends.invite.whisper')` para 'poker_invite';
//   • renderActions: `if (whisper.type === 'poker_invite') return <PokerInviteActions
//       roomId={whisper.poker_room_id} code={whisper.message} onOpen={onClose} />;`
//
// O estado vem em lote do `get_poker_invites`; aqui pede só o da linha (com cache curto
// por sala), o que basta para a lista de Sussurros (poucos convites por vez).

const cache = new Map<string, { at: number; p: Promise<InviteState | null> }>();
function stateOf(roomId: string): Promise<InviteState | null> {
  const hit = cache.get(roomId);
  if (hit && Date.now() - hit.at < 15_000) return hit.p;
  const api = friendsApi();
  const p = api ? api.inviteStates([roomId]).then((l) => l.find((x) => x.roomId === roomId) ?? null, () => null) : Promise.resolve(null);
  cache.set(roomId, { at: Date.now(), p });
  return p;
}

const btn =
  'inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-lg text-sm font-semibold transition disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-300';

const PokerInviteActions: React.FC<{ roomId: string | null | undefined; code?: string | null; onOpen?: () => void }> = ({ roomId, code, onOpen }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [st, setSt] = useState<InviteState | null>(null);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let alive = true;
    void stateOf(roomId).then((s) => alive && setSt(s));
    return () => {
      alive = false;
    };
  }, [roomId]);

  const api = friendsApi();
  if (!roomId || !api) return null;

  const answer = async (accept: boolean) => {
    setBusy(accept ? 'yes' : 'no');
    try {
      await api.respond(roomId, accept);
      cache.delete(roomId);
      if (accept) {
        onOpen?.();
        navigate(BLEFE_ROUTES.friends);
      } else setSt((s) => (s ? { ...s, state: 'declined' } : s));
    } catch (e) {
      const err = e as PokerClientError;
      // A idade e o resto: a tela da sala explica (entra pelo código).
      if (err?.code === 'age_required' && code) {
        onOpen?.();
        navigate(`${BLEFE_ROUTES.friends}?codigo=${encodeURIComponent(code)}`);
        return;
      }
      toast.error(t(`poker.friends.errors.${err?.code ?? 'error'}`, { defaultValue: t('poker.friends.errors.error') }));
      cache.delete(roomId);
      void stateOf(roomId).then(setSt);
    } finally {
      setBusy(null);
    }
  };

  const stake = st ? (st.stakeRarity ? t('poker.friends.invite.whisperStake', { rarity: t(`poker.rarity.${st.stakeRarity}`).toLowerCase() }) : t('poker.friends.invite.whisperNoStake')) : null;

  if (st && st.state !== 'open')
    return (
      <span className="text-sm" style={{ color: '#BDB4D6' }}>
        {t(`poker.friends.invite.state.${st.state}`)}
      </span>
    );

  return (
    <>
      {stake && (
        <span className="w-full text-[13px]" style={{ color: '#BDB4D6' }}>
          {stake}
        </span>
      )}
      <button type="button" className={`${btn} text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:brightness-110`} disabled={!!busy} onClick={() => void answer(true)}>
        {busy === 'yes' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
        {t('poker.friends.home.accept')}
      </button>
      <button type="button" className={`${btn} border border-white/15 hover:border-white/35 hover:bg-white/5`} style={{ color: '#F3EAD3' }} disabled={!!busy} onClick={() => void answer(false)}>
        {busy === 'no' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
        {t('poker.friends.home.decline')}
      </button>
    </>
  );
};

export default PokerInviteActions;
