import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowLeftRight, Check, Loader2, Repeat2, Send, Users, X } from 'lucide-react';
import PosterArt, { EffectTag, RarityTag } from './PosterArt';
import { PAPER, MIST, VELVET, FOCUS_RING } from '../../lib/oracleTheme';
import { titleOf } from '../../lib/posterJackpot';
import {
  cancelTrade,
  getTradeBoard,
  getTradeFriends,
  proposeTrade,
  respondTrade,
  tradeErrorCode,
  tradeSides,
  type PosterTrade,
  type TradeFriend,
  type TradePoster,
  type TradeStatus,
} from '../../lib/posterTrades';

// A aba Trocas do Poster Jackpot: as propostas recebidas (aceitar/recusar),
// as enviadas (cancelar), o histórico e o "Propor troca" (escolher o amigo,
// o seu pôster e o dele).

const Avatar: React.FC<{ user: { username: string; avatar_url: string | null }; size?: number }> = ({ user, size = 36 }) =>
  user.avatar_url ? (
    <img src={user.avatar_url} alt="" className="shrink-0 rounded-full object-cover ring-1 ring-white/15" style={{ width: size, height: size }} />
  ) : (
    <span className="shrink-0 grid place-items-center rounded-full ring-1 ring-white/15 text-sm font-bold" style={{ width: size, height: size, background: VELVET, color: PAPER }}>
      {user.username.slice(0, 1).toUpperCase()}
    </span>
  );

// Um lado da troca: o pôster, o título e a raridade.
const TradeSide: React.FC<{ poster: TradePoster; label: string }> = ({ poster, label }) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="text-[11.5px] font-semibold" style={{ color: MIST }}>{label}</p>
      <PosterArt filePath={poster.file_path} effect={poster.effect} alt={titleOf(poster, isPt)} size="w342" className="mt-1.5 mx-auto w-full max-w-[120px] aspect-[2/3] rounded-xl shadow-[0_14px_28px_-14px_rgba(0,0,0,0.9)]" />
      <p className="mt-1.5 text-[12.5px] font-medium leading-snug line-clamp-2" style={{ color: PAPER }}>{titleOf(poster, isPt)}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-1">
        <RarityTag rarity={poster.rarity} />
        {poster.effect !== 'none' && <EffectTag effect={poster.effect} />}
      </div>
    </div>
  );
};

// O cartão de uma troca (também usado nos sussurros).
export const TradeCard: React.FC<{
  trade: PosterTrade;
  busy?: boolean;
  onRespond?: (trade: PosterTrade, accept: boolean) => void;
  onCancel?: (trade: PosterTrade) => void;
  compact?: boolean;
}> = ({ trade, busy = false, onRespond, onCancel, compact = false }) => {
  const { t } = useTranslation();
  const { give, get } = tradeSides(trade);
  const pending = trade.status === 'pending';
  return (
    <div
      className={`rounded-2xl ${compact ? 'p-3' : 'p-3.5 sm:p-4'}`}
      style={{ background: 'linear-gradient(160deg, rgba(28,42,120,0.45), rgba(10,14,44,0.6) 60%, rgba(75,31,122,0.4))', boxShadow: `inset 0 0 0 1px ${pending && trade.incoming ? 'rgba(244,196,84,0.55)' : 'rgba(255,255,255,0.1)'}` }}
    >
      {!compact && (
        <div className="flex items-center gap-2.5">
          <Avatar user={trade.friend} size={32} />
          <p className="min-w-0 flex-1 text-[13.5px] leading-snug" style={{ color: MIST }}>
            {trade.incoming ? (
              <>
                <span className="font-semibold" style={{ color: PAPER }}>{trade.friend.username}</span> {t('trades.wantsToTrade')}
              </>
            ) : (
              <>
                {t('trades.proposalTo')} <span className="font-semibold" style={{ color: PAPER }}>{trade.friend.username}</span>
              </>
            )}
          </p>
          {!pending && <StatusPill status={trade.status} />}
        </div>
      )}
      <div className={`${compact ? '' : 'mt-3'} flex items-start gap-2 sm:gap-3`}>
        <TradeSide poster={give} label={t('trades.youGive')} />
        <span className="mt-[22%] grid place-items-center w-9 h-9 shrink-0 rounded-full" style={{ background: 'rgba(244,196,84,0.14)', color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }} aria-hidden>
          <ArrowLeftRight className="w-4 h-4" />
        </span>
        <TradeSide poster={get} label={t('trades.youGet')} />
      </div>
      {pending && trade.incoming && onRespond && (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onRespond(trade, true)}
            disabled={busy}
            className={`pj-spin inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-sm font-bold disabled:opacity-70 ${FOCUS_RING}`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
            <span className="relative">{t('trades.accept')}</span>
          </button>
          <button
            type="button"
            onClick={() => onRespond(trade, false)}
            disabled={busy}
            className={`inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-sm font-semibold transition hover:bg-white/10 disabled:opacity-60 ${FOCUS_RING}`}
            style={{ color: PAPER, boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.25)' }}
          >
            <X className="w-4 h-4" aria-hidden />
            {t('trades.decline')}
          </button>
        </div>
      )}
      {pending && !trade.incoming && onCancel && (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[12.5px]" style={{ color: MIST }}>{t('trades.waiting', { name: trade.friend.username })}</p>
          <button
            type="button"
            onClick={() => onCancel(trade)}
            disabled={busy}
            className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-[13px] font-semibold transition hover:bg-white/10 disabled:opacity-60 ${FOCUS_RING}`}
            style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <X className="w-3.5 h-3.5" aria-hidden />}
            {t('trades.cancel')}
          </button>
        </div>
      )}
    </div>
  );
};

export const StatusPill: React.FC<{ status: TradeStatus }> = ({ status }) => {
  const { t } = useTranslation();
  const tone: Record<TradeStatus, { bg: string; fg: string }> = {
    pending: { bg: 'rgba(244,196,84,0.16)', fg: '#FFE8A3' },
    accepted: { bg: 'rgba(52,211,153,0.16)', fg: '#A7F3D0' },
    declined: { bg: 'rgba(251,113,133,0.14)', fg: '#FECDD3' },
    cancelled: { bg: 'rgba(255,255,255,0.08)', fg: MIST },
    void: { bg: 'rgba(255,255,255,0.08)', fg: MIST },
  };
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: tone[status].bg, color: tone[status].fg }}>
      {t(`trades.status.${status}`)}
    </span>
  );
};

// Grade de pôsteres para escolher um lado da troca.
const PickGrid: React.FC<{
  posters: TradePoster[];
  selected: TradePoster | null;
  onSelect: (poster: TradePoster) => void;
  blockedLabel: string;
}> = ({ posters, selected, onSelect, blockedLabel }) => {
  const { i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  return (
    <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2">
      {posters.map((poster) => {
        const active = !!selected && selected.id === poster.id && selected.effect === poster.effect;
        const blocked = !!poster.other_has;
        return (
          <li key={`${poster.id}:${poster.effect}`}>
            <button
              type="button"
              onClick={() => !blocked && onSelect(poster)}
              disabled={blocked}
              aria-pressed={active}
              aria-label={titleOf(poster, isPt)}
              className={`relative block w-full rounded-lg transition ${FOCUS_RING} ${blocked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
              style={{ boxShadow: active ? '0 0 0 2.5px #F4C454, 0 0 18px -2px rgba(244,196,84,0.8)' : undefined }}
            >
              <PosterArt filePath={poster.file_path} effect={poster.effect} alt="" size="w185" animated={false} className={`aspect-[2/3] rounded-lg ${blocked ? 'opacity-30 grayscale' : ''}`} />
              {active && (
                <span className="absolute top-1 right-1 grid place-items-center w-5 h-5 rounded-full" style={{ background: '#F4C454', color: '#2A1A00' }}>
                  <Check className="w-3 h-3" aria-hidden />
                </span>
              )}
              {blocked && (
                <span className="absolute inset-x-1 bottom-1 rounded-md px-1 py-0.5 text-[10px] font-semibold leading-tight text-center" style={{ background: 'rgba(10,14,44,0.85)', color: PAPER }}>
                  {blockedLabel}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

// O "Propor troca": amigo → os dois pôsteres → enviar.
const ProposeFlow: React.FC<{ onDone: () => void; onBack: () => void }> = ({ onDone, onBack }) => {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<TradeFriend[] | null>(null);
  const [friend, setFriend] = useState<TradeFriend | null>(null);
  const [board, setBoard] = useState<{ mine: TradePoster[]; theirs: TradePoster[] } | null>(null);
  const [give, setGive] = useState<TradePoster | null>(null);
  const [get, setGet] = useState<TradePoster | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    getTradeFriends()
      .then(setFriends)
      .catch((error) => {
        console.error('Trade friends:', error);
        setFriends([]);
      });
  }, []);

  useEffect(() => {
    if (!friend) return;
    setBoard(null);
    setGive(null);
    setGet(null);
    getTradeBoard(friend.id)
      .then(setBoard)
      .catch((error) => {
        console.error('Trade board:', error);
        toast.error(t('trades.loadError'));
        setFriend(null);
      });
  }, [friend, t]);

  const send = async () => {
    if (!friend || !give || !get) return;
    setSending(true);
    try {
      await proposeTrade(friend.id, give, get);
      toast.success(t('trades.sent', { name: friend.username }));
      onDone();
    } catch (error) {
      const code = tradeErrorCode(error);
      console.error('Propose trade:', error);
      toast.error(t(`trades.errors.${code}`, { defaultValue: t('trades.errors.error') }));
    } finally {
      setSending(false);
    }
  };

  if (!friend) {
    return (
      <div>
        <button type="button" onClick={onBack} className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-medium ${FOCUS_RING}`} style={{ color: MIST }}>
          <ArrowLeft className="w-4 h-4" aria-hidden />
          {t('trades.back')}
        </button>
        <h3 className="mt-3 text-[16px] font-semibold" style={{ color: PAPER }}>{t('trades.pickFriend')}</h3>
        {!friends ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
          </div>
        ) : friends.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: MIST }}>{t('trades.noFriends')}</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {friends.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => item.posters > 0 && setFriend(item)}
                  disabled={item.posters === 0}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5 disabled:opacity-45 disabled:hover:bg-transparent ${FOCUS_RING}`}
                  style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
                >
                  <Avatar user={item} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium" style={{ color: PAPER }}>{item.username}</span>
                    <span className="block text-[12.5px]" style={{ color: MIST }}>
                      {item.posters > 0 ? t('trades.friendPosters', { count: item.posters }) : t('trades.friendNoPosters')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="pb-2">
      <button type="button" onClick={() => setFriend(null)} className={`inline-flex items-center gap-1.5 rounded-lg text-sm font-medium ${FOCUS_RING}`} style={{ color: MIST }}>
        <ArrowLeft className="w-4 h-4" aria-hidden />
        {t('trades.changeFriend')}
      </button>
      <div className="mt-3 flex items-center gap-2.5">
        <Avatar user={friend} />
        <h3 className="text-[16px] font-semibold" style={{ color: PAPER }}>{t('trades.tradeWith', { name: friend.username })}</h3>
      </div>

      {!board ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
        </div>
      ) : (
        <>
          <section className="mt-4">
            <h4 className="text-[13.5px] font-semibold" style={{ color: '#FFE8A3' }}>{t('trades.pickGive')}</h4>
            {board.mine.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: MIST }}>{t('trades.noMine')}</p>
            ) : (
              <div className="mt-2">
                <PickGrid posters={board.mine} selected={give} onSelect={setGive} blockedLabel={t('trades.theyHave')} />
              </div>
            )}
          </section>
          <section className="mt-5">
            <h4 className="text-[13.5px] font-semibold" style={{ color: '#FFE8A3' }}>{t('trades.pickGet', { name: friend.username })}</h4>
            <div className="mt-2">
              <PickGrid posters={board.theirs} selected={get} onSelect={setGet} blockedLabel={t('trades.youHave')} />
            </div>
          </section>

          <div className="sticky bottom-0 -mx-1 mt-5 px-1 pt-3 pb-1" style={{ background: 'linear-gradient(180deg, transparent, rgba(18,13,34,0.96) 22%)' }}>
            <div className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: 'rgba(10,14,44,0.9)', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.4)' }}>
              <span className="flex items-center gap-1.5 shrink-0" aria-hidden>
                <span className="block w-9 aspect-[2/3] rounded-md overflow-hidden" style={{ background: VELVET }}>
                  {give && <PosterArt filePath={give.file_path} effect={give.effect} size="w185" animated={false} className="w-full h-full" />}
                </span>
                <ArrowLeftRight className="w-3.5 h-3.5 text-amber-200" />
                <span className="block w-9 aspect-[2/3] rounded-md overflow-hidden" style={{ background: VELVET }}>
                  {get && <PosterArt filePath={get.file_path} effect={get.effect} size="w185" animated={false} className="w-full h-full" />}
                </span>
              </span>
              <button
                type="button"
                onClick={send}
                disabled={!give || !get || sending}
                className={`pj-spin flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-sm font-bold disabled:opacity-60 ${FOCUS_RING}`}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                <span className="relative">{give && get ? t('trades.send') : t('trades.pickBoth')}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const PosterTradesPanel: React.FC<{
  trades: PosterTrade[] | null;
  onChanged: () => void;
}> = ({ trades, onChanged }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'list' | 'propose'>('list');
  const [busyId, setBusyId] = useState<number | null>(null);

  const incoming = useMemo(() => (trades || []).filter((tr) => tr.status === 'pending' && tr.incoming), [trades]);
  const outgoing = useMemo(() => (trades || []).filter((tr) => tr.status === 'pending' && !tr.incoming), [trades]);
  const history = useMemo(() => (trades || []).filter((tr) => tr.status !== 'pending').slice(0, 12), [trades]);

  const respond = async (trade: PosterTrade, accept: boolean) => {
    setBusyId(trade.id);
    try {
      const status = await respondTrade(trade.id, accept);
      if (status === 'accepted') toast.success(t('trades.acceptedToast'));
      else if (status === 'declined') toast(t('trades.declinedToast'));
      else toast.error(t('trades.voidToast'));
      onChanged();
    } catch (error) {
      console.error('Respond trade:', error);
      toast.error(t('trades.errors.error'));
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (trade: PosterTrade) => {
    setBusyId(trade.id);
    try {
      await cancelTrade(trade.id);
      toast(t('trades.cancelledToast'));
      onChanged();
    } catch (error) {
      console.error('Cancel trade:', error);
      toast.error(t('trades.errors.error'));
    } finally {
      setBusyId(null);
    }
  };

  if (mode === 'propose') {
    return (
      <ProposeFlow
        onBack={() => setMode('list')}
        onDone={() => {
          setMode('list');
          onChanged();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="relative overflow-hidden rounded-2xl p-4 sm:p-5 flex items-center gap-3.5"
        style={{ background: 'radial-gradient(90% 120% at 0% 0%, rgba(94,168,255,0.22), transparent 60%), linear-gradient(135deg, #1c2a78, #0a0e2c 60%, #4b1f7a)', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }}
      >
        <span className="pj-stars" aria-hidden />
        <span className="relative grid place-items-center w-12 h-12 shrink-0 rounded-2xl" style={{ background: 'rgba(244,196,84,0.16)', color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.5)' }} aria-hidden>
          <Repeat2 className="w-6 h-6" />
        </span>
        <div className="relative min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold leading-snug" style={{ color: PAPER }}>{t('trades.title')}</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed" style={{ color: '#D9D2F2' }}>{t('trades.hint')}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setMode('propose')}
        className={`pj-spin -mt-3 w-full inline-flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-bold ${FOCUS_RING}`}
      >
        <Users className="w-4 h-4" aria-hidden />
        <span className="relative">{t('trades.propose')}</span>
      </button>

      {!trades ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {incoming.length > 0 && (
            <motion.section key="in" layout>
              <h4 className="text-[14px] font-semibold" style={{ color: PAPER }}>{t('trades.incoming', { count: incoming.length })}</h4>
              <div className="mt-2.5 space-y-3">
                {incoming.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} busy={busyId === trade.id} onRespond={respond} />
                ))}
              </div>
            </motion.section>
          )}
          {outgoing.length > 0 && (
            <motion.section key="out" layout>
              <h4 className="text-[14px] font-semibold" style={{ color: PAPER }}>{t('trades.outgoing', { count: outgoing.length })}</h4>
              <div className="mt-2.5 space-y-3">
                {outgoing.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} busy={busyId === trade.id} onCancel={cancel} />
                ))}
              </div>
            </motion.section>
          )}
          {history.length > 0 && (
            <motion.section key="hist" layout>
              <h4 className="text-[14px] font-semibold" style={{ color: PAPER }}>{t('trades.history')}</h4>
              <div className="mt-2.5 space-y-3">
                {history.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} />
                ))}
              </div>
            </motion.section>
          )}
          {incoming.length + outgoing.length + history.length === 0 && (
            <motion.p key="empty" className="text-center text-sm py-4" style={{ color: MIST }}>
              {t('trades.empty')}
            </motion.p>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export default PosterTradesPanel;
