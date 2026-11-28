import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Gift, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import OracleSheet from '../OracleSheet';
import UserAvatar from '../UserAvatar';
import { requestSeasonalRefresh } from '../../contexts/SeasonalEventContext';
import { FOCUS_RING, INK, MIST, PAPER, withAlpha } from '../../lib/oracleTheme';
import { sendSecretFriend, type SecretFriendCandidate, type SecretFriendState, type SendError } from '../../lib/secretFriend';

// A escolha do amigo secreto (28/11/2026). Pedido do Bruno: "um presentinho de
// verdade, que pode ser dado de 'amigo secreto' de Natal para um amigo que só
// poderá receber um."
//
// A gaveta lista os amigos; quem já ganhou a raspadinha deste Natal (de
// qualquer pessoa) aparece apagado. Tocar num amigo e confirmar entrega: cada
// pessoa dá uma só, então a entrega pede dois toques. Quando nenhum amigo está
// livre (ou a pessoa ainda não tem amigos), o Oráculo entrega por ela a alguém
// que ainda não ganhou; assim a missão nunca fica travada.

const GOLD = '#F5C451';
const RED = '#E5484D';

interface Props {
  open: boolean;
  onClose: () => void;
  state: SecretFriendState;
  // o ensaio da Conta Diretor ('christmas') ou null
  preview: string | null;
}

const SecretFriendSheet: React.FC<Props> = ({ open, onClose, state, preview }) => {
  const { t } = useTranslation();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SendError | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(null);
    setError(null);
    setBusy(false);
  }, [open]);

  const free = state.friends.filter((friend) => !friend.taken);
  // o ensaio do diretor (a conta escondida não tem amigos) e quem não tem amigo livre
  const oracleOnly = state.trial || free.length === 0;
  const chosen = state.friends.find((friend) => friend.id === picked && !friend.taken) ?? null;

  const send = async (to: SecretFriendCandidate | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await sendSecretFriend(to?.id ?? null, preview);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setPicked(null);
      // alguém chegou antes, ou a lista mudou: relê quem ainda está livre
      requestSeasonalRefresh();
      return;
    }
    toast.success(
      to
        ? t('events.christmas.gift.sent', { name: `@${to.username ?? ''}` })
        : t(state.trial ? 'events.christmas.gift.sentTrial' : 'events.christmas.gift.sentOracle'),
    );
    onClose();
    // a missão anda (e a comemoração da tag aparece)
    requestSeasonalRefresh();
  };

  const footer = oracleOnly ? (
    <button
      type="button"
      onClick={() => send(null)}
      disabled={busy}
      className={`w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl text-sm font-semibold transition hover:brightness-110 disabled:opacity-60 ${FOCUS_RING}`}
      style={{ background: GOLD, color: INK }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
      {t(state.trial ? 'events.christmas.gift.trialAction' : 'events.christmas.gift.oracle')}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => send(chosen)}
      disabled={busy || !chosen}
      className={`w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl text-sm font-semibold transition hover:brightness-110 disabled:opacity-50 ${FOCUS_RING}`}
      style={{ background: chosen ? RED : 'rgba(255,255,255,0.12)', color: chosen ? '#fff' : MIST }}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Gift className="w-4 h-4" aria-hidden />}
      {chosen ? t('events.christmas.gift.confirm', { name: `@${chosen.username ?? ''}` }) : t('events.christmas.gift.pick')}
    </button>
  );

  return (
    <OracleSheet
      open={open}
      onClose={onClose}
      title={t('events.christmas.gift.title')}
      subtitle={t('events.christmas.gift.subtitle')}
      footer={footer}
      size="md"
      escapeEnabled={!busy}
    >
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-xl px-3.5 py-2.5 text-sm leading-snug"
          style={{ background: withAlpha(RED, 0.16), color: '#FECACA', boxShadow: `inset 0 0 0 1px ${withAlpha(RED, 0.45)}` }}
        >
          {t(`events.christmas.gift.errors.${error}`, { defaultValue: t('events.christmas.gift.errors.failed') })}
        </p>
      )}

      {oracleOnly && (
        <p className="rounded-xl px-3.5 py-3 text-sm leading-relaxed" style={{ background: 'rgba(255,255,255,0.06)', color: PAPER }}>
          {t(
            state.trial
              ? 'events.christmas.gift.trialNote'
              : state.friends.length === 0
                ? 'events.christmas.gift.noFriends'
                : 'events.christmas.gift.allTaken',
          )}
          {!state.trial && <span style={{ color: MIST }}> {t('events.christmas.gift.oracleHint')}</span>}
        </p>
      )}

      {state.friends.length > 0 && !state.trial && (
        <ul className={`${oracleOnly ? 'mt-3' : ''} space-y-1.5`} aria-label={t('events.christmas.gift.listLabel')}>
          {state.friends.map((friend) => {
            const active = friend.id === picked && !friend.taken;
            return (
              <li key={friend.id}>
                <button
                  type="button"
                  disabled={friend.taken || busy}
                  aria-pressed={active}
                  onClick={() => setPicked(active ? null : friend.id)}
                  className={`w-full flex items-center gap-3 min-h-[56px] px-3 rounded-xl text-left transition ${friend.taken ? 'opacity-45' : 'hover:bg-white/10'} ${FOCUS_RING}`}
                  style={{
                    background: active ? withAlpha(RED, 0.2) : 'rgba(255,255,255,0.05)',
                    boxShadow: active ? `inset 0 0 0 2px ${RED}` : 'inset 0 0 0 1px rgba(255,255,255,0.08)',
                  }}
                >
                  <UserAvatar user={friend} size={36} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: PAPER }}>
                    @{friend.username}
                  </span>
                  {friend.taken ? (
                    <span className="shrink-0 text-xs" style={{ color: MIST }}>
                      {t('events.christmas.gift.taken')}
                    </span>
                  ) : (
                    active && (
                      <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full" style={{ background: RED, color: '#fff' }} aria-hidden>
                        <Check className="w-3.5 h-3.5" strokeWidth={3} />
                      </span>
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!oracleOnly && (
        <p className="mt-3 text-xs leading-snug" style={{ color: MIST }}>
          {t('events.christmas.gift.once')}
        </p>
      )}
    </OracleSheet>
  );
};

export default SecretFriendSheet;
