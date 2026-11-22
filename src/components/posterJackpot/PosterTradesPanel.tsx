import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowLeftRight, Check, Loader2, Maximize2, Repeat2, Send, Users, X } from 'lucide-react';
import PosterArt, { EffectTag, RarityTag } from './PosterArt';
import PosterInfoSheet from './PosterInfoSheet';
import { PAPER, MIST, VELVET, FOCUS_RING } from '../../lib/oracleTheme';
import { RARITY_META, titleOf } from '../../lib/posterJackpot';
import {
  acceptedToast,
  cancelTrade,
  getTradeBoard,
  getTradeFriends,
  getTradeLimits,
  proposeTrade,
  respondTrade,
  tradeErrorCode,
  tradeSides,
  TRADE_SLOTS,
  type PosterTrade,
  type TradeFriend,
  type TradeLimits,
  type TradePoster,
  type TradeStatus,
} from '../../lib/posterTrades';

// A aba Trocas do Poster Jackpot: as propostas recebidas (aceitar/recusar),
// as enviadas (cancelar), o histórico e o "Propor troca" (escolher o amigo,
// o seu pôster e o dele).
//
// 15/11/2026 (pedido do Bruno: "é necessário que de alguma forma o menu
// expandido dos pôsteres com as informações apareçam, para propiciar uma
// troca justa sem enganação"): todo pôster de uma troca abre o menu expandido
// dele (PosterInfoSheet: o pôster grande com o efeito, o título e o ano, o
// número de colecionador, a raridade, o efeito, e o menu do título).
//   • No "Propor troca", tocar num pôster abre o menu e a escolha é feita lá
//     dentro ("Oferecer este pôster" / "Pedir este pôster"): ninguém escolhe
//     sem ver o que está escolhendo.
//   • Nos cartões das trocas (recebidas, enviadas, histórico e sussurros), os
//     dois pôsteres abrem o menu: dá para conferir antes de aceitar.
//
// 16/11/2026 (pedido do Bruno): até 3 pôsteres de cada lado (3 por 1, 3 por 2,
// 3 por 3). No "Propor troca" cada lado aceita até 3 escolhas; os pôsteres já
// oferecidos numa proposta aberta aparecem travados ("Em outra proposta"),
// porque o banco reserva cada pôster oferecido a uma proposta por vez. Nos
// cartões, um lado com vários pôsteres mostra os pôsteres menores, lado a lado,
// com os títulos em lista; cada um continua abrindo o menu expandido.

// 03/11/2026 (pôquer): pôster ganho no Grande Blefe não entra em trocas; a
// trava é do banco (gatilho poker_trade_guard → exceção 'untradeable'). Aqui
// só a mensagem certa, lida antes do tradeErrorCode (que não conhece o código).
const isUntradeable = (error: unknown) => ((error as { message?: string })?.message || '').includes('untradeable');
const isTablePrize = (poster: TradePoster) => (poster as TradePoster & { tradeable?: boolean }).tradeable === false;
const sameVersion = (a: TradePoster | null, b: TradePoster | null) => !!a && !!b && a.id === b.id && a.effect === b.effect;

const Avatar: React.FC<{ user: { username: string; avatar_url: string | null }; size?: number }> = ({ user, size = 36 }) =>
  user.avatar_url ? (
    <img src={user.avatar_url} alt="" className="shrink-0 rounded-full object-cover ring-1 ring-white/15" style={{ width: size, height: size }} />
  ) : (
    <span className="shrink-0 grid place-items-center rounded-full ring-1 ring-white/15 text-sm font-bold" style={{ width: size, height: size, background: VELVET, color: PAPER }}>
      {user.username.slice(0, 1).toUpperCase()}
    </span>
  );

// Um lado da troca com vários pôsteres (16/11/2026): os pôsteres menores, lado
// a lado (cada um abre o menu expandido), e embaixo a lista dos títulos com a
// cor da raridade (a raridade também vai escrita para o leitor de tela). Numa
// troca com mais de um pôster em algum lado, os DOIS lados usam este formato,
// com cada pôster do tamanho de um terço do lado: num 3 por 1, o pôster sozinho
// não aparece maior que os três (o tamanho não pode sugerir valor).
const TradeSideMany: React.FC<{ posters: TradePoster[]; label: string; onOpen: (poster: TradePoster) => void }> = ({ posters, label, onOpen }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="text-[11.5px] font-semibold" style={{ color: MIST }}>{posters.length > 1 ? t('trades.sideCount', { label, count: posters.length }) : label}</p>
      <div className="mt-1.5 flex justify-center gap-1.5">
        {posters.map((poster) => (
          <button
            key={`${poster.id}:${poster.effect}`}
            type="button"
            onClick={() => onOpen(poster)}
            aria-label={t('trades.info.open', { title: titleOf(poster, isPt) })}
            className={`relative block shrink-0 rounded-lg transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${FOCUS_RING}`}
            style={{ width: `calc((100% - ${(TRADE_SLOTS - 1) * 6}px) / ${TRADE_SLOTS})` }}
          >
            <PosterArt
              filePath={poster.file_path}
              effect={poster.effect}
              alt=""
              size="w185"
              className="w-full aspect-[2/3] rounded-lg shadow-[0_10px_20px_-12px_rgba(0,0,0,0.9)]"
            />
          </button>
        ))}
      </div>
      <ul className="mt-1.5 mx-auto w-fit max-w-full space-y-0.5 text-left">
        {posters.map((poster) => (
          <li key={`${poster.id}:${poster.effect}`} className="flex items-center gap-1.5 min-w-0">
            <span aria-hidden className="shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: RARITY_META[poster.rarity].color }} />
            <span className="truncate text-[11.5px] leading-snug" style={{ color: PAPER }}>
              {titleOf(poster, isPt)}
              <span className="sr-only">
                , {t(`jackpot.rarity.${poster.rarity}`)}
                {poster.effect !== 'none' && `, ${t(`jackpot.effect.${poster.effect}`)}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Um lado da troca: o pôster (que abre o menu expandido), o título e a raridade.
const TradeSide: React.FC<{ posters: TradePoster[]; label: string; many: boolean; onOpen: (poster: TradePoster) => void }> = ({ posters, label, many, onOpen }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  if (many) return <TradeSideMany posters={posters} label={label} onOpen={onOpen} />;
  const poster = posters[0];
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="text-[11.5px] font-semibold" style={{ color: MIST }}>{label}</p>
      <button
        type="button"
        onClick={() => onOpen(poster)}
        aria-label={t('trades.info.open', { title: titleOf(poster, isPt) })}
        className={`group relative mt-1.5 mx-auto block w-full max-w-[120px] rounded-xl transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.98] ${FOCUS_RING}`}
      >
        <PosterArt
          filePath={poster.file_path}
          effect={poster.effect}
          alt=""
          size="w342"
          className="w-full aspect-[2/3] rounded-xl shadow-[0_14px_28px_-14px_rgba(0,0,0,0.9)]"
          mark={{ rarity: poster.rarity, serial: poster.serial, size: 'xs' }}
        />
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 z-10 grid place-items-center w-6 h-6 rounded-full text-white transition-transform duration-200 group-hover:scale-110"
          style={{ background: 'rgba(10,14,44,0.78)', boxShadow: 'inset 0 0 0 1px rgba(255,232,163,0.4), 0 4px 10px -4px rgba(0,0,0,0.8)' }}
        >
          <Maximize2 className="w-3 h-3" />
        </span>
      </button>
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
  // o menu expandido de um pôster aberto por cima (o Esc fecha só ele)
  onLayer?: (open: boolean) => void;
}> = ({ trade, busy = false, onRespond, onCancel, compact = false, onLayer }) => {
  const { t } = useTranslation();
  const { give, get } = tradeSides(trade);
  const many = give.length > 1 || get.length > 1;
  const pending = trade.status === 'pending';
  // o pôster aberto no menu expandido, com o lado dele na troca
  const [info, setInfo] = useState<{ poster: TradePoster; caption: string } | null>(null);
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
        <TradeSide posters={give} many={many} label={t('trades.youGive')} onOpen={(poster) => setInfo({ poster, caption: t('trades.youGive') })} />
        <span className={`${many ? 'mt-8' : 'mt-[22%]'} grid place-items-center w-9 h-9 shrink-0 rounded-full`} style={{ background: 'rgba(244,196,84,0.14)', color: '#FFE8A3', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.45)' }} aria-hidden>
          <ArrowLeftRight className="w-4 h-4" />
        </span>
        <TradeSide posters={get} many={many} label={t('trades.youGet')} onOpen={(poster) => setInfo({ poster, caption: t('trades.youGet') })} />
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
      <PosterInfoSheet poster={info?.poster ?? null} caption={info?.caption} onClose={() => setInfo(null)} onLayer={onLayer} />
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

// Grade de pôsteres para escolher um lado da troca. Tocar abre o menu
// expandido do pôster; a escolha é feita lá dentro (15/11/2026). Cada lado
// aceita até 3 (16/11/2026): com o lado cheio, os outros ficam mais apagados,
// mas ainda abrem o menu (que explica o limite).
const PickGrid: React.FC<{
  posters: TradePoster[];
  selected: TradePoster[];
  onOpen: (poster: TradePoster) => void;
  blockedLabel: string;
}> = ({ posters, selected, onOpen, blockedLabel }) => {
  const { t, i18n } = useTranslation();
  const isPt = i18n.language.startsWith('pt');
  const full = selected.length >= TRADE_SLOTS;
  return (
    <ul className="grid grid-cols-4 sm:grid-cols-5 gap-2">
      {posters.map((poster) => {
        const active = selected.some((item) => sameVersion(item, poster));
        // Prêmio da mesa: o servidor já tira da lista; se vier, fica travado.
        const tablePrize = isTablePrize(poster);
        // Já oferecido numa proposta aberta minha (só vem nos meus).
        const reserved = !!poster.reserved;
        const blocked = !!poster.other_has || tablePrize || reserved;
        return (
          <li key={`${poster.id}:${poster.effect}`}>
            <button
              type="button"
              onClick={() => !blocked && onOpen(poster)}
              disabled={blocked}
              aria-pressed={active}
              aria-label={t('trades.info.open', { title: titleOf(poster, isPt) })}
              className={`relative block w-full rounded-lg transition ${FOCUS_RING} ${blocked ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
              style={{ boxShadow: active ? '0 0 0 2.5px #F4C454, 0 0 18px -2px rgba(244,196,84,0.8)' : undefined }}
            >
              <PosterArt
                filePath={poster.file_path}
                effect={poster.effect}
                alt=""
                size="w185"
                animated={false}
                className={`aspect-[2/3] rounded-lg ${blocked ? 'opacity-30 grayscale' : full && !active ? 'opacity-55' : ''}`}
                mark={blocked ? null : { rarity: poster.rarity, serial: poster.serial, size: 'xs' }}
              />
              {active && (
                <span className="absolute top-1 right-1 grid place-items-center w-5 h-5 rounded-full" style={{ background: '#F4C454', color: '#2A1A00' }}>
                  <Check className="w-3 h-3" aria-hidden />
                </span>
              )}
              {blocked && (
                <span className="absolute inset-x-1 bottom-1 rounded-md px-1 py-0.5 text-[10px] font-semibold leading-tight text-center" style={{ background: 'rgba(10,14,44,0.85)', color: PAPER }}>
                  {tablePrize ? t('pokerEntry.trades.seal') : reserved && !poster.other_has ? t('trades.reserved') : blockedLabel}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

// Os pôsteres escolhidos de um lado, na barra de enviar: abertos em leque
// quando são mais de um (16/11/2026). Vazio, fica o lugar marcado.
const HandOfPosters: React.FC<{ posters: TradePoster[] }> = ({ posters }) => {
  if (posters.length === 0) return <span className="block w-9 aspect-[2/3] rounded-md" style={{ background: VELVET }} />;
  const middle = (posters.length - 1) / 2;
  return (
    <span className="flex items-center">
      {posters.map((poster, index) => (
        <span
          key={`${poster.id}:${poster.effect}`}
          className={`block w-9 aspect-[2/3] rounded-md overflow-hidden ${index ? '-ml-5' : ''}`}
          style={{ background: VELVET, boxShadow: '0 0 0 1.5px rgba(10,14,44,0.95)', transform: `rotate(${(index - middle) * 7}deg)` }}
        >
          <PosterArt filePath={poster.file_path} effect={poster.effect} size="w185" animated={false} className="w-full h-full" />
        </span>
      ))}
    </span>
  );
};

// O "Propor troca": amigo → até 3 pôsteres de cada lado → enviar.
const ProposeFlow: React.FC<{ onDone: () => void; onBack: () => void; onLayer?: (open: boolean) => void }> = ({ onDone, onBack, onLayer }) => {
  const { t } = useTranslation();
  const [friends, setFriends] = useState<TradeFriend[] | null>(null);
  const [friend, setFriend] = useState<TradeFriend | null>(null);
  const [board, setBoard] = useState<{ mine: TradePoster[]; theirs: TradePoster[] } | null>(null);
  const [give, setGive] = useState<TradePoster[]>([]);
  const [get, setGet] = useState<TradePoster[]>([]);
  const [sending, setSending] = useState(false);
  // o pôster aberto no menu expandido e de que lado ele entra
  const [info, setInfo] = useState<{ poster: TradePoster; side: 'give' | 'get' } | null>(null);
  const infoList = info ? (info.side === 'give' ? give : get) : [];
  const infoChosen = info ? infoList.some((item) => sameVersion(item, info.poster)) : false;
  const infoFull = !infoChosen && infoList.length >= TRADE_SLOTS;
  // Põe ou tira um pôster de um lado (até 3 por lado).
  const choose = (side: 'give' | 'get', poster: TradePoster, add: boolean) => {
    const update = (list: TradePoster[]) =>
      add
        ? list.some((item) => sameVersion(item, poster)) || list.length >= TRADE_SLOTS
          ? list
          : [...list, poster]
        : list.filter((item) => !sameVersion(item, poster));
    if (side === 'give') setGive(update);
    else setGet(update);
    setInfo(null);
  };

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
    setGive([]);
    setGet([]);
    setInfo(null);
    getTradeBoard(friend.id)
      .then(setBoard)
      .catch((error) => {
        console.error('Trade board:', error);
        toast.error(t('trades.loadError'));
        setFriend(null);
      });
  }, [friend, t]);

  // Depois de um erro de posse ou de reserva, o quadro é lido de novo e só
  // ficam escolhidos os pôsteres que ainda podem entrar na troca.
  const reloadBoard = async (friendId: string) => {
    try {
      const fresh = await getTradeBoard(friendId);
      const usable = (list: TradePoster[], pool: TradePoster[]) =>
        list.filter((item) => pool.some((p) => sameVersion(p, item) && !p.other_has && !p.reserved && !isTablePrize(p)));
      setBoard(fresh);
      setGive((list) => usable(list, fresh.mine));
      setGet((list) => usable(list, fresh.theirs));
    } catch (error) {
      console.error('Trade board:', error);
    }
  };

  const send = async () => {
    if (!friend || give.length === 0 || get.length === 0) return;
    setSending(true);
    try {
      await proposeTrade(friend.id, give, get);
      toast.success(t('trades.sent', { name: friend.username }));
      onDone();
    } catch (error) {
      const code = tradeErrorCode(error);
      console.error('Propose trade:', error);
      toast.error(isUntradeable(error) ? t('pokerEntry.trades.untradeable') : t(`trades.errors.${code}`, { defaultValue: t('trades.errors.error') }));
      if (isUntradeable(error) || ['offer_pending', 'not_owned', 'they_have', 'not_theirs', 'you_have'].includes(code)) reloadBoard(friend.id);
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
      <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: MIST }}>{t('trades.info.pickHint')}</p>

      {!board ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-amber-200" aria-hidden />
        </div>
      ) : (
        <>
          {/* 22/11/2026 (pedido do Bruno: "atualmente aparece os nossos pôsteres
              primeiro e depois os dos amigos, inverta"): quem entra na coleção de
              um amigo quer ver primeiro o que ELE tem; os meus vêm depois. Só a
              ordem das duas listas mudou; a barra de baixo segue "o que dou ⇄ o
              que recebo", como nos cartões das propostas. */}
          <section className="mt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[13.5px] font-semibold" style={{ color: '#FFE8A3' }}>{t('trades.pickGet', { name: friend.username })}</h4>
              <span className="shrink-0 text-[12px] tabular-nums" style={{ color: MIST }}>{t('trades.slotsCount', { count: get.length, max: TRADE_SLOTS })}</span>
            </div>
            <div className="mt-2">
              <PickGrid posters={board.theirs} selected={get} onOpen={(poster) => setInfo({ poster, side: 'get' })} blockedLabel={t('trades.youHave')} />
            </div>
          </section>
          <section className="mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-[13.5px] font-semibold" style={{ color: '#FFE8A3' }}>{t('trades.pickGive')}</h4>
              <span className="shrink-0 text-[12px] tabular-nums" style={{ color: MIST }}>{t('trades.slotsCount', { count: give.length, max: TRADE_SLOTS })}</span>
            </div>
            {board.mine.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: MIST }}>{t('trades.noMine')}</p>
            ) : (
              <div className="mt-2">
                <PickGrid posters={board.mine} selected={give} onOpen={(poster) => setInfo({ poster, side: 'give' })} blockedLabel={t('trades.theyHave')} />
              </div>
            )}
          </section>

          <div className="sticky bottom-0 -mx-1 mt-5 px-1 pt-3 pb-1" style={{ background: 'linear-gradient(180deg, transparent, rgba(18,13,34,0.96) 22%)' }}>
            <div className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: 'rgba(10,14,44,0.9)', boxShadow: 'inset 0 0 0 1px rgba(244,196,84,0.4)' }}>
              <span className="flex items-center gap-2 shrink-0" aria-hidden>
                <HandOfPosters posters={give} />
                <ArrowLeftRight className="w-3.5 h-3.5 text-amber-200" />
                <HandOfPosters posters={get} />
              </span>
              <button
                type="button"
                onClick={send}
                disabled={give.length === 0 || get.length === 0 || sending}
                className={`pj-spin flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full text-sm font-bold disabled:opacity-60 ${FOCUS_RING}`}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
                <span className="relative">{give.length > 0 && get.length > 0 ? t('trades.send') : t('trades.pickBoth')}</span>
              </button>
            </div>
          </div>
        </>
      )}

      <PosterInfoSheet
        poster={info?.poster ?? null}
        caption={info ? (info.side === 'give' ? t('trades.info.yours') : t('trades.info.theirs', { name: friend.username })) : undefined}
        onClose={() => setInfo(null)}
        onLayer={onLayer}
      >
        {info &&
          (infoChosen ? (
            <div className="mt-4 flex flex-col items-center gap-2">
              <p className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold" style={{ color: '#FFE8A3' }}>
                <Check className="w-4 h-4" aria-hidden />
                {t('trades.info.chosen')}
              </p>
              <button
                type="button"
                onClick={() => choose(info.side, info.poster, false)}
                className={`inline-flex items-center gap-1.5 h-11 px-5 rounded-xl text-sm font-semibold transition hover:bg-white/10 ${FOCUS_RING}`}
                style={{ color: PAPER, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)' }}
              >
                <X className="w-4 h-4" aria-hidden />
                {t('trades.info.remove')}
              </button>
            </div>
          ) : infoFull ? (
            <p className="mt-4 max-w-xs mx-auto text-center text-[13px] leading-relaxed" style={{ color: MIST }}>
              {t('trades.info.full', { max: TRADE_SLOTS })}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => choose(info.side, info.poster, true)}
              className={`pj-spin mt-4 inline-flex items-center justify-center gap-1.5 h-11 px-6 rounded-full text-sm font-bold ${FOCUS_RING}`}
            >
              <ArrowLeftRight className="w-4 h-4" aria-hidden />
              <span className="relative">{info.side === 'give' ? t('trades.info.offer') : t('trades.info.ask')}</span>
            </button>
          ))}
      </PosterInfoSheet>
    </div>
  );
};

const PosterTradesPanel: React.FC<{
  trades: PosterTrade[] | null;
  onChanged: () => void;
  // um menu expandido de pôster aberto por cima: o Esc fecha só ele
  onLayer?: (open: boolean) => void;
}> = ({ trades, onChanged, onLayer }) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'list' | 'propose'>('list');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [limits, setLimits] = useState<TradeLimits | null>(null);

  // O limite do dia vem junto com a lista de trocas (que muda a cada ação).
  useEffect(() => {
    let alive = true;
    getTradeLimits()
      .then((value) => alive && setLimits(value))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [trades]);
  const tradesLeft = limits ? Math.max(0, limits.limit - limits.tradesToday) : null;
  const proposalsLeft = limits ? Math.max(0, limits.limit - limits.proposalsToday) : null;
  const canPropose = tradesLeft !== 0 && proposalsLeft !== 0;

  const incoming = useMemo(() => (trades || []).filter((tr) => tr.status === 'pending' && tr.incoming), [trades]);
  const outgoing = useMemo(() => (trades || []).filter((tr) => tr.status === 'pending' && !tr.incoming), [trades]);
  const history = useMemo(() => (trades || []).filter((tr) => tr.status !== 'pending').slice(0, 12), [trades]);

  const respond = async (trade: PosterTrade, accept: boolean) => {
    setBusyId(trade.id);
    try {
      const status = await respondTrade(trade.id, accept);
      if (status === 'accepted') {
        const done = acceptedToast(trade);
        toast.success(t(done.key, { count: done.count }));
      } else if (status === 'declined') toast(t('trades.declinedToast'));
      else toast.error(t('trades.voidToast'));
      onChanged();
    } catch (error) {
      console.error('Respond trade:', error);
      const code = tradeErrorCode(error);
      toast.error(
        isUntradeable(error)
          ? t('pokerEntry.trades.untradeable')
          : t(`trades.errors.${code}`, { name: trade.friend.username, defaultValue: t('trades.errors.error') })
      );
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
        onLayer={onLayer}
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
      <div className="-mt-3">
        <button
          type="button"
          onClick={() => (canPropose ? setMode('propose') : toast(tradesLeft === 0 ? t('trades.errors.daily_trades') : t('trades.errors.daily_proposals')))}
          aria-disabled={!canPropose}
          className={`pj-spin w-full inline-flex items-center justify-center gap-2 h-12 rounded-full text-[15px] font-bold ${canPropose ? '' : 'opacity-60'} ${FOCUS_RING}`}
        >
          <Users className="w-4 h-4" aria-hidden />
          <span className="relative">{t('trades.propose')}</span>
        </button>
        {/* 02/11/2026: saiu a linha "Hoje ainda dá: 3 de 3 trocas e 3 de 3
            propostas". A regra continua (3 trocas e 3 propostas por dia, no
            servidor): esgotado, o botão fica apagado e tocar explica o porquê. */}
      </div>

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
                  <TradeCard key={trade.id} trade={trade} busy={busyId === trade.id} onRespond={respond} onLayer={onLayer} />
                ))}
              </div>
            </motion.section>
          )}
          {outgoing.length > 0 && (
            <motion.section key="out" layout>
              <h4 className="text-[14px] font-semibold" style={{ color: PAPER }}>{t('trades.outgoing', { count: outgoing.length })}</h4>
              <div className="mt-2.5 space-y-3">
                {outgoing.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} busy={busyId === trade.id} onCancel={cancel} onLayer={onLayer} />
                ))}
              </div>
            </motion.section>
          )}
          {history.length > 0 && (
            <motion.section key="hist" layout>
              {/* O histórico vale 30 dias, como os sussurros (02/11/2026): a
                  troca some da lista 30 dias depois de concluída e o banco a
                  apaga na limpeza diária (delete_expired_poster_trades). */}
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-[14px] font-semibold" style={{ color: PAPER }}>{t('trades.history')}</h4>
                <span className="text-[12px]" style={{ color: MIST }}>{t('trades.historyHint')}</span>
              </div>
              <div className="mt-2.5 space-y-3">
                {history.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} onLayer={onLayer} />
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
